import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Bucket } from "../../shared/metrics/periods";
import { type DayRow, progression } from "../../shared/metrics/progress";
import { isMetricId, METRICS } from "../../shared/metrics/registry";
import type { DayStatsDto, MetricsDto, ProgressionDto } from "../../shared/metrics/types";
import type { Db } from "../db";
import { exercise, exerciseMuscle, metricDaily } from "../db/schema";
import { checkRange } from "./entries";
import { InvalidError } from "./errors";
import { finalizeFocusDays } from "./focus";
import type { DayUser } from "./levels";
import { finalizeWaterDays } from "./water";
import { listWorkouts } from "./workouts";

// Stats read path. Everything comes from the `metric_daily` rollups, aggregated per bucket in SQL, so
// a request costs one small query whatever the period (Workers Free: 10 ms CPU, 50 queries).

const BUCKET_SQL: Record<Bucket, ReturnType<typeof sql>> = {
  day: sql`${metricDaily.localDate}`,
  // The Monday of the week: step back 6 days, then forward to the next Monday.
  week: sql`date(${metricDaily.localDate}, '-6 days', 'weekday 1')`,
  month: sql`substr(${metricDaily.localDate}, 1, 7) || '-01'`,
};

/** Closed-day rollups (time at the water cap, lowest energy) exist only once the day is finalised. */
async function finalizeFor(db: Db, u: DayUser, metrics: readonly string[]) {
  const water = metrics.some((m) => m.startsWith("water."));
  const focus = metrics.some((m) => m.startsWith("focus.") || m.startsWith("sleep."));
  await Promise.all([
    water ? finalizeWaterDays(db, u) : undefined,
    focus ? finalizeFocusDays(db, u) : undefined,
  ]);
}

export async function getMetrics(
  db: Db,
  u: DayUser,
  q: { metrics: string[]; from: string; to: string; bucket: Bucket },
): Promise<MetricsDto> {
  checkRange(q.from, q.to);
  const unknown = q.metrics.filter((m) => !isMetricId(m));
  if (unknown.length) throw new InvalidError(`unknown metrics: ${unknown.join(", ")}`);
  if (q.metrics.length === 0) throw new InvalidError("no metrics");
  await finalizeFor(db, u, q.metrics);

  const b = BUCKET_SQL[q.bucket];
  const rows = await db
    .select({
      metric: metricDaily.metric,
      dimension: metricDaily.dimension,
      bucket: sql<string>`${b}`,
      sum: sql<number>`sum(${metricDaily.value})`,
      min: sql<number>`min(${metricDaily.value})`,
      max: sql<number>`max(${metricDaily.value})`,
      days: sql<number>`count(*)`,
    })
    .from(metricDaily)
    .where(
      and(
        eq(metricDaily.userId, u.id),
        inArray(metricDaily.metric, q.metrics),
        gte(metricDaily.localDate, q.from),
        lte(metricDaily.localDate, q.to),
      ),
    )
    .groupBy(metricDaily.metric, metricDaily.dimension, b);
  return { from: q.from, to: q.to, bucket: q.bucket, rows };
}

/** Strength progress per exercise and muscle group over [from, to]. */
export async function getProgression(
  db: Db,
  userId: string,
  from: string,
  to: string,
): Promise<ProgressionDto> {
  checkRange(from, to);
  const ids = [METRICS.e1rm.id, METRICS.topSet.id, METRICS.bestReps.id];
  const [rows, exercises, muscles] = await Promise.all([
    db
      .select({
        metric: metricDaily.metric,
        date: metricDaily.localDate,
        exerciseId: metricDaily.dimension,
        value: metricDaily.value,
      })
      .from(metricDaily)
      .where(
        and(
          eq(metricDaily.userId, userId),
          inArray(metricDaily.metric, ids),
          gte(metricDaily.localDate, from),
          lte(metricDaily.localDate, to),
        ),
      ),
    db
      .select({ id: exercise.id, name: exercise.name })
      .from(exercise)
      .where(eq(exercise.userId, userId)),
    db
      .select({
        exerciseId: exerciseMuscle.exerciseId,
        group: exerciseMuscle.group,
        contribution: exerciseMuscle.contribution,
      })
      .from(exerciseMuscle)
      .where(eq(exerciseMuscle.userId, userId)),
  ]);

  const days = new Map<string, DayRow>();
  for (const r of rows) {
    const key = `${r.exerciseId}|${r.date}`;
    let d = days.get(key);
    if (!d) {
      d = { exerciseId: r.exerciseId, date: r.date };
      days.set(key, d);
    }
    if (r.metric === METRICS.e1rm.id) d.e1rm = r.value;
    else if (r.metric === METRICS.topSet.id) d.topSet = r.value;
    else d.reps = r.value;
  }
  const byExercise = new Map<string, { group: string; contribution: number }[]>();
  for (const m of muscles) {
    const list = byExercise.get(m.exerciseId) ?? [];
    list.push({ group: m.group, contribution: m.contribution });
    byExercise.set(m.exerciseId, list);
  }
  const result = progression(
    exercises.map((e) => ({ ...e, muscles: byExercise.get(e.id) ?? [] })),
    [...days.values()],
  );
  return { from, to, ...result };
}

/** One day across features: its rollups and the workouts done. */
export async function getDay(db: Db, u: DayUser, date: string): Promise<DayStatsDto> {
  await finalizeFor(db, u, ["water.", "focus."]);
  const [rows, workouts] = await Promise.all([
    db
      .select({
        metric: metricDaily.metric,
        dimension: metricDaily.dimension,
        value: metricDaily.value,
      })
      .from(metricDaily)
      .where(and(eq(metricDaily.userId, u.id), eq(metricDaily.localDate, date))),
    listWorkouts(db, u.id, { from: date, to: date }),
  ]);
  return {
    date,
    rows,
    workouts: workouts.map((w) => ({
      id: w.id,
      workingSets: w.workingSets,
      exercises: w.exercises,
    })),
  };
}
