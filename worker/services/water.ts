import { and, eq, sql } from "drizzle-orm";
import { METRICS } from "../../shared/metrics/registry";
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
import { type EntryRow, entry } from "../db/schema";
import { checkRange, deleteEntry, listEntries, logEntry, parseTime } from "./entries";
import { type ClosedDayRollup, type DayUser, finalizeClosedDays, refinalize } from "./levels";
import { replaceMetrics } from "./metrics";
import { getSetting, putSetting } from "./users";

// Water domain: drinks are entries of the `water` tracker; pending water is simulated by the level
// engine (shared/water/model.ts) on every read. The client runs the same simulation live.

export type { DayUser as WaterUser } from "./levels";
export { dayUser as waterUser } from "./levels";

/** `water.at_cap_min` is final up to the date kept under `water.finalized`. */
const rollup = (db: Db, u: DayUser): ClosedDayRollup => ({
  key: "water.finalized",
  trackers: ["water"],
  write: (from, to) => writeAtCap(db, u, from, to),
});

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
  u: DayUser,
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
async function writeAtCap(db: Db, u: DayUser, from: string, to: string) {
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

/** After a write: the day's target, and the at-cap minutes if a finalised day changed. */
async function afterWrite(db: Db, u: DayUser, date: string) {
  await writeTarget(db, u.id, date);
  // The day's drinks also shape the next day's start.
  await refinalize(db, u, rollup(db, u), date, addDays(date, 1));
}

// ---------- reads ----------

export async function getWaterInputs(
  db: Db,
  u: DayUser,
  now = Date.now(),
): Promise<WaterInputsDto> {
  await finalizeClosedDays(db, u, rollup(db, u), now);
  const today = localDate(now, u.tz);
  const [settings, rows] = await Promise.all([
    getWaterSettings(db, u.id),
    listEntries(db, u.id, "water", { from: addDays(today, -1), to: today }),
  ]);
  return { tz: u.tz, schedule: u.schedule, settings, entries: rows.map(toDto) };
}

export async function getWaterState(db: Db, u: DayUser, now = Date.now()) {
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
  u: DayUser,
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
export async function deleteWater(db: Db, u: DayUser, id: string): Promise<string | null> {
  const row = await deleteEntry(db, u.id, "water", id);
  if (!row) return null;
  await afterWrite(db, u, row.localDate);
  return row.localDate;
}
