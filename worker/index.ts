import { Hono } from "hono";

// Single Worker for the whole backend. Today: /api. Later: auth, /mcp (Claude), cron sync (WHOOP).
const api = new Hono<{ Bindings: Env }>().basePath("/api").get("/health", async (c) => {
  const row = await c.env.DB.prepare("select 1 as ok").first<{ ok: number }>();
  return c.json({ ok: row?.ok === 1 });
});

export type ApiType = typeof api;

export default {
  fetch: api.fetch,
} satisfies ExportedHandler<Env>;
