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
