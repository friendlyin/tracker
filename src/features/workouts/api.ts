import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { uuidv7 } from "../../../shared/id";
import { localDate } from "../../../shared/time";
import type { CreateExerciseInput, UpdateExerciseInput } from "../../../shared/workouts/schemas";
import {
  applyWorkoutSettingsPatch,
  type WorkoutSettingsPatch,
} from "../../../shared/workouts/settings";
import type {
  ExerciseDto,
  ExerciseSessionDto,
  SetDto,
  WorkoutDto,
  WorkoutsOverviewDto,
} from "../../../shared/workouts/types";
import { api, deviceTimeZone, queueWrite } from "../../lib/api";

export const keys = {
  overview: ["workouts", "overview"] as const,
  exercises: ["workouts", "exercises"] as const,
  history: (exerciseId: string) => ["workouts", "history", exerciseId] as const,
  workout: (id: string) => ["workouts", "workout", id] as const,
};

export const overviewQuery = queryOptions({
  queryKey: keys.overview,
  queryFn: () => api<WorkoutsOverviewDto>("/overview"),
});
export const useOverview = () => useQuery(overviewQuery);

export const exercisesQuery = queryOptions({
  queryKey: keys.exercises,
  queryFn: () => api<ExerciseDto[]>("/exercises?archived=1"),
});
export const useExercises = () => useQuery(exercisesQuery);

export const useExerciseHistory = (exerciseId: string) =>
  useQuery({
    queryKey: keys.history(exerciseId),
    queryFn: () => api<ExerciseSessionDto[]>(`/exercises/${exerciseId}/history?limit=5`),
  });

export const useWorkout = (id: string) =>
  useQuery({ queryKey: keys.workout(id), queryFn: () => api<WorkoutDto>(`/workouts/${id}`) });

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["workouts"] });
    qc.invalidateQueries({ queryKey: ["home"] });
  };
}

/** Starts a workout on the phone; resolves with it at once, so sets can be logged offline. */
export function useStartWorkout() {
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async () => {
      const startedAt = Date.now();
      const tz = deviceTimeZone();
      const w: WorkoutDto = {
        id: uuidv7(startedAt),
        startedAt,
        endedAt: null,
        localDate: localDate(startedAt, tz),
        tz,
        sets: [],
      };
      await qc.cancelQueries({ queryKey: keys.overview });
      qc.setQueryData<WorkoutsOverviewDto>(keys.overview, (o) => (o ? { ...o, active: w } : o));
      await queueWrite("/workouts", { body: { id: w.id, startedAt } });
      return w;
    },
    onSettled: invalidate,
  });
}

export function useFinishWorkout() {
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) =>
      queueWrite(`/workouts/${id}/finish`, { body: { endedAt: Date.now() } }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: keys.overview });
      qc.setQueryData<WorkoutsOverviewDto>(keys.overview, (o) =>
        o?.active?.id === id ? { ...o, active: null } : o,
      );
    },
    onSettled: invalidate,
  });
}

export function useDeleteWorkout() {
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => queueWrite(`/workouts/${id}`, { method: "DELETE" }),
    onMutate: (id) =>
      qc.setQueryData<WorkoutsOverviewDto>(keys.overview, (o) =>
        o
          ? {
              ...o,
              active: o.active?.id === id ? null : o.active,
              recent: o.recent.filter((w) => w.id !== id),
            }
          : o,
      ),
    onSettled: invalidate,
  });
}

type NewSet = Omit<SetDto, "id" | "position" | "performedAt">;

/** Patches the set in every cached place it appears (active workout, a past workout). */
function patchSetCaches(
  qc: ReturnType<typeof useQueryClient>,
  workoutId: string,
  fn: (sets: SetDto[]) => SetDto[],
) {
  qc.setQueryData<WorkoutsOverviewDto>(keys.overview, (o) =>
    o?.active?.id === workoutId ? { ...o, active: { ...o.active, sets: fn(o.active.sets) } } : o,
  );
  qc.setQueryData<WorkoutDto>(keys.workout(workoutId), (w) => (w ? { ...w, sets: fn(w.sets) } : w));
}

export function useAddSet() {
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (s: SetDto) => queueWrite("/sets", { body: s }),
    onMutate: async (s) => {
      await qc.cancelQueries({ queryKey: keys.overview });
      patchSetCaches(qc, s.workoutId, (sets) => [...sets, s]);
    },
    onSettled: invalidate,
  });
}

/** Builds a set with a client id, ready for useAddSet (optimistic insert needs id + position). */
export function newSet(input: NewSet, position: number): SetDto {
  return { ...input, id: uuidv7(), position, performedAt: Date.now() };
}

export function useUpdateSet() {
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (s: SetDto) =>
      queueWrite(`/sets/${s.id}`, {
        method: "PATCH",
        body: { kind: s.kind, reps: s.reps, weightKg: s.weightKg },
      }),
    onMutate: (s) =>
      patchSetCaches(qc, s.workoutId, (sets) => sets.map((x) => (x.id === s.id ? s : x))),
    onSettled: invalidate,
  });
}

export function useDeleteSet() {
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (s: SetDto) => queueWrite(`/sets/${s.id}`, { method: "DELETE" }),
    onMutate: (s) => patchSetCaches(qc, s.workoutId, (sets) => sets.filter((x) => x.id !== s.id)),
    onSettled: invalidate,
  });
}

type SaveExercise =
  | { id: string; isNew: true; data: Omit<CreateExerciseInput, "id"> }
  | { id: string; isNew: false; data: UpdateExerciseInput };

/** Patches the cached exercise list (a new exercise must be usable before it syncs). */
function patchExercises(
  qc: ReturnType<typeof useQueryClient>,
  fn: (list: ExerciseDto[]) => ExerciseDto[],
) {
  qc.setQueryData<ExerciseDto[]>(keys.exercises, (l) => fn(l ?? []));
}

export function useSaveExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (e: SaveExercise) =>
      e.isNew
        ? queueWrite("/exercises", { body: { id: e.id, ...e.data } })
        : queueWrite(`/exercises/${e.id}`, { method: "PATCH", body: e.data }),
    onMutate: async (e) => {
      await qc.cancelQueries({ queryKey: keys.exercises });
      patchExercises(qc, (list) =>
        e.isNew
          ? [
              ...list,
              {
                id: e.id,
                ...e.data,
                archived: false,
                custom: true,
                usageRecent: 0,
                usageTotal: 0,
              },
            ]
          : list.map((x) => (x.id === e.id ? { ...x, ...e.data } : x)),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["workouts"] }),
  });
}

export function useArchiveExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      queueWrite(`/exercises/${id}/archive`, { body: { archived } }),
    onMutate: ({ id, archived }) =>
      patchExercises(qc, (list) => list.map((x) => (x.id === id ? { ...x, archived } : x))),
    onSettled: () => qc.invalidateQueries({ queryKey: ["workouts"] }),
  });
}

export function useUpdateWorkoutSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: WorkoutSettingsPatch) =>
      queueWrite("/settings", { method: "PATCH", body: patch }),
    onMutate: (patch) =>
      qc.setQueryData<WorkoutsOverviewDto>(keys.overview, (o) =>
        o ? { ...o, settings: applyWorkoutSettingsPatch(o.settings, patch) } : o,
      ),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["workouts"] });
      qc.invalidateQueries({ queryKey: ["home"] });
    },
  });
}
