import type { z } from "zod";
import { type FocusData, focusDataSchema, type SleepData, sleepDataSchema } from "../focus/schemas";
import { type HabitData, habitDataSchema } from "../habits/schemas";
import { METRICS } from "../metrics/registry";
import { type MealData, mealDataSchema } from "../nutrition/schemas";
import { sumMeals } from "../nutrition/summary";
import { type WaterData, waterDataSchema } from "../water/schemas";

// Tracking engine: every "thing the user logs" is an entry of a tracker. Trackers are defined in code
// (system trackers); user-defined trackers would add a table later. Each tracker validates its
// tracker-specific `data` and turns one day's entries into `metric_daily` rows.

export type TrackerKind = "quantity" | "session" | "check" | "choice";

export interface MetricRow {
  metric: string;
  dimension?: string;
  value: number;
}

export interface TrackedEntry<D> {
  value: number | null;
  occurredAt: number;
  endedAt: number | null;
  data: D;
}

export interface TrackerDef<D> {
  key: string;
  kind: TrackerKind;
  /** Unit of `entry.value`. */
  unit: "kcal" | "ml" | "min" | "count" | "points";
  data: z.ZodType<D>;
  /** Metric ids this tracker writes; they are replaced when a day is recomputed. */
  metricIds: readonly string[];
  /** One local day's entries → rollup rows. No entries → no rows. */
  metrics(entries: readonly TrackedEntry<D>[]): MetricRow[];
}

const meal: TrackerDef<MealData> = {
  key: "meal",
  kind: "quantity",
  unit: "kcal",
  data: mealDataSchema,
  metricIds: [METRICS.kcal.id, METRICS.protein.id, METRICS.fat.id, METRICS.carbs.id],
  metrics(entries) {
    if (entries.length === 0) return [];
    const t = sumMeals(entries.map((e) => ({ kcal: e.value ?? 0, ...e.data })));
    return [
      { metric: METRICS.kcal.id, value: t.kcal },
      { metric: METRICS.protein.id, value: t.proteinG },
      { metric: METRICS.fat.id, value: t.fatG },
      { metric: METRICS.carbs.id, value: t.carbsG },
    ];
  },
};

const water: TrackerDef<WaterData> = {
  key: "water",
  kind: "quantity",
  unit: "ml",
  data: waterDataSchema,
  metricIds: [METRICS.waterIntake.id],
  metrics(entries) {
    if (entries.length === 0) return [];
    return [
      { metric: METRICS.waterIntake.id, value: entries.reduce((n, e) => n + (e.value ?? 0), 0) },
    ];
  },
};

/** One row per habit (dimension: habit id) with the summed amounts of its entries. */
function byHabit<D extends { habitId?: string }>(
  entries: readonly TrackedEntry<D>[],
  metric: string,
  amount: (e: TrackedEntry<D>) => number,
): MetricRow[] {
  const sums = new Map<string, number>();
  for (const e of entries) {
    const id = e.data.habitId;
    if (id) sums.set(id, (sums.get(id) ?? 0) + amount(e));
  }
  return [...sums].map(([dimension, value]) => ({
    metric,
    dimension,
    value: Math.round(value * 100) / 100,
  }));
}

/** Added minutes (`value`), or a stopped timer's length. */
const minutes = (e: TrackedEntry<unknown>) =>
  e.value ?? (e.endedAt === null ? 0 : Math.max(0, e.endedAt - e.occurredAt) / 60_000);

/**
 * Deep and moderate focus and unfocus: timers (counted once stopped, on the day they started) and
 * minutes added afterwards.
 */
const focus: TrackerDef<FocusData> = {
  key: "focus",
  kind: "session",
  unit: "min",
  data: focusDataSchema,
  metricIds: [
    METRICS.focusDeep.id,
    METRICS.focusDeepSessions.id,
    METRICS.focusModerate.id,
    METRICS.focusUnfocus.id,
    METRICS.habitMinutes.id,
  ],
  metrics(entries) {
    const done = entries.filter((e) => e.endedAt !== null || e.value !== null);
    const of = (k: FocusData["kind"]) => done.filter((e) => e.data.kind === k);
    const sum = (es: readonly TrackedEntry<FocusData>[]) =>
      Math.round(es.reduce((n, e) => n + minutes(e), 0));
    const rows: MetricRow[] = [];
    const deep = of("deep");
    if (deep.length > 0) {
      rows.push({ metric: METRICS.focusDeep.id, value: sum(deep) });
      rows.push({ metric: METRICS.focusDeepSessions.id, value: deep.length });
    }
    const byTag = new Map<string, TrackedEntry<FocusData>[]>();
    for (const e of of("moderate")) {
      const tag = e.data.tag ?? "";
      byTag.set(tag, [...(byTag.get(tag) ?? []), e]);
    }
    for (const [tag, es] of byTag) {
      rows.push({ metric: METRICS.focusModerate.id, dimension: tag, value: sum(es) });
    }
    const unfocus = of("unfocus");
    if (unfocus.length > 0) rows.push({ metric: METRICS.focusUnfocus.id, value: sum(unfocus) });
    rows.push(...byHabit(done, METRICS.habitMinutes.id, minutes));
    return rows;
  },
};

/** One entry per local date; `value` is 3 good, 2 ok, 1 bad. */
const sleep: TrackerDef<SleepData> = {
  key: "sleep",
  kind: "choice",
  unit: "points",
  data: sleepDataSchema,
  metricIds: [METRICS.sleepQuality.id],
  metrics(entries) {
    const last = entries[entries.length - 1];
    return last?.value ? [{ metric: METRICS.sleepQuality.id, value: last.value }] : [];
  },
};

/** Check, count and amount habits; time habits are focus sessions. */
const habit: TrackerDef<HabitData> = {
  key: "habit",
  kind: "quantity",
  unit: "count",
  data: habitDataSchema,
  metricIds: [METRICS.habitAmount.id],
  metrics: (entries) => byHabit(entries, METRICS.habitAmount.id, (e) => e.value ?? 0),
};

export const TRACKERS = { meal, water, focus, sleep, habit } as const;

export type TrackerKey = keyof typeof TRACKERS;
export type TrackerData<K extends TrackerKey> =
  (typeof TRACKERS)[K] extends TrackerDef<infer D> ? D : never;
