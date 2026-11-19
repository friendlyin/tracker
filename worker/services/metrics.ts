import { and, eq, inArray, sql } from "drizzle-orm";
import { METRICS } from "../../shared/metrics/registry";
import {
  type MetricRow,
  TRACKERS,
  type TrackerDef,
  type TrackerKey,
} from "../../shared/tracking/trackers";
import { chunkRows, type Db } from "../db";
import { entry, exerciseMuscle, metricDaily, workout, workoutSet } from "../db/schema";

const WORKOUT_METRICS = [
  METRICS.workoutsCount.id,
  METRICS.workingSets.id,
  METRICS.topSet.id,
  METRICS.e1rm.id,
  METRICS.bestReps.id,
];

/** Rebuilds the workout rows of `metric_daily` for one local date. Called after every workout write. */
export async function recomputeWorkoutDay(db: Db, userId: string, localDate: string) {
  const dayFilter = and(
    eq(workout.userId, userId),
    eq(workoutSet.userId, userId),
    eq(workout.localDate, localDate),
  );

  const [countRows, groupRows, exerciseRows] = await Promise.all([
    db
      .select({ n: sql<number>`count(distinct ${workout.id})` })
      .from(workout)
      .innerJoin(workoutSet, eq(workoutSet.workoutId, workout.id))
      .where(dayFilter),
    db
      .select({
        group: exerciseMuscle.group,
        value: sql<number>`sum(${exerciseMuscle.contribution})`,
      })
      .from(workoutSet)
      .innerJoin(workout, eq(workout.id, workoutSet.workoutId))
      .innerJoin(exerciseMuscle, eq(exerciseMuscle.exerciseId, workoutSet.exerciseId))
      .where(and(dayFilter, eq(exerciseMuscle.userId, userId), eq(workoutSet.kind, "working")))
      .groupBy(exerciseMuscle.group),
    db
      .select({
        exerciseId: workoutSet.exerciseId,
        // Weighted sets only; null when every set was without weight.
        top: sql<
          number | null
        >`max(case when ${workoutSet.weightKg} > 0 then ${workoutSet.weightKg} end)`,
        e1rm: sql<
          number | null
        >`max(case when ${workoutSet.weightKg} > 0 then (case when ${workoutSet.reps} = 1 then ${workoutSet.weightKg} else ${workoutSet.weightKg} * (1 + ${workoutSet.reps} / 30.0) end) end)`,
        reps: sql<number>`max(${workoutSet.reps})`,
      })
      .from(workoutSet)
      .innerJoin(workout, eq(workout.id, workoutSet.workoutId))
      .where(and(dayFilter, eq(workoutSet.kind, "working")))
      .groupBy(workoutSet.exerciseId),
  ]);

  const rows: MetricRow[] = [];
  const workouts = countRows[0]?.n ?? 0;
  if (workouts > 0) rows.push({ metric: METRICS.workoutsCount.id, value: workouts });
  for (const g of groupRows) {
    rows.push({
      metric: METRICS.workingSets.id,
      dimension: g.group,
      value: g.value,
    });
  }
  for (const e of exerciseRows) {
    const dimension = e.exerciseId;
    if (e.top !== null) rows.push({ metric: METRICS.topSet.id, dimension, value: e.top });
    if (e.e1rm !== null) rows.push({ metric: METRICS.e1rm.id, dimension, value: e.e1rm });
    rows.push({ metric: METRICS.bestReps.id, dimension, value: e.reps });
  }

  await replaceMetrics(db, userId, localDate, WORKOUT_METRICS, rows);
}

/** Replaces one local day's rows of the given metrics in a single batch. */
export async function replaceMetrics(
  db: Db,
  userId: string,
  localDate: string,
  metricIds: readonly string[],
  rows: readonly MetricRow[],
) {
  const values = rows.map((r) => ({ userId, localDate, ...r }));
  await db.batch([
    db
      .delete(metricDaily)
      .where(
        and(
          eq(metricDaily.userId, userId),
          eq(metricDaily.localDate, localDate),
          inArray(metricDaily.metric, [...metricIds]),
        ),
      ),
    ...chunkRows(values, 5).map((chunk) => db.insert(metricDaily).values(chunk)),
  ]);
}

/** Rebuilds a tracker's rows of `metric_daily` for one local date. Called after every entry write. */
export async function recomputeTrackerDay(
  db: Db,
  userId: string,
  key: TrackerKey,
  localDate: string,
) {
  const def: TrackerDef<unknown> = TRACKERS[key];
  const rows = await db
    .select()
    .from(entry)
    .where(and(eq(entry.userId, userId), eq(entry.tracker, key), eq(entry.localDate, localDate)));
  // `data` was validated on write.
  await replaceMetrics(db, userId, localDate, def.metricIds, def.metrics(rows));
}
