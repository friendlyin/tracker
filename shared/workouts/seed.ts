import type { MuscleGroup } from "./groups";

export type Equipment = "barbell" | "dumbbell" | "cable" | "machine" | "bodyweight";

export interface SeedExercise {
  /** Stable key, so later releases can add exercises without duplicating existing ones. */
  key: string;
  name: string;
  equipment: Equipment;
  sets: number;
  reps: [number, number];
  muscles: Partial<Record<MuscleGroup, 1 | 0.5 | 0.25>>;
}

/** Generic starter library. Copied into each new user's own exercises, which they can then edit. */
export const SEED_EXERCISES: SeedExercise[] = [
  // Chest
  {
    key: "bench_press",
    name: "Bench press",
    equipment: "barbell",
    sets: 3,
    reps: [6, 10],
    muscles: { chest: 1, triceps: 0.5, shoulders: 0.5 },
  },
  {
    key: "incline_db_press",
    name: "Incline dumbbell press",
    equipment: "dumbbell",
    sets: 3,
    reps: [8, 12],
    muscles: { chest: 1, shoulders: 0.5, triceps: 0.5 },
  },
  {
    key: "db_bench_press",
    name: "Dumbbell bench press",
    equipment: "dumbbell",
    sets: 3,
    reps: [8, 12],
    muscles: { chest: 1, triceps: 0.5, shoulders: 0.5 },
  },
  {
    key: "chest_press_machine",
    name: "Chest press machine",
    equipment: "machine",
    sets: 3,
    reps: [8, 12],
    muscles: { chest: 1, triceps: 0.5, shoulders: 0.25 },
  },
  {
    key: "cable_fly",
    name: "Cable fly",
    equipment: "cable",
    sets: 3,
    reps: [10, 15],
    muscles: { chest: 1 },
  },
  {
    key: "push_up",
    name: "Push-up",
    equipment: "bodyweight",
    sets: 3,
    reps: [10, 20],
    muscles: { chest: 1, triceps: 0.5, shoulders: 0.5 },
  },
  {
    key: "dip",
    name: "Dip",
    equipment: "bodyweight",
    sets: 3,
    reps: [6, 12],
    muscles: { triceps: 1, chest: 0.5, shoulders: 0.25 },
  },
  // Back
  {
    key: "pull_up",
    name: "Pull-up",
    equipment: "bodyweight",
    sets: 3,
    reps: [5, 10],
    muscles: { back: 1, biceps: 0.5 },
  },
  {
    key: "lat_pulldown",
    name: "Lat pulldown",
    equipment: "cable",
    sets: 3,
    reps: [8, 12],
    muscles: { back: 1, biceps: 0.5 },
  },
  {
    key: "barbell_row",
    name: "Barbell row",
    equipment: "barbell",
    sets: 3,
    reps: [6, 10],
    muscles: { back: 1, biceps: 0.5, hams_glutes: 0.25 },
  },
  {
    key: "cable_row",
    name: "Seated cable row",
    equipment: "cable",
    sets: 3,
    reps: [8, 12],
    muscles: { back: 1, biceps: 0.5 },
  },
  {
    key: "db_row",
    name: "One-arm dumbbell row",
    equipment: "dumbbell",
    sets: 3,
    reps: [8, 12],
    muscles: { back: 1, biceps: 0.5 },
  },
  {
    key: "deadlift",
    name: "Deadlift",
    equipment: "barbell",
    sets: 3,
    reps: [3, 6],
    muscles: { hams_glutes: 1, back: 0.5, quads: 0.25, core: 0.25 },
  },
  // Shoulders
  {
    key: "overhead_press",
    name: "Overhead press",
    equipment: "barbell",
    sets: 3,
    reps: [5, 8],
    muscles: { shoulders: 1, triceps: 0.5 },
  },
  {
    key: "db_shoulder_press",
    name: "Dumbbell shoulder press",
    equipment: "dumbbell",
    sets: 3,
    reps: [8, 12],
    muscles: { shoulders: 1, triceps: 0.5 },
  },
  {
    key: "lateral_raise",
    name: "Lateral raise",
    equipment: "dumbbell",
    sets: 3,
    reps: [12, 20],
    muscles: { shoulders: 1 },
  },
  {
    key: "face_pull",
    name: "Face pull",
    equipment: "cable",
    sets: 3,
    reps: [12, 20],
    muscles: { shoulders: 1, back: 0.25 },
  },
  {
    key: "rear_delt_fly",
    name: "Rear delt fly",
    equipment: "machine",
    sets: 3,
    reps: [12, 20],
    muscles: { shoulders: 1, back: 0.25 },
  },
  // Biceps
  {
    key: "barbell_curl",
    name: "Barbell curl",
    equipment: "barbell",
    sets: 3,
    reps: [8, 12],
    muscles: { biceps: 1 },
  },
  {
    key: "db_curl",
    name: "Dumbbell curl",
    equipment: "dumbbell",
    sets: 3,
    reps: [8, 12],
    muscles: { biceps: 1 },
  },
  {
    key: "hammer_curl",
    name: "Hammer curl",
    equipment: "dumbbell",
    sets: 3,
    reps: [8, 12],
    muscles: { biceps: 1 },
  },
  {
    key: "cable_curl",
    name: "Cable curl",
    equipment: "cable",
    sets: 3,
    reps: [10, 15],
    muscles: { biceps: 1 },
  },
  // Triceps
  {
    key: "triceps_pushdown",
    name: "Triceps pushdown",
    equipment: "cable",
    sets: 3,
    reps: [10, 15],
    muscles: { triceps: 1 },
  },
  {
    key: "overhead_triceps_ext",
    name: "Overhead triceps extension",
    equipment: "cable",
    sets: 3,
    reps: [10, 15],
    muscles: { triceps: 1 },
  },
  {
    key: "skull_crusher",
    name: "Skull crusher",
    equipment: "barbell",
    sets: 3,
    reps: [8, 12],
    muscles: { triceps: 1 },
  },
  {
    key: "close_grip_bench",
    name: "Close-grip bench press",
    equipment: "barbell",
    sets: 3,
    reps: [6, 10],
    muscles: { triceps: 1, chest: 0.5, shoulders: 0.25 },
  },
  // Quads
  {
    key: "back_squat",
    name: "Back squat",
    equipment: "barbell",
    sets: 3,
    reps: [5, 8],
    muscles: { quads: 1, hams_glutes: 0.5, core: 0.25 },
  },
  {
    key: "front_squat",
    name: "Front squat",
    equipment: "barbell",
    sets: 3,
    reps: [5, 8],
    muscles: { quads: 1, hams_glutes: 0.25, core: 0.25 },
  },
  {
    key: "leg_press",
    name: "Leg press",
    equipment: "machine",
    sets: 3,
    reps: [8, 12],
    muscles: { quads: 1, hams_glutes: 0.5 },
  },
  {
    key: "bulgarian_split_squat",
    name: "Bulgarian split squat",
    equipment: "dumbbell",
    sets: 3,
    reps: [8, 12],
    muscles: { quads: 1, hams_glutes: 0.5 },
  },
  {
    key: "leg_extension",
    name: "Leg extension",
    equipment: "machine",
    sets: 3,
    reps: [10, 15],
    muscles: { quads: 1 },
  },
  // Hamstrings & glutes
  {
    key: "romanian_deadlift",
    name: "Romanian deadlift",
    equipment: "barbell",
    sets: 3,
    reps: [6, 10],
    muscles: { hams_glutes: 1, back: 0.25 },
  },
  {
    key: "leg_curl",
    name: "Leg curl",
    equipment: "machine",
    sets: 3,
    reps: [10, 15],
    muscles: { hams_glutes: 1 },
  },
  {
    key: "hip_thrust",
    name: "Hip thrust",
    equipment: "barbell",
    sets: 3,
    reps: [8, 12],
    muscles: { hams_glutes: 1 },
  },
  // Core
  {
    key: "hanging_leg_raise",
    name: "Hanging leg raise",
    equipment: "bodyweight",
    sets: 3,
    reps: [8, 15],
    muscles: { core: 1 },
  },
  {
    key: "cable_crunch",
    name: "Cable crunch",
    equipment: "cable",
    sets: 3,
    reps: [10, 15],
    muscles: { core: 1 },
  },
  {
    key: "ab_wheel",
    name: "Ab wheel rollout",
    equipment: "bodyweight",
    sets: 3,
    reps: [6, 12],
    muscles: { core: 1 },
  },
];

/** Stepper increment for weights; dumbbell weights are per dumbbell. */
export function weightStep(equipment: Equipment): number {
  return equipment === "dumbbell" || equipment === "cable" ? 1 : 2.5;
}
