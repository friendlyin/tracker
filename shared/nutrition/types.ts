import type { MealItem } from "./schemas";
import type { DayTargets, DayType, NutritionSettings } from "./settings";
import type { DayStatus, DayTypeSource } from "./summary";

// Response shapes shared by the API, the PWA and the MCP tools.

export interface MealDto {
  id: string;
  name: string;
  /** Unix ms. */
  eatenAt: number;
  localDate: string;
  tz: string;
  kcal: number;
  proteinG: number;
  fatG: number | null;
  carbsG: number | null;
  items: MealItem[];
  note: string | null;
  source: "app" | "mcp";
}

/** One day's budget without the meal list (home widget). */
export interface NutritionDayStatusDto extends DayStatus {
  date: string;
  dayType: DayType;
  dayTypeSource: DayTypeSource;
}

export interface NutritionDayDto extends NutritionDayStatusDto {
  meals: MealDto[];
}

/** Daily rollup row for longer periods (from `metric_daily`). Days without meals are left out. */
export interface NutritionHistoryDayDto {
  date: string;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  targets: DayTargets;
}

export type { NutritionSettings };
