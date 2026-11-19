// Metrics engine registry. Each feature registers the metrics it writes to `metric_daily`. The stats
// UI (iteration 7) and the MCP `get_metrics` tool read these definitions.

export type Aggregation = "sum" | "avg" | "min" | "max" | "last" | "count";

export interface MetricDef {
  id: string;
  unit: "count" | "sets" | "kg" | "ml" | "kcal" | "g" | "min" | "points";
  /** How daily values combine into weeks/months. */
  aggregation: Aggregation;
  better: "higher" | "lower" | "none";
  dimension?: "muscle_group" | "exercise";
}

export const METRICS = {
  workoutsCount: { id: "workouts.count", unit: "count", aggregation: "sum", better: "higher" },
  workingSets: {
    id: "workouts.working_sets",
    unit: "sets",
    aggregation: "sum",
    better: "higher",
    dimension: "muscle_group",
  },
  topSet: {
    id: "exercise.top_set_kg",
    unit: "kg",
    aggregation: "max",
    better: "higher",
    dimension: "exercise",
  },
  e1rm: {
    id: "exercise.e1rm_kg",
    unit: "kg",
    aggregation: "max",
    better: "higher",
    dimension: "exercise",
  },
  kcal: { id: "nutrition.kcal", unit: "kcal", aggregation: "sum", better: "none" },
  protein: { id: "nutrition.protein_g", unit: "g", aggregation: "sum", better: "higher" },
  fat: { id: "nutrition.fat_g", unit: "g", aggregation: "sum", better: "none" },
  carbs: { id: "nutrition.carbs_g", unit: "g", aggregation: "sum", better: "none" },
  /** The targets that applied that day (they depend on the day type and can change over time). */
  kcalTarget: { id: "nutrition.kcal_target", unit: "kcal", aggregation: "sum", better: "none" },
  proteinTarget: {
    id: "nutrition.protein_target",
    unit: "g",
    aggregation: "sum",
    better: "none",
  },
  waterIntake: { id: "water.intake_ml", unit: "ml", aggregation: "sum", better: "higher" },
  /** The target that applied that day; written for days with water entries. */
  waterTarget: { id: "water.target_ml", unit: "ml", aggregation: "sum", better: "none" },
  /** Awake minutes with pending water at the cap; written once the day is over. */
  waterAtCap: { id: "water.at_cap_min", unit: "min", aggregation: "sum", better: "lower" },
} as const satisfies Record<string, MetricDef>;
