import { z } from "zod";
import { MUSCLE_GROUPS } from "./groups";

const id = z.uuid();
const instant = z.number().int().positive(); // Unix ms

export const setKind = z.enum(["warmup", "working"]);
export const equipment = z.enum(["barbell", "dumbbell", "cable", "machine", "bodyweight"]);
export const contribution = z.union([z.literal(1), z.literal(0.5), z.literal(0.25)]);
const reps = z.number().int().min(1).max(200);
const weightKg = z.number().min(0).max(1000).nullable();

export const musclesSchema = z
  .array(z.object({ group: z.enum(MUSCLE_GROUPS), contribution }))
  .min(1)
  .refine((m) => m.some((x) => x.contribution === 1), "A primary group (1.0) is required")
  .refine((m) => new Set(m.map((x) => x.group)).size === m.length, "Each group only once");

export const startWorkoutInput = z.object({ id, startedAt: instant.optional() });

export const finishWorkoutInput = z.object({ endedAt: instant.optional() });

export const addSetInput = z.object({
  id,
  workoutId: id,
  exerciseId: id,
  kind: setKind,
  reps,
  weightKg,
  performedAt: instant.optional(),
});

export const updateSetInput = z.object({
  kind: setKind.optional(),
  reps: reps.optional(),
  weightKg: weightKg.optional(),
});

const exerciseFields = {
  name: z.string().trim().min(1).max(80),
  equipment,
  muscles: musclesSchema,
  recSets: z.number().int().min(1).max(10),
  recRepsMin: z.number().int().min(1).max(100),
  recRepsMax: z.number().int().min(1).max(100),
};

export const createExerciseInput = z
  .object({ id, ...exerciseFields })
  .refine((e) => e.recRepsMin <= e.recRepsMax, "Rep range is reversed");

export const updateExerciseInput = z.object(exerciseFields).partial();

/** A whole workout logged after the fact (used by Claude via MCP, and for imports). */
export const logWorkoutInput = z.object({
  id,
  startedAt: instant,
  endedAt: instant,
  sets: z
    .array(
      z.object({
        id: id.optional(),
        exerciseId: id,
        kind: setKind,
        reps,
        weightKg,
      }),
    )
    .max(200),
});

export const workoutSettingsKey = "workouts";

export type AddSetInput = z.infer<typeof addSetInput>;
export type UpdateSetInput = z.infer<typeof updateSetInput>;
export type CreateExerciseInput = z.infer<typeof createExerciseInput>;
export type UpdateExerciseInput = z.infer<typeof updateExerciseInput>;
export type LogWorkoutInput = z.infer<typeof logWorkoutInput>;
