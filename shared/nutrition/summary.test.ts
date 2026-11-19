import { describe, expect, it } from "vitest";
import { applyNutritionSettingsPatch, parseNutritionSettings } from "./settings";
import { dayStatus, resolveDayType, sumMeals } from "./summary";

describe("nutrition summary", () => {
  it("sums meals with optional macros", () => {
    const t = sumMeals([
      { kcal: 650.4, proteinG: 42.25, fatG: 20 },
      { kcal: 300, proteinG: 10, carbsG: 45.5 },
    ]);
    expect(t).toEqual({ kcal: 950, proteinG: 52.3, fatG: 20, carbsG: 45.5 });
    expect(sumMeals([])).toEqual({ kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 });
  });

  it("computes remaining and over", () => {
    const targets = { kcal: 2200, proteinG: 180 };
    const under = dayStatus({ kcal: 1500, proteinG: 120, fatG: 0, carbsG: 0 }, targets);
    expect(under.remaining).toEqual({ kcal: 700, proteinG: 60 });
    expect(under.overKcal).toBe(0);
    expect(under.proteinReached).toBe(false);

    const over = dayStatus({ kcal: 2350, proteinG: 190, fatG: 0, carbsG: 0 }, targets);
    expect(over.remaining).toEqual({ kcal: 0, proteinG: 0 });
    expect(over.overKcal).toBe(150);
    expect(over.proteinReached).toBe(true);
  });

  it("resolves the day type: override wins, else workouts decide", () => {
    expect(resolveDayType(null, false)).toEqual({ type: "rest", source: "auto" });
    expect(resolveDayType(null, true)).toEqual({ type: "workout", source: "auto" });
    expect(resolveDayType("rest", true)).toEqual({ type: "rest", source: "manual" });
    expect(resolveDayType("workout", false)).toEqual({ type: "workout", source: "manual" });
  });
});

describe("nutrition settings", () => {
  it("has product defaults and merges patches", () => {
    const d = parseNutritionSettings(undefined);
    expect(d).toEqual({
      workout: { kcal: 2600, proteinG: 180 },
      rest: { kcal: 2200, proteinG: 180 },
    });
    expect(parseNutritionSettings({ workout: { kcal: "x" } })).toEqual(d);
    expect(applyNutritionSettingsPatch(d, { rest: { kcal: 2000 } })).toEqual({
      workout: { kcal: 2600, proteinG: 180 },
      rest: { kcal: 2000, proteinG: 180 },
    });
  });
});
