import { z } from "zod";
import { isoTime, localDateSchema } from "../nutrition/schemas";
import { sleepQualities } from "./settings";

export const focusKinds = ["deep", "moderate", "unfocus"] as const;
export type FocusKind = (typeof focusKinds)[number];

const tag = z.string().trim().min(1).max(30);

/**
 * `entry.data` of the focus tracker. Timers: start in `occurred_at`, end in `ended_at` (null while
 * running). Minutes added afterwards: `value` is the minutes, `occurred_at` when they were added.
 */
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

/** Minutes added afterwards: no time of day, they apply when added. */
export const logFocusInput = z.object({
  /** Client-generated UUID; logging the same id again is a no-op. */
  id: z.uuid().optional(),
  kind: z.enum(focusKinds),
  tag: tag.optional(),
  minutes,
});
export type LogFocusInput = z.infer<typeof logFocusInput>;

/** Starts a timer, which stops the running one (one timer at a time). */
export const startFocusInput = z.object({
  id: z.uuid().optional(),
  kind: z.enum(focusKinds),
  tag: tag.optional(),
  /** Start, ISO 8601 with offset; default now. */
  time: isoTime.optional(),
});
export type StartFocusInput = z.infer<typeof startFocusInput>;

/** `minutes` sets the length (and stops a running timer); `tag: null` removes the tag. */
export const updateFocusInput = z.object({
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
