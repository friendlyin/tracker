import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import {
  createHabitInput,
  logHabitInput,
  startHabitInput,
  updateHabitInput,
} from "../../shared/habits/schemas";
import { localDateSchema } from "../../shared/nutrition/schemas";
import type { AppEnv } from "../auth";
import * as svc from "../services/habits";
import { dayUser } from "../services/levels";

// Writes answer with today's habits day. A habit timer stops through POST /focus/stop.

const who = (c: Context<AppEnv>) => dayUser(c.var.user, c.var.tz);
const day = async (c: Context<AppEnv>) => c.json(await svc.getHabitsDay(c.var.db, who(c)));
const idParam = zValidator("param", z.object({ id: z.uuid() }));

export const habitRoutes = new Hono<AppEnv>()
  .get("/habits", async (c) => c.json(await svc.listHabits(c.var.db, c.var.user.id)))
  .get(
    "/habits/day",
    zValidator("query", z.object({ date: localDateSchema.optional() })),
    async (c) => c.json(await svc.getHabitsDay(c.var.db, who(c), c.req.valid("query").date)),
  )
  .post("/habits", zValidator("json", createHabitInput), async (c) =>
    c.json(await svc.createHabit(c.var.db, c.var.user.id, c.req.valid("json"))),
  )
  .patch("/habits/:id", idParam, zValidator("json", updateHabitInput), async (c) =>
    c.json(
      await svc.updateHabit(c.var.db, c.var.user.id, c.req.valid("param").id, c.req.valid("json")),
    ),
  )
  .delete("/habits/:id", idParam, async (c) => {
    await svc.archiveHabit(c.var.db, c.var.user.id, c.req.valid("param").id);
    return c.body(null, 204);
  })
  .post("/habits/entries", zValidator("json", logHabitInput), async (c) => {
    await svc.logHabit(c.var.db, who(c), c.req.valid("json"), "app");
    return day(c);
  })
  .delete("/habits/entries/:id", idParam, async (c) => {
    await svc.deleteHabitEntry(c.var.db, who(c), c.req.valid("param").id);
    return day(c);
  })
  .post("/habits/start", zValidator("json", startHabitInput), async (c) => {
    await svc.startHabitTimer(c.var.db, who(c), c.req.valid("json"), "app");
    return day(c);
  });
