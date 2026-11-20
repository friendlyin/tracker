import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { uuidv7 } from "../../../shared/id";
import { localDateSchema } from "../../../shared/nutrition/schemas";
import { displaySets } from "../../../shared/workouts/budget";
import { exerciseFields, setKind, updateExerciseInput } from "../../../shared/workouts/schemas";
import { workoutSettingsPatchSchema } from "../../../shared/workouts/settings";
import type { SetDto, WorkoutDto } from "../../../shared/workouts/types";
import { InvalidError } from "../../services/errors";
import * as svc from "../../services/workouts";
import { type McpCtx, today, tool } from "../util";

const isoTime = z.iso.datetime({ offset: true });
const compactSet = (s: SetDto) => ({ kind: s.kind, reps: s.reps, weightKg: s.weightKg });

export function registerWorkoutTools(server: McpServer, ctx: McpCtx) {
  const { db, userId, tz } = ctx;

  const names = async () =>
    new Map(
      (await svc.listExercises(db, userId, { includeArchived: true })).map((e) => [e.id, e.name]),
    );

  /** Sets grouped by exercise in the order they were done. */
  const describeWorkout = (w: WorkoutDto, name: Map<string, string>) => {
    const exercises: { exerciseId: string; name: string; sets: ReturnType<typeof compactSet>[] }[] =
      [];
    for (const s of w.sets) {
      let e = exercises.find((x) => x.exerciseId === s.exerciseId);
      if (!e) {
        e = { exerciseId: s.exerciseId, name: name.get(s.exerciseId) ?? "?", sets: [] };
        exercises.push(e);
      }
      e.sets.push(compactSet(s));
    }
    return { id: w.id, date: w.localDate, startedAt: w.startedAt, endedAt: w.endedAt, exercises };
  };

  tool(server, ctx, "get_weekly_volume", {
    description:
      "This week's (Monday–Sunday) working sets per muscle group against the weekly targets: done, target, remaining, suggested sets for today (leftToday) and status (done / ok / at_risk). Also whether a workout is in progress and how many planned workouts are left. Warm-up sets never count.",
    input: z.object({}),
    readOnly: true,
    run: async () => {
      const active = await svc.getActiveWorkout(db, userId);
      const date = today(ctx);
      const { settings, plan } = await svc.getWeekPlan(db, userId, date, {
        hasActive: active !== null,
      });
      return {
        date,
        workoutActive: active !== null,
        workoutsPerWeek: settings.workoutsPerWeek,
        remainingWorkouts: plan.remainingWorkouts,
        totals: plan.totals,
        groups: plan.groups.map((g) => ({
          ...g,
          done: displaySets(g.done),
          doneToday: displaySets(g.doneToday),
          trainedToday: displaySets(g.trainedToday),
        })),
      };
    },
  });

  tool(server, ctx, "list_workouts", {
    description:
      "Finished workouts, newest first, optionally within local dates from/to (YYYY-MM-DD): date, times, working sets and exercise names.",
    input: z.object({
      from: localDateSchema.optional(),
      to: localDateSchema.optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    readOnly: true,
    run: (opts) => svc.listWorkouts(db, userId, opts),
  });

  tool(server, ctx, "get_workout", {
    description:
      "Full workouts with every set (kind, reps, weightKg) grouped by exercise: by id, or all workouts on a local date (default today).",
    input: z.object({ id: z.uuid().optional(), date: localDateSchema.optional() }),
    readOnly: true,
    run: async ({ id, date }) => {
      const name = await names();
      if (id) {
        const w = await svc.getWorkout(db, userId, id);
        return w ? [describeWorkout(w, name)] : [];
      }
      const d = date ?? today(ctx);
      const [list, active] = await Promise.all([
        svc.listWorkouts(db, userId, { from: d, to: d }),
        svc.getActiveWorkout(db, userId),
      ]);
      const ids = list.map((w) => w.id);
      if (active?.localDate === d) ids.push(active.id);
      const full = await Promise.all(ids.map((i) => svc.getWorkout(db, userId, i)));
      return full.filter((w) => w !== null).map((w) => describeWorkout(w, name));
    },
  });

  tool(server, ctx, "get_exercise_history", {
    description:
      "Recent sessions of one exercise, newest first, with each set's kind, reps and weightKg. Get exercise ids from list_exercises.",
    input: z.object({ exerciseId: z.uuid(), limit: z.number().int().min(1).max(50).optional() }),
    readOnly: true,
    run: async ({ exerciseId, limit }) =>
      (await svc.getExerciseHistory(db, userId, exerciseId, { limit })).map((s) => ({
        date: s.localDate,
        workoutId: s.workoutId,
        sets: s.sets.map(compactSet),
      })),
  });

  tool(server, ctx, "log_workout", {
    description:
      "Log a whole past workout: start and end time (ISO 8601 with offset) and its sets in order. Use exercise ids from list_exercises; create missing exercises first. Only working sets count toward weekly targets; weightKg is null for bodyweight.",
    input: z.object({
      id: z.uuid().optional(),
      startedAt: isoTime,
      endedAt: isoTime,
      sets: z
        .array(
          z.object({
            exerciseId: z.uuid(),
            kind: setKind,
            reps: z.number().int().min(1).max(200),
            weightKg: z.number().min(0).max(1000).nullable(),
          }),
        )
        .min(1)
        .max(200),
    }),
    run: async ({ id, startedAt, endedAt, sets }) => {
      const w = await svc.logWorkout(db, userId, tz, {
        id: id ?? uuidv7(),
        startedAt: Date.parse(startedAt),
        endedAt: Date.parse(endedAt),
        sets,
      });
      return w ? describeWorkout(w, await names()) : null;
    },
  });

  tool(server, ctx, "list_exercises", {
    description:
      "The user's exercise library, most used first: id, name, equipment, muscle contributions (1 primary, 0.5 secondary, 0.25 minor), recommended sets and rep range, and working sets in the last 8 weeks.",
    input: z.object({ includeArchived: z.boolean().optional() }),
    readOnly: true,
    run: async ({ includeArchived }) =>
      (await svc.listExercises(db, userId, { includeArchived })).map((e) => ({
        id: e.id,
        name: e.name,
        equipment: e.equipment,
        muscles: e.muscles,
        recSets: e.recSets,
        recReps: [e.recRepsMin, e.recRepsMax],
        recentSets: e.usageRecent,
        ...(e.archived ? { archived: true } : {}),
      })),
  });

  tool(server, ctx, "create_exercise", {
    description:
      "Add an exercise to the library. muscles lists each group at most once with at least one primary (contribution 1); secondary groups use 0.5, minor involvement 0.25.",
    input: z.object({ id: z.uuid().optional(), ...exerciseFields }),
    run: async ({ id, ...fields }) => {
      if (fields.recRepsMin > fields.recRepsMax) throw new InvalidError("Rep range is reversed");
      return svc.createExercise(db, userId, { id: id ?? uuidv7(), ...fields });
    },
  });

  tool(server, ctx, "update_exercise", {
    description:
      "Change an exercise: name, equipment, muscle contributions (replaces the whole list; past weekly volume is recalculated), recommended sets or rep range.",
    input: updateExerciseInput.extend({ id: z.uuid() }),
    run: ({ id, ...patch }) => svc.updateExercise(db, userId, id, patch),
  });

  tool(server, ctx, "archive_exercise", {
    description:
      "Hide an exercise from the library (history is kept). archived: false restores it.",
    input: z.object({ id: z.uuid(), archived: z.boolean().optional() }),
    run: ({ id, archived }) => svc.archiveExercise(db, userId, id, archived ?? true),
  });

  tool(server, ctx, "get_workout_settings", {
    description:
      "Workout settings: the weekly working-set target of each muscle group, and workouts per week.",
    input: z.object({}),
    readOnly: true,
    run: () => svc.getWorkoutSettings(db, userId),
  });

  tool(server, ctx, "set_workout_settings", {
    description:
      "Change workout settings: targets { group: sets per week } for any muscle groups, workoutsPerWeek. Only the given values change.",
    input: workoutSettingsPatchSchema,
    run: (patch) => svc.updateWorkoutSettings(db, userId, patch),
  });
}
