import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { isValidTimeZone } from "../shared/time";
import { type Db, getDb } from "./db";
import type { User } from "./db/schema";
import { ensureUser, updateTimezone } from "./services/users";

export type AppEnv = {
  Bindings: Env;
  Variables: { db: Db; user: User; tz: string };
};

const jwksByTeam = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function normalizeTeamDomain(raw: string): string {
  const withScheme = raw.startsWith("http") ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

/**
 * Who is calling. Production: the Cloudflare Access JWT, verified against the team's public keys and
 * the application's AUD tag. Local dev: DEV_USER_EMAIL, honoured only on localhost. Fails closed.
 */
export async function identify(req: Request, env: Env): Promise<string | null> {
  const host = new URL(req.url).hostname;
  if (env.DEV_USER_EMAIL && (host === "localhost" || host === "127.0.0.1")) {
    return env.DEV_USER_EMAIL;
  }

  const token = req.headers.get("cf-access-jwt-assertion");
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;

  const issuer = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN);
  let jwks = jwksByTeam.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksByTeam.set(issuer, jwks);
  }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: env.ACCESS_AUD });
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const email = await identify(c.req.raw, c.env);
  if (!email) return c.json({ error: "unauthorized" }, 401);

  const db = getDb(c.env.DB);
  const header = c.req.header("x-timezone");
  const tz = header && isValidTimeZone(header) ? header : undefined;

  let user = await ensureUser(db, email, tz ?? "UTC");
  if (tz && tz !== user.timezone) user = await updateTimezone(db, user, tz);

  c.set("db", db);
  c.set("user", user);
  c.set("tz", tz ?? user.timezone);
  await next();
});
