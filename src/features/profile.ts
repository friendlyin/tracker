import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HomeDto, MeDto } from "../../shared/profile";
import { api } from "../lib/api";

export const useMe = () => useQuery({ queryKey: ["me"], queryFn: () => api<MeDto>("/me") });

/** Always refetched on open and focus: Claude can change the data from outside the app. */
export const useHome = () =>
  useQuery({ queryKey: ["home"], queryFn: () => api<HomeDto>("/home"), staleTime: 0 });

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Pick<MeDto, "name" | "wakeTime" | "sleepTime">>) =>
      api<MeDto>("/me", { method: "PATCH", body: patch }),
    onSuccess: (me) => {
      qc.setQueryData(["me"], me);
      // Wake and sleep times drive the water simulation.
      qc.invalidateQueries({ queryKey: ["water"] });
    },
  });
}
