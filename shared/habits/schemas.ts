import { z } from "zod";
import { focusKinds } from "../focus/schemas";
import { isoTime } from "../nutrition/schemas";

// Habits are user-defined items of the `habit` tracker. Check, count and amount progress are habit
// entries; time progress is focus sessions with the habit's id (so energy, the one running timer and
// the countdown are shared with focus).

export const habitKinds = ["check", "time", "count", "amount"] as const;
export type HabitKind = (typeof habitKinds)[number];

/** Days as a bitmask: Monday = 1, Tuesday = 2, … Sunday = 64. */
export const EVERY_DAY = 127;

const name = z.string().trim().min(1).max(40);
const target = z.number().positive().max(100_000);
const unit = z.string().trim().min(1).max(12);
const days = z.number().int().min(1).max(EVERY_DAY);

const fields = {
  name,
  kind: z.enum(habitKinds),
  /** Minutes for time habits, a count or an amount; null for a check. */
  target: target.nullable(),
  /** Amount habits: km, pages, ml, … */
  unit: unit.nullable(),
  /** Time habits: how the time counts for focus energy (null: not focus, normal awake drain). */
  focus: z.enum(focusKinds).nullable(),
  days,
};

export interface HabitFields {
  name: string;
  kind: HabitKind;
  target: number | null;
  unit: string | null;
  focus: (typeof focusKinds)[number] | null;
  days: number;
}

/** The rules between fields; an error message, or null when the habit is valid. */
export function habitProblem(h: HabitFields): string | null {
  if (h.kind === "check" && h.target !== null) return "a check habit has no target";
  if (h.kind !== "check" && h.target === null) return "target is required";
  if (h.kind === "time" && h.target !== null && !Number.isInteger(h.target))
    return "time target is whole minutes";
  if (h.kind !== "amount" && h.unit !== null) return "only amount habits have a unit";
  if (h.kind !== "time" && h.focus !== null) return "only time habits count as focus";
  return null;
}

export const createHabitInput = z
  .object({
    /** Client-generated UUID; creating the same id again returns the existing habit. */
    id: z.uuid(),
    name,
    kind: z.enum(habitKinds),
    target: target.nullable().default(null),
    unit: unit.nullable().default(null),
    focus: z.enum(focusKinds).nullable().default(null),
    days: days.default(EVERY_DAY),
  })
  .superRefine((h, ctx) => {
    const p = habitProblem(h);
    if (p) ctx.addIssue({ code: "custom", message: p });
  });
export type CreateHabitInput = z.infer<typeof createHabitInput>;

/** Changing the kind needs the fields that go with it (checked after merging). */
export const updateHabitInput = z
  .object({ ...fields, position: z.number().int().min(0).max(10_000) })
  .partial();
export type UpdateHabitInput = z.infer<typeof updateHabitInput>;

/** `entry.data` of the habit tracker; `entry.value` is the amount (1 for a check). */
export const habitDataSchema = z.object({ habitId: z.string() });
export type HabitData = z.infer<typeof habitDataSchema>;

export const logHabitInput = z.object({
  id: z.uuid().optional(),
  habitId: z.uuid(),
  /** Minutes for time habits, the count or amount; default 1 (a check, or one more). */
  amount: z.number().positive().max(100_000).optional(),
  /** When, ISO 8601 with offset; default now. */
  time: isoTime.optional(),
});
export type LogHabitInput = z.infer<typeof logHabitInput>;

export const startHabitInput = z.object({
  id: z.uuid().optional(),
  habitId: z.uuid(),
  /** Countdown minutes; default the time left to the target. */
  minutes: z
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .optional(),
  time: isoTime.optional(),
});
export type StartHabitInput = z.infer<typeof startHabitInput>;
