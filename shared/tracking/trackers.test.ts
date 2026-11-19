import { describe, expect, it } from "vitest";
import { TRACKERS } from "./trackers";

describe("meal tracker", () => {
  it("validates meal data", () => {
    expect(TRACKERS.meal.data.safeParse({ name: "Oats", proteinG: 20 }).success).toBe(true);
    expect(TRACKERS.meal.data.safeParse({ name: "", proteinG: 20 }).success).toBe(false);
    expect(TRACKERS.meal.data.safeParse({ name: "Oats" }).success).toBe(false);
  });

  it("rolls a day of meals up into metrics", () => {
    const at = { occurredAt: 0, endedAt: null };
    const rows = TRACKERS.meal.metrics([
      { ...at, value: 600, data: { name: "Lunch", proteinG: 45, fatG: 20, carbsG: 50 } },
      { ...at, value: 250, data: { name: "Skyr", proteinG: 25 } },
    ]);
    expect(rows).toEqual([
      { metric: "nutrition.kcal", value: 850 },
      { metric: "nutrition.protein_g", value: 70 },
      { metric: "nutrition.fat_g", value: 20 },
      { metric: "nutrition.carbs_g", value: 50 },
    ]);
    expect(TRACKERS.meal.metrics([])).toEqual([]);
  });
});

describe("water tracker", () => {
  it("sums a day's water", () => {
    const at = { occurredAt: 0, endedAt: null, data: {} };
    expect(
      TRACKERS.water.metrics([
        { ...at, value: 250 },
        { ...at, value: 500 },
      ]),
    ).toEqual([{ metric: "water.intake_ml", value: 750 }]);
  });
});

describe("focus tracker", () => {
  it("rolls finished sessions up by kind and tag", () => {
    const m = 60_000;
    const e = (kind: "deep" | "moderate" | "unfocus", min: number | null, tag?: string) => ({
      value: null,
      occurredAt: 0,
      endedAt: min === null ? null : min * m,
      data: { kind, tag },
    });
    expect(
      TRACKERS.focus.metrics([
        e("deep", 90),
        e("deep", 30),
        e("deep", null),
        e("moderate", 45, "podcast"),
        e("moderate", 15),
        e("unfocus", 20),
        { value: 10, occurredAt: 0, endedAt: null, data: { kind: "unfocus" as const } },
      ]),
    ).toEqual([
      { metric: "focus.deep_min", value: 120 },
      { metric: "focus.deep_sessions", value: 2 },
      { metric: "focus.moderate_min", dimension: "podcast", value: 45 },
      { metric: "focus.moderate_min", dimension: "", value: 15 },
      { metric: "focus.unfocus_min", value: 30 },
    ]);
  });
});
