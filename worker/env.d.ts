// Secrets and optional vars (set with `wrangler secret put`, or `.dev.vars` locally). Not in
// wrangler.jsonc, so `wrangler types` doesn't know them.
interface Env {
  /** e.g. https://<team>.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) tag of the Access application. */
  ACCESS_AUD?: string;
  /** Local development only: acts as this user on localhost. */
  DEV_USER_EMAIL?: string;
}
