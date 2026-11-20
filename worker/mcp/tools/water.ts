import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { localDateSchema } from "../../../shared/nutrition/schemas";
import { logWaterInput } from "../../../shared/water/schemas";
import { waterSettingsPatchSchema } from "../../../shared/water/settings";
import * as svc from "../../services/water";
import { type McpCtx, today, tool } from "../util";

export function registerWaterTools(server: McpServer, ctx: McpCtx) {
  const { db, userId } = ctx;
  const u: svc.WaterUser = { id: userId, tz: ctx.tz, schedule: ctx.schedule };
  const state = async () => svc.stateSummary(await svc.getWaterState(db, u));

  tool(server, ctx, "log_water", {
    description:
      "Log water the user drank, in ml. time is ISO 8601 with offset; omit it for now. Pass a random UUID as id to make retries safe. Returns the entry and the water state (pending now, today's total vs target).",
    input: logWaterInput,
    run: async (input) => ({
      entry: await svc.logWater(db, u, input, "mcp"),
      state: await state(),
    }),
  });

  tool(server, ctx, "delete_water", {
    description: "Delete a logged water entry. Returns the water state after deleting.",
    input: z.object({ id: z.uuid() }),
    destructive: true,
    run: async ({ id }) => ({
      deleted: (await svc.deleteWater(db, u, id)) !== null,
      state: await state(),
    }),
  });

  tool(server, ctx, "list_water", {
    description:
      "Water entries for one local date (default today) or a date range (from/to, YYYY-MM-DD), oldest first.",
    input: z.object({
      date: localDateSchema.optional(),
      from: localDateSchema.optional(),
      to: localDateSchema.optional(),
    }),
    readOnly: true,
    run: ({ date, from, to }) => {
      const d = date ?? today(ctx);
      return svc.listWater(db, userId, { from: from ?? d, to: to ?? from ?? d });
    },
  });

  tool(server, ctx, "get_water_state", {
    description:
      "Water now: pendingMl (water due, it builds up while awake and slower at night, up to the cap), creditMl (drunk ahead, delays the build-up until buildUpAt), state (ok / recommend at the cap / urgent at the cap for longer than the urgency delay), cappedAt, and today's totalMl vs targetMl.",
    input: z.object({}),
    readOnly: true,
    run: state,
  });

  tool(server, ctx, "get_water_settings", {
    description:
      "Water settings: daily target, cap, night factor, urgency delay (min), credit factor and cap, and the two quick amounts in the app.",
    input: z.object({}),
    readOnly: true,
    run: () => svc.getWaterSettings(db, userId),
  });

  tool(server, ctx, "set_water_settings", {
    description:
      "Change water settings; only the given values change. targetMl is the daily target; the build-up rate follows from it and the user's wake and sleep times. remindCap / remindUrgent switch the push reminders.",
    input: waterSettingsPatchSchema,
    run: (patch) => svc.setWaterSettings(db, u, patch),
  });
}
