import type { z } from "zod";
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

export const TRACKERS = { meal, water } as const;

export type TrackerKey = keyof typeof TRACKERS;
export type TrackerData<K extends TrackerKey> =
  (typeof TRACKERS)[K] extends TrackerDef<infer D> ? D : never;
