import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { metricsQuery, rangeQuery } from "../../shared/metrics/schemas";
import { localDateSchema } from "../../shared/nutrition/schemas";
import type { AppEnv } from "../auth";
import { dayUser } from "../services/levels";
import * as svc from "../services/stats";

export const statsRoutes = new Hono<AppEnv>()
  .get(
    "/stats/metrics",
    zValidator("query", metricsQuery.extend({ ids: z.string().min(1) })),
    async (c) => {
      const { ids, ...q } = c.req.valid("query");
      const u = dayUser(c.var.user, c.var.tz);
      return c.json(await svc.getMetrics(c.var.db, u, { ...q, metrics: ids.split(",") }));
    },
  )
  .get("/stats/progression", zValidator("query", rangeQuery), async (c) => {
    const { from, to } = c.req.valid("query");
    return c.json(await svc.getProgression(c.var.db, c.var.user.id, from, to));
  })
  .get("/stats/day", zValidator("query", z.object({ date: localDateSchema })), async (c) =>
    c.json(await svc.getDay(c.var.db, dayUser(c.var.user, c.var.tz), c.req.valid("query").date)),
  );
