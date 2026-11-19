import { z } from "zod";
import { DEFAULT_CATEGORIES, MUSCLE_GROUPS } from "./groups";

const category = z.enum(["major", "minor"]);

export const workoutSettingsSchema = z.object({
  /** Weekly working-set targets per category. */
  targets: z
    .object({
      major: z.number().int().min(0).max(40),
      minor: z.number().int().min(0).max(40),
    })
    .default({ major: 12, minor: 9 }),
  categories: z
    .object(
      Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, category])) as Record<
        (typeof MUSCLE_GROUPS)[number],
        typeof category
      >,
    )
    .default(DEFAULT_CATEGORIES),
  workoutsPerWeek: z.number().int().min(1).max(7).default(3),
  /** Only full body for now; upper/lower and focus modes are in the backlog. */
  programMode: z.enum(["full_body"]).default("full_body"),
});

export type WorkoutSettings = z.infer<typeof workoutSettingsSchema>;

export const workoutSettingsPatchSchema = z.object({
  targets: z
    .object({
      major: z.number().int().min(0).max(40),
      minor: z.number().int().min(0).max(40),
    })
    .partial()
    .optional(),
  categories: z.partialRecord(z.enum(MUSCLE_GROUPS), category).optional(),
  workoutsPerWeek: z.number().int().min(1).max(7).optional(),
});

export type WorkoutSettingsPatch = z.infer<typeof workoutSettingsPatchSchema>;

/** Parse stored JSON, filling defaults for anything missing or invalid. */
export function parseWorkoutSettings(raw: unknown): WorkoutSettings {
  const r = workoutSettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : workoutSettingsSchema.parse({});
}

export function applyWorkoutSettingsPatch(
  current: WorkoutSettings,
  patch: WorkoutSettingsPatch,
): WorkoutSettings {
  return {
    ...current,
    targets: { ...current.targets, ...patch.targets },
    categories: { ...current.categories, ...patch.categories },
    workoutsPerWeek: patch.workoutsPerWeek ?? current.workoutsPerWeek,
  };
}
