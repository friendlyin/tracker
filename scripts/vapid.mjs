// Generates a VAPID key pair for Web Push. Set the output as Worker secrets (docs/cloudflare-setup.md)
// or put it in .dev.vars for local development. Keep the private key secret.
import { webcrypto as crypto } from "node:crypto";

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);
const publicKey = b64u(await crypto.subtle.exportKey("raw", pair.publicKey));
const { d } = await crypto.subtle.exportKey("jwk", pair.privateKey);
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${d}`);
