import { and, asc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { minutesLeft, progress } from "../../shared/habits/logic";
import {
  type CreateHabitInput,
  EVERY_DAY,
  type HabitData,
  type HabitFields,
  habitProblem,
  type LogHabitInput,
  type StartHabitInput,
  type UpdateHabitInput,
} from "../../shared/habits/schemas";
import type { HabitDto, HabitEntryDto, HabitsDayDto } from "../../shared/habits/types";
import { uuidv7 } from "../../shared/id";
import { METRICS } from "../../shared/metrics/registry";
import { type LocalDate, localDate, weekRange } from "../../shared/time";
import type { Db } from "../db";
import { type EntryRow, type HabitRow, habit, metricDaily } from "../db/schema";
import { deleteEntry, getEntry, listEntries, logEntry, parseTime } from "./entries";
import { InvalidError, NotFoundError } from "./errors";
import * as focus from "./focus";
import type { DayUser } from "./levels";
import { getSetting, putSetting } from "./users";

// Habits: user-defined, each due on some weekdays with a target. Check, count and amount progress
// are entries of the `habit` tracker; time progress is focus sessions carrying the habit's id, so a
// habit timer is the one running timer, drains energy as its focus kind and counts down like focus.

const SEEDED_KEY = "habits.seeded";
/** Given to every user once (deleting it doesn't bring it back). A product default. */
const STARTER: HabitFields = {
  name: "Meditation",
  kind: "time",
  target: 10,
  unit: null,
  focus: "moderate",
  days: EVERY_DAY,
};
/** A time in the future beyond clock skew is a mistake. */
const FUTURE_MS = 5 * 60_000;

const toDto = (r: HabitRow): HabitDto => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  target: r.target,
  unit: r.unit,
  focus: r.focus,
  days: r.days,
  position: r.position,
  createdAt: r.createdAt,
});

const entryDto = (r: EntryRow): HabitEntryDto => ({
  id: r.id,
  habitId: (r.data as HabitData).habitId,
  at: r.occurredAt,
  endedAt: r.endedAt,
  amount: r.value,
  session: false,
  targetMin: null,
  source: r.source,
});

/** A time habit's focus session as habit progress (null for other sessions). */
function sessionDto(r: EntryRow): HabitEntryDto | null {
  const f = focus.toDto(r);
  if (!f.habitId) return null;
  return {
    id: f.id,
    habitId: f.habitId,
    at: f.startedAt,
    endedAt: f.endedAt,
    amount: f.minutes,
    session: true,
    targetMin: f.targetMin,
    source: f.source,
  };
}

const activeRows = (db: Db, userId: string) =>
  db
    .select()
    .from(habit)
    .where(and(eq(habit.userId, userId), isNull(habit.archivedAt)))
    .orderBy(asc(habit.position), asc(habit.createdAt));

async function insertHabit(db: Db, userId: string, id: string, h: HabitFields, now: number) {
  const [last] = await db
    .select({ max: sql<number | null>`max(${habit.position})` })
    .from(habit)
    .where(eq(habit.userId, userId));
  await db.insert(habit).values({
    id,
    userId,
    ...h,
    position: (last?.max ?? -1) + 1,
    createdAt: now,
    updatedAt: now,
  });
}

/** Active habits in order. The first read gives the user the starter habit. */
export async function listHabits(db: Db, userId: string): Promise<HabitDto[]> {
  let rows = await activeRows(db, userId);
  if (rows.length === 0 && !(await getSetting(db, userId, SEEDED_KEY))) {
    const now = Date.now();
    await putSetting(db, userId, SEEDED_KEY, true);
    await insertHabit(db, userId, uuidv7(now), STARTER, now);
    rows = await activeRows(db, userId);
  }
  return rows.map(toDto);
}

async function findHabit(db: Db, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(habit)
    .where(and(eq(habit.userId, userId), eq(habit.id, id)));
  return row ?? null;
}

async function activeHabit(db: Db, userId: string, id: string): Promise<HabitDto> {
  const row = await findHabit(db, userId, id);
  if (!row || row.archivedAt !== null) throw new NotFoundError("habit");
  return toDto(row);
}

/** Idempotent by id. */
export async function createHabit(
  db: Db,
  userId: string,
  input: CreateHabitInput,
): Promise<HabitDto> {
  const done = await findHabit(db, userId, input.id);
  if (done) return toDto(done);
  const { id, ...fields } = input;
  await insertHabit(db, userId, id, fields, Date.now());
  return activeHabit(db, userId, id);
}

export async function updateHabit(
  db: Db,
  userId: string,
  id: string,
  patch: UpdateHabitInput,
): Promise<HabitDto> {
  const current = await activeHabit(db, userId, id);
  const next = { ...current, ...patch };
  const problem = habitProblem(next);
  if (problem) throw new InvalidError(problem);
  await db
    .update(habit)
    .set({ ...patch, updatedAt: Date.now() })
    .where(and(eq(habit.userId, userId), eq(habit.id, id)));
  return activeHabit(db, userId, id);
}

/** Hides the habit; its entries and stats stay. Idempotent. */
export async function archiveHabit(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(habit)
    .set({ archivedAt: Date.now(), updatedAt: Date.now() })
    .where(and(eq(habit.userId, userId), eq(habit.id, id), isNull(habit.archivedAt)))
    .returning({ id: habit.id });
  return rows.length > 0;
}

/** Progress per habit on the days [from, to) from the rollups. */
async function weekProgress(db: Db, userId: string, from: LocalDate, to: LocalDate) {
  if (from >= to) return {};
  const rows = await db
    .select({ date: metricDaily.localDate, id: metricDaily.dimension, value: metricDaily.value })
    .from(metricDaily)
    .where(
      and(
        eq(metricDaily.userId, userId),
        inArray(metricDaily.metric, [METRICS.habitAmount.id, METRICS.habitMinutes.id]),
        gte(metricDaily.localDate, from),
        lt(metricDaily.localDate, to),
      ),
    );
  const week: HabitsDayDto["week"] = {};
  for (const r of rows) {
    const day = week[r.date] ?? {};
    day[r.id] = (day[r.id] ?? 0) + r.value;
    week[r.date] = day;
  }
  return week;
}

/** A day's progress entries (habit entries and time-habit sessions), plus a running habit timer. */
async function dayEntries(db: Db, userId: string, date: LocalDate): Promise<HabitEntryDto[]> {
  const range = { from: date, to: date };
  const [logged, sessions, running] = await Promise.all([
    listEntries(db, userId, "habit", range),
    listEntries(db, userId, "focus", range),
    focus.runningRows(db, userId),
  ]);
  const ids = new Set(sessions.map((r) => r.id));
  const all = [...sessions, ...running.filter((r) => !ids.has(r.id))].flatMap((r) => {
    const e = sessionDto(r);
    return e ? [e] : [];
  });
  return [...logged.map(entryDto), ...all];
}

export async function getHabitsDay(
  db: Db,
  u: DayUser,
  date: LocalDate = localDate(Date.now(), u.tz),
): Promise<HabitsDayDto> {
  const [habits, entries, week] = await Promise.all([
    listHabits(db, u.id),
    dayEntries(db, u.id, date),
    weekProgress(db, u.id, weekRange(date).start, date),
  ]);
  return { date, habits, entries, week };
}

/**
 * Logs progress (default 1: a check, or one more). A time habit's minutes become a focus session of
 * its kind, applied now like added focus minutes. Idempotent by id.
 */
export async function logHabit(
  db: Db,
  u: DayUser,
  input: LogHabitInput,
  source: "app" | "mcp",
): Promise<HabitEntryDto> {
  const h = await activeHabit(db, u.id, input.habitId);
  const now = Date.now();
  const at = parseTime(input.time) ?? now;
  if (at > now + FUTURE_MS) throw new InvalidError("time is in the future");
  if (h.kind === "time") {
    const minutes = Math.round(input.amount ?? 1);
    if (minutes < 1 || minutes > 24 * 60) throw new InvalidError("minutes must be 1 to 1440");
    const f = await focus.logFocus(
      db,
      u,
      { id: input.id, kind: h.focus ?? "other", minutes, time: input.time, habitId: h.id },
      source,
    );
    return {
      id: f.id,
      habitId: h.id,
      at: f.startedAt,
      endedAt: null,
      amount: f.minutes,
      session: true,
      targetMin: null,
      source: f.source,
    };
  }
  const row = await logEntry(db, u.id, u.tz, "habit", {
    id: input.id,
    occurredAt: at,
    value: h.kind === "check" ? 1 : (input.amount ?? 1),
    data: { habitId: h.id },
    source,
  });
  return entryDto(row);
}

/** Deletes a habit entry or a time habit's session. Idempotent. */
export async function deleteHabitEntry(db: Db, u: DayUser, id: string): Promise<boolean> {
  if (await deleteEntry(db, u.id, "habit", id)) return true;
  const session = await getEntry(db, u.id, "focus", id);
  if (!session || !sessionDto(session)) return false;
  return (await focus.deleteFocus(db, u, id)) !== null;
}

/**
 * Starts a time habit's timer (stopping the running one): a session of the habit's focus kind,
 * counting down from `minutes` or, by default, the time left to today's target.
 */
export async function startHabitTimer(
  db: Db,
  u: DayUser,
  input: StartHabitInput,
  source: "app" | "mcp",
): Promise<HabitEntryDto> {
  const h = await activeHabit(db, u.id, input.habitId);
  if (h.kind !== "time") throw new InvalidError("only time habits have a timer");
  const now = Date.now();
  const today = localDate(parseTime(input.time) ?? now, u.tz);
  const minutes =
    input.minutes ?? minutesLeft(h, progress(h.id, await dayEntries(db, u.id, today), now));
  const f = await focus.startFocus(
    db,
    u,
    { id: input.id, kind: h.focus ?? "other", minutes, time: input.time, habitId: h.id },
    source,
  );
  return {
    id: f.id,
    habitId: h.id,
    at: f.startedAt,
    endedAt: f.endedAt,
    amount: null,
    session: true,
    targetMin: f.targetMin,
    source: f.source,
  };
}
