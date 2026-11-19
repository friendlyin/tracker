import {
  AuthorizationError,
  CimdFetchError,
  OAuthProvider,
} from "@cloudflare/workers-oauth-provider";
import { identify } from "./auth";
import { consentPage, escapeHtml } from "./consent";
import { getDb } from "./db";
import { handleMcp } from "./mcp";
import { ensureUser, getUser } from "./services/users";

// OAuth 2.1 for MCP clients (claude.ai, Claude Code). The Worker is the authorization server and
// `/mcp` its only resource. Signing in is Cloudflare Access: `/authorize` stays behind the app's
// Access application, so it arrives with the Access JWT, and the user only confirms the client on
// the consent page. Discovery, `/token` and `/register` are machine endpoints, bypassed in Access.

/** What a grant carries; tools act for this user. */
type Props = { userId: string };

const DAY = 86_400;

type Fetcher = (req: Request, env: Env, ctx: ExecutionContext) => Response | Promise<Response>;

const text = (body: string, status: number) =>
  new Response(escapeHtml(body), {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });

const mcpHandler = {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const { userId } = (ctx as ExecutionContext<Props>).props;
    const db = getDb(env.DB);
    const user = await getUser(db, userId);
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
    return handleMcp(req, db, user);
  },
};

/** GET shows the consent page; POST is the user's answer. */
async function authorize(req: Request, env: Env): Promise<Response> {
  const email = await identify(req, env);
  if (!email) return text("Log in to Tracker first.", 401);
  const oauth = env.OAUTH_PROVIDER;
  try {
    if (req.method === "POST") {
      const form = await req.formData();
      const handle = String(form.get("handle") ?? "");
      if (form.get("decision") !== "allow") {
        const denied = await oauth.denyConsent(req, handle);
        denied.headers.set("Location", denied.redirectTo);
        return new Response(null, { status: 302, headers: denied.headers });
      }
      const approved = await oauth.approveConsent(req, handle);
      const user = await ensureUser(getDb(env.DB), email, "UTC");
      const props: Props = { userId: user.id };
      const { redirectTo } = await oauth.completeAuthorization({
        request: approved.request,
        userId: user.id,
        metadata: {},
        scope: approved.request.scope,
        props,
      });
      approved.headers.set("Location", redirectTo);
      return new Response(null, { status: 302, headers: approved.headers });
    }
    const request = await oauth.parseAuthRequest(req);
    const details = await oauth.describeConsent(request);
    const consent = await oauth.beginConsent(request);
    consent.headers.set("Content-Type", "text/html; charset=utf-8");
    return new Response(consentPage(details, consent.handle, email), { headers: consent.headers });
  } catch (e) {
    // Redirect back only when the library validated the client's redirect; otherwise say it here.
    if (e instanceof AuthorizationError && e.redirectTo)
      return Response.redirect(e.redirectTo, 302);
    if (e instanceof AuthorizationError) return text(e.description, 400);
    if (e instanceof CimdFetchError) return text("This app could not be verified.", 400);
    throw e;
  }
}

/**
 * The Worker's fetch with OAuth in front: `/mcp` needs a token, `/authorize` is the consent page,
 * everything else goes to `app`. Providers are built per origin, so the deployment's hostname never
 * has to be configured (or committed).
 */
export function withOAuth(app: Fetcher): Fetcher {
  const providers = new Map<string, OAuthProvider<Env>>();
  const defaultHandler = {
    fetch: (req: Request, env: Env, ctx: ExecutionContext) =>
      new URL(req.url).pathname === "/authorize" ? authorize(req, env) : app(req, env, ctx),
  };
  return (req, env, ctx) => {
    const origin = new URL(req.url).origin;
    let provider = providers.get(origin);
    if (!provider) {
      provider = new OAuthProvider<Env>({
        apiRoute: "/mcp",
        apiHandler: mcpHandler,
        defaultHandler,
        authorizeEndpoint: "/authorize",
        tokenEndpoint: "/token",
        clientRegistrationEndpoint: "/register",
        clientIdMetadataDocumentEnabled: true,
        resourceMetadata: {
          resource: `${origin}/mcp`,
          authorization_servers: [origin],
          resource_name: "Tracker",
        },
        // Claude stays connected while it is used at least once a month.
        refreshTokenTTL: 30 * DAY,
        refreshTokenIdleTTL: 30 * DAY,
      });
      providers.set(origin, provider);
    }
    return provider.fetch(req, env, ctx);
  };
}
