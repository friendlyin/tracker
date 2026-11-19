import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { uuidv7 } from "../../../shared/id";
import { isoInZone, localDate } from "../../../shared/time";
import { waterState } from "../../../shared/water/model";
import {
  applyWaterSettingsPatch,
  type WaterSettings,
  type WaterSettingsPatch,
} from "../../../shared/water/settings";
import type { WaterInputsDto } from "../../../shared/water/types";
import { api, deviceTimeZone } from "../../lib/api";
import { useNow } from "../../lib/useNow";

// The app logs water. Writes are optimistic: the entry is added to the cached inputs and the shared
// simulation runs again. Claude can log water too, so the day refetches on open and focus.

export const wkeys = {
  all: ["water"] as const,
  day: ["water", "day"] as const,
  settings: ["water", "settings"] as const,
};
const mutationKey = ["water", "write"];

export const useWaterDay = () =>
  useQuery({
    queryKey: wkeys.day,
    queryFn: () => api<WaterInputsDto>("/water/day"),
    staleTime: 0,
  });

/** The simulated state, re-run every minute so pending rises live. */
export function useWaterState() {
  const { data } = useWaterDay();
  const tick = useNow(60_000);
  // Simulate at the real current time: a drink logged since the last tick must count.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick re-runs it every minute
  return useMemo(() => (data ? waterState(data, Date.now()) : undefined), [data, tick]);
}

export const useWaterSettings = () =>
  useQuery({ queryKey: wkeys.settings, queryFn: () => api<WaterSettings>("/water/settings") });

/** Optimistic write on the cached day; the server's answer replaces it once no other write is pending. */
function useWaterWrite<V>(
  request: (v: V) => Promise<WaterInputsDto>,
  optimistic: (d: WaterInputsDto, v: V) => WaterInputsDto,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey,
    mutationFn: request,
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: wkeys.day });
      const prev = qc.getQueryData<WaterInputsDto>(wkeys.day);
      if (prev) qc.setQueryData(wkeys.day, optimistic(prev, v));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(wkeys.day, ctx.prev);
    },
    onSuccess: (d) => {
      if (qc.isMutating({ mutationKey }) <= 1) qc.setQueryData(wkeys.day, d);
    },
  });
}

export function useLogWater() {
  return useWaterWrite(
    (v: { id: string; ml: number; at: number }) =>
      api<WaterInputsDto>("/water/entries", {
        body: { id: v.id, ml: v.ml, time: isoInZone(v.at, deviceTimeZone()) },
      }),
    (d, v) => ({
      ...d,
      entries: [
        ...d.entries,
        { id: v.id, drankAt: v.at, localDate: localDate(v.at, d.tz), ml: v.ml, source: "app" },
      ],
    }),
  );
}

/** `log(ml)` adds a drink now and returns its id (for undo). */
export function useDrink() {
  const m = useLogWater();
  return {
    log: (ml: number) => {
      const at = Date.now();
      const id = uuidv7(at);
      m.mutate({ id, ml, at });
      return id;
    },
  };
}

export function useDeleteWater() {
  return useWaterWrite(
    (id: string) => api<WaterInputsDto>(`/water/entries/${id}`, { method: "DELETE" }),
    (d, id) => ({ ...d, entries: d.entries.filter((e) => e.id !== id) }),
  );
}

export function useUpdateWaterSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: WaterSettingsPatch) =>
      api<WaterSettings>("/water/settings", { method: "PATCH", body: patch }),
    onMutate: (patch) => {
      qc.setQueryData<WaterSettings>(wkeys.settings, (s) =>
        s ? applyWaterSettingsPatch(s, patch) : s,
      );
      qc.setQueryData<WaterInputsDto>(wkeys.day, (d) =>
        d ? { ...d, settings: applyWaterSettingsPatch(d.settings, patch) } : d,
      );
    },
    onSuccess: (s) => {
      qc.setQueryData(wkeys.settings, s);
      qc.invalidateQueries({ queryKey: wkeys.day });
    },
  });
}
