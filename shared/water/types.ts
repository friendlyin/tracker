import type { LevelPoint, LevelState } from "../level/engine";
import type { DaySchedule } from "../schedule";
import type { WaterSettings } from "./settings";

// Response shapes shared by the API, the PWA and the MCP tools.

export interface WaterEntryDto {
  id: string;
  /** Unix ms. */
  drankAt: number;
  localDate: string;
  ml: number;
  source: "app" | "mcp";
}

/**
 * Everything needed to simulate the water level now and in the next hours: the PWA runs the same
 * simulation every minute without refetching. `entries` cover yesterday and today.
 */
export interface WaterInputsDto {
  tz: string;
  schedule: DaySchedule;
  settings: WaterSettings;
  entries: WaterEntryDto[];
}

export interface WaterStateDto {
  date: string;
  /** Water due now (0 when there is credit). */
  pendingMl: number;
  /** Extra drunk ahead, which delays the next build-up. */
  creditMl: number;
  state: LevelState;
  /** Since when pending has been at the cap; null when below it. */
  cappedAt: number | null;
  /** When pending starts rising again (only while there is credit). */
  buildUpAt: number | null;
  totalMl: number;
  targetMl: number;
  /** Today's timeline (from local midnight to now). */
  points: LevelPoint[];
}
