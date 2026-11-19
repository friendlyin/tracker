import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HomeDto, MeDto } from "../../shared/profile";
import { api, queueWrite } from "../lib/api";

export const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => api<MeDto>("/me") });
export const useMe = () => useQuery(meQuery);

/** Always refetched on open and focus: Claude can change the data from outside the app. */
export const homeQuery = queryOptions({
  queryKey: ["home"],
  queryFn: () => api<HomeDto>("/home"),
  staleTime: 0,
});
export const useHome = () => useQuery(homeQuery);

type MePatch = Partial<Pick<MeDto, "name" | "wakeTime" | "sleepTime">>;

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: MePatch) => queueWrite("/me", { method: "PATCH", body: patch }),
    onMutate: (patch) => qc.setQueryData<MeDto>(["me"], (me) => (me ? { ...me, ...patch } : me)),
    onSettled: () => {
      // Wake and sleep times drive the water and focus simulations.
      qc.invalidateQueries({ queryKey: ["water"] });
      qc.invalidateQueries({ queryKey: ["focus"] });
    },
  });
}
