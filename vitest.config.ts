import { defineConfig } from "vitest/config";

// Unit tests cover pure logic in shared/ and worker/. They run in Node without the Cloudflare and
// PWA plugins from vite.config.ts.
export default defineConfig({
  test: { include: ["shared/**/*.test.ts", "worker/**/*.test.ts", "src/**/*.test.ts"] },
});
