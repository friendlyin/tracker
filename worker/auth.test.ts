import { describe, expect, it } from "vitest";
import { identify, isLocalHost } from "./auth";

const env = (vars: Partial<Env>) => vars as Env;

describe("identify", () => {
  it("uses the dev user only on localhost", async () => {
    const dev = env({ DEV_USER_EMAIL: "dev@example.com" });
    expect(await identify(new Request("http://localhost:5173/api/me"), dev)).toBe(
      "dev@example.com",
    );
    expect(
      await identify(new Request("https://tracker.example.workers.dev/api/me"), dev),
    ).toBeNull();
  });

  it("fails closed without Access configuration or token", async () => {
    const req = new Request("https://tracker.example.workers.dev/api/me", {
      headers: { "cf-access-jwt-assertion": "x.y.z" },
    });
    expect(await identify(req, env({}))).toBeNull();
    expect(
      await identify(
        new Request("https://tracker.example.workers.dev/api/me"),
        env({ ACCESS_AUD: "a", ACCESS_TEAM_DOMAIN: "t" }),
      ),
    ).toBeNull();
  });

  it("rejects a malformed token", async () => {
    const req = new Request("https://tracker.example.workers.dev/api/me", {
      headers: { "cf-access-jwt-assertion": "not-a-jwt" },
    });
    const e = env({ ACCESS_AUD: "aud", ACCESS_TEAM_DOMAIN: "https://team.example.com" });
    expect(await identify(req, e)).toBeNull();
  });

  it("treats only localhost and private addresses as local", () => {
    for (const h of ["localhost", "127.0.0.1", "192.168.1.20", "10.0.0.5", "172.20.1.1"]) {
      expect(isLocalHost(h)).toBe(true);
    }
    for (const h of [
      "tracker.example.workers.dev",
      "172.32.0.1",
      "8.8.8.8",
      "192.168.example.com",
    ]) {
      expect(isLocalHost(h)).toBe(false);
    }
  });
});
