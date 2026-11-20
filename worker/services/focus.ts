import { and, eq, isNull } from "drizzle-orm";
import { focusDayStats, focusState, sleepValue } from "../../shared/focus/model";
import type {
  FocusData,
  LogFocusInput,
  SetSleepInput,
  SleepData,
  StartFocusInput,
  UpdateFocusInput,
} from "../../shared/focus/schemas";
import {
  applyFocusSettingsPatch,
  type FocusSettings,
  type FocusSettingsPatch,
  focusSettingsKey,
  focusSettingsSchema,
  parseFocusSettings,
} from "../../shared/focus/settings";
import type {
  FocusEntryDto,
  FocusInputsDto,
  FocusStateDto,
  SleepDto,
} from "../../shared/focus/types";
import { METRICS } from "../../shared/metrics/registry";
import { wakeInstant } from "../../shared/schedule";
import { addDays, localDate } from "../../shared/time";
import type { Db } from "../db";
import { type EntryRow, entry } from "../db/schema";
import {
  checkRange,
  deleteEntry,
  getEntry,
  listEntries,
  logEntry,
  parseTime,
  updateEntry,
} from "./entries";
import { InvalidError, NotFoundError } from "./errors";
import { type ClosedDayRollup, type DayUser, finalizeClosedDays, refinalize } from "./levels";
import { replaceMetrics } from "./metrics";
import { getSetting, putSetting } from "./users";

// Focus energy: sessions (deep, moderate, unfocus) are entries of the `focus` tracker, the day's sleep
// quality an entry of the `sleep` tracker. Energy is simulated by the level engine
// (shared/focus/model.ts) on every read; the client runs the same simulation live.

const MIN = 60_000;
/** A start this far in the future is a mistake (clock skew is allowed). */
const FUTURE_MS = 5 * MIN;

function toDto(r: EntryRow): FocusEntryDto {
  const d = r.data as FocusData;
  return {
    id: r.id,
    kind: d.kind,
    tag: d.tag ?? null,
    startedAt: r.occurredAt,
    endedAt: r.endedAt,
    minutes: r.value,
    targetMin: d.targetMin ?? null,
    localDate: r.localDate,
    source: r.source,
  };
}

function sleepDto(r: EntryRow): SleepDto {
  return {
    id: r.id,
    date: r.localDate,
    quality: (r.data as SleepData).quality,
    setAt: r.occurredAt,
  };
}

// ---------- settings ----------

export async function getFocusSettings(db: Db, userId: string): Promise<FocusSettings> {
  return parseFocusSettings(await getSetting(db, userId, focusSettingsKey));
}

/** New settings apply to the whole open day; finalised days keep their rollups. */
export async function setFocusSettings(
  db: Db,
  userId: string,
  patch: FocusSettingsPatch,
): Promise<FocusSettings> {
  const next = applyFocusSettingsPatch(await getFocusSettings(db, userId), patch);
  const r = focusSettingsSchema.safeParse(next);
  if (!r.success) throw new InvalidError(r.error.issues.map((i) => i.message).join("; "));
  await putSetting(db, userId, focusSettingsKey, r.data);
  return r.data;
}

// ---------- inputs ----------

/** Timers still running, whatever day they started on (added minutes have a value instead). */
const runningRows = (db: Db, userId: string) =>
  db
    .select()
    .from(entry)
    .where(
      and(
        eq(entry.userId, userId),
        eq(entry.tracker, "focus"),
        isNull(entry.endedAt),
        isNull(entry.value),
      ),
    );

async function loadInputs(
  db: Db,
  u: DayUser,
  range: { from: string; to: string },
): Promise<FocusInputsDto> {
  const [settings, rows, running, sleep] = await Promise.all([
    getFocusSettings(db, u.id),
    listEntries(db, u.id, "focus", range),
    runningRows(db, u.id),
    listEntries(db, u.id, "sleep", range),
  ]);
  const ids = new Set(rows.map((r) => r.id));
  return {
    tz: u.tz,
    schedule: u.schedule,
    settings,
    entries: [...rows, ...running.filter((r) => !ids.has(r.id))].map(toDto),
    sleep: sleep.map(sleepDto),
  };
}

// ---------- rollups ----------

const DAY_METRICS = [
  METRICS.focusMinEnergy.id,
  METRICS.focusLowSuggest.id,
  METRICS.focusLowRecommend.id,
  METRICS.focusLowUrgent.id,
];

/** Lowest energy and time at or below each threshold, for closed days with sessions or sleep. */
async function writeDayStats(db: Db, u: DayUser, from: string, to: string) {
  const inputs = await loadInputs(db, u, { from: addDays(from, -1), to: addDays(to, 1) });
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const tracked =
      inputs.entries.some((e) => e.localDate === d) || inputs.sleep.some((s) => s.date === d);
    const st = tracked ? focusDayStats(inputs, d) : null;
    await replaceMetrics(
      db,
      u.id,
      d,
      DAY_METRICS,
      st
        ? [
            { metric: METRICS.focusMinEnergy.id, value: st.minEnergy },
            { metric: METRICS.focusLowSuggest.id, value: st.lowMin.suggest },
            { metric: METRICS.focusLowRecommend.id, value: st.lowMin.recommend },
            { metric: METRICS.focusLowUrgent.id, value: st.lowMin.urgent },
          ]
        : [],
    );
  }
}

const rollup = (db: Db, u: DayUser): ClosedDayRollup => ({
  key: "focus.finalized",
  trackers: ["focus", "sleep"],
  write: (from, to) => writeDayStats(db, u, from, to),
});

/** Writes the closed-day rollups up to yesterday (stats read them). */
export const finalizeFocusDays = (db: Db, u: DayUser, now = Date.now()) =>
  finalizeClosedDays(db, u, rollup(db, u), now);

/** A day's sessions and the next day's early start (sleep set before the wake) shape its stats. */
const afterWrite = (db: Db, u: DayUser, ...dates: string[]) =>
  Promise.all([...new Set(dates)].map((d) => refinalize(db, u, rollup(db, u), addDays(d, -1), d)));

// ---------- reads ----------

export async function getFocusInputs(
  db: Db,
  u: DayUser,
  now = Date.now(),
): Promise<FocusInputsDto> {
  await finalizeClosedDays(db, u, rollup(db, u), now);
  const today = localDate(now, u.tz);
  return loadInputs(db, u, { from: addDays(today, -1), to: today });
}

export async function getFocusState(db: Db, u: DayUser, now = Date.now()) {
  return focusState(await getFocusInputs(db, u, now), now);
}

/** The state without the timeline (for Claude). */
export const stateSummary = ({ points: _, ...rest }: FocusStateDto) => rest;

export async function listFocus(
  db: Db,
  userId: string,
  range: { from: string; to: string },
): Promise<{ entries: FocusEntryDto[]; sleep: SleepDto[] }> {
  checkRange(range.from, range.to);
  const [rows, sleep] = await Promise.all([
    listEntries(db, userId, "focus", range),
    listEntries(db, userId, "sleep", range),
  ]);
  return { entries: rows.map(toDto), sleep: sleep.map(sleepDto) };
}

// ---------- writes ----------

/**
 * Stops every running timer (or only timer `id`) at `at` (never before its start). A timer stopped
 * within a minute was a mis-tap and is removed. Returns what was stopped.
 */
export async function stopFocus(
  db: Db,
  u: DayUser,
  at = Date.now(),
  id?: string,
): Promise<FocusEntryDto[]> {
  const running = (await runningRows(db, u.id)).filter((r) => !id || r.id === id);
  const out: FocusEntryDto[] = [];
  for (const r of running) {
    if (at - r.occurredAt < MIN) {
      await deleteEntry(db, u.id, "focus", r.id);
      continue;
    }
    const row = await updateEntry(db, u.id, u.tz, "focus", r.id, { endedAt: at });
    out.push(toDto(row));
  }
  await afterWrite(db, u, ...running.map((r) => r.localDate));
  return out;
}

/** `entry.data` without empty fields. */
const focusData = (d: FocusData): FocusData => ({
  kind: d.kind,
  ...(d.tag ? { tag: d.tag } : {}),
  ...(d.targetMin ? { targetMin: d.targetMin } : {}),
});

async function existing(db: Db, userId: string, id: string | undefined) {
  const row = id ? await getEntry(db, userId, "focus", id) : null;
  return row ? toDto(row) : null;
}

/** Minutes added afterwards: no time of day, they apply when added (default now). Idempotent by id. */
export async function logFocus(
  db: Db,
  u: DayUser,
  input: LogFocusInput,
  source: "app" | "mcp",
): Promise<FocusEntryDto> {
  const done = await existing(db, u.id, input.id);
  if (done) return done;
  const now = Date.now();
  const at = parseTime(input.time) ?? now;
  if (at > now + FUTURE_MS) throw new InvalidError("time is in the future");
  const row = await logEntry(db, u.id, u.tz, "focus", {
    id: input.id,
    occurredAt: at,
    value: input.minutes,
    data: focusData({ kind: input.kind, tag: input.tag }),
    source,
  });
  await afterWrite(db, u, row.localDate);
  return toDto(row);
}

/** Starts a timer; the running one stops first (one timer at a time). Idempotent by id. */
export async function startFocus(
  db: Db,
  u: DayUser,
  input: StartFocusInput,
  source: "app" | "mcp",
): Promise<FocusEntryDto> {
  const done = await existing(db, u.id, input.id);
  if (done) return done;
  const now = Date.now();
  const start = parseTime(input.time) ?? now;
  if (start > now + FUTURE_MS) throw new InvalidError("start is in the future");
  await stopFocus(db, u, start);
  const row = await logEntry(db, u.id, u.tz, "focus", {
    id: input.id,
    occurredAt: start,
    endedAt: null,
    value: null,
    data: focusData({ kind: input.kind, tag: input.tag, targetMin: input.minutes }),
    source,
  });
  await afterWrite(db, u, row.localDate);
  return toDto(row);
}

/**
 * `minutes` changes added minutes, or sets a timer's length (stopping it if it runs). `tag: null`
 * removes the tag; `targetMin` changes the countdown (null: count up).
 */
export async function updateFocus(
  db: Db,
  u: DayUser,
  id: string,
  patch: UpdateFocusInput,
): Promise<FocusEntryDto> {
  const current = await getEntry(db, u.id, "focus", id);
  if (!current) throw new NotFoundError("focus entry");
  const d = current.data as FocusData;
  const tag = patch.tag === undefined ? d.tag : (patch.tag ?? undefined);
  const targetMin = patch.targetMin === undefined ? d.targetMin : (patch.targetMin ?? undefined);
  const added = current.value !== null;
  const row = await updateEntry(db, u.id, u.tz, "focus", id, {
    ...(patch.minutes === undefined
      ? {}
      : added
        ? { value: patch.minutes }
        : { endedAt: current.occurredAt + patch.minutes * MIN }),
    data: focusData({ ...d, tag, targetMin }),
  });
  await afterWrite(db, u, row.localDate);
  return toDto(row);
}

/** Returns the entry's local date, or null when it didn't exist (idempotent). */
export async function deleteFocus(db: Db, u: DayUser, id: string): Promise<string | null> {
  const row = await deleteEntry(db, u.id, "focus", id);
  if (!row) return null;
  await afterWrite(db, u, row.localDate);
  return row.localDate;
}

/**
 * One sleep entry per day. Set today, it is stamped with the time of the tap (before the wake time
 * that starts the day early); set for a past day, with that day's wake time.
 */
export async function setSleep(
  db: Db,
  u: DayUser,
  input: SetSleepInput,
  source: "app" | "mcp",
): Promise<SleepDto> {
  const now = Date.now();
  const today = localDate(now, u.tz);
  const date = input.date ?? today;
  if (date > today) throw new InvalidError("date is in the future");
  const data = { quality: input.quality };
  const value = sleepValue[input.quality];
  const [existing] = await listEntries(db, u.id, "sleep", { from: date, to: date });
  const row = existing
    ? await updateEntry(db, u.id, u.tz, "sleep", existing.id, { value, data })
    : await logEntry(db, u.id, u.tz, "sleep", {
        occurredAt: date === today ? now : wakeInstant(date, u.schedule, u.tz),
        value,
        data,
        source,
      });
  await afterWrite(db, u, date);
  return sleepDto(row);
}
