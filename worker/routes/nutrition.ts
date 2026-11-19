import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { dayTypeChoice, localDateSchema } from "../../shared/nutrition/schemas";
import { nutritionSettingsPatchSchema } from "../../shared/nutrition/settings";
import { localDate } from "../../shared/time";
import type { AppEnv } from "../auth";
import * as svc from "../services/nutrition";

// The app only reads meals (Claude logs them through MCP). It can change the day type and targets.

export const nutritionRoutes = new Hono<AppEnv>()
  .get(
    "/nutrition/day",
    zValidator("query", z.object({ date: localDateSchema.optional() })),
    async (c) => {
      const date = c.req.valid("query").date ?? localDate(Date.now(), c.var.tz);
      return c.json(await svc.getDay(c.var.db, c.var.user.id, date));
    },
  )
  .put(
    "/nutrition/day/:date/type",
    zValidator("param", z.object({ date: localDateSchema })),
    zValidator("json", z.object({ type: dayTypeChoice })),
    async (c) =>
      c.json(
        await svc.setDayType(
          c.var.db,
          c.var.user.id,
          c.req.valid("param").date,
          c.req.valid("json").type,
        ),
      ),
  )
  .get("/nutrition/settings", async (c) =>
    c.json(await svc.getNutritionTargets(c.var.db, c.var.user.id)),
  )
  .patch("/nutrition/settings", zValidator("json", nutritionSettingsPatchSchema), async (c) =>
    c.json(await svc.setNutritionTargets(c.var.db, c.var.user.id, c.var.tz, c.req.valid("json"))),
  );
