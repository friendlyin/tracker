import { z } from "zod";
import { isoTime } from "../nutrition/schemas";

/** What the water tracker stores in `entry.data`; the amount (ml) lives in `entry.value`. */
export const waterDataSchema = z.object({});
export type WaterData = z.infer<typeof waterDataSchema>;

export const logWaterInput = z.object({
  /** Client-generated UUID; logging the same id again is a no-op. */
  id: z.uuid().optional(),
  ml: z.number().int().min(1).max(3000),
  /** ISO 8601 with offset; default now. */
  time: isoTime.optional(),
});

export type LogWaterInput = z.infer<typeof logWaterInput>;
