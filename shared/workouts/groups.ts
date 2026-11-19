export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hams_glutes",
  "core",
  "calves",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Quads",
  hams_glutes: "Hamstrings & glutes",
  core: "Core",
  calves: "Calves",
};

/** Default weekly working-set target per group; each one can be changed in settings. */
export const DEFAULT_TARGETS: Record<MuscleGroup, number> = {
  chest: 12,
  back: 12,
  shoulders: 12,
  biceps: 9,
  triceps: 9,
  quads: 12,
  hams_glutes: 12,
  core: 9,
  calves: 3,
};

export function isMuscleGroup(v: string): v is MuscleGroup {
  return (MUSCLE_GROUPS as readonly string[]).includes(v);
}
