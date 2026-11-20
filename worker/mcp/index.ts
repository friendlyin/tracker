import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import type { Db } from "../db";
import type { User } from "../db/schema";
import { registerFocusTools } from "./tools/focus";
import { registerHabitTools } from "./tools/habits";
import { registerNutritionTools } from "./tools/nutrition";
import { registerStatsTools } from "./tools/stats";
import { registerWaterTools } from "./tools/water";
import { registerWorkoutTools } from "./tools/workouts";
import type { McpCtx } from "./util";

const INSTRUCTIONS = `Tracker is the user's personal health tracker: workouts, nutrition, water, focus energy and habits.
- Meals: estimate kcal, protein, fat and carbs from the user's description or photo and call log_meal. Never send or store photos; only the numbers go to the app. After logging, tell the user what is left for the day (kcal and protein) from the returned day summary.
- Targets depend on the day type (workout or rest). A day with a workout is a workout day unless the user overrides it with set_day_type.
- Times are local ISO 8601 with offset. "Today" is the user's local date.
- Water: log_water when the user says they drank something (ml). Pending water builds up while awake (slower at night) up to a cap and drinking pays it off; get_water_state tells what is due now.
- Focus energy (0–100) drains while awake, faster during deep and moderate focus, and unfocus breaks restore it. Sleep quality sets the day's start and ceiling. Log sessions the user mentions (log_focus_session, log_unfocus) or run timers (start_focus / stop_focus); get_focus_state tells whether a break is due.
- Habits: each is due on some weekdays with a target (check, minutes, count or amount). get_habits_day shows today's progress; log_habit logs it. A time habit's minutes are focus sessions of its focus kind, and start_habit_timer runs the one shared timer.
- Workouts: weekly volume counts working sets per muscle group; warm-ups never count.
- Stats and trends across features: list_metrics, then get_metrics for a date range (by day, week or month); get_progression for strength progress; get_day for one day across features.`;

/**
 * Stateless Streamable HTTP endpoint: a new server per request, bound to `user`. In production the
 * user comes from the OAuth token (worker/oauth.ts); locally from DEV_USER_EMAIL.
 */
export async function handleMcp(req: Request, db: Db, user: User): Promise<Response> {
  const ctx: McpCtx = {
    db,
    userId: user.id,
    tz: user.timezone,
    schedule: { wakeTime: user.wakeTime, sleepTime: user.sleepTime },
  };

  const server = new McpServer(
    { name: "tracker", version: "0.8.0" },
    // Ajv (the SDK default) compiles schemas with `new Function`, which Workers don't allow.
    { instructions: INSTRUCTIONS, jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
  );
  registerWorkoutTools(server, ctx);
  registerNutritionTools(server, ctx);
  registerWaterTools(server, ctx);
  registerFocusTools(server, ctx);
  registerStatsTools(server, ctx);
  registerHabitTools(server, ctx);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}
