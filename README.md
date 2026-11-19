# Health

A self-hosted health tracker for your phone: workouts, food, water and focus, in one minimal app that
you run on your own Cloudflare account, for free. It has an MCP server, so Claude can log meals from a
photo, read your history and give you insights. The app itself contains no AI.

Built for one person or a household: each person has their own account and sees only their own data.

> **Status: early development.** The project scaffold is done; features are being built in iterations
> (see [the plan](docs/requirements.md)). Nothing below is usable yet unless marked ✅.

## Features (planned)

| Feature | What it does | Iteration |
|---|---|---|
| Workouts | Weekly sets per muscle group (major/minor targets, fractional credit for secondary muscles). You choose exercises in the gym, see your previous result instantly, and log warm-up and working sets. | 2 |
| Nutrition | Daily kcal / protein budget with workout-day and rest-day targets. Meals logged by Claude from a photo, or by hand. | 3 |
| Claude (MCP) | Claude reads and writes your data: log meals, adjust targets, analyse trends. | 3 |
| Water | Water "debt" builds up through the day (slower at night) and is paid off by drinking. The app warns when you've been behind for too long. | 4 |
| Focus energy | Focus energy drains with work and information intake, refills with deliberate unfocus and sleep. The app prompts you to unfocus before you run out. | 5 |
| Stats | One engine for all charts: any period, per feature or everything on one screen. | 6 |
| Offline logging | Log sets in a gym with no signal; the app syncs later. | 7 |
| WHOOP | Sleep, recovery and workouts from your WHOOP. | 8 |
| Habits, mood | Habits such as morning sunlight, plus mood check-ins. | 9–10 |

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
2. **Deploy from GitHub.** In the Cloudflare dashboard, go to Workers & Pages → Create → Import a
   repository and pick your fork.
   - Build command: `pnpm build`
   - Deploy command: `npx wrangler deploy && npx wrangler d1 migrations apply DB --remote`

   The first deploy creates the database.
3. **Turn on login.** Enable Cloudflare Access on the Worker and allow your email (plus anyone you
   invite).
4. **Add secrets** with `pnpm wrangler secret put ...`. The Access team domain and audience tag.
5. **Install on your phone.** iPhone: open the URL in Safari → Share → Add to Home Screen. Android:
   Chrome → menu → Install app.
6. **Connect Claude** (from iteration 3). In claude.ai, go to Settings → Connectors → Add custom
   connector and enter `https://<your-app>/mcp`.

Every push to your fork's `main` branch redeploys automatically.

## Local development

```bash
pnpm install
pnpm db:migrate:local
pnpm dev                 # http://localhost:5173: app + API + local database
```

| Command | |
|---|---|
| `pnpm build` | Typecheck and production build |
| `pnpm lint` / `pnpm format` | Biome |
| `pnpm test` | Vitest |
| `pnpm db:generate` | Create a SQL migration after editing `worker/db/schema.ts` |
| `pnpm db:migrate:local` / `pnpm db:migrate:remote` | Apply migrations |
| `pnpm cf-typegen` | Regenerate Worker types after editing `wrangler.jsonc` |
| `pnpm check:private` | Scan the tree and git history for private terms |

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
