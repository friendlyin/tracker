import { and, eq, gt, inArray, sql } from "drizzle-orm";
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
        top: sql<number>`max(${workoutSet.weightKg})`,
        e1rm: sql<number>`max(case when ${workoutSet.reps} = 1 then ${workoutSet.weightKg} else ${workoutSet.weightKg} * (1 + ${workoutSet.reps} / 30.0) end)`,
      })
      .from(workoutSet)
      .innerJoin(workout, eq(workout.id, workoutSet.workoutId))
      .where(and(dayFilter, eq(workoutSet.kind, "working"), gt(workoutSet.weightKg, 0)))
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
    rows.push({
      metric: METRICS.topSet.id,
      dimension: e.exerciseId,
      value: e.top,
    });
    rows.push({
      metric: METRICS.e1rm.id,
      dimension: e.exerciseId,
      value: e.e1rm,
    });
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
