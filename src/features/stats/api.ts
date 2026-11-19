import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import type { Period } from "../../../shared/metrics/periods";
import type { DayStatsDto, MetricsDto, ProgressionDto } from "../../../shared/metrics/types";
import type { ExerciseSessionDto } from "../../../shared/workouts/types";
import { api } from "../../lib/api";

// Stats are read-only views over the rollups; they refetch with everything else once queued writes
// have synced. Paging keeps the previous period on screen until the next one arrives.

export const metricsQuery = (ids: readonly string[], p: Period) =>
  queryOptions({
    queryKey: ["stats", "metrics", p.bucket, p.from, p.to, ...ids],
    queryFn: () =>
      api<MetricsDto>(
        `/stats/metrics?ids=${ids.join(",")}&from=${p.from}&to=${p.to}&bucket=${p.bucket}`,
      ),
    placeholderData: keepPreviousData,
  });
export const useMetrics = (ids: readonly string[], p: Period) => useQuery(metricsQuery(ids, p));

export const progressionQuery = (p: Period) =>
  queryOptions({
    queryKey: ["stats", "progression", p.from, p.to],
    queryFn: () => api<ProgressionDto>(`/stats/progression?from=${p.from}&to=${p.to}`),
    placeholderData: keepPreviousData,
  });
export const useProgression = (p: Period) => useQuery(progressionQuery(p));

export const useDayStats = (date: string) =>
  useQuery({
    queryKey: ["stats", "day", date],
    queryFn: () => api<DayStatsDto>(`/stats/day?date=${date}`),
  });

/** Up to 50 recent sessions of an exercise, for the progress screen's list. */
export const useExerciseSessions = (exerciseId: string) =>
  useQuery({
    queryKey: ["stats", "sessions", exerciseId],
    queryFn: () => api<ExerciseSessionDto[]>(`/exercises/${exerciseId}/history?limit=50`),
  });
