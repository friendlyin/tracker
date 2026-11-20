# Cloudflare setup guide

Step-by-step setup for running your own instance on Cloudflare. Deploys run from GitHub (Workers
Builds). Cloudflare creates the database on the first deploy, so the repository needs no
account-specific ids. The terminal (`wrangler`) handles secrets, migrations and backups. The dashboard
is used to connect GitHub, configure login (Access), and read logs.

Dashboard: https://dash.cloudflare.com. The left sidebar groups products. Workers are under
**Compute → Workers & Pages**, databases under **Storage & databases**, login (Access) under
**Protect & connect → Zero Trust**. Cloudflare sometimes
renames menu items; if a name doesn't match, use the search box at the top of the dashboard.

Placeholders used below: `<subdomain>` (your workers.dev subdomain), `<team>` (your Zero Trust team
name), `<app-host>` (`tracker.<subdomain>.workers.dev`), `<github-user>`.

Steps are grouped by the iteration that needs them.

---

## Part A: Iteration 6 (first deploy)

### A1. Account and security
1. Sign up or log in at dash.cloudflare.com and verify your email.
2. Turn on two-factor authentication: top-right avatar → **Profile** → **Authentication** →
   **Two-Factor Authentication**. This account will hold health data.
3. No plan to choose. New accounts are on **Workers Free**. The Free plan never bills you; at the
   (very high) limits, requests fail until the daily reset.

### A2. Choose your workers.dev subdomain
1. Sidebar → **Compute → Workers & Pages**.
2. On first visit Cloudflare asks you to pick a subdomain. The app will be at
   `https://tracker.<subdomain>.workers.dev`. Pick something that doesn't need to be your name; it is
   public.

### A3. Connect the terminal to your account
```bash
pnpm wrangler login     # opens the browser → click "Allow"
pnpm wrangler whoami    # shows your account
```

### A4. Put the code on GitHub
Cloudflare builds from a GitHub repository you own: it installs its GitHub app on that repository and
deploys on every push to it. If the code is already in a repository of yours, skip this step.

1. Fork this repository on GitHub, or create a new **public** (or private) repository and push your
   clone to it:
   ```bash
   pnpm check:private      # make sure nothing personal is in the tree (see README)
   git remote add origin git@github.com:<github-user>/<repo>.git
   git push -u origin main
   ```

### A5. First deploy from GitHub
1. **Compute → Workers & Pages → Create application → Import a repository** → connect GitHub (grant access only
   to this repository) → select it.
2. Settings on the next screen:
   - **Project name:** `tracker`. It must match `name` in `wrangler.jsonc`.
   - **Build command:** `pnpm build`
   - **Deploy command:** `npx wrangler deploy && npx wrangler d1 migrations apply DB --remote`
3. Click **Deploy**. Because the bindings in `wrangler.jsonc` have no ids, the first deploy creates
   the D1 database (`tracker-db`) and the KV namespace for Claude's logins (`tracker-oauth-kv`), and
   later deploys reuse them. Then the migrations create the tables. Nothing to copy into the
   repository.
4. Every push to `main` now deploys. Build logs are under **Deployments**.
5. Don't run `pnpm deploy` from your computer for the first deploy. A local deploy writes the new
   database id into `wrangler.jsonc`, and it shouldn't be committed.

Where to look afterwards: **Workers & Pages → tracker**:
- **Overview / Metrics**: requests, errors, CPU time. Free allows 10 ms CPU per request.
- **Deployments**: history of versions, with **Rollback** if a deploy breaks something.
- **Logs**: live and stored logs (enabled by `observability` in `wrangler.jsonc`).
- **Settings**: domains, variables/secrets, build configuration, triggers.
- The database: **Storage & databases → D1 SQL database**, with **Tables** (browse data), **Console**
  (SQL) and **Time Travel** (backups).

### A6. Login with Cloudflare Access
See [architecture.md §3](architecture.md#3-authentication) for why. Zero Trust is in the sidebar under
**Protect & connect → Zero Trust**; the steps below name its sub-menus.

1. **Create the Zero Trust organization** (once): sidebar → **Zero Trust**.
   1. Pick a team name. It becomes the login domain `<team>.cloudflareaccess.com` (shown later under
      Zero Trust → **Settings → Team domain**).
   2. Choose the **Free** plan. It may ask for a payment method even though it costs $0.
2. **Add the login method:** Zero Trust → **Integrations → Identity providers**. If **One-time PIN**
   (email + 6-digit code) isn't listed, **Add new identity provider → One-time PIN**. Newer
   organizations no longer get it by default.
3. **Create the allowlist policy:** Zero Trust → **Access controls → Policies → Add a policy**.
   - Name: e.g. `Tracker users`. Action: **Allow**. Session duration: **1 month**.
   - Include → **Emails** → your exact address and those of the people you invite. The allowlist lives
     only in the dashboard, never in the repository.
   - Don't use an **Email domain** rule with a public mail provider such as `gmail.com`: anyone with
     an address there could log in, and the app creates an account for every email Access lets
     through.
4. **Protect the app** (after the first deploy in A5, so the Worker exists): Zero Trust → **Access
   controls → Applications → Add an application → Self-hosted and private** → **Continue**. The tabs
   in the middle of that dialog only switch the example diagram.
   - Name: `tracker`. Destination: the public hostname `<app-host>` with an empty path. (A **Workers**
     destination also works, but if step 6 then fails with "destination belongs to another
     application", switch it to the public hostname.)
   - Policy: `Tracker users`. Login method: **One-time PIN**. Session duration: **1 month**.
   - Save, then open `https://<app-host>` in a private window: the Cloudflare email-code page should
     appear before the app.
   - Don't use the Worker's own **Access** tab (**Protect this Worker behind Access**): its dialog
     only offers an account-members policy or an email-domain policy, neither of which fits. The tab
     may keep saying "not protected"; the address is protected anyway.
5. **Values the Worker needs:** Zero Trust → **Access controls → Applications** → `tracker` →
   **Edit** → **Additional settings** → **Application Audience (AUD) Tag** → copy the value (a long
   hex string). The text there about a "token validation script" refers to the Worker's own check
   (`worker/auth.ts`); nothing else to set up. The team domain is
   `https://<team>.cloudflareaccess.com`. Store both as secrets (A7).
6. **Bypass for Claude:** add a second Access application (**Self-hosted and private**, name
   `tracker-mcp`) with four **public hostname** destinations on `<app-host>`, paths `mcp`, `token`,
   `register` and `.well-known`. Delete any **Workers** destination the dialog adds: it belongs to
   the first application, and keeping it fails with "destination belongs to another application".
   Give it one policy with Action **Bypass**, Include **Everyone**. Access applies the application
   with the most specific path. These are the machine endpoints Claude calls; the Worker protects
   them with its own OAuth tokens. `/authorize` is *not* bypassed: it is where you log in and allow
   Claude, so it stays behind the login. Check in a private window: `https://<app-host>/mcp` answers
   with an error (401) and no login page; `https://<app-host>/authorize` shows the login page.

### A7. Secrets
Secrets are keys and settings the Worker needs that must not be in the repository.
```bash
pnpm wrangler secret put ACCESS_TEAM_DOMAIN   # https://<team>.cloudflareaccess.com
pnpm wrangler secret put ACCESS_AUD           # the AUD tag from A6
```
Push notifications (optional) need a key pair. `pnpm vapid` prints one; set both, plus a contact:
```bash
pnpm vapid                                     # prints VAPID_PUBLIC_KEY=… and VAPID_PRIVATE_KEY=…
pnpm wrangler secret put VAPID_PUBLIC_KEY
pnpm wrangler secret put VAPID_PRIVATE_KEY     # keep it secret; a new pair logs out every device
pnpm wrangler secret put VAPID_SUBJECT         # mailto:you@example.com
```
Then on the iPhone (app added to the Home Screen): Settings → Notifications → This device.

Dashboard alternative: **Compute → Workers & Pages → tracker → Settings → Variables and Secrets → + Add** →
Type **Secret** → name + value → **Deploy**. Values stay hidden after saving.

For local development, copy `.dev.vars.example` to `.dev.vars` (git-ignored). Locally the app has no
Access login and acts as `DEV_USER_EMAIL`.

Until both secrets are set, the deployed API answers every request with 401 (it fails closed). The app
shell still loads but shows no data.

### A8. Install the app on your iPhone
1. Open the app URL in **Safari** (it must be Safari on iOS) and log in with the email code.
2. Share → **Add to Home Screen** → Add.
3. Open it from the home screen: it runs full-screen like an app. Close it and open it again the next
   day: it should not ask for the code again (the session lasts a month).

### A9. Backups
- **Automatic:** D1 Time Travel keeps point-in-time history (7 days on Free, 30 days on Paid).
  Restore with:
  ```bash
  pnpm wrangler d1 time-travel restore tracker-db --timestamp=2026-11-19T10:00:00Z
  ```
- **Manual export** (worth doing occasionally). Backups contain health data: keep them outside the
  repository folder.
  ```bash
  pnpm wrangler d1 export tracker-db --remote --output=$HOME/tracker-backup-$(date +%F).sql
  ```

### A10. Later: custom domain
Not needed; the `workers.dev` address is fine. If you switch later: change the destinations of both
Access applications (A6 steps 4 and 6) to the new hostname, reconnect Claude (B1) and re-install the
PWA.
1. If you need a domain: sidebar → **Domain Registration → Register Domains**. Cloudflare sells at cost,
   roughly $10/year for `.com`.
2. **Workers & Pages → tracker → Settings → Domains & Routes → + Add → Custom domain** → enter the
   hostname → **Add domain**. Cloudflare creates the DNS record and HTTPS certificate; it takes a few
   minutes.
3. Optionally turn off the `workers.dev` address in the same section, so there is a single entry point.

---

## Part B: Iteration 6 (connect Claude)

Claude connects with OAuth, run by the Worker. Logging in is the same Access email code as the app,
then an **Allow** page. Nothing to set up beyond A6 step 6:
- The OAuth storage (KV namespace `tracker-oauth-kv`) is created on the first deploy (A5). To look at
  it: **Storage & databases → Workers KV**.
- No secrets.

### B1. Connect Claude
- **claude.ai** (web; then also available in the desktop and mobile apps): Settings → **Connectors** →
  **Add custom connector** → URL `https://<app-host>/mcp`.
  - **OAuth client:** choose **Claude's published identity** (a client ID metadata document). The
    Allow page then shows "Published by claude.ai". If that fails, **Register automatically** (dynamic
    registration) also works. "Your own OAuth client" is not supported.
  - **Connect** → log in with the email code → **Allow**.
- **Claude Code:** `claude mcp add --transport http tracker https://<app-host>/mcp`, then run `/mcp`
  inside Claude Code and log in the same way.

Each invited person connects their own Claude with their own account and sees only their own data.
Claude stays connected as long as it uses the app at least once every 30 days; after that it asks
to log in again.

To disconnect Claude, remove the connector in Claude. Removing a person from the Access policy stops
their app login at once, but a Claude connection they already made keeps working until it goes
unused for 30 days.

---

## Part C: Iteration 9 (WHOOP)

1. At https://developer.whoop.com (WHOOP's site, not Cloudflare), create an app. Use redirect URL
   `https://<app-host>/api/whoop/callback` and scopes `read:recovery read:sleep read:workout
   read:cycles read:profile offline`.
2. Store the credentials:
   ```bash
   pnpm wrangler secret put WHOOP_CLIENT_ID
   pnpm wrangler secret put WHOOP_CLIENT_SECRET
   ```
3. The sync schedule is defined in `wrangler.jsonc` (`triggers.crons`). After deploy it appears under
   **tracker → Settings → Trigger events**.

---

## Costs and limits checklist

- Zero Trust (Access) Free: up to 50 users.
- Workers Free: 100k requests/day, 10 ms CPU per request. D1 Free: 5 GB, ~5M rows read and ~100k
  rows written per day. KV and Cron Triggers are included.
- Upgrade path: **Workers & Pages → Plans** (or **Billing**) → Workers Paid, $5/month. Do this only if
  Metrics shows CPU-limit errors or you want 30-day backups.
