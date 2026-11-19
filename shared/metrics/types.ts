import type { LocalDate } from "../time";
import type { Bucket } from "./periods";

/** One metric (and dimension) aggregated over one bucket of `metric_daily` rows. */
export interface MetricBucketRow {
  metric: string;
  /** Muscle group, exercise id or tag; "" for metrics without a dimension. */
  dimension: string;
  /** First day of the bucket. */
  bucket: LocalDate;
  sum: number;
  min: number;
  max: number;
  /** Days with a row. */
  days: number;
}

export interface MetricsDto {
  from: LocalDate;
  to: LocalDate;
  bucket: Bucket;
  rows: MetricBucketRow[];
}

export interface TrendDto {
  /** Fitted value at the first and the last session. */
  start: number;
  end: number;
  changePct: number;
}

export interface ExerciseProgressDto {
  exerciseId: string;
  name: string;
  /** e1RM (kg) when the exercise was done with weight in the period, otherwise best reps. */
  measure: "e1rm" | "reps";
  /** Best value per session day, oldest first. */
  points: { date: LocalDate; value: number }[];
  /** Heaviest set per session day (kg), for weighted exercises. */
  topSets: { date: LocalDate; value: number }[];
  trend: TrendDto | null;
}

export interface GroupProgressDto {
  group: string;
  /** Mean change over the group's primary exercises that have a trend; null without any. */
  changePct: number | null;
  exercises: number;
}

export interface ProgressionDto {
  from: LocalDate;
  to: LocalDate;
  exercises: ExerciseProgressDto[];
  groups: GroupProgressDto[];
}

export interface DayStatsDto {
  date: LocalDate;
  /** That day's `metric_daily` rows. */
  rows: { metric: string; dimension: string; value: number }[];
  workouts: { id: string; workingSets: number; exercises: string[] }[];
}
