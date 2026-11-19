import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import { uuidv7 } from "../../shared/id";
import { localDate, weekRange } from "../../shared/time";
import { emptyVolume, planWeek, type Volume } from "../../shared/workouts/budget";
import { isMuscleGroup, type MuscleGroup } from "../../shared/workouts/groups";
import {
  type AddSetInput,
  type CreateExerciseInput,
  type LogWorkoutInput,
  type UpdateExerciseInput,
  type UpdateSetInput,
  workoutSettingsKey,
} from "../../shared/workouts/schemas";
import type { Equipment } from "../../shared/workouts/seed";
import {
  applyWorkoutSettingsPatch,
  parseWorkoutSettings,
  type WorkoutSettings,
  type WorkoutSettingsPatch,
} from "../../shared/workouts/settings";
import type {
  ExerciseDto,
  ExerciseSessionDto,
  SetDto,
  WorkoutDto,
  WorkoutSummaryDto,
  WorkoutsOverviewDto,
} from "../../shared/workouts/types";
import { chunkRows, type Db } from "../db";
import { exercise, exerciseMuscle, workout, workoutSet } from "../db/schema";
import { InvalidError, NotFoundError } from "./errors";
import { recomputeWorkoutDay } from "./metrics";
import { recomputeNutritionTargets } from "./nutrition";
import { addMissingSeedExercises, getSetting, putSetting } from "./users";

// Workout domain logic. Every function takes the authenticated userId and filters by it. The API
// routes and the MCP tools are thin wrappers over these functions. Creating or deleting a workout
// also refreshes the nutrition targets of that day, because the automatic day type follows workouts.

export { InvalidError, NotFoundError };

/** An open workout with no new set for this long is closed automatically at its last set. */
const STALE_MS = 3 * 60 * 60 * 1000;
const RECENT_USAGE_MS = 8 * 7 * 24 * 60 * 60 * 1000;

type SetRow = typeof workoutSet.$inferSelect;
type WorkoutRow = typeof workout.$inferSelect;

function toSetDto(r: SetRow): SetDto {
  return {
    id: r.id,
    workoutId: r.workoutId,
    exerciseId: r.exerciseId,
    position: r.position,
    kind: r.kind,
    reps: r.reps,
    weightKg: r.weightKg,
    performedAt: r.performedAt,
  };
}

function toWorkoutDto(w: WorkoutRow, sets: SetRow[]): WorkoutDto {
  return {
    id: w.id,
    startedAt: w.startedAt,
    endedAt: w.endedAt,
    localDate: w.localDate,
    tz: w.tz,
    sets: sets.map(toSetDto),
  };
}

// ---------- settings ----------

export async function getWorkoutSettings(db: Db, userId: string): Promise<WorkoutSettings> {
  return parseWorkoutSettings(await getSetting(db, userId, workoutSettingsKey));
}

export async function updateWorkoutSettings(
  db: Db,
  userId: string,
  patch: WorkoutSettingsPatch,
): Promise<WorkoutSettings> {
  const next = applyWorkoutSettingsPatch(await getWorkoutSettings(db, userId), patch);
  await putSetting(db, userId, workoutSettingsKey, next);
  return next;
}

// ---------- workouts ----------

async function findWorkout(db: Db, userId: string, id: string) {
  return db.query.workout.findFirst({ where: and(eq(workout.userId, userId), eq(workout.id, id)) });
}

async function setsOf(db: Db, userId: string, workoutId: string) {
  return db
    .select()
    .from(workoutSet)
    .where(and(eq(workoutSet.userId, userId), eq(workoutSet.workoutId, workoutId)))
    .orderBy(asc(workoutSet.position));
}

/** Ends a workout; an empty workout is deleted instead, so it never counts. */
async function closeWorkout(
  db: Db,
  userId: string,
  w: WorkoutRow,
  sets: SetRow[],
  endedAt: number,
) {
  if (sets.length === 0) {
    await db.delete(workout).where(and(eq(workout.userId, userId), eq(workout.id, w.id)));
    await recomputeNutritionTargets(db, userId, w.localDate);
    return null;
  }
  const [row] = await db
    .update(workout)
    .set({ endedAt, updatedAt: Date.now() })
    .where(and(eq(workout.userId, userId), eq(workout.id, w.id)))
    .returning();
  await recomputeWorkoutDay(db, userId, w.localDate);
  return row ? toWorkoutDto(row, sets) : null;
}

export async function getActiveWorkout(db: Db, userId: string, now = Date.now()) {
  const w = await db.query.workout.findFirst({
    where: and(eq(workout.userId, userId), isNull(workout.endedAt)),
    orderBy: desc(workout.startedAt),
  });
  if (!w) return null;
  const sets = await setsOf(db, userId, w.id);
  const last = sets.reduce((m, s) => Math.max(m, s.performedAt), w.startedAt);
  if (now - last > STALE_MS) {
    await closeWorkout(db, userId, w, sets, last);
    return null;
  }
  return toWorkoutDto(w, sets);
}

/**
 * Starts workout `id` (idempotent). The app starts one only when it knows of none running, and may
 * sync it late (offline). A different workout still open here (another device, an outdated cache)
 * therefore ends at its last set, so the sets queued for `id` always find their workout.
 */
export async function startWorkout(
  db: Db,
  userId: string,
  tz: string,
  input: { id: string; startedAt?: number },
): Promise<WorkoutDto> {
  const existing = await findWorkout(db, userId, input.id);
  if (existing) return toWorkoutDto(existing, await setsOf(db, userId, existing.id));
  const active = await getActiveWorkout(db, userId);
  if (active) {
    const w = await findWorkout(db, userId, active.id);
    const sets = await setsOf(db, userId, active.id);
    const last = sets.reduce((m, x) => Math.max(m, x.performedAt), active.startedAt);
    if (w) await closeWorkout(db, userId, w, sets, last);
  }

  const now = Date.now();
  const startedAt = input.startedAt ?? now;
  const [row] = await db
    .insert(workout)
    .values({
      id: input.id,
      userId,
      startedAt,
      endedAt: null,
      tz,
      localDate: localDate(startedAt, tz),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!row) throw new Error("insert failed");
  await recomputeNutritionTargets(db, userId, row.localDate);
  return toWorkoutDto(row, []);
}

export async function finishWorkout(db: Db, userId: string, id: string, endedAt = Date.now()) {
  const w = await findWorkout(db, userId, id);
  if (!w) throw new NotFoundError("workout");
  return closeWorkout(db, userId, w, await setsOf(db, userId, id), Math.max(endedAt, w.startedAt));
}

/** Idempotent: deleting a workout that is already gone is a no-op. */
export async function deleteWorkout(db: Db, userId: string, id: string) {
  const w = await findWorkout(db, userId, id);
  if (!w) return;
  await db.batch([
    db.delete(workoutSet).where(and(eq(workoutSet.userId, userId), eq(workoutSet.workoutId, id))),
    db.delete(workout).where(and(eq(workout.userId, userId), eq(workout.id, id))),
  ]);
  await recomputeWorkoutDay(db, userId, w.localDate);
  await recomputeNutritionTargets(db, userId, w.localDate);
}

export async function getWorkout(db: Db, userId: string, id: string): Promise<WorkoutDto | null> {
  const w = await findWorkout(db, userId, id);
  return w ? toWorkoutDto(w, await setsOf(db, userId, id)) : null;
}

export async function listWorkouts(
  db: Db,
  userId: string,
  opts: { from?: string; to?: string; limit?: number } = {},
): Promise<WorkoutSummaryDto[]> {
  const conds = [eq(workout.userId, userId), isNotNull(workout.endedAt)];
  if (opts.from) conds.push(gte(workout.localDate, opts.from));
  if (opts.to) conds.push(lte(workout.localDate, opts.to));
  const rows = await db
    .select()
    .from(workout)
    .where(and(...conds))
    .orderBy(desc(workout.startedAt))
    .limit(Math.min(opts.limit ?? 100, 100));
  if (rows.length === 0) return [];

  const stats = await db
    .select({
      workoutId: workoutSet.workoutId,
      name: exercise.name,
      first: sql<number>`min(${workoutSet.position})`,
      working: sql<number>`sum(case when ${workoutSet.kind} = 'working' then 1 else 0 end)`,
    })
    .from(workoutSet)
    .innerJoin(exercise, eq(exercise.id, workoutSet.exerciseId))
    .where(
      and(
        eq(workoutSet.userId, userId),
        inArray(
          workoutSet.workoutId,
          rows.map((r) => r.id),
        ),
      ),
    )
    .groupBy(workoutSet.workoutId, workoutSet.exerciseId)
    .orderBy(sql`min(${workoutSet.position})`);

  return rows.map((w) => {
    const mine = stats.filter((s) => s.workoutId === w.id);
    return {
      id: w.id,
      startedAt: w.startedAt,
      endedAt: w.endedAt,
      localDate: w.localDate,
      workingSets: mine.reduce((n, s) => n + s.working, 0),
      exercises: mine.map((s) => s.name),
    };
  });
}

/** Working sets × contribution per group for local dates in [from, to]; also the `today` part. */
async function volumeBetween(db: Db, userId: string, from: string, to: string, today: string) {
  const rows = await db
    .select({
      group: exerciseMuscle.group,
      total: sql<number>`sum(${exerciseMuscle.contribution})`,
      today: sql<number>`sum(case when ${workout.localDate} = ${today} then ${exerciseMuscle.contribution} else 0 end)`,
    })
    .from(workoutSet)
    .innerJoin(workout, eq(workout.id, workoutSet.workoutId))
    .innerJoin(exerciseMuscle, eq(exerciseMuscle.exerciseId, workoutSet.exerciseId))
    .where(
      and(
        eq(workoutSet.userId, userId),
        eq(workout.userId, userId),
        eq(exerciseMuscle.userId, userId),
        eq(workoutSet.kind, "working"),
        gte(workout.localDate, from),
        lte(workout.localDate, to),
      ),
    )
    .groupBy(exerciseMuscle.group);
  const volume: Volume = emptyVolume();
  const volumeToday: Volume = emptyVolume();
  for (const r of rows) {
    if (!isMuscleGroup(r.group)) continue;
    volume[r.group] = r.total;
    volumeToday[r.group] = r.today;
  }
  return { volume, volumeToday };
}

/** Weekly budget for the week containing `today` (the user's local date). */
export async function getWeekPlan(
  db: Db,
  userId: string,
  today: string,
  opts: { hasActive: boolean },
) {
  const { start } = weekRange(today);
  const countWorkouts = (from: string, toExclusive: string | null, onlyDay?: string) =>
    db
      .select({ n: sql<number>`count(*)` })
      .from(workout)
      .where(
        and(
          eq(workout.userId, userId),
          onlyDay ? eq(workout.localDate, onlyDay) : gte(workout.localDate, from),
          toExclusive ? lt(workout.localDate, toExclusive) : undefined,
        ),
      );
  const [settings, vol, before, todays] = await Promise.all([
    getWorkoutSettings(db, userId),
    volumeBetween(db, userId, start, today, today),
    countWorkouts(start, today),
    countWorkouts(today, null, today),
  ]);
  const workoutsToday = todays[0]?.n ?? 0;
  const plan = planWeek({
    settings,
    today,
    volume: vol.volume,
    volumeToday: vol.volumeToday,
    workoutsBeforeToday: before[0]?.n ?? 0,
    todayFinished: !opts.hasActive && workoutsToday > 0 ? { workouts: workoutsToday } : undefined,
  });
  return { settings, plan };
}

export async function getOverview(
  db: Db,
  userId: string,
  tz: string,
): Promise<WorkoutsOverviewDto> {
  const active = await getActiveWorkout(db, userId);
  const today = localDate(Date.now(), tz);
  const [{ settings, plan }, recent] = await Promise.all([
    getWeekPlan(db, userId, today, { hasActive: active !== null }),
    listWorkouts(db, userId, { limit: 5 }),
  ]);
  return { today, settings, plan, active, recent };
}

// ---------- sets ----------

async function requireExercise(db: Db, userId: string, id: string) {
  const e = await db.query.exercise.findFirst({
    where: and(eq(exercise.userId, userId), eq(exercise.id, id)),
  });
  if (!e) throw new NotFoundError("exercise");
  return e;
}

export async function addSet(db: Db, userId: string, input: AddSetInput): Promise<SetDto> {
  const existing = await db.query.workoutSet.findFirst({
    where: and(eq(workoutSet.userId, userId), eq(workoutSet.id, input.id)),
  });
  if (existing) return toSetDto(existing); // idempotent retry

  const w = await findWorkout(db, userId, input.workoutId);
  if (!w) throw new NotFoundError("workout");
  await requireExercise(db, userId, input.exerciseId);

  const [pos] = await db
    .select({ max: sql<number | null>`max(${workoutSet.position})` })
    .from(workoutSet)
    .where(and(eq(workoutSet.userId, userId), eq(workoutSet.workoutId, w.id)));
  const now = Date.now();
  const [row] = await db
    .insert(workoutSet)
    .values({
      id: input.id,
      userId,
      workoutId: w.id,
      exerciseId: input.exerciseId,
      position: (pos?.max ?? -1) + 1,
      kind: input.kind,
      reps: input.reps,
      weightKg: input.weightKg,
      performedAt: input.performedAt ?? now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!row) throw new Error("insert failed");
  await recomputeWorkoutDay(db, userId, w.localDate);
  return toSetDto(row);
}

async function workoutDateOfSet(db: Db, userId: string, workoutId: string) {
  const w = await findWorkout(db, userId, workoutId);
  return w?.localDate;
}

export async function updateSet(db: Db, userId: string, id: string, patch: UpdateSetInput) {
  const [row] = await db
    .update(workoutSet)
    .set({ ...patch, updatedAt: Date.now() })
    .where(and(eq(workoutSet.userId, userId), eq(workoutSet.id, id)))
    .returning();
  if (!row) throw new NotFoundError("set");
  const date = await workoutDateOfSet(db, userId, row.workoutId);
  if (date) await recomputeWorkoutDay(db, userId, date);
  return toSetDto(row);
}

export async function deleteSet(db: Db, userId: string, id: string) {
  const [row] = await db
    .delete(workoutSet)
    .where(and(eq(workoutSet.userId, userId), eq(workoutSet.id, id)))
    .returning();
  if (!row) return; // already gone: idempotent
  const date = await workoutDateOfSet(db, userId, row.workoutId);
  if (date) await recomputeWorkoutDay(db, userId, date);
}

/** Past sessions of one exercise, newest first. `excludeWorkoutId` skips the current workout. */
export async function getExerciseHistory(
  db: Db,
  userId: string,
  exerciseId: string,
  opts: { limit?: number; excludeWorkoutId?: string } = {},
): Promise<ExerciseSessionDto[]> {
  const limit = Math.min(opts.limit ?? 5, 50);
  const rows = await db
    .select({ set: workoutSet, localDate: workout.localDate, startedAt: workout.startedAt })
    .from(workoutSet)
    .innerJoin(workout, eq(workout.id, workoutSet.workoutId))
    .where(
      and(
        eq(workoutSet.userId, userId),
        eq(workout.userId, userId),
        eq(workoutSet.exerciseId, exerciseId),
      ),
    )
    .orderBy(desc(workout.startedAt), asc(workoutSet.position))
    .limit(limit * 15);

  const sessions: ExerciseSessionDto[] = [];
  for (const r of rows) {
    if (r.set.workoutId === opts.excludeWorkoutId) continue;
    let s = sessions.at(-1);
    if (!s || s.workoutId !== r.set.workoutId) {
      if (sessions.length === limit) break;
      s = { workoutId: r.set.workoutId, localDate: r.localDate, sets: [] };
      sessions.push(s);
    }
    s.sets.push(toSetDto(r.set));
  }
  return sessions;
}

/** A whole workout logged after the fact (MCP / import). Idempotent by id. */
export async function logWorkout(db: Db, userId: string, tz: string, input: LogWorkoutInput) {
  const existing = await getWorkout(db, userId, input.id);
  if (existing) return existing;
  if (input.endedAt < input.startedAt) throw new InvalidError("endedAt is before startedAt");

  const exerciseIds = [...new Set(input.sets.map((s) => s.exerciseId))];
  if (exerciseIds.length) {
    const owned = await db
      .select({ id: exercise.id })
      .from(exercise)
      .where(and(eq(exercise.userId, userId), inArray(exercise.id, exerciseIds)));
    if (owned.length !== exerciseIds.length) throw new NotFoundError("exercise");
  }

  const now = Date.now();
  const date = localDate(input.startedAt, tz);
  const step = input.sets.length > 1 ? (input.endedAt - input.startedAt) / input.sets.length : 0;
  const setRows = input.sets.map((s, i) => ({
    id: s.id ?? uuidv7(now + i),
    userId,
    workoutId: input.id,
    exerciseId: s.exerciseId,
    position: i,
    kind: s.kind,
    reps: s.reps,
    weightKg: s.weightKg,
    performedAt: Math.round(input.startedAt + step * i),
    createdAt: now,
    updatedAt: now,
  }));
  await db.batch([
    db.insert(workout).values({
      id: input.id,
      userId,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      tz,
      localDate: date,
      createdAt: now,
      updatedAt: now,
    }),
    ...chunkRows(setRows, 12).map((rows) => db.insert(workoutSet).values(rows)),
  ]);
  await recomputeWorkoutDay(db, userId, date);
  await recomputeNutritionTargets(db, userId, date);
  return getWorkout(db, userId, input.id);
}

// ---------- exercises ----------

export async function listExercises(
  db: Db,
  userId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<ExerciseDto[]> {
  const since = Date.now() - RECENT_USAGE_MS;
  const [seedRows, exRows, muscleRows, usageRows] = await Promise.all([
    db
      .select({ key: exercise.seedKey })
      .from(exercise)
      .where(and(eq(exercise.userId, userId), isNotNull(exercise.seedKey))),
    db
      .select()
      .from(exercise)
      .where(
        opts.includeArchived
          ? eq(exercise.userId, userId)
          : and(eq(exercise.userId, userId), isNull(exercise.archivedAt)),
      ),
    db.select().from(exerciseMuscle).where(eq(exerciseMuscle.userId, userId)),
    db
      .select({
        exerciseId: workoutSet.exerciseId,
        total: sql<number>`count(*)`,
        recent: sql<number>`sum(case when ${workoutSet.performedAt} >= ${since} then 1 else 0 end)`,
      })
      .from(workoutSet)
      .where(and(eq(workoutSet.userId, userId), eq(workoutSet.kind, "working")))
      .groupBy(workoutSet.exerciseId),
  ]);
  if (
    await addMissingSeedExercises(
      db,
      userId,
      seedRows.map((r) => r.key),
    )
  ) {
    return listExercises(db, userId, opts);
  }

  const muscles = new Map<string, ExerciseDto["muscles"]>();
  for (const m of muscleRows) {
    if (!isMuscleGroup(m.group)) continue;
    const list = muscles.get(m.exerciseId) ?? [];
    list.push({ group: m.group, contribution: m.contribution });
    muscles.set(m.exerciseId, list);
  }
  const usage = new Map(usageRows.map((u) => [u.exerciseId, u]));

  return exRows
    .map((e) => ({
      id: e.id,
      name: e.name,
      equipment: e.equipment as Equipment,
      recSets: e.recSets,
      recRepsMin: e.recRepsMin,
      recRepsMax: e.recRepsMax,
      muscles: (muscles.get(e.id) ?? []).sort((a, b) => b.contribution - a.contribution),
      archived: e.archivedAt !== null,
      custom: e.seedKey === null,
      usageRecent: usage.get(e.id)?.recent ?? 0,
      usageTotal: usage.get(e.id)?.total ?? 0,
    }))
    .sort(
      (a, b) =>
        b.usageRecent - a.usageRecent ||
        b.usageTotal - a.usageTotal ||
        a.name.localeCompare(b.name),
    );
}

async function getExerciseDto(db: Db, userId: string, id: string) {
  const all = await listExercises(db, userId, { includeArchived: true });
  const e = all.find((x) => x.id === id);
  if (!e) throw new NotFoundError("exercise");
  return e;
}

function muscleRowsFor(
  exerciseId: string,
  userId: string,
  muscles: { group: MuscleGroup; contribution: number }[],
) {
  return muscles.map((m) => ({ exerciseId, userId, group: m.group, contribution: m.contribution }));
}

export async function createExercise(db: Db, userId: string, input: CreateExerciseInput) {
  const existing = await db.query.exercise.findFirst({
    where: and(eq(exercise.userId, userId), eq(exercise.id, input.id)),
  });
  if (!existing) {
    const now = Date.now();
    await db.batch([
      db.insert(exercise).values({
        id: input.id,
        userId,
        name: input.name,
        equipment: input.equipment,
        recSets: input.recSets,
        recRepsMin: input.recRepsMin,
        recRepsMax: input.recRepsMax,
        seedKey: null,
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(exerciseMuscle).values(muscleRowsFor(input.id, userId, input.muscles)),
    ]);
  }
  return getExerciseDto(db, userId, input.id);
}

export async function updateExercise(
  db: Db,
  userId: string,
  id: string,
  patch: UpdateExerciseInput,
) {
  const current = await requireExercise(db, userId, id);
  const { muscles, ...fields } = patch;
  const min = fields.recRepsMin ?? current.recRepsMin;
  const max = fields.recRepsMax ?? current.recRepsMax;
  if (min > max) throw new InvalidError("Rep range is reversed");

  const owned = and(eq(exercise.userId, userId), eq(exercise.id, id));
  await db
    .update(exercise)
    .set({ ...fields, updatedAt: Date.now() })
    .where(owned);
  if (muscles) {
    await db.batch([
      db
        .delete(exerciseMuscle)
        .where(and(eq(exerciseMuscle.userId, userId), eq(exerciseMuscle.exerciseId, id))),
      db.insert(exerciseMuscle).values(muscleRowsFor(id, userId, muscles)),
    ]);
    // Contributions changed: rebuild the rollups of every day this exercise was trained.
    const days = await db
      .selectDistinct({ localDate: workout.localDate })
      .from(workoutSet)
      .innerJoin(workout, eq(workout.id, workoutSet.workoutId))
      .where(and(eq(workoutSet.userId, userId), eq(workoutSet.exerciseId, id)));
    for (const d of days) await recomputeWorkoutDay(db, userId, d.localDate);
  }
  return getExerciseDto(db, userId, id);
}

export async function archiveExercise(db: Db, userId: string, id: string, archived = true) {
  await requireExercise(db, userId, id);
  await db
    .update(exercise)
    .set({ archivedAt: archived ? Date.now() : null, updatedAt: Date.now() })
    .where(and(eq(exercise.userId, userId), eq(exercise.id, id)));
  return getExerciseDto(db, userId, id);
}
