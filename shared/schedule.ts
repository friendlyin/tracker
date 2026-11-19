import { z } from "zod";
import type { LocalDate } from "./time";

// The user's day schedule (wake and sleep time, local "HH:MM"). Water and focus drift differently
// while awake and asleep. Times follow the user's current timezone. Approximation: on a night with a
// DST change the next boundary can be off by the shift (one hour, twice a year).

export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM");

export interface DaySchedule {
  wakeTime: string;
  sleepTime: string;
}

export type Phase = "awake" | "asleep";

const DAY_MIN = 24 * 60;
const MIN = 60_000;
const DAY_MS = DAY_MIN * MIN;

export const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Awake hours per day. Equal wake and sleep times mean awake all day. */
export function awakeHours(s: DaySchedule): number {
  const w = toMinutes(s.wakeTime);
  const sl = toMinutes(s.sleepTime);
  if (w === sl) return 24;
  return ((((sl - w) % DAY_MIN) + DAY_MIN) % DAY_MIN) / 60;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function parts(instant: number, tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  const out: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(instant))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
}

/** Milliseconds since local midnight (an integer, so boundary checks are exact). */
export function msOfDay(instant: number, tz: string): number {
  const p = parts(instant, tz);
  return ((p.hour * 60 + p.minute) * 60 + p.second) * 1000 + (((instant % 1000) + 1000) % 1000);
}

/** The timezone's offset from UTC at `instant`, in ms. */
function offsetAt(instant: number, tz: string): number {
  const p = parts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The instant of local `date` at `time` ("HH:MM") in `tz`. */
export function zonedInstant(date: LocalDate, time: string, tz: string): number {
  const guess = Date.parse(`${date}T${time}:00Z`);
  const first = guess - offsetAt(guess, tz);
  return guess - offsetAt(first, tz);
}

export function isAwake(instant: number, s: DaySchedule, tz: string): boolean {
  const w = toMinutes(s.wakeTime) * MIN;
  const sl = toMinutes(s.sleepTime) * MIN;
  if (w === sl) return true;
  const m = msOfDay(instant, tz);
  return w < sl ? m >= w && m < sl : m >= w || m < sl;
}

export const phaseAt = (instant: number, s: DaySchedule, tz: string): Phase =>
  isAwake(instant, s, tz) ? "awake" : "asleep";

/** The next wake or sleep boundary strictly after `instant`. */
export function nextPhaseChange(instant: number, s: DaySchedule, tz: string): number {
  const w = toMinutes(s.wakeTime) * MIN;
  const sl = toMinutes(s.sleepTime) * MIN;
  if (w === sl) return Number.POSITIVE_INFINITY;
  const m = msOfDay(instant, tz);
  let d = DAY_MS;
  for (const b of [w, sl]) {
    const ahead = (((b - m) % DAY_MS) + DAY_MS) % DAY_MS;
    if (ahead > 0 && ahead < d) d = ahead;
  }
  return instant + d;
}

export const wakeInstant = (date: LocalDate, s: DaySchedule, tz: string) =>
  zonedInstant(date, s.wakeTime, tz);
