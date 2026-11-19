import { describe, expect, it } from "vitest";
import { period } from "./periods";
import { METRICS } from "./registry";
import { bucketValues, onTarget, periodValue, targetValues } from "./series";
import type { MetricBucketRow } from "./types";

const row = (
  metric: string,
  bucket: string,
  sum: number,
  days = 1,
  dimension = "",
): MetricBucketRow => ({
  metric,
  dimension,
  bucket,
  sum,
  min: sum / days,
  max: sum / days,
  days,
});

const today = "2026-11-19"; // Thursday
const week = period("week", today);

describe("series", () => {
  it("counts a missing day as 0 for `zero` metrics and leaves the future empty", () => {
    const rows = [
      row("water.intake_ml", "2026-11-16", 2000),
      row("water.intake_ml", "2026-11-18", 3000),
    ];
    const v = bucketValues(rows, METRICS.waterIntake, week, { today });
    expect(v).toEqual([2000, 0, 3000, 0, null, null, null]);
  });

  it("leaves a missing day empty for `unknown` metrics", () => {
    const rows = [row("nutrition.kcal", "2026-11-16", 2100)];
    const v = bucketValues(rows, METRICS.kcal, week, { today });
    expect(v.slice(0, 4)).toEqual([2100, null, null, null]);
  });

  it("averages sums per elapsed day for `zero`, per logged day for `unknown`", () => {
    const month = period("3m", today); // weekly buckets
    const water = [row("water.intake_ml", "2026-11-16", 6000, 2)];
    // The week of Nov 16 has 4 elapsed days up to today.
    const i = month.buckets.indexOf("2026-11-16");
    expect(bucketValues(water, METRICS.waterIntake, month, { today, mode: "daily" })[i]).toBe(1500);
    const kcal = [row("nutrition.kcal", "2026-11-16", 4400, 2)];
    expect(bucketValues(kcal, METRICS.kcal, month, { today, mode: "daily" })[i]).toBe(2200);
  });

  it("combines dimensions unless one is asked for", () => {
    const rows = [
      row("workouts.working_sets", "2026-11-17", 6, 1, "chest"),
      row("workouts.working_sets", "2026-11-17", 3, 1, "triceps"),
    ];
    expect(bucketValues(rows, METRICS.workingSets, week, { today })[1]).toBe(9);
    expect(bucketValues(rows, METRICS.workingSets, week, { today, dimension: "chest" })[1]).toBe(6);
  });

  it("gives one value for the period", () => {
    const rows = [
      row("water.intake_ml", "2026-11-16", 2000),
      row("water.intake_ml", "2026-11-18", 4000),
    ];
    expect(periodValue(rows, METRICS.waterIntake, week, { today })).toBe(6000);
    expect(periodValue(rows, METRICS.waterIntake, week, { today, mode: "daily" })).toBe(1500);
    expect(periodValue([], METRICS.kcal, week, { today, mode: "daily" })).toBeNull();
  });

  it("carries the target over days without one and counts days on target", () => {
    const rows = [
      row("water.intake_ml", "2026-11-17", 3200),
      row("water.target_ml", "2026-11-17", 3000),
      row("water.intake_ml", "2026-11-18", 2000),
    ];
    const values = bucketValues(rows, METRICS.waterIntake, week, { today });
    const targets = targetValues(rows, METRICS.waterIntake, week, today);
    expect(targets).toEqual(Array(7).fill(3000));
    expect(onTarget(METRICS.waterIntake, values, targets)).toEqual({ hit: 1, of: 4 });
  });

  it("treats a target as a budget unless more is better", () => {
    const rows = [
      row("nutrition.kcal", "2026-11-16", 2500),
      row("nutrition.kcal_target", "2026-11-16", 2600),
    ];
    const values = bucketValues(rows, METRICS.kcal, week, { today });
    const targets = targetValues(rows, METRICS.kcal, week, today);
    expect(onTarget(METRICS.kcal, values, targets)).toEqual({ hit: 1, of: 1 });
  });
});
