import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { dayStatus, goal, isDone, isDue, progress } from "../../../shared/habits/logic";
import {
  createHabitInput,
  logHabitInput,
  startHabitInput,
  updateHabitInput,
} from "../../../shared/habits/schemas";
import type { HabitDto } from "../../../shared/habits/types";
import { localDateSchema } from "../../../shared/nutrition/schemas";
import * as svc from "../../services/habits";
import type { DayUser } from "../../services/levels";
import { type McpCtx, tool } from "../util";

// Claude sees weekdays as numbers (1 = Monday … 7 = Sunday) instead of the stored bitmask.

const weekdays = z
  .array(z.number().int().min(1).max(7))
  .min(1)
  .max(7)
  .describe("1 = Monday … 7 = Sunday; default every day");
const toDays = (w: number[] | undefined) =>
  w === undefined ? undefined : w.reduce((m, d) => m | (1 << (d - 1)), 0);
const toWeekdays = (days: number) =>
  [1, 2, 3, 4, 5, 6, 7].filter((d) => (days & (1 << (d - 1))) !== 0);
const forClaude = ({ days, position: _, ...h }: HabitDto) => ({ ...h, weekdays: toWeekdays(days) });

const { days: _d, ...createShape } = createHabitInput.shape;
const { days: _u, position: _p, ...updateShape } = updateHabitInput.shape;

export function registerHabitTools(server: McpServer, ctx: McpCtx) {
  const { db, userId } = ctx;
  const u: DayUser = { id: userId, tz: ctx.tz, schedule: ctx.schedule };

  tool(server, ctx, "list_habits", {
    description:
      "The user's habits: kind (check, time in minutes, count, amount with a unit), target, weekdays it is due, and for time habits focus (deep / moderate / unfocus: how its time counts for focus energy; null = not focus).",
    input: z.object({}),
    readOnly: true,
    run: async () => (await svc.listHabits(db, userId)).map(forClaude),
  });

  tool(server, ctx, "get_habits_day", {
    description:
      "A day's habits (default today): for each habit whether it is due, its progress against the target and whether it is done, plus the day's progress entries and counts of due / done / left.",
    input: z.object({ date: localDateSchema.optional() }),
    readOnly: true,
    run: async ({ date }) => {
      const d = await svc.getHabitsDay(db, u, date);
      const now = Date.now();
      return {
        date: d.date,
        ...dayStatus(d.habits, d.date, d.entries, now),
        habits: d.habits.map((h) => {
          const amount = Math.round(progress(h.id, d.entries, now) * 10) / 10;
          return {
            ...forClaude(h),
            due: isDue(h, d.date),
            progress: amount,
            goal: goal(h),
            done: isDone(h, amount),
          };
        }),
        entries: d.entries,
      };
    },
  });

  tool(server, ctx, "create_habit", {
    description:
      "Create a habit. kind: check (done or not), time (target in minutes; focus says how its time counts for focus energy), count (target count) or amount (target with a unit such as km or pages). Pass a random UUID as id.",
    input: z.object({ ...createShape, weekdays: weekdays.optional() }),
    run: async ({ weekdays: w, ...rest }) =>
      forClaude(
        await svc.createHabit(db, userId, createHabitInput.parse({ ...rest, days: toDays(w) })),
      ),
  });

  tool(server, ctx, "update_habit", {
    description:
      "Change a habit's name, kind, target, unit, focus or weekdays. Changing the kind needs the fields that go with it.",
    input: z.object({ id: z.uuid(), ...updateShape, weekdays: weekdays.optional() }),
    run: async ({ id, weekdays: w, ...patch }) =>
      forClaude(await svc.updateHabit(db, userId, id, { ...patch, days: toDays(w) })),
  });

  tool(server, ctx, "archive_habit", {
    description: "Remove a habit from the list. Its history stays.",
    input: z.object({ id: z.uuid() }),
    destructive: true,
    run: async ({ id }) => ({ archived: await svc.archiveHabit(db, userId, id) }),
  });

  tool(server, ctx, "log_habit", {
    description:
      "Log progress on a habit: a check needs no amount; count and amount habits add amount (default 1); time habits add amount minutes done earlier (counted as the habit's focus kind). Pass a random UUID as id to make retries safe.",
    input: logHabitInput,
    run: async (input) => svc.logHabit(db, u, input, "mcp"),
  });

  tool(server, ctx, "delete_habit_entry", {
    description: "Delete a habit progress entry (from get_habits_day).",
    input: z.object({ id: z.uuid() }),
    destructive: true,
    run: async ({ id }) => ({ deleted: await svc.deleteHabitEntry(db, u, id) }),
  });

  tool(server, ctx, "start_habit_timer", {
    description:
      "Start a time habit's timer, counting down from minutes (default the time left to today's target). It is the one running timer: it stops a running focus timer, and stop_focus stops it.",
    input: startHabitInput,
    run: async (input) => svc.startHabitTimer(db, u, input, "mcp"),
  });
}
