import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  dayTypeChoice,
  localDateSchema,
  logMealInput,
  updateMealInput,
} from "../../../shared/nutrition/schemas";
import { nutritionSettingsPatchSchema } from "../../../shared/nutrition/settings";
import * as svc from "../../services/nutrition";
import { type McpCtx, today, tool } from "../util";

export function registerNutritionTools(server: McpServer, ctx: McpCtx) {
  const { db, userId, tz } = ctx;

  tool(server, ctx, "log_meal", {
    description:
      "Log a meal the user ate. Estimate the numbers from the user's description or photo and send only the numbers: never send or store the image. name, kcal and proteinG are required; add fatG and carbsG when you can estimate them, and items for meals with several parts. time is ISO 8601 with offset; omit it for now. Pass a random UUID as id to make retries safe. Returns the meal and the day's running totals against the targets; tell the user what is left.",
    input: logMealInput,
    run: async (input) => {
      const meal = await svc.logMeal(db, userId, tz, input, "mcp");
      return { meal, day: await svc.getDayStatus(db, userId, meal.localDate) };
    },
  });

  tool(server, ctx, "update_meal", {
    description:
      "Correct a logged meal. Only the given fields change; null clears fatG, carbsG, items or note. Returns the meal and the day's totals.",
    input: updateMealInput.extend({ id: z.uuid() }),
    run: async ({ id, ...patch }) => {
      const meal = await svc.updateMeal(db, userId, tz, id, patch);
      return { meal, day: await svc.getDayStatus(db, userId, meal.localDate) };
    },
  });

  tool(server, ctx, "delete_meal", {
    description: "Delete a logged meal. Returns the day's totals after deleting.",
    input: z.object({ id: z.uuid() }),
    destructive: true,
    run: async ({ id }) => {
      const date = await svc.deleteMeal(db, userId, id);
      if (!date) return { deleted: false };
      return { deleted: true, day: await svc.getDayStatus(db, userId, date) };
    },
  });

  tool(server, ctx, "list_meals", {
    description:
      "Meals for one local date (default today) or a date range (from/to, YYYY-MM-DD), oldest first, with items.",
    input: z.object({
      date: localDateSchema.optional(),
      from: localDateSchema.optional(),
      to: localDateSchema.optional(),
    }),
    readOnly: true,
    run: async ({ date, from, to }) => {
      const d = date ?? today(ctx);
      return svc.listMeals(db, userId, { from: from ?? d, to: to ?? from ?? d });
    },
  });

  tool(server, ctx, "get_day_summary", {
    description:
      "One day's nutrition (default today): totals of kcal, protein, fat and carbs, the day type (workout/rest, auto or manual) and its targets, what is left, kcal over target, and the meals.",
    input: z.object({ date: localDateSchema.optional() }),
    readOnly: true,
    run: ({ date }) => svc.getDay(db, userId, date ?? today(ctx)),
  });

  tool(server, ctx, "list_day_summaries", {
    description:
      "Daily nutrition totals and the targets that applied, for a date range (YYYY-MM-DD, at most 400 days). Days without meals are left out. Use it for trends and averages.",
    input: z.object({ from: localDateSchema, to: localDateSchema }),
    readOnly: true,
    run: ({ from, to }) => svc.listNutritionHistory(db, userId, from, to),
  });

  tool(server, ctx, "set_day_type", {
    description:
      "Set the day type that decides the targets: workout or rest. auto removes the override, so a day with a workout is a workout day. Default date is today. Returns the day's totals.",
    input: z.object({ date: localDateSchema.optional(), type: dayTypeChoice }),
    run: ({ date, type }) => svc.setDayType(db, userId, date ?? today(ctx), type),
  });

  tool(server, ctx, "get_nutrition_targets", {
    description: "Daily kcal and protein targets for workout days and rest days.",
    input: z.object({}),
    readOnly: true,
    run: () => svc.getNutritionTargets(db, userId),
  });

  tool(server, ctx, "set_nutrition_targets", {
    description:
      "Change the daily kcal and/or protein (g) targets for workout days and/or rest days. Only the given values change. Past days keep their targets.",
    input: nutritionSettingsPatchSchema,
    run: (patch) => svc.setNutritionTargets(db, userId, tz, patch),
  });
}
