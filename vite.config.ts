import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  define: {
    // Busts the persisted query cache on every build (see src/lib/queryClient.ts).
    "import.meta.env.VITE_BUILD_ID": JSON.stringify(
      process.env.WORKERS_CI_COMMIT_SHA ?? String(Date.now()),
    ),
  },
  plugins: [
    // Must come before react(): generates src/routeTree.gen.ts from src/routes/.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    cloudflare(),
    VitePWA({
      registerType: "autoUpdate",
      // Registered from src/lib/pwa.ts, which reloads the page when a new build takes over.
      injectRegister: false,
      includeAssets: ["favicon.ico", "apple-touch-icon-180x180.png", "icon.svg"],
      manifest: {
        name: "Tracker",
        short_name: "Tracker",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        background_color: "#fafaf8",
        theme_color: "#fafaf8",
        icons: [
          { src: "/pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // A new build takes over at once (and src/lib/pwa.ts reloads the page). The plugin sets these
        // only when it injects its own registration.
        skipWaiting: true,
        clientsClaim: true,
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
