import { z } from "zod";
import type { NutritionDayStatusDto } from "./nutrition/types";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM");

export const profilePatchSchema = z.object({
  name: z.string().trim().max(60).nullable().optional(),
  wakeTime: time.optional(),
  sleepTime: time.optional(),
});

export interface MeDto {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
  wakeTime: string;
  sleepTime: string;
}

export interface HomeDto {
  workouts: { done: number; target: number; remaining: number; active: boolean };
  nutrition: NutritionDayStatusDto;
}
