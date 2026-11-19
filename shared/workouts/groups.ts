export const MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hams_glutes",
  "core",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
export type GroupCategory = "major" | "minor";

export const GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Quads",
  hams_glutes: "Hamstrings & glutes",
  core: "Core",
};

export const DEFAULT_CATEGORIES: Record<MuscleGroup, GroupCategory> = {
  chest: "major",
  back: "major",
  shoulders: "major",
  biceps: "minor",
  triceps: "minor",
  quads: "major",
  hams_glutes: "major",
  core: "minor",
};

export function isMuscleGroup(v: string): v is MuscleGroup {
  return (MUSCLE_GROUPS as readonly string[]).includes(v);
}
