import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    // Must come before react(): generates src/routeTree.gen.ts from src/routes/.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    cloudflare(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Health",
        short_name: "Health",
        display: "standalone",
        start_url: "/",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      workbox: {
        // Precache the app shell only; never serve API/MCP/auth from the SW cache.
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/mcp/,
          /^\/authorize/,
          /^\/token/,
          /^\/register/,
          /^\/callback/,
        ],
      },
    }),
  ],
});
