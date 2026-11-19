import type { ConsentDescription } from "@cloudflare/workers-oauth-provider";
import { describe, expect, it } from "vitest";
import { consentPage } from "./consent";

const details = (over: Partial<ConsentDescription> = {}): ConsentDescription => ({
  clientId: "c1",
  clientName: "Example Client",
  redirectUri: "https://client.example.com/cb",
  redirectHost: "client.example.com",
  redirectIsLoopback: false,
  scope: [],
  ...over,
});

describe("consentPage", () => {
  it("escapes everything the client chose", () => {
    const html = consentPage(
      details({ clientName: '<script>alert("x")</script>', redirectHost: "a<b>.example.com" }),
      'h"1',
      "you@example.com",
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&#60;script&#62;");
    expect(html).toContain("a&#60;b&#62;.example.com");
    expect(html).toContain('value="h&#34;1"');
  });

  it("flags self-registered names and local redirects", () => {
    const html = consentPage(
      details({ redirectHost: "localhost", redirectIsLoopback: true }),
      "h",
      "you@example.com",
    );
    expect(html).toContain("not verified");
    expect(html).toContain("an app on this computer");
  });

  it("names the publisher of a metadata-document client", () => {
    const html = consentPage(
      details({ clientDomain: "client.example.com" }),
      "h",
      "you@example.com",
    );
    expect(html).toContain("Published by <strong>client.example.com</strong>");
    expect(html).not.toContain("an app on this computer");
  });
});
