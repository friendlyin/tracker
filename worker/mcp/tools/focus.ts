import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  focusKinds,
  logFocusInput,
  setSleepInput,
  stopFocusInput,
  updateFocusInput,
} from "../../../shared/focus/schemas";
import { focusSettingsPatchSchema } from "../../../shared/focus/settings";
import { localDateSchema } from "../../../shared/nutrition/schemas";
import { parseTime } from "../../services/entries";
import * as svc from "../../services/focus";
import type { DayUser } from "../../services/levels";
import { type McpCtx, today, tool } from "../util";

export function registerFocusTools(server: McpServer, ctx: McpCtx) {
  const { db, userId } = ctx;
  const u: DayUser = { id: userId, tz: ctx.tz, schedule: ctx.schedule };
  const state = async () => svc.stateSummary(await svc.getFocusState(db, u));
  const { id, time, tag } = logFocusInput.shape;
  const minutes = logFocusInput.shape.minutes.unwrap();

  tool(server, ctx, "get_focus_state", {
    description:
      "Focus energy now (0–100): energy, the day's ceiling and sleep quality (null = not set, the default is assumed), state (ok / suggest / recommend / urgent: time for unfocus), the running timer, next (the next state change if the current activity continues), and today's deep, moderate and unfocus minutes.",
    input: z.object({}),
    readOnly: true,
    run: state,
  });

  tool(server, ctx, "log_focus_session", {
    description:
      "Log a finished focus session afterwards. tier deep = focused work or study; moderate = podcasts, films/series, reading (give a tag). time is the start, ISO 8601 with offset (default now). Pass a random UUID as id to make retries safe. Returns the entry and the focus state.",
    input: z.object({ tier: z.enum(["deep", "moderate"]), minutes, time, tag, id }),
    run: async ({ tier, ...rest }) => ({
      entry: await svc.logFocus(db, u, { kind: tier, ...rest }, "mcp"),
      state: await state(),
    }),
  });

  tool(server, ctx, "log_unfocus", {
    description:
      "Log a finished unfocus break (walk, nap, meditation, nature: no screens or input) afterwards. time is the start. Unfocus restores energy, more when more is left. Returns the entry and the focus state.",
    input: z.object({ minutes, time, id }),
    run: async (input) => ({
      entry: await svc.logFocus(db, u, { kind: "unfocus", ...input }, "mcp"),
      state: await state(),
    }),
  });

  tool(server, ctx, "start_focus", {
    description:
      "Start a timer: kind deep, moderate (with a tag) or unfocus. Only one timer runs at a time; starting one stops the running one. time is the start (default now).",
    input: z.object({ kind: z.enum(focusKinds), tag, time, id }),
    run: async (input) => ({
      entry: await svc.logFocus(db, u, input, "mcp"),
      state: await state(),
    }),
  });

  tool(server, ctx, "stop_focus", {
    description: "Stop the running timer, at time (default now). Returns what was stopped.",
    input: stopFocusInput,
    run: async ({ time }) => ({
      stopped: await svc.stopFocus(db, u, parseTime(time)),
      state: await state(),
    }),
  });

  tool(server, ctx, "set_sleep_quality", {
    description:
      "Set how the user slept: good, ok or bad, for date (default today). It sets the day's start energy and ceiling.",
    input: setSleepInput,
    run: async (input) => ({
      sleep: await svc.setSleep(db, u, input, "mcp"),
      state: await state(),
    }),
  });

  tool(server, ctx, "list_focus", {
    description:
      "Focus sessions (deep, moderate, unfocus; endedAt null = running) and sleep quality for one local date (default today) or a date range (from/to, YYYY-MM-DD).",
    input: z.object({
      date: localDateSchema.optional(),
      from: localDateSchema.optional(),
      to: localDateSchema.optional(),
    }),
    readOnly: true,
    run: ({ date, from, to }) => {
      const d = date ?? today(ctx);
      return svc.listFocus(db, userId, { from: from ?? d, to: to ?? from ?? d });
    },
  });

  tool(server, ctx, "update_focus_entry", {
    description:
      "Fix a session: time moves its start (a finished session keeps its length unless minutes is given), minutes sets the length (and stops a running timer), tag null removes the tag.",
    input: updateFocusInput.extend({ id: z.uuid() }),
    run: async ({ id, ...patch }) => ({
      entry: await svc.updateFocus(db, u, id, patch),
      state: await state(),
    }),
  });

  tool(server, ctx, "delete_focus_entry", {
    description: "Delete a focus session. Returns the focus state after deleting.",
    input: z.object({ id: z.uuid() }),
    destructive: true,
    run: async ({ id }) => ({
      deleted: (await svc.deleteFocus(db, u, id)) !== null,
      state: await state(),
    }),
  });

  tool(server, ctx, "get_focus_settings", {
    description:
      "Focus settings: start energy and ceiling per sleep quality, the default sleep, drain per hour (baseline, moderate, deep), unfocus restore (restorePerMin × (restoreFloor + (1 − restoreFloor) × energy/100) per minute), the state thresholds and the moderate tags.",
    input: z.object({}),
    readOnly: true,
    run: () => svc.getFocusSettings(db, userId),
  });

  tool(server, ctx, "set_focus_settings", {
    description:
      "Change focus settings; only the given values change (nested groups merge field by field). Thresholds must keep urgent ≤ recommend ≤ suggest.",
    input: focusSettingsPatchSchema,
    run: (patch) => svc.setFocusSettings(db, userId, patch),
  });
}
