import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import {
  logFocusInput,
  setSleepInput,
  startFocusInput,
  stopFocusInput,
  updateFocusInput,
} from "../../shared/focus/schemas";
import { focusSettingsPatchSchema } from "../../shared/focus/settings";
import type { AppEnv } from "../auth";
import { parseTime } from "../services/entries";
import * as svc from "../services/focus";
import { dayUser } from "../services/levels";

// Writes answer with fresh inputs. The app sends writes through its offline outbox and refetches
// instead; the answer is for other clients.

const who = (c: Context<AppEnv>) => dayUser(c.var.user, c.var.tz);
const inputs = async (c: Context<AppEnv>) => c.json(await svc.getFocusInputs(c.var.db, who(c)));
const idParam = zValidator("param", z.object({ id: z.uuid() }));

export const focusRoutes = new Hono<AppEnv>()
  .get("/focus/day", inputs)
  .post("/focus/entries", zValidator("json", logFocusInput), async (c) => {
    await svc.logFocus(c.var.db, who(c), c.req.valid("json"), "app");
    return inputs(c);
  })
  .post("/focus/start", zValidator("json", startFocusInput), async (c) => {
    await svc.startFocus(c.var.db, who(c), c.req.valid("json"), "app");
    return inputs(c);
  })
  .patch("/focus/entries/:id", idParam, zValidator("json", updateFocusInput), async (c) => {
    await svc.updateFocus(c.var.db, who(c), c.req.valid("param").id, c.req.valid("json"));
    return inputs(c);
  })
  .delete("/focus/entries/:id", idParam, async (c) => {
    await svc.deleteFocus(c.var.db, who(c), c.req.valid("param").id);
    return inputs(c);
  })
  .post("/focus/stop", zValidator("json", stopFocusInput), async (c) => {
    const { time, id } = c.req.valid("json");
    await svc.stopFocus(c.var.db, who(c), parseTime(time), id);
    return inputs(c);
  })
  .put("/focus/sleep", zValidator("json", setSleepInput), async (c) => {
    await svc.setSleep(c.var.db, who(c), c.req.valid("json"), "app");
    return inputs(c);
  })
  .get("/focus/settings", async (c) => c.json(await svc.getFocusSettings(c.var.db, c.var.user.id)))
  .patch("/focus/settings", zValidator("json", focusSettingsPatchSchema), async (c) =>
    c.json(await svc.setFocusSettings(c.var.db, c.var.user.id, c.req.valid("json"))),
  );
