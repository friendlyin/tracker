import type { WeekPlan } from "./budget";
import type { MuscleGroup } from "./groups";
import type { Equipment } from "./seed";
import type { WorkoutSettings } from "./settings";

// Response shapes shared by the API, the PWA and (from iteration 3) MCP tools.

export interface ExerciseDto {
  id: string;
  name: string;
  equipment: Equipment;
  recSets: number;
  recRepsMin: number;
  recRepsMax: number;
  muscles: { group: MuscleGroup; contribution: number }[];
  archived: boolean;
  custom: boolean;
  /** Working sets in the last 8 weeks / ever; used for "most used first". */
  usageRecent: number;
  usageTotal: number;
}

export interface SetDto {
  id: string;
  workoutId: string;
  exerciseId: string;
  position: number;
  kind: "warmup" | "working";
  reps: number;
  weightKg: number | null;
  performedAt: number;
}

export interface WorkoutDto {
  id: string;
  startedAt: number;
  endedAt: number | null;
  localDate: string;
  tz: string;
  sets: SetDto[];
}

export interface WorkoutSummaryDto {
  id: string;
  startedAt: number;
  endedAt: number | null;
  localDate: string;
  workingSets: number;
  exercises: string[];
}

export interface ExerciseSessionDto {
  workoutId: string;
  localDate: string;
  sets: SetDto[];
}

export interface WorkoutsOverviewDto {
  today: string;
  settings: WorkoutSettings;
  plan: WeekPlan;
  active: WorkoutDto | null;
  recent: WorkoutSummaryDto[];
}
