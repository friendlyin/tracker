import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { identify } from "../auth";
import { getDb } from "../db";
import { ensureUser } from "../services/users";
import { registerFocusTools } from "./tools/focus";
import { registerNutritionTools } from "./tools/nutrition";
import { registerWaterTools } from "./tools/water";
import { registerWorkoutTools } from "./tools/workouts";
import type { McpCtx } from "./util";

const INSTRUCTIONS = `Tracker is the user's personal health tracker: workouts, nutrition, water and focus energy.
- Meals: estimate kcal, protein, fat and carbs from the user's description or photo and call log_meal. Never send or store photos; only the numbers go to the app. After logging, tell the user what is left for the day (kcal and protein) from the returned day summary.
- Targets depend on the day type (workout or rest). A day with a workout is a workout day unless the user overrides it with set_day_type.
- Times are local ISO 8601 with offset. "Today" is the user's local date.
- Water: log_water when the user says they drank something (ml). Pending water builds up while awake (slower at night) up to a cap and drinking pays it off; get_water_state tells what is due now.
- Focus energy (0–100) drains while awake, faster during deep and moderate focus, and unfocus breaks restore it. Sleep quality sets the day's start and ceiling. Log sessions the user mentions (log_focus_session, log_unfocus) or run timers (start_focus / stop_focus); get_focus_state tells whether a break is due.
- Workouts: weekly volume counts working sets per muscle group; warm-ups never count.`;

/**
 * Stateless Streamable HTTP endpoint: a new server per request, bound to the authenticated user.
 * Locally the dev user (localhost / LAN only). In production this fails closed until OAuth for MCP
 * clients lands (iteration 6).
 */
export async function handleMcp(req: Request, env: Env): Promise<Response> {
  const email = await identify(req, env);
  if (!email) return Response.json({ error: "unauthorized" }, { status: 401 });

  const db = getDb(env.DB);
  const user = await ensureUser(db, email, "UTC");
  const ctx: McpCtx = {
    db,
    userId: user.id,
    tz: user.timezone,
    schedule: { wakeTime: user.wakeTime, sleepTime: user.sleepTime },
  };

  const server = new McpServer(
    { name: "tracker", version: "0.5.0" },
    // Ajv (the SDK default) compiles schemas with `new Function`, which Workers don't allow.
    { instructions: INSTRUCTIONS, jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
  );
  registerWorkoutTools(server, ctx);
  registerNutritionTools(server, ctx);
  registerWaterTools(server, ctx);
  registerFocusTools(server, ctx);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}
