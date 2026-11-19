import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { focusState } from "../../../shared/focus/model";
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
import { api, deviceTimeZone } from "../../lib/api";
import { useNow } from "../../lib/useNow";

// The app logs focus sessions and runs their timers. Writes are optimistic: the cached inputs change
// and the shared simulation runs again. Claude can log too, so the day refetches on open and focus.

export const fkeys = {
  all: ["focus"] as const,
  day: ["focus", "day"] as const,
  settings: ["focus", "settings"] as const,
};
const mutationKey = ["focus", "write"];
const MIN = 60_000;
const iso = (t: number) => isoInZone(t, deviceTimeZone());

export const useFocusDay = () =>
  useQuery({
    queryKey: fkeys.day,
    queryFn: () => api<FocusInputsDto>("/focus/day"),
    staleTime: 0,
  });

export const useFocusSettings = () =>
  useQuery({ queryKey: fkeys.settings, queryFn: () => api<FocusSettings>("/focus/settings") });

/** The simulated state, re-run every minute (every 15 s while a timer runs). */
export function useFocusState() {
  const { data } = useFocusDay();
  const running = data?.entries.some((e) => e.endedAt === null) ?? false;
  const tick = useNow(running ? 15_000 : 60_000);
  // Simulate at the real current time: a write since the last tick must count.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick re-runs it
  return useMemo(() => (data ? focusState(data, Date.now()) : undefined), [data, tick]);
}

/** Optimistic write on the cached day; the server's answer replaces it once no other write is pending. */
function useFocusWrite<V>(
  request: (v: V) => Promise<FocusInputsDto>,
  optimistic: (d: FocusInputsDto, v: V) => FocusInputsDto,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey,
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
    onSuccess: (d) => {
      if (qc.isMutating({ mutationKey }) <= 1) qc.setQueryData(fkeys.day, d);
    },
  });
}

/** Like the server: a timer stopped within a minute is dropped. */
const stopAll = (entries: FocusEntryDto[], at: number) =>
  entries
    .filter((e) => e.endedAt !== null || at - e.startedAt >= MIN)
    .map((e) => (e.endedAt === null ? { ...e, endedAt: at } : e));

export interface LogFocus {
  kind: FocusKind;
  tag?: string;
  /** Start (Unix ms). */
  at: number;
  /** Omit to start a timer. */
  minutes?: number;
}

function useLogFocus() {
  return useFocusWrite(
    (v: LogFocus & { id: string }) =>
      api<FocusInputsDto>("/focus/entries", {
        body: { id: v.id, kind: v.kind, tag: v.tag, time: iso(v.at), minutes: v.minutes },
      }),
    (d, v) => {
      const entry: FocusEntryDto = {
        id: v.id,
        kind: v.kind,
        tag: v.tag ?? null,
        startedAt: v.at,
        endedAt: v.minutes === undefined ? null : v.at + v.minutes * MIN,
        localDate: localDate(v.at, d.tz),
        source: "app",
      };
      const rest = v.minutes === undefined ? stopAll(d.entries, v.at) : d.entries;
      return { ...d, entries: [...rest, entry] };
    },
  );
}

/** `log(...)` adds a session (or starts a timer) and returns its id. */
export function useFocusLog() {
  const m = useLogFocus();
  return {
    log: (v: LogFocus) => {
      const id = uuidv7();
      m.mutate({ ...v, id });
      return id;
    },
    start: (kind: FocusKind, tag?: string) => {
      const id = uuidv7();
      m.mutate({ kind, tag, at: Date.now(), id });
      return id;
    },
  };
}

export function useStopFocus() {
  const m = useFocusWrite(
    (at: number) => api<FocusInputsDto>("/focus/stop", { body: { time: iso(at) } }),
    (d, at) => ({ ...d, entries: stopAll(d.entries, at) }),
  );
  return { stop: () => m.mutate(Date.now()) };
}

export interface FocusPatch {
  id: string;
  at?: number;
  minutes?: number;
  tag?: string | null;
}

export function useUpdateFocus() {
  return useFocusWrite(
    (v: FocusPatch) =>
      api<FocusInputsDto>(`/focus/entries/${v.id}`, {
        method: "PATCH",
        body: {
          time: v.at === undefined ? undefined : iso(v.at),
          minutes: v.minutes,
          tag: v.tag,
        },
      }),
    (d, v) => ({
      ...d,
      entries: d.entries.map((e) => {
        if (e.id !== v.id) return e;
        const start = v.at ?? e.startedAt;
        const length = e.endedAt === null ? null : e.endedAt - e.startedAt;
        const endedAt =
          v.minutes !== undefined
            ? start + v.minutes * MIN
            : length === null
              ? null
              : start + length;
        const tag = v.tag === undefined ? e.tag : v.tag;
        return { ...e, startedAt: start, endedAt, tag, localDate: localDate(start, d.tz) };
      }),
    }),
  );
}

export function useDeleteFocus() {
  return useFocusWrite(
    (id: string) => api<FocusInputsDto>(`/focus/entries/${id}`, { method: "DELETE" }),
    (d, id) => ({ ...d, entries: d.entries.filter((e) => e.id !== id) }),
  );
}

/** Sets the sleep quality of the current focus day. */
export function useSetSleep() {
  return useFocusWrite(
    (v: { quality: SleepQuality; date: string }) =>
      api<FocusInputsDto>("/focus/sleep", { method: "PUT", body: v }),
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
      api<FocusSettings>("/focus/settings", { method: "PATCH", body: patch }),
    onMutate: (patch) => {
      qc.setQueryData<FocusSettings>(fkeys.settings, (s) =>
        s ? applyFocusSettingsPatch(s, patch) : s,
      );
      qc.setQueryData<FocusInputsDto>(fkeys.day, (d) =>
        d ? { ...d, settings: applyFocusSettingsPatch(d.settings, patch) } : d,
      );
    },
    onError: () => qc.invalidateQueries({ queryKey: fkeys.all }),
    onSuccess: (s) => {
      qc.setQueryData(fkeys.settings, s);
      qc.invalidateQueries({ queryKey: fkeys.day });
    },
  });
}
