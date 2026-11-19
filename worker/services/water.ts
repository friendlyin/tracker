import { and, eq, sql } from "drizzle-orm";
import { METRICS } from "../../shared/metrics/registry";
import type { DaySchedule } from "../../shared/schedule";
import { addDays, localDate } from "../../shared/time";
import { atCapMinutes, waterState } from "../../shared/water/model";
import type { LogWaterInput } from "../../shared/water/schemas";
import {
  applyWaterSettingsPatch,
  parseWaterSettings,
  type WaterSettings,
  type WaterSettingsPatch,
  waterSettingsKey,
} from "../../shared/water/settings";
import type { WaterEntryDto, WaterInputsDto, WaterStateDto } from "../../shared/water/types";
import type { Db } from "../db";
import { type EntryRow, entry, type User } from "../db/schema";
import { checkRange, deleteEntry, listEntries, logEntry, parseTime } from "./entries";
import { replaceMetrics } from "./metrics";
import { getSetting, putSetting } from "./users";

// Water domain: drinks are entries of the `water` tracker; pending water is simulated by the level
// engine (shared/water/model.ts) on every read. The client runs the same simulation live.

/** Who the water functions act for: the user, their latest timezone and their day schedule. */
export interface WaterUser {
  id: string;
  tz: string;
  schedule: DaySchedule;
}

export const waterUser = (u: User, tz: string): WaterUser => ({
  id: u.id,
  tz,
  schedule: { wakeTime: u.wakeTime, sleepTime: u.sleepTime },
});

/** The last local date whose `water.at_cap_min` is final. */
const FINALIZED_KEY = "water.finalized";
/** Closed days are finalised at most this far back (the app was not opened for a while). */
const MAX_FINALIZE_DAYS = 14;

function toDto(r: EntryRow): WaterEntryDto {
  return {
    id: r.id,
    drankAt: r.occurredAt,
    localDate: r.localDate,
    ml: r.value ?? 0,
    source: r.source,
  };
}

// ---------- settings ----------

export async function getWaterSettings(db: Db, userId: string): Promise<WaterSettings> {
  return parseWaterSettings(await getSetting(db, userId, waterSettingsKey));
}

/** Changing the settings updates today's target rollup only; past days keep theirs. */
export async function setWaterSettings(
  db: Db,
  u: WaterUser,
  patch: WaterSettingsPatch,
): Promise<WaterSettings> {
  const next = applyWaterSettingsPatch(await getWaterSettings(db, u.id), patch);
  await putSetting(db, u.id, waterSettingsKey, next);
  await writeTarget(db, u.id, localDate(Date.now(), u.tz), next);
  return next;
}

// ---------- rollups ----------

const waterOn = (userId: string, date: string) =>
  and(eq(entry.userId, userId), eq(entry.tracker, "water"), eq(entry.localDate, date));

/** The target that applied, only for days with water (an untracked day has no target to miss). */
async function writeTarget(db: Db, userId: string, date: string, settings?: WaterSettings) {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(entry)
    .where(waterOn(userId, date));
  const has = (row?.n ?? 0) > 0;
  const s = has ? (settings ?? (await getWaterSettings(db, userId))) : null;
  await replaceMetrics(
    db,
    userId,
    date,
    [METRICS.waterTarget.id],
    s ? [{ metric: METRICS.waterTarget.id, value: s.targetMl }] : [],
  );
}

/** Writes `water.at_cap_min` for closed days in [from, to]. */
async function writeAtCap(db: Db, u: WaterUser, from: string, to: string) {
  const [settings, rows] = await Promise.all([
    getWaterSettings(db, u.id),
    listEntries(db, u.id, "water", { from: addDays(from, -1), to }),
  ]);
  const inputs: WaterInputsDto = {
    tz: u.tz,
    schedule: u.schedule,
    settings,
    entries: rows.map(toDto),
  };
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const value = atCapMinutes(inputs, d);
    await replaceMetrics(
      db,
      u.id,
      d,
      [METRICS.waterAtCap.id],
      [{ metric: METRICS.waterAtCap.id, value }],
    );
  }
}

/**
 * Time at the cap keeps growing while a day is open, so it is written once the day is over: on the
 * first water read or write of a new day, for the days since the last run (at most 14, never before
 * the first water entry).
 */
async function finalizeClosedDays(db: Db, u: WaterUser, now: number) {
  const yesterday = addDays(localDate(now, u.tz), -1);
  const done = (await getSetting(db, u.id, FINALIZED_KEY)) as string | undefined;
  if (done && done >= yesterday) return;
  const [first] = await db
    .select({ d: sql<string | null>`min(${entry.localDate})` })
    .from(entry)
    .where(and(eq(entry.userId, u.id), eq(entry.tracker, "water")));
  if (!first?.d) return;
  const from = [
    done ? addDays(done, 1) : first.d,
    first.d,
    addDays(yesterday, 1 - MAX_FINALIZE_DAYS),
  ]
    .sort()
    .at(-1) as string;
  if (from <= yesterday) await writeAtCap(db, u, from, yesterday);
  await putSetting(db, u.id, FINALIZED_KEY, yesterday);
}

/** After a write: the day's target, and the at-cap minutes if a finalised day changed. */
async function afterWrite(db: Db, u: WaterUser, date: string) {
  await writeTarget(db, u.id, date);
  const done = (await getSetting(db, u.id, FINALIZED_KEY)) as string | undefined;
  if (!done || date > done) return;
  // The day's drinks also shape the next day's start.
  const next = addDays(date, 1);
  await writeAtCap(db, u, date, next <= done ? next : date);
}

// ---------- reads ----------

export async function getWaterInputs(
  db: Db,
  u: WaterUser,
  now = Date.now(),
): Promise<WaterInputsDto> {
  await finalizeClosedDays(db, u, now);
  const today = localDate(now, u.tz);
  const [settings, rows] = await Promise.all([
    getWaterSettings(db, u.id),
    listEntries(db, u.id, "water", { from: addDays(today, -1), to: today }),
  ]);
  return { tz: u.tz, schedule: u.schedule, settings, entries: rows.map(toDto) };
}

export async function getWaterState(db: Db, u: WaterUser, now = Date.now()) {
  return waterState(await getWaterInputs(db, u, now), now);
}

/** The state without the timeline (for Claude). */
export const stateSummary = ({ points: _, ...rest }: WaterStateDto) => rest;

export async function listWater(
  db: Db,
  userId: string,
  range: { from: string; to: string },
): Promise<WaterEntryDto[]> {
  checkRange(range.from, range.to);
  return (await listEntries(db, userId, "water", range)).map(toDto);
}

// ---------- writes ----------

export async function logWater(
  db: Db,
  u: WaterUser,
  input: LogWaterInput,
  source: "app" | "mcp",
): Promise<WaterEntryDto> {
  const row = await logEntry(db, u.id, u.tz, "water", {
    id: input.id,
    occurredAt: parseTime(input.time) ?? Date.now(),
    value: input.ml,
    data: {},
    source,
  });
  await afterWrite(db, u, row.localDate);
  return toDto(row);
}

/** Returns the entry's local date, or null when it didn't exist (idempotent). */
export async function deleteWater(db: Db, u: WaterUser, id: string): Promise<string | null> {
  const row = await deleteEntry(db, u.id, "water", id);
  if (!row) return null;
  await afterWrite(db, u, row.localDate);
  return row.localDate;
}
