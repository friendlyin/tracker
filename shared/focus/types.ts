import type { LevelPoint, LevelState } from "../level/engine";
import type { DaySchedule } from "../schedule";
import type { FocusKind } from "./schemas";
import type { FocusSettings, SleepQuality } from "./settings";

// Response shapes shared by the API, the PWA and the MCP tools.

export interface FocusEntryDto {
  id: string;
  kind: FocusKind;
  tag: string | null;
  /** Unix ms: when a timer started, or when minutes were added. */
  startedAt: number;
  /** When a timer stopped; null while it runs and for added minutes. */
  endedAt: number | null;
  /** Minutes added afterwards (applied when added, no time of day); null for timers. */
  minutes: number | null;
  localDate: string;
  source: "app" | "mcp";
}

export interface SleepDto {
  id: string;
  date: string;
  quality: SleepQuality;
  /** When it was set (Unix ms). */
  setAt: number;
}

/**
 * Everything needed to simulate energy now: the PWA runs the same simulation every minute (every
 * second while a timer runs) without refetching. Entries and sleep cover yesterday and today.
 */
export interface FocusInputsDto {
  tz: string;
  schedule: DaySchedule;
  settings: FocusSettings;
  entries: FocusEntryDto[];
  sleep: SleepDto[];
}

export interface FocusStateDto {
  /** The focus day: the local date of the last wake. */
  date: string;
  /** When the day started (wake time, or earlier when sleep was set before it). */
  dayStartedAt: number;
  energy: number;
  ceiling: number;
  /** Null until set for the day (the default sleep is assumed). */
  sleep: SleepQuality | null;
  state: LevelState;
  running: { id: string; kind: FocusKind; tag: string | null; startedAt: number } | null;
  /** The next state change if the current activity continues: the threshold crossed and when. */
  next: { state: LevelState; level: number; reachedAt: number } | null;
  deepMin: number;
  deepSessions: number;
  moderateMin: number;
  unfocusMin: number;
  /** Today's timeline from the day start to now. */
  points: LevelPoint[];
}
