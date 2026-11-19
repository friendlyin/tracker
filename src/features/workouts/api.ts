import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { uuidv7 } from "../../../shared/id";
import type { CreateExerciseInput, UpdateExerciseInput } from "../../../shared/workouts/schemas";
import type { WorkoutSettings, WorkoutSettingsPatch } from "../../../shared/workouts/settings";
import type {
  ExerciseDto,
  ExerciseSessionDto,
  SetDto,
  WorkoutDto,
  WorkoutsOverviewDto,
} from "../../../shared/workouts/types";
import { api } from "../../lib/api";

export const keys = {
  overview: ["workouts", "overview"] as const,
  exercises: ["workouts", "exercises"] as const,
  history: (exerciseId: string) => ["workouts", "history", exerciseId] as const,
  workout: (id: string) => ["workouts", "workout", id] as const,
};

export const useOverview = () =>
  useQuery({ queryKey: keys.overview, queryFn: () => api<WorkoutsOverviewDto>("/overview") });

export const useExercises = () =>
  useQuery({
    queryKey: keys.exercises,
    queryFn: () => api<ExerciseDto[]>("/exercises?archived=1"),
  });

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

export function useStartWorkout() {
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: () => api<WorkoutDto>("/workouts", { body: { id: uuidv7() } }),
    onSuccess: (w) => {
      qc.setQueryData<WorkoutsOverviewDto>(keys.overview, (o) => (o ? { ...o, active: w } : o));
      invalidate();
    },
  });
}

export function useFinishWorkout() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => api<WorkoutDto | null>(`/workouts/${id}/finish`, { body: {} }),
    onSettled: invalidate,
  });
}

export function useDeleteWorkout() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => api(`/workouts/${id}`, { method: "DELETE" }),
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
    mutationFn: (s: SetDto) => api<SetDto>("/sets", { body: s }),
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
      api<SetDto>(`/sets/${s.id}`, {
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
    mutationFn: (s: SetDto) => api(`/sets/${s.id}`, { method: "DELETE" }),
    onMutate: (s) => patchSetCaches(qc, s.workoutId, (sets) => sets.filter((x) => x.id !== s.id)),
    onSettled: invalidate,
  });
}

export function useSaveExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      e:
        | { id: string; isNew: true; data: Omit<CreateExerciseInput, "id"> }
        | {
            id: string;
            isNew: false;
            data: UpdateExerciseInput;
          },
    ) =>
      e.isNew
        ? api<ExerciseDto>("/exercises", { body: { id: e.id, ...e.data } })
        : api<ExerciseDto>(`/exercises/${e.id}`, { method: "PATCH", body: e.data }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["workouts"] }),
  });
}

export function useArchiveExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      api<ExerciseDto>(`/exercises/${id}/archive`, { body: { archived } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["workouts"] }),
  });
}

export function useUpdateWorkoutSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: WorkoutSettingsPatch) =>
      api<WorkoutSettings>("/settings", { method: "PATCH", body: patch }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["workouts"] });
      qc.invalidateQueries({ queryKey: ["home"] });
    },
  });
}
