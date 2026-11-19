import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";

// Generates the PNG icons in public/ from public/icon.svg: `pnpm icons`. Outputs are committed.
export default defineConfig({
  preset: minimal2023Preset,
  images: ["public/icon.svg"],
});
