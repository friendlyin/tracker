import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import {
  addSetInput,
  createExerciseInput,
  finishWorkoutInput,
  logWorkoutInput,
  startWorkoutInput,
  updateExerciseInput,
  updateSetInput,
} from "../../shared/workouts/schemas";
import { workoutSettingsPatchSchema } from "../../shared/workouts/settings";
import type { AppEnv } from "../auth";
import * as svc from "../services/workouts";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const workoutRoutes = new Hono<AppEnv>()
  .get("/overview", async (c) => c.json(await svc.getOverview(c.var.db, c.var.user.id, c.var.tz)))
  .get("/settings", async (c) => c.json(await svc.getWorkoutSettings(c.var.db, c.var.user.id)))
  .patch("/settings", zValidator("json", workoutSettingsPatchSchema), async (c) =>
    c.json(await svc.updateWorkoutSettings(c.var.db, c.var.user.id, c.req.valid("json"))),
  )
  .get(
    "/workouts",
    zValidator(
      "query",
      z.object({ from: date.optional(), to: date.optional(), limit: z.coerce.number().optional() }),
    ),
    async (c) => c.json(await svc.listWorkouts(c.var.db, c.var.user.id, c.req.valid("query"))),
  )
  .post("/workouts", zValidator("json", startWorkoutInput), async (c) =>
    c.json(await svc.startWorkout(c.var.db, c.var.user.id, c.var.tz, c.req.valid("json"))),
  )
  .post("/workouts/log", zValidator("json", logWorkoutInput), async (c) =>
    c.json(await svc.logWorkout(c.var.db, c.var.user.id, c.var.tz, c.req.valid("json"))),
  )
  .get("/workouts/:id", async (c) => {
    const w = await svc.getWorkout(c.var.db, c.var.user.id, c.req.param("id"));
    return w ? c.json(w) : c.json({ error: "not_found" }, 404);
  })
  .post("/workouts/:id/finish", zValidator("json", finishWorkoutInput), async (c) =>
    c.json(
      await svc.finishWorkout(
        c.var.db,
        c.var.user.id,
        c.req.param("id"),
        c.req.valid("json").endedAt,
      ),
    ),
  )
  .delete("/workouts/:id", async (c) => {
    await svc.deleteWorkout(c.var.db, c.var.user.id, c.req.param("id"));
    return c.json({ ok: true });
  })
  .post("/sets", zValidator("json", addSetInput), async (c) =>
    c.json(await svc.addSet(c.var.db, c.var.user.id, c.req.valid("json"))),
  )
  .patch("/sets/:id", zValidator("json", updateSetInput), async (c) =>
    c.json(await svc.updateSet(c.var.db, c.var.user.id, c.req.param("id"), c.req.valid("json"))),
  )
  .delete("/sets/:id", async (c) => {
    await svc.deleteSet(c.var.db, c.var.user.id, c.req.param("id"));
    return c.json({ ok: true });
  })
  .get("/exercises", async (c) =>
    c.json(
      await svc.listExercises(c.var.db, c.var.user.id, {
        includeArchived: c.req.query("archived") === "1",
      }),
    ),
  )
  .post("/exercises", zValidator("json", createExerciseInput), async (c) =>
    c.json(await svc.createExercise(c.var.db, c.var.user.id, c.req.valid("json"))),
  )
  .patch("/exercises/:id", zValidator("json", updateExerciseInput), async (c) =>
    c.json(
      await svc.updateExercise(c.var.db, c.var.user.id, c.req.param("id"), c.req.valid("json")),
    ),
  )
  .post(
    "/exercises/:id/archive",
    zValidator("json", z.object({ archived: z.boolean().default(true) })),
    async (c) =>
      c.json(
        await svc.archiveExercise(
          c.var.db,
          c.var.user.id,
          c.req.param("id"),
          c.req.valid("json").archived,
        ),
      ),
  )
  .get(
    "/exercises/:id/history",
    zValidator(
      "query",
      z.object({ limit: z.coerce.number().optional(), exclude: z.string().optional() }),
    ),
    async (c) => {
      const q = c.req.valid("query");
      return c.json(
        await svc.getExerciseHistory(c.var.db, c.var.user.id, c.req.param("id"), {
          limit: q.limit,
          excludeWorkoutId: q.exclude,
        }),
      );
    },
  );
