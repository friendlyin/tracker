import type { DayTargets, DayType } from "./settings";

export interface Macros {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

export interface MealMacros {
  kcal: number;
  proteinG: number;
  fatG?: number | null;
  carbsG?: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Day totals. kcal are whole numbers, grams have one decimal. */
export function sumMeals(meals: readonly MealMacros[]): Macros {
  let kcal = 0;
  let proteinG = 0;
  let fatG = 0;
  let carbsG = 0;
  for (const m of meals) {
    kcal += m.kcal;
    proteinG += m.proteinG;
    fatG += m.fatG ?? 0;
    carbsG += m.carbsG ?? 0;
  }
  return {
    kcal: Math.round(kcal),
    proteinG: round1(proteinG),
    fatG: round1(fatG),
    carbsG: round1(carbsG),
  };
}

export interface DayStatus {
  totals: Macros;
  targets: DayTargets;
  /** What is left to reach the targets, never negative. */
  remaining: { kcal: number; proteinG: number };
  /** kcal above the target (0 when under). Shown as a warning. */
  overKcal: number;
  /** Protein at or above target. Going over is fine. */
  proteinReached: boolean;
}

export function dayStatus(totals: Macros, targets: DayTargets): DayStatus {
  return {
    totals,
    targets,
    remaining: {
      kcal: Math.max(0, targets.kcal - totals.kcal),
      proteinG: round1(Math.max(0, targets.proteinG - totals.proteinG)),
    },
    overKcal: Math.max(0, totals.kcal - targets.kcal),
    proteinReached: totals.proteinG >= targets.proteinG,
  };
}

export type DayTypeSource = "auto" | "manual";

/** A manual override wins; otherwise a day with a workout is a workout day. */
export function resolveDayType(
  override: DayType | null,
  hasWorkout: boolean,
): { type: DayType; source: DayTypeSource } {
  if (override) return { type: override, source: "manual" };
  return { type: hasWorkout ? "workout" : "rest", source: "auto" };
}
