import { defineConfig } from "drizzle-kit";

// Generates SQL migrations into ./migrations; they are applied with wrangler (pnpm db:migrate:*).
export default defineConfig({
  dialect: "sqlite",
  schema: "./worker/db/schema.ts",
  out: "./migrations",
});
