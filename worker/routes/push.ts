import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { notifySettingsPatchSchema, pushSubscriptionInput } from "../../shared/notify/settings";
import type { AppEnv } from "../auth";
import * as svc from "../services/notify";

// Device registration for push, and the notification settings that belong to no feature. The app
// calls these directly (not through the offline outbox): subscribing needs the device online anyway.

export const pushRoutes = new Hono<AppEnv>()
  .get("/push/key", (c) => c.json({ publicKey: svc.vapidFrom(c.env)?.publicKey ?? null }))
  .post("/push/subscriptions", zValidator("json", pushSubscriptionInput), async (c) => {
    await svc.subscribe(c.var.db, c.var.user.id, c.req.valid("json"));
    return c.body(null, 204);
  })
  .post("/push/unsubscribe", zValidator("json", z.object({ endpoint: z.string() })), async (c) => {
    await svc.unsubscribe(c.var.db, c.var.user.id, c.req.valid("json").endpoint);
    return c.body(null, 204);
  })
  .post("/push/test", async (c) => {
    const vapid = svc.vapidFrom(c.env);
    if (!vapid) return c.json({ error: "not_configured" }, 503);
    return c.json(await svc.sendTest(c.var.db, c.var.user.id, vapid));
  })
  .get("/notify/settings", async (c) =>
    c.json(await svc.getNotifySettings(c.var.db, c.var.user.id)),
  )
  .patch("/notify/settings", zValidator("json", notifySettingsPatchSchema), async (c) =>
    c.json(await svc.setNotifySettings(c.var.db, c.var.user.id, c.req.valid("json"))),
  );
