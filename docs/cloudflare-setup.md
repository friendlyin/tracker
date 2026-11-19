# Cloudflare setup guide

Step-by-step setup for running your own instance on Cloudflare. Deploys run from GitHub (Workers
Builds). Cloudflare creates the database on the first deploy, so the repository needs no
account-specific ids. The terminal (`wrangler`) handles secrets, migrations and backups. The dashboard
is used to connect GitHub, configure login (Access), and read logs.

Dashboard: https://dash.cloudflare.com. The left sidebar groups products. Workers are under
**Compute (Workers) → Workers & Pages**, databases under **Storage & databases**. Cloudflare sometimes
renames menu items; if a name doesn't match, use the search box at the top of the dashboard.

Placeholders used below: `<subdomain>` (your workers.dev subdomain), `<team>` (your Zero Trust team
name), `<app-host>` (`health-app.<subdomain>.workers.dev`), `<github-user>`.

Steps are grouped by the iteration that needs them.

---

## Part A: Iteration 1 (first deploy)

### A1. Account and security
1. Sign up or log in at dash.cloudflare.com and verify your email.
2. Turn on two-factor authentication: top-right avatar → **Profile** → **Authentication** →
   **Two-Factor Authentication**. This account will hold health data.
3. No plan to choose. New accounts are on **Workers Free**. The Free plan never bills you; at the
   (very high) limits, requests fail until the daily reset.

### A2. Choose your workers.dev subdomain
1. Sidebar → **Compute (Workers) → Workers & Pages**.
2. On first visit Cloudflare asks you to pick a subdomain. The app will be at
   `https://health-app.<subdomain>.workers.dev`. Pick something that doesn't need to be your name; it is
   public.

### A3. Connect the terminal to your account
```bash
pnpm wrangler login     # opens the browser → click "Allow"
pnpm wrangler whoami    # shows your account
```

### A4. Put the code on GitHub
1. Fork this repository on GitHub, or create a new **public** (or private) repository and push your
   clone to it:
   ```bash
   pnpm check:private      # make sure nothing personal is in the tree (see README)
   git remote add origin git@github.com:<github-user>/<repo>.git
   git push -u origin main
   ```

### A5. First deploy from GitHub
1. **Workers & Pages → Create application → Import a repository** → connect GitHub (grant access only
   to this repository) → select it.
2. Settings on the next screen:
   - **Project name:** `health-app`. It must match `name` in `wrangler.jsonc`.
   - **Build command:** `pnpm build`
   - **Deploy command:** `npx wrangler deploy && npx wrangler d1 migrations apply DB --remote`
3. Click **Deploy**. On the first deploy wrangler creates the D1 database because the binding has no id.
   Then the migrations create the tables.
   - To verify in iteration 1: if the migration step can't find the auto-created database, copy its id
     from the dashboard into `wrangler.jsonc` (`database_id`). It is not personal data or a secret; forks
     only have to change that one line.
4. Every push to `main` now deploys. Build logs are under **Deployments**.
5. Don't run `pnpm deploy` from your computer for the first deploy. A local deploy writes the new
   database id into `wrangler.jsonc`, and it shouldn't be committed.

Where to look afterwards: **Workers & Pages → health-app**:
- **Overview / Metrics**: requests, errors, CPU time. Free allows 10 ms CPU per request.
- **Deployments**: history of versions, with **Rollback** if a deploy breaks something.
- **Logs**: live and stored logs (enabled by `observability` in `wrangler.jsonc`).
- **Settings**: domains, variables/secrets, build configuration, triggers.
- The database: **Storage & databases → D1 SQL database**, with **Tables** (browse data), **Console**
  (SQL) and **Time Travel** (backups).

### A6. Login with Cloudflare Access
See [architecture.md §3](architecture.md#3-authentication) for why.

1. **Create the Zero Trust organization** (once): sidebar → **Zero Trust**.
   1. Pick a team name. It becomes the login domain `<team>.cloudflareaccess.com`.
   2. Choose the **Free** plan. It may ask for a payment method even though it costs $0.
2. **Check the login method:** Zero Trust → **Settings → Authentication → Login methods**.
   **One-time PIN** is there by default (email + 6-digit code).
3. **Protect the app:** **Workers & Pages → health-app → Settings → Domains & Routes**. On the
   `workers.dev` row, enable **Cloudflare Access**. This creates an Access application for the Worker.
4. **Allowlist:** Zero Trust → **Access → Applications** → open the new application → **Policies**.
   1. Add a policy: Action **Allow**, Include → **Emails** → your email and those of the people you
      invite. The allowlist lives only in the dashboard, never in the repository.
   2. Set **Session duration** to **1 month** (the maximum), so login is rarely needed.
5. **Values the Worker needs:** in the application's overview, copy the **Application Audience (AUD)
   tag**, and store it and the team domain as secrets (A7).
6. **Test on the iPhone:** open the URL in Safari, log in with the email code, Add to Home Screen, open
   it from the home screen, close it, and open it again the next day.
7. **Bypass for Claude** (needed in iteration 3, but test it now): add a second Access application for
   the same host with the paths `/mcp`, `/authorize`, `/token`, `/register`, `/callback` and
   `/.well-known/`. Give it one policy with Action **Bypass**, Include **Everyone**. The Worker protects
   these paths with its own OAuth. Check that `https://<app-host>/mcp` is reachable without the Access
   login page.

If step 6 or 7 fails, we switch to the fallback (Better Auth, email + password).

### A7. Secrets
Secrets are keys and settings the Worker needs that must not be in the repository.
```bash
pnpm wrangler secret put ACCESS_TEAM_DOMAIN   # https://<team>.cloudflareaccess.com
pnpm wrangler secret put ACCESS_AUD           # the AUD tag from A6
```
Dashboard alternative: **Workers & Pages → health-app → Settings → Variables and Secrets → + Add** →
Type **Secret** → name + value → **Deploy**. Values stay hidden after saving.

For local development, put local values in `.dev.vars` (git-ignored). Copy `.dev.vars.example` when it
is added in iteration 1.

### A8. Install the app on your iPhone
1. Open the app URL in **Safari** (it must be Safari on iOS).
2. Share → **Add to Home Screen** → Add.
3. Open it from the home screen: it runs full-screen like an app.

### A9. Backups
- **Automatic:** D1 Time Travel keeps point-in-time history (7 days on Free, 30 days on Paid).
  Restore with:
  ```bash
  pnpm wrangler d1 time-travel restore health-db --timestamp=2026-11-19T10:00:00Z
  ```
- **Manual export** (worth doing occasionally). Backups contain health data: keep them outside the
  repository folder.
  ```bash
  pnpm wrangler d1 export health-db --remote --output=$HOME/health-backup-$(date +%F).sql
  ```

### A10. Later: custom domain
Not needed; the `workers.dev` address is fine. If you switch later, reconnect Claude (B2) and
re-install the PWA. Access path rules are simplest on a custom domain.
1. If you need a domain: sidebar → **Domain Registration → Register Domains**. Cloudflare sells at cost,
   roughly $10/year for `.com`.
2. **Workers & Pages → health-app → Settings → Domains & Routes → + Add → Custom domain** → enter the
   hostname → **Add domain**. Cloudflare creates the DNS record and HTTPS certificate; it takes a few
   minutes.
3. Optionally turn off the `workers.dev` address in the same section, so there is a single entry point.

---

## Part B: Iteration 3 (MCP server for Claude)

### B1. Storage for OAuth tokens (KV)
The code adds an `OAUTH_KV` binding without an id to `wrangler.jsonc`. The next deploy from GitHub
creates the namespace. To check in the dashboard: **Storage & databases → Workers KV**.

### B2. Access as the identity provider for Claude logins
1. Zero Trust → **Access → Applications → Add an application → SaaS** → choose **OIDC**.
2. **Redirect URLs:** `https://<app-host>/callback`. Under advanced settings, enable **Refresh tokens**.
3. Use the same Allow policy (the invited emails).
4. Save, then copy the client ID, client secret and the token / authorization / JWKS endpoints into
   secrets:
   ```bash
   pnpm wrangler secret put ACCESS_CLIENT_ID
   pnpm wrangler secret put ACCESS_CLIENT_SECRET
   pnpm wrangler secret put ACCESS_TOKEN_URL
   pnpm wrangler secret put ACCESS_AUTHORIZATION_URL
   pnpm wrangler secret put ACCESS_JWKS_URL
   pnpm wrangler secret put COOKIE_ENCRYPTION_KEY   # openssl rand -hex 32
   ```

### B3. Connect Claude
- **claude.ai** (web, then also available in the desktop and mobile apps): Settings → **Connectors** →
  **Add custom connector** → URL `https://<app-host>/mcp` → Connect → log in with the email code →
  Approve.
- **Claude Code:** `claude mcp add --transport http health https://<app-host>/mcp`, then run `/mcp`
  inside Claude Code to log in.

Each invited person connects their own Claude with their own account and sees only their own data.

---

## Part C: Iteration 8 (WHOOP)

1. At https://developer.whoop.com (WHOOP's site, not Cloudflare), create an app. Use redirect URL
   `https://<app-host>/api/whoop/callback` and scopes `read:recovery read:sleep read:workout
   read:cycles read:profile offline`.
2. Store the credentials:
   ```bash
   pnpm wrangler secret put WHOOP_CLIENT_ID
   pnpm wrangler secret put WHOOP_CLIENT_SECRET
   ```
3. The sync schedule is defined in `wrangler.jsonc` (`triggers.crons`). After deploy it appears under
   **health-app → Settings → Trigger events**.

---

## Costs and limits checklist

- Zero Trust (Access) Free: up to 50 users.
- Workers Free: 100k requests/day, 10 ms CPU per request. D1 Free: 5 GB, ~5M rows read and ~100k
  rows written per day. KV and Cron Triggers are included.
- Upgrade path: **Workers & Pages → Plans** (or **Billing**) → Workers Paid, $5/month. Do this only if
  Metrics shows CPU-limit errors or you want 30-day backups.
