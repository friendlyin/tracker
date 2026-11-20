import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { type HomeDto, type MeDto, profilePatchSchema } from "../shared/profile";
import { localDate } from "../shared/time";
import { type AppEnv, identify, isLocalHost, isLoopback, requireUser } from "./auth";
import { getDb } from "./db";
import type { User } from "./db/schema";
import { handleMcp } from "./mcp";
import { withOAuth } from "./oauth";
import { focusRoutes } from "./routes/focus";
import { habitRoutes } from "./routes/habits";
import { nutritionRoutes } from "./routes/nutrition";
import { pushRoutes } from "./routes/push";
import { statsRoutes } from "./routes/stats";
import { waterRoutes } from "./routes/water";
import { workoutRoutes } from "./routes/workouts";
import { InvalidError, NotFoundError } from "./services/errors";
import { dayUser } from "./services/levels";
import { refreshNotify, runDue, vapidFrom } from "./services/notify";
import { getDayStatus } from "./services/nutrition";
import { ensureUser, updateProfile } from "./services/users";
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
  // Any change can move a reminder (a drink, a session, settings, the day schedule): replan after
  // every successful write, without delaying the answer.
  .use(async (c, next) => {
    await next();
    if (c.req.method === "GET" || c.res.status >= 300 || c.req.path.endsWith("/push/test")) return;
    const { db, user, tz } = c.var;
    const work = refreshNotify(db, dayUser(user, tz)).catch((e) => console.error("replan", e));
    try {
      c.executionCtx.waitUntil(work);
    } catch {
      await work;
    }
  })
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
  .route("/", focusRoutes)
  .route("/", statsRoutes)
  .route("/", habitRoutes)
  .route("/", pushRoutes);

api.onError((err, c) => {
  if (err instanceof NotFoundError) return c.json({ error: "not_found", what: err.message }, 404);
  if (err instanceof InvalidError) return c.json({ error: "invalid", message: err.message }, 400);
  console.error(err);
  return c.json({ error: "internal" }, 500);
});

const withAuth = withOAuth((req, env, ctx) => api.fetch(req, env, ctx));

/** Local development as DEV_USER_EMAIL: `/mcp` without a token acts as that user. */
async function devMcp(req: Request, env: Env): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname !== "/mcp" && url.pathname !== "/mcp/") return null;
  if (req.headers.has("authorization")) return null;
  const email = await identify(req, env);
  if (!email) return null;
  const db = getDb(env.DB);
  return handleMcp(req, db, await ensureUser(db, email, "UTC"));
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (isLocalHost(url.hostname)) {
      const dev = await devMcp(req, env);
      if (dev) return dev;
      // OAuth needs https or a loopback host; a LAN address (phone testing) gets the plain API.
      if (!isLoopback(url.hostname)) return api.fetch(req, env, ctx);
    }
    return withAuth(req, env, ctx);
  },

  /** Every minute: send the notifications that are due. */
  async scheduled(_controller, env, ctx) {
    const vapid = vapidFrom(env);
    if (vapid) ctx.waitUntil(runDue(getDb(env.DB), vapid));
  },
} satisfies ExportedHandler<Env>;
