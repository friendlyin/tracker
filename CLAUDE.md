# Tracker

A personal health-tracking mobile PWA for one person or a household (a few accounts per
deployment). Each person has a separate
account and only sees their own data. The app tracks workouts, nutrition, water, and later habits, focus,
mood and WHOOP data. The app has no AI of its own: Claude reads and writes app data through the app's
MCP server.

- Requirements and iteration plan: [docs/requirements.md](docs/requirements.md)
- Architecture and infrastructure decisions: [docs/architecture.md](docs/architecture.md)
- Cloudflare setup steps: [docs/cloudflare-setup.md](docs/cloudflare-setup.md)

## Stack

- **Frontend**: React 19 + TypeScript, Vite, TanStack Router (file-based routes in `src/routes/`),
  TanStack Query, Tailwind CSS v4, vite-plugin-pwa.
- **Backend**: one Cloudflare Worker (`worker/`) with Hono. It serves the API under `/api`, auth, and
  the MCP endpoint under `/mcp`. The PWA is served as static assets by the same Worker.
- **Data**: Cloudflare D1 (SQLite) through Drizzle ORM. Schema is in `worker/db/schema.ts` and
  migrations are in `migrations/`.
- **Shared**: `shared/` holds zod schemas, domain types and pure calculations used by both client and
  Worker (weekly set budget, water accumulation, nutrition targets). Unit-test these.
- **Auth**: Cloudflare Access (email one-time code, email allowlist); Better Auth only as a fallback.
  See docs/architecture.md §3. `@cloudflare/workers-oauth-provider` handles OAuth for MCP clients.
- **MCP**: `agents` (Cloudflare Agents SDK) + `@modelcontextprotocol/sdk`.
- **Tooling**: pnpm, Biome (lint + format), Vitest.

## Commands

```bash
pnpm dev                 # app + worker + local D1 at http://localhost:5173
pnpm build               # typecheck + production build
pnpm lint / pnpm format  # Biome
pnpm test                # Vitest
pnpm cf-typegen          # regenerate worker-configuration.d.ts after editing wrangler.jsonc
pnpm db:generate         # create a SQL migration from schema.ts changes
pnpm db:migrate:local    # apply migrations to local D1
pnpm db:migrate:remote   # apply migrations to production D1
pnpm deploy              # build + deploy to Cloudflare
pnpm icons               # regenerate PNG icons from public/icon.svg
```

Local dev: `cp .dev.vars.example .dev.vars`. On localhost the API acts as `DEV_USER_EMAIL`; in production
it requires the Cloudflare Access JWT (`worker/auth.ts`) and fails closed.

Code map:
- `worker/services/*`: domain logic as `(db, userId, input)` functions. API routes (`worker/routes/`) and
  MCP tools (`worker/mcp/tools/`, served at `/mcp`) are thin wrappers over them.
- `worker/services/entries.ts` + `shared/tracking/trackers.ts`: the tracking engine (entries of
  trackers defined in code, rolled up into `metric_daily`).
- `shared/level/engine.ts` + `shared/schedule.ts`: the level engine (a level drifting per phase of the
  day, moved by entries). Water (`shared/water/model.ts`) is its first configuration.
- `shared/<feature>/`: zod schemas, DTO types (`types.ts`) and pure logic shared by PWA and Worker.
- `src/routes/`: screens; `src/features/<feature>/`: query hooks and feature components; `src/ui/`: base
  components; `src/dev/variants.tsx`: `useVariant`.

## Product and UI principles

1. **Mobile first.** Design for a phone used with one hand: works at 360px width, tap targets at least
   44px, primary actions within thumb reach (lower half of the screen), no hover-only interactions.
   Logging something common (a set, a glass of water) should take one or two taps.
2. **Minimal copy.** No text unless it is needed to understand or act. Prefer numbers, units, icons and
   layout over labels, helper text, headings, empty-state prose and confirmation messages. When in
   doubt, remove the text and see whether the screen still makes sense.
3. **Data first.** Screens mostly show the user's numbers and the controls to change them. No decoration.
4. **Flat and simple.** Solid colors, a small neutral palette with one or two accents that carry meaning
   (progress, urgency), clear typographic hierarchy, consistent spacing.
5. **Avoid generative-AI design patterns.** Review every UI change against this list and remove any
   that appear:
   - gradients (backgrounds, text, buttons), glassmorphism, blur, glow, soft multi-layer shadows
   - purple/indigo/violet default palettes, neon accents
   - everything in a large-radius card (`rounded-2xl` + shadow + border on every block)
   - sparkle/magic icons, emoji used as icons or decoration
   - hero headers, greetings ("Good morning!"), motivational slogans, marketing-style copy
   - badges and pills everywhere, decorative icon-in-a-circle next to every heading
   - centered layouts with big headings and a small subtitle
   - stock shadcn/ui look used unchanged, default Inter + gray-500 subtitle styling
   - decorative animation; only use motion that explains a state change
6. **Navigation.** The home screen is a grid of widgets, one per feature. Each widget shows a summary and
   opens that feature when tapped. No tab bar, no side menu. A single icon in the top-right corner opens
   profile/settings. Settings for a feature live inside that feature's screen.
7. **Design variants.** When building or significantly changing a UI element, implement 2–3 meaningfully
   different variants and register them with the dev variant switcher (`useVariant(key, variants)`). The
   switcher must work on the deployed app on the phone, behind a dev-mode toggle in settings, because
   mobile designs need to be judged on a real device. The maintainer picks a variant. Then delete the other
   variants and their code, and record the decision in the iteration's notes in `docs/requirements.md`.

## Open source and private data

The repository is public. Anyone must be able to deploy their own instance from it, and it must contain
nothing that identifies a real user, including the maintainer and their family.

- **Never commit personal information:** real names, emails, phone numbers, health data, photos,
  screenshots with real data, Cloudflare account/database/namespace ids, workers.dev subdomains,
  Zero Trust team names, personal URLs, or local paths such as `/Users/<name>/...`.
- **Generic defaults are fine.** Default targets (12/9 sets, 2600/2200 kcal, 180 g protein, 3 l water)
  are product defaults, not personal data.
- **Where personal values live:**
  - the deployed app's database (settings, data)
  - Cloudflare secrets and the dashboard (Access allowlist, secrets)
  - git-ignored local files: `.dev.vars`, `.private-terms`
- **Placeholders** in docs and examples: `you@example.com`, `<subdomain>`, `<team>`, `<app-host>`.
- **Seed data, fixtures and tests** use invented data only.
- **Docs** are written for anyone self-hosting: say "the user" or "people you invite", never a real
  person.
- **Git identity:** commits use a GitHub `noreply` email, never a personal email address.
- **Private-data guard:** `.githooks/pre-commit` runs `scripts/check-private.sh`. It blocks a commit
  when the staged changes or the author identity contain any term from the git-ignored `.private-terms`
  file. `pnpm check:private` scans the whole tree. Never bypass it with `--no-verify`. If it fires,
  remove the data.
- **Before publishing anything** (push, README, screenshots, issues), check it for personal data.

## Engineering rules

- **Data isolation.** Every user-owned table has `user_id`. Every query, including MCP tools, filters by
  the authenticated user's id. Never accept `user_id` from the client or from MCP tool input.
- **MCP parity.** Any data Claude may need to read or write gets an MCP tool next to the API endpoint.
  Feature work is not done until its MCP tools exist and are documented in `docs/requirements.md`.
- **Time.** Store instants as UTC. Every entry also stores the user's IANA timezone at entry time and
  the derived `local_date` (YYYY-MM-DD), because "today" and daily totals follow the user's local day
  while they travel. The client sends its timezone on each request; the server keeps the latest one on
  the user record.
- **Units.** Metric: kg, ml, kcal, grams.
- **IDs.** Generate entity IDs on the client (UUIDv7), so offline writes and retries are idempotent.
- **Reuse the shared engines.** Things the user logs go through the tracking engine (tracker + entry).
  Levels that change over time (water debt, focus energy) are configurations of the level engine.
  Every chart, period selector and aggregate goes through the metrics engine (`metric_daily` + metric
  registry). Do not build per-feature logging, simulation or charting. If an engine cannot express a
  feature, extend the engine. See "Shared engines" in docs/requirements.md.
- **Business logic** that both sides need (set budget, water accumulation, targets) lives in `shared/`
  as pure functions with unit tests.
- **Validation.** zod schemas in `shared/` are reused for API input, MCP tool input and forms.
- **Migrations** are generated with drizzle-kit and committed. Never edit an applied migration.
- **Docs.** When scope or a decision changes, update `docs/requirements.md` or `docs/architecture.md` in
  the same change.
- **Workers limits.** On the Free plan a request gets 10 ms of CPU. Keep handlers light: aggregate in
  SQL, avoid heavy JS crypto (use WebCrypto).
