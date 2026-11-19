import { z } from "zod";
import { DAY_TYPES } from "./settings";

const name = z.string().trim().min(1).max(80);
const kcal = z.number().min(0).max(10000);
const grams = z.number().min(0).max(2000);
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
/** ISO 8601 with an offset or Z, e.g. 2026-11-19T12:30:00+01:00. */
const isoTime = z.iso.datetime({ offset: true });

export const mealItemSchema = z.object({
  name,
  /** Free text such as "150 g" or "1 cup". */
  amount: z.string().trim().max(40).optional(),
  kcal,
  proteinG: grams,
  fatG: grams.optional(),
  carbsG: grams.optional(),
});

export type MealItem = z.infer<typeof mealItemSchema>;

/** What the meal tracker stores in `entry.data`. The meal's kcal live in `entry.value`. */
export const mealDataSchema = z.object({
  name,
  proteinG: grams,
  fatG: grams.optional(),
  carbsG: grams.optional(),
  items: z.array(mealItemSchema).max(30).optional(),
});

export type MealData = z.infer<typeof mealDataSchema>;

export const logMealInput = z.object({
  /** Optional client id (UUID) so a retried call doesn't log the meal twice. */
  id: z.uuid().optional(),
  name,
  /** When the meal was eaten. Defaults to now. */
  time: isoTime.optional(),
  kcal,
  proteinG: grams,
  fatG: grams.optional(),
  carbsG: grams.optional(),
  items: z.array(mealItemSchema).max(30).optional(),
  note: z.string().trim().max(500).optional(),
});

export type LogMealInput = z.infer<typeof logMealInput>;

export const updateMealInput = z.object({
  name: name.optional(),
  time: isoTime.optional(),
  kcal: kcal.optional(),
  proteinG: grams.optional(),
  fatG: grams.nullable().optional(),
  carbsG: grams.nullable().optional(),
  items: z.array(mealItemSchema).max(30).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

export type UpdateMealInput = z.infer<typeof updateMealInput>;

/** "auto" removes a manual override, so the day type follows workouts again. */
export const dayTypeChoice = z.enum([...DAY_TYPES, "auto"]);
export type DayTypeChoice = z.infer<typeof dayTypeChoice>;

export { isoTime, localDate as localDateSchema };
