import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { identify } from "../auth";
import { getDb } from "../db";
import { ensureUser } from "../services/users";
import { registerNutritionTools } from "./tools/nutrition";
import { registerWorkoutTools } from "./tools/workouts";
import type { McpCtx } from "./util";

const INSTRUCTIONS = `Tracker is the user's personal health tracker: workouts and nutrition.
- Meals: estimate kcal, protein, fat and carbs from the user's description or photo and call log_meal. Never send or store photos; only the numbers go to the app. After logging, tell the user what is left for the day (kcal and protein) from the returned day summary.
- Targets depend on the day type (workout or rest). A day with a workout is a workout day unless the user overrides it with set_day_type.
- Times are local ISO 8601 with offset. "Today" is the user's local date.
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
  const ctx: McpCtx = { db, userId: user.id, tz: user.timezone };

  const server = new McpServer(
    { name: "tracker", version: "0.3.0" },
    // Ajv (the SDK default) compiles schemas with `new Function`, which Workers don't allow.
    { instructions: INSTRUCTIONS, jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
  );
  registerWorkoutTools(server, ctx);
  registerNutritionTools(server, ctx);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}
