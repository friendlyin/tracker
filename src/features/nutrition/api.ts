import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DayTypeChoice } from "../../../shared/nutrition/schemas";
import {
  applyNutritionSettingsPatch,
  type NutritionSettings,
  type NutritionSettingsPatch,
} from "../../../shared/nutrition/settings";
import type { NutritionDayDto } from "../../../shared/nutrition/types";
import { localDate } from "../../../shared/time";
import { api, deviceTimeZone, queueWrite } from "../../lib/api";

// Meals are written by Claude (MCP), so these queries refetch when the app comes back into focus.

export const nkeys = {
  all: ["nutrition"] as const,
  day: (date: string) => ["nutrition", "day", date] as const,
  settings: ["nutrition", "settings"] as const,
};

export const todayLocal = () => localDate(Date.now(), deviceTimeZone());

export const nutritionDayQuery = (date: string) =>
  queryOptions({
    queryKey: nkeys.day(date),
    queryFn: () => api<NutritionDayDto>(`/nutrition/day?date=${date}`),
    // Claude logs meals from outside the app: refetch on every open and focus (cache shows first).
    staleTime: 0,
  });
export const useNutritionDay = (date: string) => useQuery(nutritionDayQuery(date));

export const useNutritionSettings = () =>
  useQuery({
    queryKey: nkeys.settings,
    queryFn: () => api<NutritionSettings>("/nutrition/settings"),
  });

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: nkeys.all });
    qc.invalidateQueries({ queryKey: ["home"] });
  };
}

export function useSetDayType(date: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (type: DayTypeChoice) =>
      queueWrite(`/nutrition/day/${date}/type`, { method: "PUT", body: { type } }),
    onMutate: (type) => {
      // Optimistic for a manual choice; "auto" is resolved by the server once the write is sent.
      if (type === "auto") return;
      qc.setQueryData<NutritionDayDto>(nkeys.day(date), (d) =>
        d ? { ...d, dayType: type, dayTypeSource: "manual" } : d,
      );
    },
    onSettled: invalidate,
  });
}

export function useUpdateNutritionSettings() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (patch: NutritionSettingsPatch) =>
      queueWrite("/nutrition/settings", { method: "PATCH", body: patch }),
    onMutate: (patch) =>
      qc.setQueryData<NutritionSettings>(nkeys.settings, (s) =>
        s ? applyNutritionSettingsPatch(s, patch) : s,
      ),
    onSettled: invalidate,
  });
}
