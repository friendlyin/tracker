import { addDays, isoWeekday, type LocalDate, weekRange } from "../time";
import type { HabitDto, HabitEntryDto } from "./types";

const MIN = 60_000;

export const dayBit = (d: LocalDate) => 1 << (isoWeekday(d) - 1);
export const isDue = (h: Pick<HabitDto, "days">, d: LocalDate) => (h.days & dayBit(d)) !== 0;

/** What counts as done: 1 for a check, else the target. */
export const goal = (h: Pick<HabitDto, "kind" | "target">) =>
  h.kind === "check" ? 1 : (h.target ?? 1);

/** An entry's amount; a timer counts its minutes so far. */
export const entryAmount = (e: HabitEntryDto, now: number) =>
  e.amount ?? Math.max(0, (e.endedAt ?? now) - e.at) / MIN;

export function progress(habitId: string, entries: readonly HabitEntryDto[], now: number) {
  return entries.filter((e) => e.habitId === habitId).reduce((n, e) => n + entryAmount(e, now), 0);
}

export const isDone = (h: Pick<HabitDto, "kind" | "target">, amount: number) =>
  amount >= goal(h) - 1e-9;

export interface DayStatus {
  /** Habits due that day. */
  due: number;
  /** Due habits done. */
  done: number;
  left: number;
}

export function dayStatus(
  habits: readonly HabitDto[],
  date: LocalDate,
  entries: readonly HabitEntryDto[],
  now: number,
): DayStatus {
  const due = habits.filter((h) => isDue(h, date));
  const done = due.filter((h) => isDone(h, progress(h.id, entries, now))).length;
  return { due: due.length, done, left: due.length - done };
}

/** Minutes still needed for a time habit (at least 1): the default countdown. */
export const minutesLeft = (h: Pick<HabitDto, "kind" | "target">, amount: number) =>
  Math.max(1, Math.ceil(goal(h) - amount - 1e-9));

export type Dot = "done" | "missed" | "due" | "off";

/**
 * Monday to Sunday of the week containing `today`: done (also on a day it wasn't due), missed (a
 * past due day not done), due (today or later), off (not due, or before the habit existed: `since`).
 */
export function weekDots(
  h: HabitDto,
  today: LocalDate,
  week: Record<LocalDate, Record<string, number>>,
  todayAmount: number,
  since: LocalDate = "0000-01-01",
): Dot[] {
  const { start } = weekRange(today);
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    const amount = d === today ? todayAmount : (week[d]?.[h.id] ?? 0);
    if (d <= today && isDone(h, amount)) return "done";
    if (!isDue(h, d) || d < since) return "off";
    return d < today ? "missed" : "due";
  });
}
