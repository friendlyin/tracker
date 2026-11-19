import { describe, expect, it } from "vitest";
import { identify } from "./auth";

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
});
