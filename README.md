# Tracker

A self-hosted health tracker for your phone: workouts, food, water and focus, in one minimal app that
you run on your own Cloudflare account, for free. It has an MCP server, so Claude can log meals from a
photo, read your history and give you insights. The app itself contains no AI.

Built for one person or a household: each person has their own account and sees only their own data.

> **Status: early development.** Features are built in iterations (see [the plan](docs/requirements.md)).
> Usable so far: workouts, nutrition, water and focus energy (✅), deployed on your own Cloudflare
> account with email-code login, and Claude (claude.ai, the Claude apps, Claude Code) connected
> through MCP.

## Features (planned)

| Feature | What it does | Iteration |
|---|---|---|
| Workouts ✅ | Weekly sets per muscle group (major/minor targets, fractional credit for secondary muscles). You choose exercises in the gym, see your previous result instantly, and log warm-up and working sets. | 2 |
| Nutrition ✅ | Daily kcal / protein budget with workout-day and rest-day targets. Claude logs meals from a photo; the app shows what is left. | 3 |
| Claude (MCP) | Claude reads and writes your data: log meals, adjust targets, analyse trends. | 3 (local), 6 (claude.ai) |
| Water ✅ | Water "debt" builds up through the day (slower at night) and is paid off by drinking; one tap on the home screen logs a glass. The app warns when you've been behind for too long. | 4 |
| Focus energy ✅ | Focus energy drains with work and information intake, refills with deliberate unfocus and sleep. The app prompts you to unfocus before you run out. | 5 |
| Stats | One engine for all charts: any period, per feature or everything on one screen. | 7 |
| Offline logging | Log sets in a gym with no signal; the app syncs later. | 8 |
| WHOOP | Sleep, recovery and workouts from your WHOOP. | 9 |
| Habits, mood | Habits such as morning sunlight, plus mood check-ins. | 10–11 |

## How it works

```
 iPhone (PWA, home-screen app)          Claude (claude.ai / desktop / mobile / Claude Code)
            │  HTTPS                                   │  MCP over HTTPS (OAuth)
            ▼                                          ▼
 ┌──────────────────── Cloudflare Worker (your account) ─────────────────────┐
 │  static PWA   ·   /api (Hono)   ·   /mcp (MCP server)   ·   cron (WHOOP) │
 └───────────────────────────────────┬───────────────────────────────────────┘
                                     ▼
                      D1 database (SQLite, your account)
 Login: Cloudflare Access (email one-time code, only emails you allow)
```

- **Your data stays in your Cloudflare account.** There is no central server, no telemetry, and
  nothing is sent to third parties. Claude only sees data when you connect it and ask.
- **Free to run** on Cloudflare's free plans for a household.
- Details: [docs/architecture.md](docs/architecture.md).

## Self-hosting

You need:
- a free Cloudflare account
- a GitHub account
- Node.js 24+ and pnpm 10+ (`corepack enable`)
- an iPhone or Android phone

**Overview of the steps.** Full click-by-click instructions are in
[docs/cloudflare-setup.md](docs/cloudflare-setup.md).

1. **Fork** this repository, then clone your fork and run `pnpm install`.
2. **Deploy from GitHub.** In the Cloudflare dashboard, go to Compute → Workers & Pages → Create → Import a
   repository and pick your fork.
   - Build command: `pnpm build`
   - Deploy command: `npx wrangler deploy && npx wrangler d1 migrations apply DB --remote`

   The first deploy creates the database and the storage for Claude's logins.
3. **Turn on login.** In Zero Trust, add a self-hosted Access application for the Worker's address
   with a policy that allows your exact email (plus anyone you invite), and a second one that
   bypasses login for Claude's endpoints (`/mcp`, `/token`, `/register`, `/.well-known`).
4. **Add secrets** with `pnpm wrangler secret put ...`. The Access team domain and audience tag.
5. **Install on your phone.** iPhone: open the URL in Safari → Share → Add to Home Screen. Android:
   Chrome → menu → Install app.
6. **Connect Claude.** In claude.ai, go to Settings → Connectors → Add custom connector, enter
   `https://<your-app>/mcp`, choose Claude's published identity as the OAuth client, log in with the
   email code and allow it.

Every push to your fork's `main` branch redeploys automatically.

## Local development

```bash
pnpm install
cp .dev.vars.example .dev.vars   # local dev user (you@example.com); git-ignored
pnpm db:migrate:local
pnpm dev                         # http://localhost:5173: app + API + local database
```

There is no Cloudflare Access locally: on `localhost` the API acts as `DEV_USER_EMAIL` from `.dev.vars`.
On any other host that variable is ignored and requests without a valid Access token get 401.

To try it on your phone before deploying: run `pnpm dev --host`, then open the printed network address
(`http://192.168.x.x:5173`) on the phone, on the same Wi-Fi. The dev user is also accepted on private
network addresses. Installing as a home-screen app needs HTTPS, so that waits for the deploy.

**Claude Code against the local app.** While `pnpm dev` runs, the MCP server is at
`http://localhost:5173/mcp` and acts as the dev user (no login). Connect Claude Code once:

```bash
claude mcp add --transport http tracker-dev http://localhost:5173/mcp
```

Then ask it, for example, to log a meal from a photo. Photos are never sent to the app; Claude sends the
estimated numbers. claude.ai and the Claude apps connect to the deployed app (see step 6 above).

| Command | |
|---|---|
| `pnpm build` | Typecheck and production build |
| `pnpm lint` / `pnpm format` | Biome |
| `pnpm test` | Vitest |
| `pnpm db:generate` | Create a SQL migration after editing `worker/db/schema.ts` |
| `pnpm db:migrate:local` / `pnpm db:migrate:remote` | Apply migrations |
| `pnpm cf-typegen` | Regenerate Worker types after editing `wrangler.jsonc` |
| `pnpm check:private` | Scan the tree and git history for private terms |
| `pnpm icons` | Regenerate the PNG app icons from `public/icon.svg` |

Project layout:
- `src/`: the React PWA
- `worker/`: the Cloudflare Worker (API, MCP, cron)
- `shared/`: schemas and logic shared by both
- `migrations/`: database migrations
- `docs/`: plans and guides

## Privacy: keeping your data out of the repo

This is a public repository, but you deploy it with your own data. Personal information belongs in your
deployed database, Cloudflare secrets and dashboard, and git-ignored local files (`.dev.vars`,
`.private-terms`). It never belongs in commits.

The repo ships with a guard against accidental leaks. Git hooks are enabled automatically by
`pnpm install`.

1. `cp .private-terms.example .private-terms` and list your real name, the names and emails of the
   people you invite, your workers.dev subdomain and your Zero Trust team name. The file is git-ignored.
2. **pre-commit** blocks a commit when staged changes, file names or your git identity contain one of
   those terms.
3. **pre-push** scans the whole tree and git history.
4. Commit with your GitHub noreply email:
   `git config user.email <id>+<github-user>@users.noreply.github.com`.

## Contributing

Principles for product, UI and engineering are in [CLAUDE.md](CLAUDE.md):
- mobile first
- minimal text
- flat design without generative-AI clichés
- design variants for every new UI element
- strict per-user data isolation
- an MCP tool for every feature

The roadmap is in [docs/requirements.md](docs/requirements.md).

## License

[MIT](LICENSE)
