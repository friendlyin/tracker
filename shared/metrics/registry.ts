// Metrics engine registry. Each feature registers the metrics it writes to `metric_daily`; the stats
// screens, the Overview and the MCP `list_metrics` / `get_metrics` tools read these definitions.

export type Aggregation = "sum" | "avg" | "min" | "max";

export interface MetricDef {
  id: string;
  /** Short name, for Claude and for the few places the UI needs one. */
  label: string;
  unit: "count" | "sets" | "kg" | "reps" | "ml" | "kcal" | "g" | "min" | "points";
  /** How daily values combine into weeks/months. */
  aggregation: Aggregation;
  better: "higher" | "lower" | "none";
  dimension?: "muscle_group" | "exercise" | "tag" | "habit";
  /**
   * What a day without a row means: `zero` (nothing drunk, no workout) or `unknown` (nothing logged,
   * e.g. meals). Daily averages count every elapsed day for `zero`, only days with a row for `unknown`.
   */
  empty: "zero" | "unknown";
  /** The metric holding the target that applied each day. */
  target?: string;
}

export const METRICS = {
  workoutsCount: {
    id: "workouts.count",
    label: "Workouts",
    unit: "count",
    aggregation: "sum",
    better: "higher",
    empty: "zero",
  },
  workingSets: {
    id: "workouts.working_sets",
    label: "Working sets",
    unit: "sets",
    aggregation: "sum",
    better: "higher",
    dimension: "muscle_group",
    empty: "zero",
  },
  topSet: {
    id: "exercise.top_set_kg",
    label: "Top set",
    unit: "kg",
    aggregation: "max",
    better: "higher",
    dimension: "exercise",
    empty: "unknown",
  },
  e1rm: {
    id: "exercise.e1rm_kg",
    label: "Estimated 1RM",
    unit: "kg",
    aggregation: "max",
    better: "higher",
    dimension: "exercise",
    empty: "unknown",
  },
  /** Most reps in one working set: the progress measure for exercises done without weight. */
  bestReps: {
    id: "exercise.best_reps",
    label: "Best reps",
    unit: "reps",
    aggregation: "max",
    better: "higher",
    dimension: "exercise",
    empty: "unknown",
  },
  kcal: {
    id: "nutrition.kcal",
    label: "Calories",
    unit: "kcal",
    aggregation: "sum",
    better: "none",
    empty: "unknown",
    target: "nutrition.kcal_target",
  },
  protein: {
    id: "nutrition.protein_g",
    label: "Protein",
    unit: "g",
    aggregation: "sum",
    better: "higher",
    empty: "unknown",
    target: "nutrition.protein_target",
  },
  fat: {
    id: "nutrition.fat_g",
    label: "Fat",
    unit: "g",
    aggregation: "sum",
    better: "none",
    empty: "unknown",
  },
  carbs: {
    id: "nutrition.carbs_g",
    label: "Carbs",
    unit: "g",
    aggregation: "sum",
    better: "none",
    empty: "unknown",
  },
  /** The targets that applied that day (they depend on the day type and can change over time). */
  kcalTarget: {
    id: "nutrition.kcal_target",
    label: "Calorie target",
    unit: "kcal",
    aggregation: "avg",
    better: "none",
    empty: "unknown",
  },
  proteinTarget: {
    id: "nutrition.protein_target",
    label: "Protein target",
    unit: "g",
    aggregation: "avg",
    better: "none",
    empty: "unknown",
  },
  waterIntake: {
    id: "water.intake_ml",
    label: "Water",
    unit: "ml",
    aggregation: "sum",
    better: "higher",
    empty: "zero",
    target: "water.target_ml",
  },
  /** The target that applied that day; written for days with water entries. */
  waterTarget: {
    id: "water.target_ml",
    label: "Water target",
    unit: "ml",
    aggregation: "avg",
    better: "none",
    empty: "unknown",
  },
  /** Awake minutes with pending water at the cap; written once the day is over. */
  waterAtCap: {
    id: "water.at_cap_min",
    label: "Time at the cap",
    unit: "min",
    aggregation: "sum",
    better: "lower",
    empty: "unknown",
  },
  focusDeep: {
    id: "focus.deep_min",
    label: "Deep focus",
    unit: "min",
    aggregation: "sum",
    better: "none",
    empty: "zero",
  },
  focusDeepSessions: {
    id: "focus.deep_sessions",
    label: "Deep sessions",
    unit: "count",
    aggregation: "sum",
    better: "none",
    empty: "zero",
  },
  /** By tag (podcast, film, …); untagged sessions have the empty dimension. */
  focusModerate: {
    id: "focus.moderate_min",
    label: "Moderate focus",
    unit: "min",
    aggregation: "sum",
    better: "none",
    dimension: "tag",
    empty: "zero",
  },
  focusUnfocus: {
    id: "focus.unfocus_min",
    label: "Unfocus",
    unit: "min",
    aggregation: "sum",
    better: "higher",
    empty: "zero",
  },
  /** The rest are written once the day is over, for days with focus entries or sleep set. */
  focusMinEnergy: {
    id: "focus.min_energy",
    label: "Lowest energy",
    unit: "points",
    aggregation: "min",
    better: "higher",
    empty: "unknown",
  },
  focusLowSuggest: {
    id: "focus.low_suggest_min",
    label: "Time below the suggest level",
    unit: "min",
    aggregation: "sum",
    better: "lower",
    empty: "unknown",
  },
  focusLowRecommend: {
    id: "focus.low_recommend_min",
    label: "Time below the recommend level",
    unit: "min",
    aggregation: "sum",
    better: "lower",
    empty: "unknown",
  },
  focusLowUrgent: {
    id: "focus.low_urgent_min",
    label: "Time below the urgent level",
    unit: "min",
    aggregation: "sum",
    better: "lower",
    empty: "unknown",
  },
  /** 3 good, 2 ok, 1 bad. */
  sleepQuality: {
    id: "sleep.quality",
    label: "Sleep quality",
    unit: "points",
    aggregation: "avg",
    better: "higher",
    empty: "unknown",
  },
  /** Check (1), count and amount habits: the day's amount per habit (dimension: habit id). */
  habitAmount: {
    id: "habit.amount",
    label: "Habit amount",
    unit: "count",
    aggregation: "sum",
    better: "higher",
    dimension: "habit",
    empty: "unknown",
  },
  /** Time habits: stopped sessions and added minutes per habit (dimension: habit id). */
  habitMinutes: {
    id: "habit.minutes",
    label: "Habit minutes",
    unit: "min",
    aggregation: "sum",
    better: "higher",
    dimension: "habit",
    empty: "unknown",
  },
} as const satisfies Record<string, MetricDef>;

export type MetricId = (typeof METRICS)[keyof typeof METRICS]["id"];

const BY_ID = new Map<string, MetricDef>(Object.values(METRICS).map((m) => [m.id, m]));

export const metricDef = (id: string): MetricDef | undefined => BY_ID.get(id);
export const isMetricId = (id: string): id is MetricId => BY_ID.has(id);
export const ALL_METRICS: readonly MetricDef[] = Object.values(METRICS);
