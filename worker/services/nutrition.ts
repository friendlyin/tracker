import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { METRICS } from "../../shared/metrics/registry";
import type {
  DayTypeChoice,
  LogMealInput,
  MealData,
  UpdateMealInput,
} from "../../shared/nutrition/schemas";
import {
  applyNutritionSettingsPatch,
  type DayType,
  type NutritionSettings,
  type NutritionSettingsPatch,
  nutritionSettingsKey,
  parseNutritionSettings,
} from "../../shared/nutrition/settings";
import { dayStatus, resolveDayType, sumMeals } from "../../shared/nutrition/summary";
import type {
  MealDto,
  NutritionDayDto,
  NutritionDayStatusDto,
  NutritionHistoryDayDto,
} from "../../shared/nutrition/types";
import { localDate } from "../../shared/time";
import type { Db } from "../db";
import { dayType, type EntryRow, entry, metricDaily, workout } from "../db/schema";
import { deleteEntry, getEntry, listEntries, logEntry, updateEntry } from "./entries";
import { InvalidError, NotFoundError } from "./errors";
import { replaceMetrics } from "./metrics";
import { getSetting, putSetting } from "./users";

// Nutrition domain: meals are entries of the `meal` tracker. Targets depend on the day type, which
// follows workouts unless overridden. API routes and MCP tools are thin wrappers over these functions.

const MAX_RANGE_DAYS = 400;

function toMealDto(r: EntryRow): MealDto {
  const d = r.data as MealData;
  return {
    id: r.id,
    name: d.name,
    eatenAt: r.occurredAt,
    localDate: r.localDate,
    tz: r.tz,
    kcal: r.value ?? 0,
    proteinG: d.proteinG,
    fatG: d.fatG ?? null,
    carbsG: d.carbsG ?? null,
    items: d.items ?? [],
    note: r.note,
    source: r.source,
  };
}

function parseTime(iso: string | undefined): number | undefined {
  if (iso === undefined) return undefined;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) throw new InvalidError("invalid time");
  return t;
}

function checkRange(from: string, to: string) {
  if (from > to) throw new InvalidError("from is after to");
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (days > MAX_RANGE_DAYS) throw new InvalidError(`at most ${MAX_RANGE_DAYS} days`);
}

// ---------- targets ----------

export async function getNutritionTargets(db: Db, userId: string): Promise<NutritionSettings> {
  return parseNutritionSettings(await getSetting(db, userId, nutritionSettingsKey));
}

/** Changing targets updates today's rollup only; past days keep the targets that applied then. */
export async function setNutritionTargets(
  db: Db,
  userId: string,
  tz: string,
  patch: NutritionSettingsPatch,
): Promise<NutritionSettings> {
  const next = applyNutritionSettingsPatch(await getNutritionTargets(db, userId), patch);
  await putSetting(db, userId, nutritionSettingsKey, next);
  await recomputeNutritionTargets(db, userId, localDate(Date.now(), tz));
  return next;
}

// ---------- day type ----------

async function dayTypeOf(db: Db, userId: string, date: string) {
  const [override, workouts] = await Promise.all([
    db.query.dayType.findFirst({
      where: and(eq(dayType.userId, userId), eq(dayType.localDate, date)),
    }),
    db
      .select({ n: sql<number>`count(*)` })
      .from(workout)
      .where(and(eq(workout.userId, userId), eq(workout.localDate, date))),
  ]);
  return resolveDayType(override?.type ?? null, (workouts[0]?.n ?? 0) > 0);
}

export async function setDayType(db: Db, userId: string, date: string, choice: DayTypeChoice) {
  const owned = and(eq(dayType.userId, userId), eq(dayType.localDate, date));
  if (choice === "auto") {
    await db.delete(dayType).where(owned);
  } else {
    const now = Date.now();
    await db
      .insert(dayType)
      .values({ userId, localDate: date, type: choice, updatedAt: now })
      .onConflictDoUpdate({
        target: [dayType.userId, dayType.localDate],
        set: { type: choice, updatedAt: now },
      });
  }
  await recomputeNutritionTargets(db, userId, date);
  return getDayStatus(db, userId, date);
}

/**
 * Writes the targets that apply to `date` into `metric_daily`, only for days with meals (an untracked
 * day has no target to miss). Called after meal writes, day-type changes, target changes and workout
 * writes (a workout can change the automatic day type).
 */
export async function recomputeNutritionTargets(db: Db, userId: string, date: string) {
  const ids = [METRICS.kcalTarget.id, METRICS.proteinTarget.id];
  const [meals] = await db
    .select({ n: sql<number>`count(*)` })
    .from(entry)
    .where(and(eq(entry.userId, userId), eq(entry.tracker, "meal"), eq(entry.localDate, date)));
  if ((meals?.n ?? 0) === 0) return replaceMetrics(db, userId, date, ids, []);
  const [settings, type] = await Promise.all([
    getNutritionTargets(db, userId),
    dayTypeOf(db, userId, date),
  ]);
  const t = settings[type.type];
  await replaceMetrics(db, userId, date, ids, [
    { metric: METRICS.kcalTarget.id, value: t.kcal },
    { metric: METRICS.proteinTarget.id, value: t.proteinG },
  ]);
}

// ---------- day summary ----------

export async function getDay(db: Db, userId: string, date: string): Promise<NutritionDayDto> {
  const [rows, settings, type] = await Promise.all([
    listEntries(db, userId, "meal", { from: date, to: date }),
    getNutritionTargets(db, userId),
    dayTypeOf(db, userId, date),
  ]);
  const meals = rows.map(toMealDto);
  return {
    date,
    dayType: type.type,
    dayTypeSource: type.source,
    ...dayStatus(sumMeals(meals), settings[type.type]),
    meals,
  };
}

export async function getDayStatus(
  db: Db,
  userId: string,
  date: string,
): Promise<NutritionDayStatusDto> {
  const { meals: _, ...status } = await getDay(db, userId, date);
  return status;
}

/** Daily totals and targets for [from, to] from the rollups; days without meals are left out. */
export async function listNutritionHistory(
  db: Db,
  userId: string,
  from: string,
  to: string,
): Promise<NutritionHistoryDayDto[]> {
  checkRange(from, to);
  const ids = [
    METRICS.kcal.id,
    METRICS.protein.id,
    METRICS.fat.id,
    METRICS.carbs.id,
    METRICS.kcalTarget.id,
    METRICS.proteinTarget.id,
  ];
  const rows = await db
    .select({ date: metricDaily.localDate, metric: metricDaily.metric, value: metricDaily.value })
    .from(metricDaily)
    .where(
      and(
        eq(metricDaily.userId, userId),
        inArray(metricDaily.metric, ids),
        gte(metricDaily.localDate, from),
        lte(metricDaily.localDate, to),
      ),
    )
    .orderBy(asc(metricDaily.localDate));
  const days = new Map<string, NutritionHistoryDayDto>();
  for (const r of rows) {
    let d = days.get(r.date);
    if (!d) {
      d = {
        date: r.date,
        kcal: 0,
        proteinG: 0,
        fatG: 0,
        carbsG: 0,
        targets: { kcal: 0, proteinG: 0 },
      };
      days.set(r.date, d);
    }
    if (r.metric === METRICS.kcal.id) d.kcal = r.value;
    else if (r.metric === METRICS.protein.id) d.proteinG = r.value;
    else if (r.metric === METRICS.fat.id) d.fatG = r.value;
    else if (r.metric === METRICS.carbs.id) d.carbsG = r.value;
    else if (r.metric === METRICS.kcalTarget.id) d.targets.kcal = r.value;
    else if (r.metric === METRICS.proteinTarget.id) d.targets.proteinG = r.value;
  }
  return [...days.values()];
}

// ---------- meals ----------

export async function logMeal(
  db: Db,
  userId: string,
  tz: string,
  input: LogMealInput,
  source: "app" | "mcp",
): Promise<MealDto> {
  const row = await logEntry(db, userId, tz, "meal", {
    id: input.id,
    occurredAt: parseTime(input.time) ?? Date.now(),
    value: input.kcal,
    note: input.note ?? null,
    data: {
      name: input.name,
      proteinG: input.proteinG,
      fatG: input.fatG,
      carbsG: input.carbsG,
      items: input.items,
    },
    source,
  });
  await recomputeNutritionTargets(db, userId, row.localDate);
  return toMealDto(row);
}

export async function updateMeal(
  db: Db,
  userId: string,
  tz: string,
  id: string,
  patch: UpdateMealInput,
): Promise<MealDto> {
  const current = await getEntry(db, userId, "meal", id);
  if (!current) throw new NotFoundError("meal");
  const d = current.data as MealData;
  const pick = <T>(next: T | null | undefined, prev: T | undefined) =>
    next === null ? undefined : (next ?? prev);
  const data: MealData = {
    name: patch.name ?? d.name,
    proteinG: patch.proteinG ?? d.proteinG,
    fatG: pick(patch.fatG, d.fatG),
    carbsG: pick(patch.carbsG, d.carbsG),
    items: pick(patch.items, d.items),
  };
  const row = await updateEntry(db, userId, tz, "meal", id, {
    occurredAt: parseTime(patch.time),
    value: patch.kcal,
    note: patch.note,
    data,
  });
  await recomputeNutritionTargets(db, userId, row.localDate);
  if (row.localDate !== current.localDate)
    await recomputeNutritionTargets(db, userId, current.localDate);
  return toMealDto(row);
}

/** Returns the meal's local date, or null when it didn't exist (idempotent). */
export async function deleteMeal(db: Db, userId: string, id: string): Promise<string | null> {
  const row = await deleteEntry(db, userId, "meal", id);
  if (!row) return null;
  await recomputeNutritionTargets(db, userId, row.localDate);
  return row.localDate;
}

export async function listMeals(
  db: Db,
  userId: string,
  range: { from: string; to: string },
): Promise<MealDto[]> {
  checkRange(range.from, range.to);
  return (await listEntries(db, userId, "meal", range)).map(toMealDto);
}

export type { DayType };
