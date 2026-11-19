import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { focusState, isRunning } from "../../../shared/focus/model";
import type { FocusKind } from "../../../shared/focus/schemas";
import {
  applyFocusSettingsPatch,
  type FocusSettings,
  type FocusSettingsPatch,
  type SleepQuality,
} from "../../../shared/focus/settings";
import type { FocusEntryDto, FocusInputsDto } from "../../../shared/focus/types";
import { uuidv7 } from "../../../shared/id";
import { isoInZone, localDate } from "../../../shared/time";
import { api, deviceTimeZone, queueWrite } from "../../lib/api";
import { useNow } from "../../lib/useNow";

// The app logs focus sessions and runs their timers. Writes are optimistic: the cached inputs change
// and the shared simulation runs again. The write waits in the outbox until it is sent; the day
// refetches once the outbox is empty. Claude can log too, so the day also refetches on open and focus.

export const fkeys = {
  all: ["focus"] as const,
  day: ["focus", "day"] as const,
  settings: ["focus", "settings"] as const,
};
const MIN = 60_000;
const iso = (t: number) => isoInZone(t, deviceTimeZone());

export const focusDayQuery = queryOptions({
  queryKey: fkeys.day,
  queryFn: () => api<FocusInputsDto>("/focus/day"),
  staleTime: 0,
});
export const useFocusDay = () => useQuery(focusDayQuery);

export const useFocusSettings = () =>
  useQuery({ queryKey: fkeys.settings, queryFn: () => api<FocusSettings>("/focus/settings") });

/** The simulated state, re-run every minute (every 15 s while a timer runs). */
export function useFocusState() {
  const { data } = useFocusDay();
  const running = data?.entries.some(isRunning) ?? false;
  const tick = useNow(running ? 15_000 : 60_000);
  // Simulate at the real current time: a write since the last tick must count.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick re-runs it
  return useMemo(() => (data ? focusState(data, Date.now()) : undefined), [data, tick]);
}

/** Optimistic write on the cached day, queued in the outbox. */
function useFocusWrite<V>(
  request: (v: V) => Promise<void>,
  optimistic: (d: FocusInputsDto, v: V) => FocusInputsDto,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: request,
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: fkeys.day });
      const prev = qc.getQueryData<FocusInputsDto>(fkeys.day);
      if (prev) qc.setQueryData(fkeys.day, optimistic(prev, v));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(fkeys.day, ctx.prev);
    },
  });
}

/** Like the server: stops running timers; one stopped within a minute is dropped. */
const stopAll = (entries: FocusEntryDto[], at: number) =>
  entries
    .filter((e) => !isRunning(e) || at - e.startedAt >= MIN)
    .map((e) => (isRunning(e) ? { ...e, endedAt: at } : e));

const newEntry = (
  d: FocusInputsDto,
  v: { id: string; kind: FocusKind; tag?: string; at: number; minutes: number | null },
): FocusEntryDto => ({
  id: v.id,
  kind: v.kind,
  tag: v.tag ?? null,
  startedAt: v.at,
  endedAt: null,
  minutes: v.minutes,
  localDate: localDate(v.at, d.tz),
  source: "app",
});

type Added = { id: string; kind: FocusKind; tag?: string; minutes: number; at: number };
type Started = { id: string; kind: FocusKind; tag?: string; at: number };

/** `add` logs minutes done earlier (they apply now); `start` starts a timer. Both return the id. */
export function useFocusLog() {
  const add = useFocusWrite(
    (v: Added) =>
      queueWrite("/focus/entries", {
        body: { id: v.id, kind: v.kind, tag: v.tag, minutes: v.minutes, time: iso(v.at) },
      }),
    (d, v) => ({ ...d, entries: [...d.entries, newEntry(d, v)] }),
  );
  const start = useFocusWrite(
    (v: Started) =>
      queueWrite("/focus/start", {
        body: { id: v.id, kind: v.kind, tag: v.tag, time: iso(v.at) },
      }),
    (d, v) => ({
      ...d,
      entries: [...stopAll(d.entries, v.at), newEntry(d, { ...v, minutes: null })],
    }),
  );
  return {
    add: (kind: FocusKind, minutes: number, tag?: string) => {
      const id = uuidv7();
      add.mutate({ id, kind, tag, minutes, at: Date.now() });
      return id;
    },
    start: (kind: FocusKind, tag?: string) => {
      const id = uuidv7();
      start.mutate({ id, kind, tag, at: Date.now() });
      return id;
    },
  };
}

export function useStopFocus() {
  const qc = useQueryClient();
  const m = useFocusWrite(
    (v: { at: number; id?: string }) =>
      queueWrite("/focus/stop", { body: { time: iso(v.at), id: v.id } }),
    (d, v) => ({ ...d, entries: stopAll(d.entries, v.at) }),
  );
  return {
    // Names the running timer, so a late or repeated stop never stops a newer one.
    stop: () => {
      const id = qc.getQueryData<FocusInputsDto>(fkeys.day)?.entries.find(isRunning)?.id;
      m.mutate({ at: Date.now(), id });
    },
  };
}

export interface FocusPatch {
  id: string;
  minutes?: number;
  tag?: string | null;
}

export function useUpdateFocus() {
  return useFocusWrite(
    (v: FocusPatch) =>
      queueWrite(`/focus/entries/${v.id}`, {
        method: "PATCH",
        body: { minutes: v.minutes, tag: v.tag },
      }),
    (d, v) => ({
      ...d,
      entries: d.entries.map((e) => {
        if (e.id !== v.id) return e;
        const tag = v.tag === undefined ? e.tag : v.tag;
        if (v.minutes === undefined) return { ...e, tag };
        return e.minutes !== null
          ? { ...e, tag, minutes: v.minutes }
          : { ...e, tag, endedAt: e.startedAt + v.minutes * MIN };
      }),
    }),
  );
}

export function useDeleteFocus() {
  return useFocusWrite(
    (id: string) => queueWrite(`/focus/entries/${id}`, { method: "DELETE" }),
    (d, id) => ({ ...d, entries: d.entries.filter((e) => e.id !== id) }),
  );
}

/** Sets the sleep quality of the current focus day. */
export function useSetSleep() {
  return useFocusWrite(
    (v: { quality: SleepQuality; date: string }) =>
      queueWrite("/focus/sleep", { method: "PUT", body: v }),
    (d, v) => {
      const existing = d.sleep.find((s) => s.date === v.date);
      const now = Date.now();
      const sleep = existing
        ? d.sleep.map((s) => (s.date === v.date ? { ...s, quality: v.quality } : s))
        : [...d.sleep, { id: uuidv7(now), date: v.date, quality: v.quality, setAt: now }];
      return { ...d, sleep };
    },
  );
}

export function useUpdateFocusSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: FocusSettingsPatch) =>
      queueWrite("/focus/settings", { method: "PATCH", body: patch }),
    onMutate: (patch) => {
      qc.setQueryData<FocusSettings>(fkeys.settings, (s) =>
        s ? applyFocusSettingsPatch(s, patch) : s,
      );
      qc.setQueryData<FocusInputsDto>(fkeys.day, (d) =>
        d ? { ...d, settings: applyFocusSettingsPatch(d.settings, patch) } : d,
      );
    },
    onError: () => qc.invalidateQueries({ queryKey: fkeys.all }),
  });
}
