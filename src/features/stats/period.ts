import { useMemo, useSyncExternalStore } from "react";
import {
  isPeriodKind,
  type Period,
  type PeriodKind,
  period,
  shiftPeriod,
} from "../../../shared/metrics/periods";
import type { LocalDate } from "../../../shared/time";
import { todayLocal } from "../nutrition/api";

// The stats period, shared by every stats screen and the Overview, so moving between them keeps it.
// The kind is remembered on the device; paging back always starts again from today.

const KEY = "stats.period";

function storedKind(): PeriodKind {
  try {
    const v = localStorage.getItem(KEY);
    if (isPeriodKind(v)) return v;
  } catch {
    // ignore
  }
  return "month";
}

interface State {
  kind: PeriodKind;
  /** A day inside the shown period; null for the current one. */
  at: LocalDate | null;
}

let state: State = { kind: storedKind(), at: null };
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  try {
    localStorage.setItem(KEY, state.kind);
  } catch {
    // ignore
  }
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export interface PeriodState {
  period: Period;
  today: LocalDate;
  /** The period holds today: there is no next one yet. */
  current: boolean;
  setKind: (k: PeriodKind) => void;
  shift: (dir: -1 | 1) => void;
  /** Shows the period of `kind` around `at` (tapping a week or month bucket). */
  zoom: (kind: PeriodKind, at: LocalDate) => void;
}

export function usePeriod(): PeriodState {
  const s = useSyncExternalStore(subscribe, () => state);
  const today = todayLocal();
  const anchor = s.at ?? today;
  const p = useMemo(() => period(s.kind, anchor), [s.kind, anchor]);
  const holdsToday = (q: Period) => q.from <= today && today <= q.to;
  return {
    period: p,
    today,
    current: p.to >= today,
    setKind: (kind) => set({ kind, at: s.at && !holdsToday(period(kind, s.at)) ? s.at : null }),
    shift: (dir) => {
      const at = shiftPeriod(s.kind, anchor, dir);
      set({ at: holdsToday(period(s.kind, at)) ? null : at });
    },
    zoom: (kind, at) => set({ kind, at: holdsToday(period(kind, at)) ? null : at }),
  };
}
