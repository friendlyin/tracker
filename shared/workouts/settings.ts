import { z } from "zod";
import { DEFAULT_TARGETS, MUSCLE_GROUPS, type MuscleGroup } from "./groups";

const sets = z.number().int().min(0).max(40);

export const workoutSettingsSchema = z.object({
  /**
   * Weekly working-set target per muscle group. Each group has its own default, so stored settings
   * stay valid when a group is added.
   */
  targets: z
    .object(
      Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, sets.default(DEFAULT_TARGETS[g])])) as {
        [G in MuscleGroup]: z.ZodDefault<typeof sets>;
      },
    )
    .default(DEFAULT_TARGETS),
  workoutsPerWeek: z.number().int().min(1).max(7).default(3),
  /** Only full body for now; upper/lower and focus modes are in the backlog. */
  programMode: z.enum(["full_body"]).default("full_body"),
});

export type WorkoutSettings = z.infer<typeof workoutSettingsSchema>;

export const workoutSettingsPatchSchema = z.object({
  targets: z.partialRecord(z.enum(MUSCLE_GROUPS), sets).optional(),
  workoutsPerWeek: z.number().int().min(1).max(7).optional(),
});

export type WorkoutSettingsPatch = z.infer<typeof workoutSettingsPatchSchema>;

// Until 2026-11-20 targets were set per category: `targets: { major, minor }` plus a category per
// group. Stored settings in that shape become per-group targets with the same numbers.
const LEGACY_MAJOR = new Set(["chest", "back", "shoulders", "quads", "hams_glutes"]);

function fromLegacy(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as { targets?: Record<string, unknown>; categories?: Record<string, unknown> };
  const t = r.targets;
  if (!t || !("major" in t || "minor" in t)) return raw;
  const { categories, ...rest } = r;
  const targets: Record<string, unknown> = {};
  for (const g of MUSCLE_GROUPS) {
    if (g === "calves") continue; // added after categories; starts from its own default
    const category = categories?.[g] ?? (LEGACY_MAJOR.has(g) ? "major" : "minor");
    const v = t[category as string];
    if (v !== undefined) targets[g] = v;
  }
  return { ...rest, targets };
}

/** Parse stored JSON, filling defaults for anything missing or invalid. */
export function parseWorkoutSettings(raw: unknown): WorkoutSettings {
  const r = workoutSettingsSchema.safeParse(fromLegacy(raw) ?? {});
  return r.success ? r.data : workoutSettingsSchema.parse({});
}

export function applyWorkoutSettingsPatch(
  current: WorkoutSettings,
  patch: WorkoutSettingsPatch,
): WorkoutSettings {
  return {
    ...current,
    targets: { ...current.targets, ...patch.targets },
    workoutsPerWeek: patch.workoutsPerWeek ?? current.workoutsPerWeek,
  };
}

/** The weekly set target summed over all groups. */
export const weeklySetTarget = (s: WorkoutSettings) =>
  MUSCLE_GROUPS.reduce((sum, g) => sum + s.targets[g], 0);
