import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { ALL_METRICS, metricDef } from "../../../shared/metrics/registry";
import { metricsQuery, rangeQuery } from "../../../shared/metrics/schemas";
import { localDateSchema } from "../../../shared/nutrition/schemas";
import { exercise } from "../../db/schema";
import * as svc from "../../services/stats";
import { type McpCtx, tool } from "../util";

const round = (v: number) => Math.round(v * 10) / 10;

export function registerStatsTools(server: McpServer, ctx: McpCtx) {
  const { db, userId } = ctx;
  const u = { id: userId, tz: ctx.tz, schedule: ctx.schedule };

  tool(server, ctx, "list_metrics", {
    description:
      "The metrics the app keeps per day, across all features: id, label, unit, how days combine into weeks/months (aggregation), which direction is better, the dimension (muscle group, exercise id, focus tag) and the metric holding its target. Use the ids with get_metrics.",
    input: z.object({}),
    readOnly: true,
    run: async () => ALL_METRICS,
  });

  tool(server, ctx, "get_metrics", {
    description:
      "Values of one or more metrics (ids from list_metrics) for a local date range (at most 400 days), per day, week (Monday start) or month. Each row has the bucket's first day, the value combined by the metric's aggregation, and the days with data. Days without a row have no data (0 for counts, intake and minutes). Exercise dimensions come with the exercise name.",
    input: metricsQuery.extend({ metrics: z.array(z.string()).min(1).max(30) }),
    readOnly: true,
    run: async ({ metrics, ...q }) => {
      const res = await svc.getMetrics(db, u, { ...q, metrics });
      const exIds = [
        ...new Set(
          res.rows
            .filter((r) => metricDef(r.metric)?.dimension === "exercise")
            .map((r) => r.dimension),
        ),
      ];
      const names = new Map(
        exIds.length
          ? (
              await db
                .select({ id: exercise.id, name: exercise.name })
                .from(exercise)
                .where(inArray(exercise.id, exIds))
            ).map((e) => [e.id, e.name])
          : [],
      );
      return {
        from: res.from,
        to: res.to,
        bucket: res.bucket,
        rows: res.rows.map((r) => {
          const agg = metricDef(r.metric)?.aggregation;
          const value =
            agg === "sum" ? r.sum : agg === "avg" ? r.sum / r.days : agg === "max" ? r.max : r.min;
          return {
            metric: r.metric,
            bucket: r.bucket,
            ...(r.dimension ? { dimension: r.dimension } : {}),
            ...(names.has(r.dimension) ? { exercise: names.get(r.dimension) } : {}),
            value: round(value),
            days: r.days,
          };
        }),
      };
    },
  });

  tool(server, ctx, "get_progression", {
    description:
      "Strength progress for a local date range: per exercise the best estimated 1RM per session (Epley; best reps for exercises done without weight) and the trend (a least-squares line, % change from the first to the last session; needs 3+ sessions), and per muscle group the mean change of its primary exercises.",
    input: rangeQuery,
    readOnly: true,
    run: async ({ from, to }) => {
      const p = await svc.getProgression(db, userId, from, to);
      return {
        ...p,
        exercises: p.exercises.map((e) => ({
          ...e,
          trend: e.trend && {
            start: round(e.trend.start),
            end: round(e.trend.end),
            changePct: round(e.trend.changePct),
          },
        })),
        groups: p.groups.map((g) => ({
          ...g,
          changePct: g.changePct === null ? null : round(g.changePct),
        })),
      };
    },
  });

  tool(server, ctx, "get_day", {
    description:
      "One local date across all features: that day's metric values (see list_metrics) and the workouts done.",
    input: z.object({ date: localDateSchema }),
    readOnly: true,
    run: async ({ date }) => svc.getDay(db, u, date),
  });
}
