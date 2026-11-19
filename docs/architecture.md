# Architecture and infrastructure

Status: proposed in iteration 0 (2026-11-19). Prices and limits checked in November 2026; re-check the
official pricing pages before relying on them.

## 1. Infrastructure: Cloudflare vs Supabase

### What the app needs

- Host a static React PWA.
- A small API (CRUD + aggregations) for 2–5 users.
- A relational database. Expected size: megabytes per user per year (sets, meals, water entries).
- Authentication with separate accounts.
- A remote MCP server reachable by Claude (claude.ai, Claude desktop/mobile, Claude Code) over HTTPS,
  protected with OAuth.
- Scheduled jobs (WHOOP sync) and storage for third-party OAuth tokens (WHOOP).

### Option A: Cloudflare (Workers + D1)

One Worker serves the PWA, the API, auth and the MCP endpoint. Data is in D1 (managed SQLite).

| | |
|---|---|
| Cost for this app | **$0** on the Free plan. Optional Workers Paid is $5/month. |
| Free plan limits that matter | 100,000 requests/day; **10 ms CPU per request** (waiting on the database does not count); D1: 5 GB storage, ~5M rows read and ~100k rows written per day. We will use well under 1% of these. |
| Over the limit | Requests fail until the daily reset (00:00 UTC). No surprise bills on the Free plan. |
| Auth | **Cloudflare Access** (Zero Trust, free up to 50 users) puts a login (email one-time code, or Google/GitHub) in front of the app with no auth code in the app. Alternatively, Better Auth (a library; data stays in D1). See §3. |
| MCP | First-class: Cloudflare's Agents SDK and `workers-oauth-provider` are built for remote MCP servers with OAuth on Workers. |
| Scheduled jobs | Cron Triggers, included in Free. |
| Database | SQLite. Good for this data shape; no Postgres features such as row-level security. |
| Backups | D1 Time Travel: point-in-time restore (7 days on Free, 30 on Paid) + `wrangler d1 export`. |
| Cold starts | None in practice. Workers start in milliseconds and never "pause". |
| Ops | One deploy command, one platform, one dashboard. |

### Option B: Supabase (Postgres + Auth + Edge Functions)

| | |
|---|---|
| Cost | Free: 500 MB DB, 2 projects. **Free projects pause after 7 days without activity** and must be restored from the dashboard. Pro is **$25/month**. |
| Auth | Built in (email, magic link, OAuth), with a good admin UI. Its strongest advantage. |
| Database | Postgres with row-level security, table editor and SQL editor in the dashboard. |
| Frontend hosting | Not included. We would still need Cloudflare Pages, Vercel or similar, so it is two platforms. |
| MCP | Must be hosted in Supabase Edge Functions (Deno) or elsewhere. Building our own OAuth for Claude on top of Supabase Auth is possible but less paved than on Cloudflare. |
| Scheduled jobs | pg_cron + Edge Functions. |

Note: Supabase's own MCP server lets Claude query the database directly. That is aimed at developers
working on the database, not at a domain API like "log this meal for me". We would still write our own
tools.

### Recommendation: Cloudflare

- **Cost:** $0 instead of $0-with-pausing or $25/month.
- **One platform:** the PWA, API, auth, MCP and cron jobs all deploy from this repo with one command.
- **MCP:** Cloudflare is the best-supported place today to host a remote, OAuth-protected MCP server.
- **Fit:** SQLite is enough for a few users' personal logs. Row-level security matters less here
  because there is one API layer, and every query is scoped by `user_id` in code.
- **What Cloudflare costs us:** Supabase Auth is more polished than either Cloudflare route (see §3).
  The D1 dashboard is less pleasant than Supabase's table editor.

Plan choice: start on **Workers Free**. Move to **Workers Paid ($5/month)** if we hit the 10 ms CPU
limit (most likely from password hashing or heavy statistics) or want 30-day backups.

## 2. Application stack

| Layer | Choice | Why |
|---|---|---|
| UI | React 19 + TypeScript | Owner's experience. |
| Build | Vite + `@cloudflare/vite-plugin` | Runs the real Workers runtime and local D1 in `pnpm dev`; one build for client and Worker. |
| Routing | TanStack Router (file-based) | Type-safe routes and search params (useful for period selectors such as `?period=month`). |
| Server state | TanStack Query | Caching, optimistic updates, and offline persistence later. |
| Styling | Tailwind CSS v4 with our own tokens | Fast to build flat, custom UI. We do not use a component kit, so the app does not look generic. |
| API | Hono on Workers | Small and fast. The PWA calls it with a thin fetch wrapper; request/response types live in `shared/` (`hono/client` would pull Worker types into the browser build). |
| Validation | zod | One schema for API input, MCP tool input and forms. |
| DB | D1 + Drizzle ORM + drizzle-kit | Typed queries; SQL migrations applied by wrangler. |
| Auth | Cloudflare Access | See §3. Confirmed by a test on the iPhone in iteration 6 (deploy). |
| MCP | Agents SDK (`agents`) + `@modelcontextprotocol/sdk` + `@cloudflare/workers-oauth-provider` | Streamable-HTTP MCP endpoint at `/mcp` with OAuth 2.1, so it works as a claude.ai custom connector and in Claude Code. |
| PWA | vite-plugin-pwa (Workbox) | Manifest, service worker, app-shell caching. |
| Charts | Decided in the Stats iteration, using design variants | Candidates: hand-written SVG (most control over a flat look), visx, Recharts. |
| Lint/format/test | Biome, Vitest | |

### Repository layout

```
src/            React PWA (routes in src/routes, generated src/routeTree.gen.ts)
worker/         Cloudflare Worker: Hono API, auth, MCP, cron
worker/db/      Drizzle schema
shared/         zod schemas, domain types, pure calculations (client + worker)
migrations/     SQL migrations for D1
public/         static files (icons)
docs/           requirements, architecture, setup guides
```

## 3. Authentication

There are two logins to solve:
- **App login:** you and the people you invite (e.g. family members), on their phones.
- **Claude login:** Claude connecting to the MCP server must obtain a token tied to one user. Claude
  requires the server to speak OAuth 2.1 with dynamic client registration.

### Option 1 (chosen): Cloudflare Access

Cloudflare Access is part of Cloudflare Zero Trust. It is **free for up to 50 users** and needs no
external identity provider.

**App login**
- Turn Access on for the Worker's `workers.dev` address. Cloudflare docs confirm Access can protect a
  Worker's `workers.dev` URL.
- Add a policy that allows only the emails of the people you invite.
- Logging in means entering your email and a 6-digit code sent to it. Google or GitHub login can be
  added instead. Emails outside the policy never get a code.
- Every request that passes Access carries a signed JWT (`Cf-Access-Jwt-Assertion`) with the user's
  email. The Worker verifies it and maps the email to an app user row.

**Claude login**
- Access does **not** do the OAuth handshake with Claude itself. The Worker is the OAuth 2.1
  authorization server (`@cloudflare/workers-oauth-provider`, `worker/oauth.ts`) and `/mcp` its only
  resource: discovery metadata, dynamic client registration and client metadata documents, PKCE,
  1-hour access tokens and a refresh grant that lives while used (30 days idle).
- **Signing in is Access itself.** `/authorize` opens in the user's browser, so it stays behind the
  app's Access application: the request arrives with the Access JWT, the Worker reads the email as
  for the app, and shows a consent page (client name, where access goes, Allow / Deny). Allow issues
  a grant for that user. The consent page is required: anyone can register a client and send a
  logged-in user an `/authorize` link.
- Only the machine endpoints bypass Access: `/mcp`, `/token`, `/register`, `/.well-known/`.
- Chosen over the original plan (Access for SaaS as an OIDC provider behind `/authorize`, from
  Cloudflare's template): same login, but no second Access application, no `/callback` and no
  secrets.
- The provider is built per request origin, so the deployment's hostname is never configured or
  committed. Grants and tokens live in KV (`OAUTH_KV`), hashed; props are encrypted.

**Pros**
- No passwords, sign-up screens, password reset or hashing (so no CPU-limit risk).
- The allowlist is managed in the dashboard.
- Brute-force protection comes from Cloudflare.
- One identity for both the app and Claude.

**Cons**
- Sessions last at most **1 month** (configurable from 15 min). After that you enter an email code
  again.
- Login happens on a Cloudflare page (`<team>.cloudflareaccess.com`). Inside an installed iOS PWA this
  redirect usually works, but iOS standalone mode has known cookie quirks. Tested in iteration 6:
  login works in the installed PWA on the iPhone.
- The MCP and OAuth paths (`/mcp`, `/authorize`, `/token`, `/register`, `/.well-known/*`) must be
  excluded from the app's Access gate with a bypass rule, because Claude cannot log in through it.
  Tested in iteration 6: a second Access application with Bypass and one destination per path works
  on `workers.dev`, because Access applies the application with the most specific path.
- More dashboard configuration (Zero Trust setup) and less code. The Zero Trust signup may ask for a
  payment method even on the free plan.
- Local development has no Access, so the dev server uses a fixed dev user.

### Option 2 (fallback): Better Auth, email + password

- Login UI in the app, sessions in D1. Sessions can last as long as we like (e.g. 90 days rolling).
- Closed sign-up: only emails in the `ALLOWED_EMAILS` secret can register.
- Claude login: the same `workers-oauth-provider` setup, with `/authorize` reusing the app session.
- **Cons:**
  - We own the password security: hashing, rate limiting, reset by hand.
  - Better Auth's default scrypt can exceed the 10 ms CPU limit on Free, so it needs a WebCrypto PBKDF2
    hasher or Workers Paid.
  - Roughly a day more work than Option 1.

### Plan

Start iteration 6 (deploy) with a **30-minute test**:
1. Deploy the blank app.
2. Enable Access with the email allowlist.
3. Install the PWA on the iPhone and check login, re-opening after a day, and that the bypass for
   `/mcp` works on `workers.dev`.

Result: login and the bypass work on `workers.dev`, so Access is used and `better-auth` was removed. Either way, MCP uses `workers-oauth-provider` and every token carries the `userId`, which
every MCP tool uses. Each invited person connects their own Claude with their own account the same way.

## 4. MCP server

- Endpoint: `https://<app-host>/mcp` (Streamable HTTP, stateless). `worker/mcp/index.ts` builds a
  server per request with `@modelcontextprotocol/sdk`, bound to the authenticated user. Tools in
  `worker/mcp/tools/` are thin wrappers over `worker/services/`. No Durable Object is needed.
- Locally (`pnpm dev`) it acts as the dev user: `claude mcp add --transport http tracker-dev
  http://localhost:5173/mcp`. A request with a bearer token goes through OAuth, so the whole flow
  can be tested locally too. In production every request needs an OAuth token (§3).
- Times are exchanged as local ISO 8601 with offset. The SDK's default schema validator (Ajv) compiles
  with `new Function`, which Workers forbid, so the server uses the `@cfworker/json-schema` validator.
- Connect from claude.ai: Settings → Connectors → Add custom connector → paste the URL. It works on
  Claude mobile once it is added on the web.
- Connect from Claude Code: `claude mcp add --transport http tracker https://<app-host>/mcp`.
- Tools follow the domain: `log_meal`, `get_day_summary`, `log_water`, `get_workout_history`,
  `get_stats(period)`, and so on. Each iteration lists its tools in `docs/requirements.md`.
- For insights, read tools return compact aggregated data (daily totals, weekly sets per muscle group)
  so Claude can reason over months without pulling raw rows.

## 5. PWA and caching: recommendation

| Level | What | Value | When |
|---|---|---|---|
| 1 | Precache the app shell (HTML/JS/CSS/icons) with the service worker | Instant launch, the app opens without signal. Already configured. | Iteration 1 |
| 2 | Persist the TanStack Query cache to IndexedDB | Last-known data shows instantly and offline (read-only). | Iteration 1–2 |
| 3 | Offline write queue for logging (sets, water) | Gyms often have poor signal. Logging a set must never fail. Mutations queue locally and sync later. | Iteration 8 (cheap because IDs are client-generated from day 1) |
| 4 | Web Push notifications | Water urgency reminders. iOS supports push for home-screen PWAs. | Backlog |

API responses are never served from the service-worker cache: `/api`, `/mcp` and the auth paths are
excluded. Freshness is handled by TanStack Query.

iOS notes: install from Safari → Share → Add to Home Screen. Installed PWAs keep their storage; Safari's
7-day storage eviction applies to sites that are not installed.

## 6. Data model sketch

Refined in each iteration. All user tables have `user_id`, `created_at`, `updated_at`; entries have
`occurred_at` (UTC), `tz` and `local_date`.

The three shared engines (tracking, level, metrics) are described in
[requirements.md](requirements.md#shared-engines).

- **Users**: `user` (id, email, name, timezone, wake_time, sleep_time).
- **Settings**: `user_setting` (user, feature key → JSON), validated by a zod schema per feature.
- **Tracking engine**: `entry` (tracker key, occurred_at, ended_at, tz, local_date, value, note, data
  JSON, source app/mcp). Tracker definitions (kind, unit, data schema, rollup) are code in
  `shared/tracking/trackers.ts`; a `tracker` table is added only with user-defined trackers. Tags are
  added when a tracker needs them. Meals, water, focus sessions, unfocus, sleep quality, habits and mood
  are all entries.
- **Level engine**: no tables. It is a pure simulation over entries, spans (sessions) and config in
  `shared/level/`, run on every read. The API returns the simulation's inputs, so the PWA runs the same simulation live
  (every minute and after optimistic writes).
- **Metrics engine**: `metric_daily` (user, local_date, metric, dimension, value), updated on every
  write and indexed by (user, metric, local_date).
- **Workouts** (domain tables, more structure than entries):
  - muscle groups are 8 fixed keys in code (`shared/workouts/groups.ts`); each group's category
    (major/minor), the targets and workouts per week live in `user_setting` key `workouts`
  - `exercise` (user-owned; the seed library in `shared/workouts/seed.ts` is copied to each new user,
    `seed_key` remembers the origin; equipment, recommended sets and rep range, `archived_at`)
  - `exercise_muscle` (exercise, group, contribution 1.0 / 0.5 / 0.25)
  - `workout` (started_at, ended_at, tz, local_date)
  - `workout_set` (workout, exercise, position, kind warmup/working, reps, weight_kg, performed_at)
  - weekly volume is computed in SQL from sets (cheap at this size); `metric_daily` holds
    `workouts.count`, `workouts.working_sets` per group, `exercise.top_set_kg` and `exercise.e1rm_kg`
    per exercise for the stats engine
- **Nutrition**: meals are `meal` entries (kcal in `value`; name, protein/fat/carbs and items in `data`).
  `day_type` holds manual overrides only (local_date → workout/rest); other days follow workouts.
  Targets per day type live in `user_setting` key `nutrition`. `metric_daily` holds `nutrition.kcal`,
  `nutrition.protein_g`, `nutrition.fat_g`, `nutrition.carbs_g` and the targets that applied
  (`nutrition.kcal_target`, `nutrition.protein_target`).
- **Water**: drinks are `water` entries (ml in `value`). Settings in `user_setting` key `water`; the
  day schedule comes from `user`. `metric_daily` holds `water.intake_ml`, `water.target_ml` (days with
  water) and `water.at_cap_min`. The last one is written lazily for closed days; the last finalised
  date is kept in `user_setting` key `water.finalized`.
- **Focus**: sessions are `focus` entries (kind deep / moderate / unfocus and tag in `data`). Timers
  have `occurred_at` start and `ended_at` end (null while running); minutes added afterwards have the
  minutes in `value` and no time of day. Sleep quality is one `sleep` entry per local
  date (value 3 / 2 / 1). Settings in `user_setting` key `focus`. `metric_daily` holds the minutes per
  tier and `sleep.quality` on every write. For closed days it also holds `focus.min_energy` and the
  minutes at or below each threshold, written through the same lazy finalisation as water
  (`worker/services/levels.ts`, key `focus.finalized`).
- **Later**: `whoop_connection` (tokens, encrypted) and `whoop_cycle` / `whoop_sleep` /
  `whoop_recovery` / `whoop_workout`.

## 7. WHOOP

WHOOP has an official developer API (v2, OAuth 2.0, scopes such as `read:recovery`, `read:sleep`,
`read:workout`, `read:cycles`, `offline`) and webhooks for recovery, sleep and workout updates. There is
no official WHOOP MCP server, only community ones. The plan: the app connects to WHOOP itself through
OAuth (each user connects their own WHOOP), syncs with a cron trigger plus webhooks, and stores the data
in D1. Claude then sees WHOOP data through **our** MCP server, next to workouts, food and water, so it
can correlate them.
