import { z } from "zod";
import { isoTime, localDateSchema } from "../nutrition/schemas";
import { sleepQualities } from "./settings";

export const focusKinds = ["deep", "moderate", "unfocus"] as const;
export type FocusKind = (typeof focusKinds)[number];

const tag = z.string().trim().min(1).max(30);

/** `entry.data` of the focus tracker; the start is `occurred_at`, the end `ended_at` (null: running). */
export const focusDataSchema = z.object({
  kind: z.enum(focusKinds),
  /** Moderate sessions: podcast, film, reading, … */
  tag: tag.optional(),
});
export type FocusData = z.infer<typeof focusDataSchema>;

/** `entry.data` of the sleep tracker (one entry per local date); `entry.value` is 3 / 2 / 1. */
export const sleepDataSchema = z.object({ quality: z.enum(sleepQualities) });
export type SleepData = z.infer<typeof sleepDataSchema>;

const minutes = z
  .number()
  .int()
  .min(1)
  .max(24 * 60);

export const logFocusInput = z.object({
  /** Client-generated UUID; logging the same id again is a no-op. */
  id: z.uuid().optional(),
  kind: z.enum(focusKinds),
  tag: tag.optional(),
  /** Start, ISO 8601 with offset; default now. */
  time: isoTime.optional(),
  /** Length in minutes; omit to start a timer (which stops the one running). */
  minutes: minutes.optional(),
});
export type LogFocusInput = z.infer<typeof logFocusInput>;

export const updateFocusInput = z.object({
  time: isoTime.optional(),
  minutes: minutes.optional(),
  tag: tag.nullable().optional(),
});
export type UpdateFocusInput = z.infer<typeof updateFocusInput>;

export const stopFocusInput = z.object({
  /** When it stopped, ISO 8601 with offset; default now. */
  time: isoTime.optional(),
});

export const setSleepInput = z.object({
  quality: z.enum(sleepQualities),
  /** The day it applies to; default today. */
  date: localDateSchema.optional(),
});
export type SetSleepInput = z.infer<typeof setSleepInput>;
