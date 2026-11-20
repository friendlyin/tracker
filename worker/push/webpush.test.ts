import { decodeJwt, decodeProtectedHeader } from "jose";
import { describe, expect, it } from "vitest";
import { b64u, encryptPayload, vapidAuth } from "./webpush";

// RFC 8291 §5 (appendix A) example.
const rfc = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPublic:
    "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic:
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

describe("web push", () => {
  it("encrypts the RFC 8291 example exactly", async () => {
    const body = await encryptPayload(
      new TextEncoder().encode(rfc.plaintext),
      { p256dh: rfc.uaPublic, auth: rfc.auth },
      {
        sender: { publicKey: rfc.asPublic, privateKey: rfc.asPrivate },
        salt: b64u.decode(rfc.salt),
      },
    );
    expect(b64u.encode(body)).toBe(rfc.body);
  });

  it("signs a VAPID token for the push service's origin", async () => {
    const header = await vapidAuth(
      "https://web.push.apple.com/abc",
      { publicKey: rfc.asPublic, privateKey: rfc.asPrivate, subject: "mailto:you@example.com" },
      Date.parse("2026-11-20T12:00:00Z"),
    );
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(header);
    expect(m?.[2]).toBe(rfc.asPublic);
    const jwt = m?.[1] ?? "";
    expect(decodeProtectedHeader(jwt).alg).toBe("ES256");
    expect(decodeJwt(jwt)).toMatchObject({
      aud: "https://web.push.apple.com",
      sub: "mailto:you@example.com",
    });
  });
});
