import { useEffect, useSyncExternalStore } from "react";
import { readJson, writeJson } from "../lib/storage";

/*
 * Design variant switcher (see CLAUDE.md "Design variants").
 *
 *   const Grid = useVariant("home.grid", { tiles: TilesGrid, list: ListGrid });
 *
 * The first entry is the default. Choices persist per device. With dev mode on (Settings), a small
 * button on every screen lists the variants mounted on that screen. When a variant is chosen, delete
 * the others and the useVariant call.
 */

const SELECTED_KEY = "dev.variants";
const DEV_MODE_KEY = "dev.mode";

type State = {
  devMode: boolean;
  selected: Record<string, string>;
  /** key → option names, for variants mounted right now. */
  mounted: Record<string, string[]>;
};

let state: State = {
  devMode: readJson(DEV_MODE_KEY, false),
  selected: readJson(SELECTED_KEY, {}),
  mounted: {},
};
const listeners = new Set<() => void>();
const mountCounts = new Map<string, number>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDevState(): State {
  return useSyncExternalStore(subscribe, () => state);
}

export function setDevMode(on: boolean) {
  writeJson(DEV_MODE_KEY, on);
  set({ devMode: on });
}

export function selectVariant(key: string, option: string) {
  const selected = { ...state.selected, [key]: option };
  writeJson(SELECTED_KEY, selected);
  set({ selected });
}

export function resetVariants() {
  writeJson(SELECTED_KEY, {});
  set({ selected: {} });
}

export function useVariant<T>(key: string, variants: Record<string, T>): T {
  const names = Object.keys(variants);
  const namesKey = names.join("|");
  const { selected } = useDevState();

  useEffect(() => {
    mountCounts.set(key, (mountCounts.get(key) ?? 0) + 1);
    set({ mounted: { ...state.mounted, [key]: namesKey.split("|") } });
    return () => {
      const n = (mountCounts.get(key) ?? 1) - 1;
      mountCounts.set(key, n);
      if (n === 0) {
        const { [key]: _, ...rest } = state.mounted;
        set({ mounted: rest });
      }
    };
  }, [key, namesKey]);

  const choice = selected[key];
  const name = choice && choice in variants ? choice : names[0];
  return variants[name as string] as T;
}
