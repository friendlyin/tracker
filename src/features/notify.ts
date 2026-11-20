import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotifySettings, NotifySettingsPatch } from "../../shared/notify/settings";
import { api, queueWrite } from "../lib/api";

export const notifySettingsQuery = queryOptions({
  queryKey: ["notify", "settings"],
  queryFn: () => api<NotifySettings>("/notify/settings"),
});
export const useNotifySettings = () => useQuery(notifySettingsQuery);

export function useUpdateNotifySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: NotifySettingsPatch) =>
      queueWrite("/notify/settings", { method: "PATCH", body: patch }),
    onMutate: (patch) =>
      qc.setQueryData<NotifySettings>(notifySettingsQuery.queryKey, (s) =>
        s ? { ...s, ...patch } : s,
      ),
  });
}
