import { importJWK, SignJWT } from "jose";

// Web Push without a library: RFC 8291 payload encryption (aes128gcm) and RFC 8292 VAPID, all with
// WebCrypto (native, so it stays well inside the Workers CPU limit).

export interface PushSubscriptionKeys {
  endpoint: string;
  /** The browser's P-256 public key, base64url (65 bytes uncompressed). */
  p256dh: string;
  /** The browser's auth secret, base64url (16 bytes). */
  auth: string;
}

export interface Vapid {
  /** base64url of the 65-byte uncompressed public key. */
  publicKey: string;
  /** base64url of the 32-byte private scalar. */
  privateKey: string;
  /** `mailto:` or `https:` contact for push services. */
  subject: string;
}

export const b64u = {
  encode(bytes: Uint8Array): string {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(s: string): Uint8Array {
    const b = atob(
      s
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(s.length / 4) * 4, "="),
    );
    return Uint8Array.from(b, (c) => c.charCodeAt(0));
  },
};

const enc = new TextEncoder();

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

/** HKDF with a single output block (≤ 32 bytes). */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}

/** A P-256 key pair from the raw public key and private scalar (both base64url). */
function ecJwk(publicKey: Uint8Array, d?: string): JsonWebKey {
  return {
    kty: "EC",
    crv: "P-256",
    x: b64u.encode(publicKey.slice(1, 33)),
    y: b64u.encode(publicKey.slice(33, 65)),
    ...(d ? { d } : {}),
  };
}

export interface EncryptOptions {
  /** Test vectors only: a fixed sender key pair and salt. */
  sender?: { publicKey: string; privateKey: string };
  salt?: Uint8Array;
}

/** RFC 8291: the request body for `payload` (one record, aes128gcm). */
export async function encryptPayload(
  payload: Uint8Array,
  sub: Pick<PushSubscriptionKeys, "p256dh" | "auth">,
  opts: EncryptOptions = {},
): Promise<Uint8Array> {
  const uaPublic = b64u.decode(sub.p256dh);
  const authSecret = b64u.decode(sub.auth);
  const ecdh = { name: "ECDH", namedCurve: "P-256" } as const;

  let asPrivate: CryptoKey;
  let asPublic: Uint8Array;
  if (opts.sender) {
    asPublic = b64u.decode(opts.sender.publicKey);
    asPrivate = await crypto.subtle.importKey(
      "jwk",
      ecJwk(asPublic, opts.sender.privateKey),
      ecdh,
      false,
      ["deriveBits"],
    );
  } else {
    const pair = (await crypto.subtle.generateKey(ecdh, true, ["deriveBits"])) as CryptoKeyPair;
    asPrivate = pair.privateKey;
    asPublic = new Uint8Array(
      (await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer,
    );
  }
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, ecdh, false, []);
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      // Workers' types name the field `$public`; at runtime it is `public`, as in the spec.
      { name: "ECDH", public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm,
      asPrivate,
      256,
    ),
  );

  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // One record: the payload, then the last-record delimiter (no padding).
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      concat(payload, new Uint8Array([2])),
    ),
  );
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/** RFC 8292: the `Authorization` header for a push service. */
export async function vapidAuth(endpoint: string, vapid: Vapid, now = Date.now()) {
  const key = await importJWK(ecJwk(b64u.decode(vapid.publicKey), vapid.privateKey), "ES256");
  const jwt = await new SignJWT({ sub: vapid.subject })
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .setAudience(new URL(endpoint).origin)
    .setExpirationTime(Math.floor(now / 1000) + 12 * 3600)
    .sign(key);
  return `vapid t=${jwt}, k=${vapid.publicKey}`;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Opened on tap. */
  url: string;
  /** A newer notification with the same tag replaces the older one. */
  tag: string;
}

export type SendResult = "ok" | "gone" | "error";

/** Sends one notification. `gone`: the subscription expired or was revoked (delete it). */
export async function sendPush(
  sub: PushSubscriptionKeys,
  msg: PushMessage,
  vapid: Vapid,
  opts: { ttl?: number; urgency?: "normal" | "high" } = {},
): Promise<SendResult> {
  const body = await encryptPayload(enc.encode(JSON.stringify(msg)), sub);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuth(sub.endpoint, vapid),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(opts.ttl ?? 3600),
      Urgency: opts.urgency ?? "normal",
    },
    body,
  });
  if (res.status === 404 || res.status === 410) return "gone";
  if (!res.ok) {
    console.error("push failed", res.status, await res.text().catch(() => ""));
    return "error";
  }
  return "ok";
}
