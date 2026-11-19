import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { logWaterInput } from "../../shared/water/schemas";
import { waterSettingsPatchSchema } from "../../shared/water/settings";
import type { AppEnv } from "../auth";
import * as svc from "../services/water";

// Writes answer with fresh inputs, so the client replaces its cache and simulates from there.

const who = (c: Context<AppEnv>) => svc.waterUser(c.var.user, c.var.tz);

export const waterRoutes = new Hono<AppEnv>()
  .get("/water/day", async (c) => c.json(await svc.getWaterInputs(c.var.db, who(c))))
  .post("/water/entries", zValidator("json", logWaterInput), async (c) => {
    await svc.logWater(c.var.db, who(c), c.req.valid("json"), "app");
    return c.json(await svc.getWaterInputs(c.var.db, who(c)));
  })
  .delete("/water/entries/:id", zValidator("param", z.object({ id: z.uuid() })), async (c) => {
    await svc.deleteWater(c.var.db, who(c), c.req.valid("param").id);
    return c.json(await svc.getWaterInputs(c.var.db, who(c)));
  })
  .get("/water/settings", async (c) => c.json(await svc.getWaterSettings(c.var.db, c.var.user.id)))
  .patch("/water/settings", zValidator("json", waterSettingsPatchSchema), async (c) =>
    c.json(await svc.setWaterSettings(c.var.db, who(c), c.req.valid("json"))),
  );
