import { displaySets } from "../../shared/workouts/budget";

/** Sets in 0.5 steps without a trailing ".0". */
export const fmtSets = (n: number) => {
  const v = displaySets(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

export const fmtKg = (n: number | null) =>
  n === null || n === 0 ? "" : Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);

const dayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "Mon 16 Nov" for a YYYY-MM-DD local date. */
export const fmtDay = (localDate: string) => dayFmt.format(new Date(`${localDate}T12:00:00`));

export const fmtDuration = (ms: number) => {
  const min = Math.max(0, Math.round(ms / 60000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
};

export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}` : `${m} min`;
};

/** "60 × 8" or "× 12" for bodyweight. */
export const fmtSet = (s: { reps: number; weightKg: number | null }) =>
  s.weightKg ? `${fmtKg(s.weightKg)} × ${s.reps}` : `× ${s.reps}`;

const intFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

/** Whole number with the locale's grouping, e.g. "1,880". */
export const fmtInt = (n: number) => intFmt.format(Math.round(n));

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

/** "12:30" for an instant (device timezone). */
export const fmtTime = (ms: number) => timeFmt.format(new Date(ms));
