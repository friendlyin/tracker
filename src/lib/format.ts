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

/** A running timer: "4:05", "42:05", "1:02:05". */
export const fmtElapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
};

const shortDay = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const monthYear = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const shortMonth = new Intl.DateTimeFormat(undefined, { month: "short" });
const shortMonthYear = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" });
const at = (d: string) => new Date(`${d}T12:00:00`);

/** A bucket by its first day: "Mon 16 Nov", "16 Nov" (a week) or "Nov 2026". */
export function fmtBucket(d: string, bucket: "day" | "week" | "month") {
  if (bucket === "day") return fmtDay(d);
  if (bucket === "week") return shortDay.format(at(d));
  return shortMonthYear.format(at(d));
}

/** Axis label for a bucket: "16 Nov" or "Nov". */
export const fmtAxis = (d: string, bucket: "day" | "week" | "month") =>
  bucket === "month" ? shortMonth.format(at(d)) : shortDay.format(at(d));

/** "16 – 22 Nov", "November 2026", "Sep – Nov 2026", "Dec 2025 – Nov 2026". */
export function fmtPeriod(p: { kind: string; from: string; to: string }) {
  if (p.kind === "week") return shortDay.formatRange(at(p.from), at(p.to));
  if (p.kind === "month") return monthYear.format(at(p.from));
  return shortMonthYear.formatRange(at(p.from), at(p.to));
}

/** A signed change: "+4.2%", "−3.1%". */
export const fmtPct = (v: number) =>
  `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(Math.abs(v) < 10 ? 1 : 0)}%`;

/** A rounded value: whole numbers from 10 up, one decimal below. */
export const fmtNum = (v: number) =>
  Math.abs(v) >= 10 ? fmtInt(v) : String(Math.round(v * 10) / 10);
