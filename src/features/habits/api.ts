import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FocusInputsDto } from "../../../shared/focus/types";
import type { CreateHabitInput, UpdateHabitInput } from "../../../shared/habits/schemas";
import type { HabitDto, HabitEntryDto, HabitsDayDto } from "../../../shared/habits/types";
import { uuidv7 } from "../../../shared/id";
import { isoInZone } from "../../../shared/time";
import { api, deviceTimeZone, queueWrite } from "../../lib/api";
import { fkeys, newEntry, stopAll } from "../focus/api";

// Habits and today's progress. Writes are optimistic and queued in the outbox. A time habit's progress
// is a focus session, so those writes also update the cached focus day (energy, the running timer).

const MIN = 60_000;
const iso = (t: number) => isoInZone(t, deviceTimeZone());

export const hkeys = {
  all: ["habits"] as const,
  day: ["habits", "day"] as const,
};

export const habitsDayQuery = queryOptions({
  queryKey: hkeys.day,
  queryFn: () => api<HabitsDayDto>("/habits/day"),
  staleTime: 0,
});
export const useHabitsDay = () => useQuery(habitsDayQuery);

/** Habit names by id, for labelling focus sessions. */
export function useHabitNames(): Map<string, string> {
  const { data } = useHabitsDay();
  return new Map((data?.habits ?? []).map((h) => [h.id, h.name]));
}

type Patch = {
  habits?: (d: HabitsDayDto) => HabitsDayDto;
  focus?: (d: FocusInputsDto) => FocusInputsDto;
};

/** Optimistic write on the cached habits day (and focus day), queued in the outbox. */
function useHabitsWrite<V>(request: (v: V) => Promise<void>, patch: (v: V) => Patch) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: request,
    onMutate: async (v) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: hkeys.day }),
        qc.cancelQueries({ queryKey: fkeys.day }),
      ]);
      const prev = {
        habits: qc.getQueryData<HabitsDayDto>(hkeys.day),
        focus: qc.getQueryData<FocusInputsDto>(fkeys.day),
      };
      const p = patch(v);
      if (prev.habits && p.habits) qc.setQueryData(hkeys.day, p.habits(prev.habits));
      if (prev.focus && p.focus) qc.setQueryData(fkeys.day, p.focus(prev.focus));
      return prev;
    },
    onError: (_e, _v, prev) => {
      if (prev?.habits) qc.setQueryData(hkeys.day, prev.habits);
      if (prev?.focus) qc.setQueryData(fkeys.day, prev.focus);
    },
  });
}

/** Stops running timers in the habit entries, like the server (under a minute is dropped). */
const stopEntries = (entries: HabitEntryDto[], at: number) =>
  entries
    .filter((e) => !(e.session && e.amount === null && e.endedAt === null && at - e.at < MIN))
    .map((e) => (e.session && e.amount === null && e.endedAt === null ? { ...e, endedAt: at } : e));

export const runningEntry = (d: HabitsDayDto | undefined) =>
  d?.entries.find((e) => e.session && e.amount === null && e.endedAt === null);

export function useLogHabit() {
  const m = useHabitsWrite(
    (v: { id: string; habit: HabitDto; amount: number; at: number }) =>
      queueWrite("/habits/entries", {
        body: { id: v.id, habitId: v.habit.id, amount: v.amount, time: iso(v.at) },
      }),
    (v) => {
      const time = v.habit.kind === "time";
      const e: HabitEntryDto = {
        id: v.id,
        habitId: v.habit.id,
        at: v.at,
        endedAt: null,
        amount: v.amount,
        session: time,
        targetMin: null,
        source: "app",
      };
      return {
        habits: (d) => ({ ...d, entries: [...d.entries, e] }),
        focus: time
          ? (d) => ({
              ...d,
              entries: [
                ...d.entries,
                newEntry(d, {
                  id: v.id,
                  kind: v.habit.focus ?? "other",
                  at: v.at,
                  minutes: v.amount,
                  habitId: v.habit.id,
                }),
              ],
            })
          : undefined,
      };
    },
  );
  /** A check logs 1; count and amount habits `amount`; time habits `amount` minutes. */
  return (habit: HabitDto, amount = 1) => {
    const id = uuidv7();
    m.mutate({ id, habit, amount: habit.kind === "check" ? 1 : amount, at: Date.now() });
    return id;
  };
}

export function useDeleteHabitEntry() {
  const m = useHabitsWrite(
    (id: string) => queueWrite(`/habits/entries/${id}`, { method: "DELETE" }),
    (id) => ({
      habits: (d) => ({ ...d, entries: d.entries.filter((e) => e.id !== id) }),
      focus: (d) => ({ ...d, entries: d.entries.filter((e) => e.id !== id) }),
    }),
  );
  return (id: string) => m.mutate(id);
}

/** Starts a time habit's countdown; it is the one running timer (a focus timer stops). */
export function useStartHabit() {
  const m = useHabitsWrite(
    (v: { id: string; habit: HabitDto; minutes: number; at: number }) =>
      queueWrite("/habits/start", {
        body: { id: v.id, habitId: v.habit.id, minutes: v.minutes, time: iso(v.at) },
      }),
    (v) => ({
      habits: (d) => ({
        ...d,
        entries: [
          ...stopEntries(d.entries, v.at),
          {
            id: v.id,
            habitId: v.habit.id,
            at: v.at,
            endedAt: null,
            amount: null,
            session: true,
            targetMin: v.minutes,
            source: "app",
          },
        ],
      }),
      focus: (d) => ({
        ...d,
        entries: [
          ...stopAll(d.entries, v.at),
          newEntry(d, {
            id: v.id,
            kind: v.habit.focus ?? "other",
            at: v.at,
            minutes: null,
            targetMin: v.minutes,
            habitId: v.habit.id,
          }),
        ],
      }),
    }),
  );
  return (habit: HabitDto, minutes: number) => {
    const id = uuidv7();
    m.mutate({ id, habit, minutes, at: Date.now() });
    return id;
  };
}

/** Stops the running timer by id (a habit's or a focus one). */
export function useStopTimer() {
  const m = useHabitsWrite(
    (v: { id: string; at: number }) =>
      queueWrite("/focus/stop", { body: { time: iso(v.at), id: v.id } }),
    (v) => ({
      habits: (d) => ({ ...d, entries: stopEntries(d.entries, v.at) }),
      // One timer runs at a time.
      focus: (d) => ({ ...d, entries: stopAll(d.entries, v.at) }),
    }),
  );
  return (id: string) => m.mutate({ id, at: Date.now() });
}

const sortHabits = (hs: HabitDto[]) => [...hs].sort((a, b) => a.position - b.position);

export function useCreateHabit() {
  const m = useHabitsWrite(
    (v: CreateHabitInput) => queueWrite("/habits", { body: v }),
    (v) => ({
      habits: (d) => ({
        ...d,
        habits: [
          ...d.habits,
          {
            ...v,
            position: Math.max(-1, ...d.habits.map((h) => h.position)) + 1,
            createdAt: Date.now(),
          },
        ],
      }),
    }),
  );
  return (v: Omit<CreateHabitInput, "id">) => m.mutate({ ...v, id: uuidv7() });
}

export function useUpdateHabit() {
  const m = useHabitsWrite(
    (v: { id: string; patch: UpdateHabitInput }) =>
      queueWrite(`/habits/${v.id}`, { method: "PATCH", body: v.patch }),
    (v) => ({
      habits: (d) => ({
        ...d,
        habits: sortHabits(d.habits.map((h) => (h.id === v.id ? { ...h, ...v.patch } : h))),
      }),
    }),
  );
  return (id: string, patch: UpdateHabitInput) => m.mutate({ id, patch });
}

export function useArchiveHabit() {
  const m = useHabitsWrite(
    (id: string) => queueWrite(`/habits/${id}`, { method: "DELETE" }),
    (id) => ({ habits: (d) => ({ ...d, habits: d.habits.filter((h) => h.id !== id) }) }),
  );
  return (id: string) => m.mutate(id);
}
