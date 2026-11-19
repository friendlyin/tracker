# Requirements and iterations

Self-hosted personal health-tracking PWA for one person or a household. Each person has a separate,
private account.
Mobile-first, minimal, data-first UI (see principles in [CLAUDE.md](../CLAUDE.md)). The app has no AI;
Claude reads and writes data through the app's MCP server.

**Priority:** workouts → nutrition (kcal/protein) → water → focus energy. Then stats, offline, WHOOP,
habits, mood.

## Global requirements

- **Accounts:** a few users, closed registration, data never shared between accounts.
- **Navigation:** the home screen is a grid of feature widgets; tapping a widget opens the feature. No
  tabs or side menu. A top-right icon opens profile/settings. Feature settings live inside the feature.
- **Timezones:** the user's day follows the device's current timezone, so travel works.
- **Units:** kg, ml, kcal, grams. The week starts on Monday.
- **Day schedule:** one user setting, wake time and sleep time (default 07:00–23:00). Water and focus
  both use it for their day/night behaviour. Once WHOOP is connected (iteration 8), actual sleep and
  wake times replace these defaults day by day.
- **MCP:** the app exposes an authenticated MCP server so Claude can read data (for insights) and
  write data (meals, exercises, targets, etc.).
- **Design process:** UI elements are built in 2–3 variants with an in-app switcher; the maintainer picks one.
- **Open source:** the repository is public from day one. It contains no personal information about
  any user: no names, emails, health data, account ids or personal URLs. Default settings are generic
  product defaults, not personal data. Personal values live only in the deployed app's database,
  Cloudflare secrets and dashboard, and git-ignored local files. See "Open source and private data" in
  CLAUDE.md.
- **Shared engines:** features are built on three shared engines (below), not on one-off logic.
  A new tracker or chart should mostly be configuration.

## Shared engines

Each engine is built together with its first real feature and generalised when the second feature uses
it. Engines are not built up front without a user.

### Tracking engine (first user: nutrition, iteration 3)

One model for "things the user logs".
- **Tracker:** a definition with key, kind, unit, settings and targets. System trackers include water,
  meal, focus session, unfocus, sleep quality and habits. User-defined trackers come later.
- **Entry:** one logged event, stored the same way for every tracker: tracker, time (UTC + timezone +
  local date), value, duration or start/end, tags, note, data (JSON for tracker-specific fields such as
  meal macros), source (app / mcp / whoop).
- **Entry kinds:**
  - **quantity:** water ml, meal kcal and macros
  - **session:** deep focus, moderate focus, unfocus; with a start/stop timer or minutes added
    afterwards
  - **check:** habit done
  - **choice/scale:** sleep quality, mood
- Shared UI building blocks: quick-log buttons, timer, entry list with edit/undo.
- Shared MCP tools: `log_entry`, `update_entry`, `delete_entry`, `list_entries`. Domain-named wrappers
  such as `log_meal` and `log_water` make it obvious to Claude what to call.

Workouts keep their own tables (exercises, sets, warm-ups need more structure), but they feed the same
metrics engine.

### Level engine (first user: water, iteration 4; second: focus energy, iteration 5)

A level that changes over time on its own and is moved by entries. It is a pure function in `shared/`:
`simulate(config, entries, from, to)` returns the level timeline, the current value and the state.
- **Drift:** change per hour, which can differ between day and night (from the day schedule) and while a
  session is active (deep focus drains fastest, moderate focus less).
- **Effects:** how an entry changes the level, with an optional response curve (for example, unfocus
  restores more when energy is higher).
- **Bounds:** min, max, and a per-day ceiling (bad sleep lowers the ceiling).
- **Daily start:** start value at wake time (for focus, set by sleep quality).
- **States:** thresholds that map the level to `ok / suggest / recommend / urgent`, including
  "stayed at threshold longer than N minutes" (water urgency).
- The home widget, feature screen and MCP state tool all read the same simulation output.

Water is a debt that rises over time and drinking lowers it. Focus energy falls over time and unfocus
and sleep raise it. Both are configurations of this one engine.

### Metrics and stats engine (rollups from iteration 2; full UI in iteration 6)

- **Metric registry:** each feature registers metrics with an id, unit, daily aggregation (sum / avg /
  min / max / last / count), an optional target (can depend on the day, e.g. workout vs rest day),
  which direction is better, and optional dimensions (muscle group, exercise).
- **Daily rollup:** a `metric_daily` table (user, local date, metric, dimension → value) updated on
  every write. Every stats query reads this small table, which keeps D1 reads and CPU low.
- **Periods:** week, month (default), 3 months, 6 months, year. Buckets adjust automatically: days for
  short periods, weeks or months for long ones, showing totals or daily averages.
- **Chart primitives**, shared everywhere: bars/line against a target, progress bar or ring, sparkline,
  calendar heatmap.
- **Views:**
  - Feature stats screens are presets (a list of metrics) over the same engine.
  - An **Overview** screen shows all features for the selected period on one shared time axis. Tapping
    a day shows that day across all features.
- **MCP:** `list_metrics`, `get_metrics(metrics, period, bucket)`. One generic tool lets Claude analyse
  across features.

---

## Iteration 0: Foundation ✅

Project scaffold (React + Vite + Cloudflare Worker + D1), dependencies, git repository, project
principles (`CLAUDE.md`), infrastructure analysis and these docs.

## Iteration 1: Platform base

Deployed, installable, logged-in empty app.

**Status:** code done (2026-11-19). Waiting for the first deploy and the 30-minute Access test on the
iPhone (setup steps A1–A8). If the test passes, remove the `better-auth` dependency.

- GitHub repository + automatic deploys on push to `main` (Workers Builds), with migrations run on
  deploy. Free `*.workers.dev` address (no custom domain for now).
- Auth: **Cloudflare Access** with email one-time-code login and an email allowlist (see
  [architecture.md §3](architecture.md#3-authentication)). Start with the 30-minute test on the iPhone;
  fall back to Better Auth (email + password) only if it fails.
- Open-source basics: public README with self-hosting instructions, LICENSE, private-data guard
  (pre-commit check against a local, git-ignored list of private terms).
- App user record: id, email, name, timezone, day schedule.
- App shell: home widget grid (placeholders), top-right profile/settings, timezone sync.
- Design foundations: tokens (color, type, spacing), base components, anti-generative-AI review.
- Dev variant switcher (`useVariant`), usable on the phone behind a dev-mode toggle.
- PWA: manifest, proper icons (incl. Apple touch icon), app-shell caching, install on iPhone.
- Query cache persistence (offline read).

## Iteration 2: Workouts

Weekly-volume-driven gym logging where exercises are chosen in the gym.

**Muscle groups and targets**
- 8 groups: chest, back, shoulders, biceps, triceps, quads, hamstrings & glutes, core.
- Each group is **major** or **minor**. Weekly working-set targets are set per category in settings:
  major 12, minor 9. The category of each group can be changed in settings.
  Default: minor = biceps, triceps, core; major = chest, back, shoulders, quads, hamstrings & glutes.

**Exercises and muscle contributions**
- Each exercise has a contribution per muscle group: 1.0 for primary groups, 0.5 for secondary (0.25
  allowed for minor involvement). Example: bench press = chest 1.0, triceps 0.5, shoulders 0.5.
- Weekly sets for a group = Σ (working sets × contribution). Shown in 0.5 steps.
- Seeded library of basic exercises with contributions, recommended sets and reps.
- Add a custom exercise in the gym: name, muscle contributions (primary group required, secondary
  optional), recommended sets and reps.

**Sets**
- Each set is **warm-up** or **working**, with reps × weight (weight optional for bodyweight).
- Warm-ups are optional per exercise. They are recorded and shown as a reference (what weight to warm up
  with) but **do not count** toward weekly targets.

**Weekly budget and recommendations**
- Per group: working sets done vs target this week (Mon–Sun), remaining sets.
- Suggested sets today = remaining ÷ remaining planned workouts this week (workouts/week setting,
  default 3).
- Groups that are already complete drop to the bottom. Groups at risk (many sets left, few days left)
  are highlighted.

**Workout flow**
1. Start a workout.
2. The workout screen shows groups by priority, with today's suggested sets.
3. Tap a group to open its exercise list, most-used first.
4. Tap an exercise to open the logging screen. It shows the recommended sets × reps and the previous
   result for this exercise (warm-ups and working sets with reps and weight). Inputs are prefilled from
   the previous result, so a matching set is one tap.
5. Go back and add more exercises. Several per group are allowed.
6. Finish the workout. It becomes the baseline for next time and feeds stats.

**Other**
- Settings: targets per category, group categories, workouts per week, program mode (default
  "full body"; upper/lower and focus modes are in the backlog, and the data model is ready for them).
- Home widget: working sets done this week / remaining this week.
- Metrics: workouts count, working sets per group, per-exercise top set and estimated 1RM (lets weight
  progress be compared across different rep counts).
- MCP:
  - workout data: `get_weekly_volume`, `list_workouts(period)`, `get_workout(date)`,
    `get_exercise_history`, `log_workout`
  - exercise library: `list_exercises`, `create_exercise`, `update_exercise` (incl. muscle
    contributions), `archive_exercise`

**Status:** done (2026-11-19). The MCP tools above are
implemented as service functions in `worker/services/workouts.ts` and become MCP tools in iteration 3:

| MCP tool | Service function |
|---|---|
| `get_weekly_volume` | `getWeekPlan` |
| `list_workouts(period)` | `listWorkouts({ from, to })` |
| `get_workout(date)` | `listWorkouts` for the date + `getWorkout` |
| `get_exercise_history` | `getExerciseHistory` |
| `log_workout` | `logWorkout` |
| `list_exercises` / `create_exercise` / `update_exercise` / `archive_exercise` | same names |

**Implementation notes**
- Weekly sets per group are floored to 0.5 for display. Today's suggested sets are rounded up to whole
  sets.
- Remaining planned workouts = max(1, min(workouts per week − workouts done, days left in the week)).
  While a workout is active, today counts as one of them. Once today's workout is finished, the plan
  moves on to the next workout.
- Suggested today = what was left before today's workouts ÷ remaining planned workouts, rounded up, so
  it stays stable while logging. A group is at risk when that exceeds 1.5× a normal session
  (target ÷ workouts per week).
- Order: groups with sets left today first, then by remaining sets; completed groups last.
- Group screen: primary exercises (contribution 1.0) first, then secondary ones; each list is most-used
  first (working sets in the last 8 weeks, then all time).
- Logging prefill: follows last session's set at the same position, carries today's values after a
  deviation (`shared/workouts/prefill.ts`). The default set kind is warm-up until last session's number
  of warm-ups is reached. No automatic weight progression.
- Logging the first set starts a workout automatically. A workout with no new set for 3 h is closed at
  its last set; a workout finished without sets is deleted.
- Weight steps: 2.5 kg for barbell and machine, 1 kg for dumbbell (per dumbbell) and cable.
- Design variants chosen (2026-11-19): home grid **tiles** (2-column square widgets), budget list
  **grid** (2-column cells per muscle group), set entry **steppers** (− / + around kg and reps).
  Rejected: home rows / lead, budget bars / big numbers, on-screen keypad.

## Iteration 3: Nutrition + MCP server (+ tracking engine)

Meals are logged mostly by Claude from meal photos; the app shows the daily budget.

- **Targets** (settings, also via MCP): workout day 2600 kcal, rest day 2200 kcal, protein 180 g every
  day. Fat and carbs are tracked but have no target.
- **Day type:** set automatically to "workout" when a workout is logged that day; manual override with a
  toggle on the nutrition screen. It decides which targets apply.
- **Today view:** consumed vs target and remaining for kcal and protein; fat and carbs consumed; list of
  meals (edit/delete, quick manual add).
- **Home widget:** remaining kcal and protein for today.
- **MCP server:** OAuth-protected `/mcp` endpoint; connection guide for claude.ai and Claude Code.
- **MCP tools:**
  - meals: `log_meal` (name, time, kcal, protein, fat, carbs, optional item breakdown), `update_meal`,
    `delete_meal`, `list_meals(date)`
  - day: `get_day_summary(date)` (totals, targets, remaining), `set_day_type`
  - targets: `get_nutrition_targets`, `set_nutrition_targets`
- **Flow:** photo → Claude estimates → Claude calls `log_meal` → Claude answers with the day's running
  total from `get_day_summary`.
- Introduces the tracking engine (meal is its first tracker).

## Iteration 4: Water (+ level engine)

Water "debt" that builds up through the day and is paid off by drinking.

- **Settings:** daily target (litres, e.g. 3 l), cap 500 ml, night factor 0.25, urgency delay 60 min, credit
  factor 0.3, credit cap 200 ml. The day schedule comes from the user setting.
- **Rate:** pending water rises at a rate that adds up to the daily target over 24 h. It rises slower
  at night (night rate = day rate × night factor) and stops at the cap.
- **Drinking** lowers pending. If the user drinks more than is pending, the extra counts toward the daily total
  and creates a small **credit** that delays the next build-up: credit = min(extra × 0.3, 200 ml).
  Example: 500 ml when 200 ml is pending gives 90 ml credit, about 30 min of delay.
- **Urgency:** pending sitting at the cap for longer than the urgency delay highlights the home widget.
- **UI:** current pending, today's total vs target, one-tap amounts (e.g. 250 / 500 ml), undo.
- **Metrics:** intake per day, time spent at cap.
- **MCP:** `log_water`, `get_water_state`, `get_water_settings`, `set_water_settings`.

## Iteration 5: Focus energy

The problem: knowledge work often means long stretches of focus and information intake without
deliberate unfocus, and the need for a break is noticed only when already exhausted. The app models a **focus energy** level and prompts for unfocus *before* it runs
out. It is a second configuration of the level engine.

**Model** (proposed defaults, all configurable; calibrate after 1–2 weeks of use)
- Scale 0–100.
- **Sleep** sets the day's start and ceiling. One tap in the morning:

  | Sleep | Start | Ceiling |
  |---|---|---|
  | good | 100 | 100 |
  | ok | 85 | 90 |
  | bad | 70 | 80 |

  Energy can never go above the day's ceiling. Later WHOOP sleep
  performance and recovery replace the manual choice.
- **Drain** while awake depends on what is happening. Three tiers, each a rate in total (not added on
  top of each other):

  | Tier | Examples | Drain per hour |
  |---|---|---|
  | baseline | ordinary activity, chores, commuting | 3 |
  | moderate focus | podcasts, films/series, reading | 6 |
  | deep focus | focused work or study sessions | 12 |

  If sessions overlap, the higher drain applies. The examples are tags on moderate sessions and can be
  edited in settings.
- **Unfocus restores** energy, and it works better when there is more energy left:
  restore per minute = 1.0 × (0.2 + 0.8 × level/100).
  - At 0% it takes about 5 min to gain 1 point.
  - At 40% one minute gives about 0.5 points.
  - At 80% one minute gives about 0.85 points.
  - Passive drain pauses during unfocus.
- **States:** ≤ 60 suggest (subtle), ≤ 40 recommend (widget highlighted), ≤ 20 urgent (strong
  highlight). The prompt comes well before zero.
- Example day: 07:00 good sleep = 100 → 1 h ordinary → 97 → 3 h focus → 61 (suggest) → 1 h ordinary
  → 58 → 2 h focus → 34 (recommend) → 20 min unfocus → ~44 → 2 h film (moderate) → 32.

**Logging**
- Deep and moderate focus sessions: both a live start/stop timer and adding afterwards (start time +
  minutes) are first-class. A moderate session has a tag (podcast, film, reading, ...).
- Unfocus: add minutes (or timer); optional type tag later (walk, nap/NSDR, meditation, nature).
- Sleep quality: one tap (good / ok / bad); the focus widget asks for it until it is set for the day.

**Views**
- Home widget: current energy and state.
- Focus screen: level curve for today, sessions by tier, unfocus minutes, quick actions.
- Metrics: deep focus minutes and sessions, moderate focus minutes (by tag), unfocus minutes, lowest
  energy, time below each threshold.

**MCP**
- state: `get_focus_state`
- logging: `log_focus_session` (tier deep / moderate, optional tag), `start_focus` / `stop_focus`
  (with tier), `log_unfocus`, `set_sleep_quality`
- settings: `get_focus_settings`, `set_focus_settings`

Web Push reminders (for focus and water) are in the backlog.

## Iteration 6: Stats engine and Overview

The full metrics UI on top of the rollups that features have been writing since iteration 2:
- one period selector
- shared chart primitives
- feature stats screens as presets

Workouts preset:
- workouts on a timeline
- weight / estimated-1RM progression per exercise
- aggregated progression per muscle group, i.e. average change across its exercises (improving or not,
  by how much)

Nutrition, water and focus presets show daily (or averaged) values against targets.

Overview: all features in one screen for the selected period, plus a day detail view.

MCP: `list_metrics`, `get_metrics` for cross-feature insights.

## Iteration 7: Offline-proof logging

Logging works with no signal (gym): mutations queue in IndexedDB and sync on reconnect, without
conflicts thanks to client-generated IDs. Includes a sync-state indicator.

## Iteration 8: WHOOP integration

Each user connects their own WHOOP via OAuth. Sync recovery, sleep, strain/cycles and workouts via cron
plus webhooks. Uses:
- show key numbers on home
- WHOOP sleep sets the focus-energy start and ceiling (replaces the manual good / ok / bad)
- WHOOP sleep and wake times replace the default day schedule
- WHOOP workouts suggest the day type

WHOOP data is exposed through our MCP for cross-feature insights.

## Iteration 9: Habits

Built on the tracking engine as check-type trackers: morning sun exposure, going to sleep early, etc.
One-tap check-off, streaks and weekly completion in the stats engine. Sleep timing can be checked against
WHOOP sleep. MCP via the generic entry tools.

## Iteration 10: Mood and emotions

Quick check-ins built on the tracking engine:
- how the user feels (UI to explore with variants, e.g. a valence/energy grid)
- why (tags + optional note)
- what affected the mood

Trends come from the stats engine. Claude can correlate mood with sleep, workouts and focus via MCP.

## Backlog

- Workout program modes: upper/lower split, focus on chosen groups.
- Body weight tracking (useful for protein targets and progress).
- Passkey login.
- Web Push reminders (water urgency, focus energy).
- Custom domain (later; reconnect Claude and reinstall the PWA when switching).
- Data export (CSV/JSON).

---

## Decisions log

| Date | Decision |
|---|---|
| 2026-11-19 | Hosting on Cloudflare (Workers + D1), free `workers.dev` address, automatic deploys from GitHub. |
| 2026-11-19 | Units kg/ml, week starts Monday. Water cap 500 ml. |
| 2026-11-19 | 8 muscle groups split into major (12 sets/week) and minor (9 sets/week), configurable. Secondary muscles count with fractional contributions per exercise. |
| 2026-11-19 | Warm-up and working sets are separate; only working sets count toward targets. |
| 2026-11-19 | Day type switches to "workout" automatically when a workout is logged. |
| 2026-11-19 | Drinking above pending gives a small, capped credit. |
| 2026-11-19 | Focus energy is priority 4, before stats. |
| 2026-11-19 | Shared tracking, level and metrics engines instead of per-feature logic. |
| 2026-11-19 | Auth: Cloudflare Access with email-code login; Better Auth only as fallback. |
| 2026-11-19 | Minor groups: biceps, triceps, core. |
| 2026-11-19 | Day schedule defaults 07:00–23:00, later replaced by WHOOP sleep data. |
| 2026-11-19 | Sleep quality: good / ok / bad. Focus sessions: live timer and logging afterwards. |
| 2026-11-19 | Focus drain has three tiers: baseline 3/h, moderate focus 6/h (podcasts, films, reading), deep focus 12/h. |
| 2026-11-19 | Open source from the start; no personal information in the repository or git history. |
| 2026-11-19 | App name "Tracker". Light and dark themes follow the system. |
| 2026-11-19 | Workout MCP tools are built as service functions in iteration 2 and exposed when the MCP server lands in iteration 3. |
| 2026-11-19 | No automatic weight progression; the logger prefills last session's values. |
| 2026-11-19 | Muscle groups are fixed keys; categories and targets are user settings. The seed exercise library is copied per user, so every exercise is editable. |
| 2026-11-19 | A new user row is created on first login with a valid Access token; the Access allowlist is the only gate. |
| 2026-11-19 | Design: home tiles, two-column budget grid, stepper set entry. |
