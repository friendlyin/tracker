import type { LocalDate } from "../time";
import type { HabitFields } from "./schemas";

export interface HabitDto extends HabitFields {
  id: string;
  position: number;
  /** Unix ms; days before it are not counted as missed. */
  createdAt: number;
}

/** Progress logged toward a habit: a habit entry, or a focus session of a time habit. */
export interface HabitEntryDto {
  id: string;
  habitId: string;
  /** Unix ms: when it was logged, or when a timer started. */
  at: number;
  /** Timers: when it stopped (null while running). Null for logged amounts. */
  endedAt: number | null;
  /** The amount (minutes for time habits); null for a timer, whose minutes come from its times. */
  amount: number | null;
  /** A focus session (a time habit's timer or added minutes). */
  session: boolean;
  /** A timer's countdown length in minutes (null: counts up, or not a timer). */
  targetMin: number | null;
  source: "app" | "mcp";
}

export interface HabitsDayDto {
  date: LocalDate;
  /** Active habits in their order. */
  habits: HabitDto[];
  /** The day's progress entries, and a running habit timer whatever day it started. */
  entries: HabitEntryDto[];
  /** Progress per habit on the earlier days of the week (Monday to the day before `date`). */
  week: Record<LocalDate, Record<string, number>>;
}
