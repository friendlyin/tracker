import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { type HomeDto, type MeDto, profilePatchSchema } from "../shared/profile";
import { localDate } from "../shared/time";
import { type AppEnv, requireUser } from "./auth";
import type { User } from "./db/schema";
import { handleMcp } from "./mcp";
import { focusRoutes } from "./routes/focus";
import { nutritionRoutes } from "./routes/nutrition";
import { waterRoutes } from "./routes/water";
import { workoutRoutes } from "./routes/workouts";
import { InvalidError, NotFoundError } from "./services/errors";
import { getDayStatus } from "./services/nutrition";
import { updateProfile } from "./services/users";
import { getActiveWorkout, getWeekPlan } from "./services/workouts";

function toMe(u: User): MeDto {
  const { id, email, name, timezone, wakeTime, sleepTime } = u;
  return { id, email, name, timezone, wakeTime, sleepTime };
}

const api = new Hono<AppEnv>()
  .basePath("/api")
  .get("/health", async (c) => {
    const row = await c.env.DB.prepare("select 1 as ok").first<{ ok: number }>();
    return c.json({ ok: row?.ok === 1 });
  })
  .use(requireUser)
  .get("/me", (c) => c.json(toMe(c.var.user)))
  .patch("/me", zValidator("json", profilePatchSchema), async (c) =>
    c.json(toMe(await updateProfile(c.var.db, c.var.user.id, c.req.valid("json")))),
  )
  .get("/home", async (c) => {
    const { db, user, tz } = c.var;
    const today = localDate(Date.now(), tz);
    const active = await getActiveWorkout(db, user.id);
    const [{ plan }, nutrition] = await Promise.all([
      getWeekPlan(db, user.id, today, { hasActive: active !== null }),
      getDayStatus(db, user.id, today),
    ]);
    const body: HomeDto = { workouts: { ...plan.totals, active: active !== null }, nutrition };
    return c.json(body);
  })
  .route("/", workoutRoutes)
  .route("/", nutritionRoutes)
  .route("/", waterRoutes)
  .route("/", focusRoutes);

api.onError((err, c) => {
  if (err instanceof NotFoundError) return c.json({ error: "not_found", what: err.message }, 404);
  if (err instanceof InvalidError) return c.json({ error: "invalid", message: err.message }, 400);
  console.error(err);
  return c.json({ error: "internal" }, 500);
});

export default {
  fetch(req, env, ctx) {
    const { pathname } = new URL(req.url);
    if (pathname === "/mcp" || pathname === "/mcp/") return handleMcp(req, env);
    return api.fetch(req, env, ctx);
  },
} satisfies ExportedHandler<Env>;
