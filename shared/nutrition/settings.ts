import { z } from "zod";

export const DAY_TYPES = ["workout", "rest"] as const;
export type DayType = (typeof DAY_TYPES)[number];

const kcal = z.number().int().min(0).max(10000);
const proteinG = z.number().int().min(0).max(1000);

export const dayTargetsSchema = z.object({ kcal, proteinG });
export type DayTargets = z.infer<typeof dayTargetsSchema>;

/** Daily targets per day type. Fat and carbs are tracked without a target. */
export const nutritionSettingsSchema = z.object({
  workout: dayTargetsSchema.default({ kcal: 2600, proteinG: 180 }),
  rest: dayTargetsSchema.default({ kcal: 2200, proteinG: 180 }),
});

export type NutritionSettings = z.infer<typeof nutritionSettingsSchema>;

export const nutritionSettingsPatchSchema = z.object({
  workout: dayTargetsSchema.partial().optional(),
  rest: dayTargetsSchema.partial().optional(),
});

export type NutritionSettingsPatch = z.infer<typeof nutritionSettingsPatchSchema>;

export const nutritionSettingsKey = "nutrition";

/** Parse stored JSON, filling defaults for anything missing or invalid. */
export function parseNutritionSettings(raw: unknown): NutritionSettings {
  const r = nutritionSettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : nutritionSettingsSchema.parse({});
}

export function applyNutritionSettingsPatch(
  current: NutritionSettings,
  patch: NutritionSettingsPatch,
): NutritionSettings {
  return {
    workout: { ...current.workout, ...patch.workout },
    rest: { ...current.rest, ...patch.rest },
  };
}
