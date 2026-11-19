import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { METRICS } from "../../shared/metrics/registry";
import { chunkRows, type Db } from "../db";
import { exerciseMuscle, metricDaily, workout, workoutSet } from "../db/schema";

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

  const rows: (typeof metricDaily.$inferInsert)[] = [];
  const workouts = countRows[0]?.n ?? 0;
  if (workouts > 0)
    rows.push({ userId, localDate, metric: METRICS.workoutsCount.id, value: workouts });
  for (const g of groupRows) {
    rows.push({
      userId,
      localDate,
      metric: METRICS.workingSets.id,
      dimension: g.group,
      value: g.value,
    });
  }
  for (const e of exerciseRows) {
    rows.push({
      userId,
      localDate,
      metric: METRICS.topSet.id,
      dimension: e.exerciseId,
      value: e.top,
    });
    rows.push({
      userId,
      localDate,
      metric: METRICS.e1rm.id,
      dimension: e.exerciseId,
      value: e.e1rm,
    });
  }

  await db.batch([
    db
      .delete(metricDaily)
      .where(
        and(
          eq(metricDaily.userId, userId),
          eq(metricDaily.localDate, localDate),
          inArray(metricDaily.metric, WORKOUT_METRICS),
        ),
      ),
    ...chunkRows(rows, 5).map((chunk) => db.insert(metricDaily).values(chunk)),
  ]);
}
