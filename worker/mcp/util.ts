import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import type { DaySchedule } from "../../shared/schedule";
import { isoInZone, localDate } from "../../shared/time";
import type { Db } from "../db";
import { InvalidError, NotFoundError } from "../services/errors";

/** Who the tools act for. `userId` comes from authentication, never from tool input. */
export interface McpCtx {
  db: Db;
  userId: string;
  /** The user's latest timezone (from the app). "Today" and default times follow it. */
  tz: string;
  /** Wake and sleep time (profile). */
  schedule: DaySchedule;
}

export const today = (ctx: McpCtx) => localDate(Date.now(), ctx.tz);

/** Instants (keys ending in `At`, Unix ms) become local ISO times, which Claude reads directly. */
export function forClaude(value: unknown, tz: string): unknown {
  if (Array.isArray(value)) return value.map((v) => forClaude(v, tz));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        k.endsWith("At") && typeof v === "number" ? isoInZone(v, tz) : forClaude(v, tz),
      ]),
    );
  }
  return value;
}

function text(t: string, isError = false): CallToolResult {
  return { content: [{ type: "text", text: t }], ...(isError ? { isError } : {}) };
}

export interface ToolDef<S extends z.ZodObject> {
  description: string;
  input: S;
  /** Read-only tools are marked so clients can call them without asking. */
  readOnly?: boolean;
  destructive?: boolean;
  run: (args: z.infer<S>) => Promise<unknown>;
}

/** Registers a tool whose result is JSON; domain errors become tool errors Claude can react to. */
export function tool<S extends z.ZodObject>(
  server: McpServer,
  ctx: McpCtx,
  name: string,
  def: ToolDef<S>,
) {
  server.registerTool(
    name,
    {
      description: def.description,
      inputSchema: def.input,
      annotations: {
        readOnlyHint: def.readOnly ?? false,
        destructiveHint: def.destructive ?? false,
      },
    },
    // biome-ignore lint/suspicious/noExplicitAny: the SDK infers args from the schema
    (async (args: any) => {
      try {
        return text(JSON.stringify(forClaude(await def.run(args), ctx.tz)));
      } catch (e) {
        if (e instanceof NotFoundError) return text(`not found: ${e.message}`, true);
        if (e instanceof InvalidError) return text(`invalid: ${e.message}`, true);
        throw e;
      }
    }) as never,
  );
}
