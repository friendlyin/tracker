// Secrets and optional vars (set with `wrangler secret put`, or `.dev.vars` locally). Not in
// wrangler.jsonc, so `wrangler types` doesn't know them.
interface Env {
  /** Set by the OAuth provider before it calls the default handler (`/authorize`). */
  OAUTH_PROVIDER: import("@cloudflare/workers-oauth-provider").OAuthHelpers;
  /** e.g. https://<team>.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) tag of the Access application. */
  ACCESS_AUD?: string;
  /** Local development only: acts as this user on localhost. */
  DEV_USER_EMAIL?: string;
  /** Web Push (VAPID) keys from `pnpm vapid`: base64url public key and private scalar. */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  /** Contact for push services, e.g. mailto:you@example.com. */
  VAPID_SUBJECT?: string;
}
