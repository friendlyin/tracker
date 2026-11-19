import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { del, get, set } from "idb-keyval";

const WEEK = 7 * 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: WEEK,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

/** Last-known data in IndexedDB: the app opens with data instantly and offline (read-only). */
export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (k) => get<string>(k).then((v) => v ?? null),
    setItem: (k, v) => set(k, v),
    removeItem: (k) => del(k),
  },
  key: "tracker.query-cache",
});

export const persistOptions = {
  persister,
  maxAge: WEEK,
  // A new build may change response shapes; start from a clean cache.
  buster: import.meta.env.VITE_BUILD_ID ?? "dev",
};
