# Requirements and iterations

Self-hosted personal health-tracking PWA for one person or a household. Each person has a separate,
private account.
Mobile-first, minimal, data-first UI (see principles in [CLAUDE.md](../CLAUDE.md)). The app has no AI;
Claude reads and writes data through the app's MCP server.

**Priority:** workouts → nutrition (kcal/protein) → water → focus energy, all built and used locally
first. Then deploy to Cloudflare and connect Claude, then stats, offline, WHOOP, habits, mood.

**Order of work**

| # | Iteration | Status |
|---|---|---|
| 0 | Foundation | ✅ |
| 1 | Platform base (local) | ✅ |
| 2 | Workouts | ✅ |
| 3 | Nutrition + tracking engine + local MCP server | ✅ |
| 4 | Water + level engine | ✅ |
| 5 | Focus energy | ✅ |
| 6 | Deploy to Cloudflare, login, connect Claude | next |
| 7 | Stats engine and Overview | |
| 8 | Offline-proof logging | |
| 9 | WHOOP | |
| 10 | Habits | |
| 11 | Mood and emotions | |

Until iteration 6 everything runs locally (`pnpm dev`, local D1, dev user). The phone can open the dev
server over the home network for testing (`pnpm dev --host`), but the PWA is installed for real only
after the deploy.

## Global requirements

- **Accounts:** a few users, closed registration, data never shared between accounts.
- **Navigation:** the home screen is a grid of feature widgets; tapping a widget opens the feature. No
  tabs or side menu. A top-right icon opens profile/settings. Feature settings live inside the feature.
- **Timezones:** the user's day follows the device's current timezone, so travel works.
- **Units:** kg, ml, kcal, grams. The week starts on Monday.
- **Day schedule:** one user setting, wake time and sleep time (default 07:00–23:00). Water and focus
  both use it for their day/night behaviour. Once WHOOP is connected (iteration 9), actual sleep and
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
- MCP tools are domain-named (`log_meal`, later `log_water`), so it is obvious to Claude what to call.
  Generic `log_entry` / `list_entries` tools come only with user-defined trackers, so Claude never has
  two ways to log the same thing.
- **Implementation (iteration 3):**
  - System trackers are defined in code (`shared/tracking/trackers.ts`): key, kind, unit, a zod schema
    for `data`, and a function that rolls one day's entries into `metric_daily` rows.
  - There is no `tracker` table until user-defined trackers exist.
  - All entries live in one `entry` table. `worker/services/entries.ts` provides the generic
    log/update/delete/list functions and keeps the rollups current.

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

**Implementation (iteration 4):**
- `shared/level/engine.ts`: `simulate(model, { start, entries, to, clock })`.
  - A model has bounds, a rate per hour for each phase (awake / asleep) and an `apply(level, entry)`
    effect.
  - The clock says when the phase changes (from the day schedule, `shared/schedule.ts`).
  - The result is a piecewise-linear timeline, with a point wherever a bound is hit.
- Helpers on the timeline:
  - `durationWhere` (time at or past a threshold);
  - `heldSince`;
  - `classify` (threshold rules, most severe first, with an optional minimum time; held time can be
    limited to "since the last wake");
  - `firstReach`.
- The engine has no tables: it runs on every read over the entries and settings, in the Worker and in
  the PWA.

**Extensions (iteration 5, for focus energy):**
- **Spans:** entries can run for a while (`spans: {from, to, kind}`). The rate takes the phase and the
  set of active span kinds, so drift depends on what is happening.
- **Response curves:** a rate can be affine in the level (`{base, perLevel}`, dL/dt = base +
  perLevel × L).
  - It is solved in closed form, including the time a bound is hit.
  - Curved stretches get a point every 5 minutes, so the timeline stays piecewise linear and the
    helpers still apply.
- **Daily ceiling:** a feature that restarts each day builds its model per day, with `max` set to that
  day's ceiling. No extra engine concept is needed.
- **New helpers:** `firstFall` (for forecasts) and `minLevel`.
- **Shared finalisation:** rollups that keep changing while a day is open are written once the day is
  over. `worker/services/levels.ts` handles this for any level feature: a closed day is written on the
  first read of a new day, at most 14 days back, and a write to a finalised day writes it again.

### Metrics and stats engine (rollups from iteration 2; full UI in iteration 7)

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

## Iteration 1: Platform base (local) ✅

The app shell and everything a deploy needs, running locally. The deploy itself moved to iteration 6.

- Auth code: Cloudflare Access JWT verification (fails closed) and a dev user on localhost. Testing it
  for real happens in iteration 6.
- Open-source basics: public README with self-hosting instructions, LICENSE, private-data guard
  (pre-commit check against a local, git-ignored list of private terms).
- App user record: id, email, name, timezone, day schedule.
- App shell: home widget grid (placeholders), top-right profile/settings, timezone sync.
- Design foundations: tokens (color, type, spacing), base components, anti-generative-AI review.
- Dev variant switcher (`useVariant`), usable on the phone behind a dev-mode toggle.
- PWA: manifest, proper icons (incl. Apple touch icon), app-shell caching, install on iPhone.
- Query cache persistence (offline read).

## Iteration 2: Workouts ✅

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
implemented as service functions in `worker/services/workouts.ts`; since iteration 3 they are MCP tools
(`worker/mcp/tools/workouts.ts`):

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

## Iteration 3: Nutrition + tracking engine + local MCP server ✅

Meals are logged by Claude (MCP), mostly from meal photos. The app has no meal input: it shows the
day's budget and the meals.

- **Targets** (settings screen in the app, also via MCP): workout day 2600 kcal, rest day 2200 kcal,
  protein 180 g on both. Fat and carbs are tracked but have no target.
- **Day type:** "workout" when a workout is dated that day, otherwise "rest". A manual override (toggle on
  the nutrition screen, or `set_day_type`) wins; "Auto" removes it. It decides which targets apply.
- **Nutrition screen:**
  - kcal and protein: consumed / target, plus what is left.
  - Over the kcal target shows "+150 kcal over" in the warning colour. Protein at or above target is
    "reached" (ok colour), because going over is fine.
  - Fat and carbs consumed.
  - The meals, read-only (time, name, kcal, protein); tapping one shows its items.
  - Previous and next day in the footer.
- **Home widget:** kcal left (or over) and protein left for today.
- **Photos are never stored** or sent to the app. Claude sends only the estimated numbers.
- **MCP server (local):** `/mcp` with all tools so far (workouts and nutrition).
  - Locally it acts as the dev user without OAuth (localhost and private network addresses only).
    Connect with `claude mcp add --transport http tracker-dev http://localhost:5173/mcp`.
  - In production it answers 401 until OAuth lands in iteration 6.
- **MCP tools:**
  - meals:
    - `log_meal`: name, kcal and proteinG required; fatG, carbsG, items, time and note optional. Returns
      the meal and the day's totals, so the photo flow is one call.
    - `update_meal`, `delete_meal`, `list_meals(date | from–to)`.
  - day:
    - `get_day_summary(date)`: totals, day type, targets, remaining, over, meals.
    - `list_day_summaries(from, to)`: daily totals and the targets that applied.
    - `set_day_type(date, workout | rest | auto)`.
  - targets: `get_nutrition_targets`, `set_nutrition_targets`.
  - workouts: the iteration 2 tools (`get_weekly_volume`, `list_workouts`, `get_workout`,
    `get_exercise_history`, `log_workout`, `list_exercises`, `create_exercise`, `update_exercise`,
    `archive_exercise`), plus `get_workout_settings` / `set_workout_settings`.
- **Flow:** photo → Claude estimates → `log_meal` → Claude answers with what is left today.

**Status:** done (2026-11-19).

**Implementation notes**
- Meals are entries of the `meal` tracker: kcal in `entry.value`, name, macros and items in
  `entry.data`.
- Day overrides are stored in `day_type`; days without an override follow workouts.
- Rollups in `metric_daily`:
  - `nutrition.kcal`, `nutrition.protein_g`, `nutrition.fat_g` and `nutrition.carbs_g`.
  - `nutrition.kcal_target` and `nutrition.protein_target` are written only for days with meals, so
    stats compare against the target that applied then.
- When rollups change:
  - Changing the targets updates today's rollup only.
  - Creating or deleting a workout refreshes that day's targets, since it can change the automatic day type.
- MCP:
  - Stateless Streamable HTTP via `@modelcontextprotocol/sdk`: one server per request, bound to the
    authenticated user.
  - Times are exchanged as local ISO 8601 with offset; "today" follows the user's latest timezone from
    the app.
  - Domain errors (not found, invalid) come back as tool errors.
- Home and nutrition queries refetch every time the app opens or regains focus, because Claude changes
  the data from outside the app.
- Design variants chosen (2026-11-19): nutrition summary **big** (kcal and protein side by side with
  large numbers), home tile **split** (kcal and protein as two equal numbers with bars). Rejected:
  summary bars / compact rows, kcal-led home tile.

## Iteration 4: Water (+ level engine) ✅

Water "debt" that builds up through the day and is paid off by drinking. Unlike meals, water is
logged in the app (and by Claude).

- **Settings** (water settings screen, also via MCP):
  - daily target 3000 ml, cap 500 ml;
  - night factor 0.25, urgency delay 60 min;
  - credit factor 0.3, credit cap 200 ml;
  - quick amounts 250 / 500 ml.

  The day schedule (wake and sleep time) comes from the profile.
- **Model:** one level from −credit cap to +cap. Above zero it is pending water; below zero it is credit.
  - **Rate:** pending rises at a rate that adds up to the daily target over 24 h, slower while asleep:
    - day rate = target / (awake hours + night factor × asleep hours);
    - night rate = day rate × night factor;
    - with 07:00–23:00 and 3 l, that is 167 ml/h by day and 42 ml/h at night.
  - It stops at the cap.
  - **Drinking** pays off pending first. Water beyond that becomes credit: credit + extra × 0.3, at most
    200 ml.
    - Credit is used up at the build-up rate, so it delays the next build-up.
    - Example: 500 ml when 200 ml is pending gives 90 ml credit, about 32 min of delay.
    - The whole amount counts toward the day's total.
  - **Continuity:** the level carries over between days, so the night's build-up is there at wake.
    - The simulation starts at the previous day's wake time with nothing pending.
    - Any drink larger than what is pending clears the history, so this start is effectively exact.
- **States:**
  - `ok` below the cap.
  - `recommend` at the cap.
  - `urgent` at the cap for longer than the urgency delay. The delay counts from the last wake time, so
    a night at the cap does not make the morning urgent.
  - Only urgent highlights the home tile (solid warning colour).
- **Home tile:** pending ml, today's total against the target, and a one-tap button for the first quick
  amount (a glass from home in one tap). Tapping elsewhere opens the water screen.
- **Water screen:**
  - pending, plus credit as "+90 ml ahead · 32 min";
  - today's total / target;
  - the two quick buttons and a custom amount, all in the footer;
  - undo for 5 s after a tap;
  - today's entries, each with a delete button;
  - settings.
- **Metrics:**
  - `water.intake_ml` per day;
  - `water.target_ml`, written for days with water;
  - `water.at_cap_min`, awake minutes at the cap.
- **MCP tools:**
  - `log_water(ml, time?, id?)` returns the entry and the state.
  - `delete_water(id)` and `list_water(date | from–to)`.
  - `get_water_state`: pending, credit, `buildUpAt`, state, `cappedAt`, total vs target.
  - `get_water_settings` and `set_water_settings`.

**Status:** done (2026-11-19).

**Implementation notes**
- Drinks are entries of the `water` tracker (ml in `entry.value`, no data). No new table.
- The simulation lives in `shared/water/model.ts` and runs in the Worker (MCP) and in the PWA.
  - The API returns its inputs: settings, schedule, timezone, and entries for yesterday and today.
  - The PWA runs the simulation again every minute and after every write, so pending rises live
    without refetching.
  - Writes are optimistic, with client-generated ids.
- `water.at_cap_min` keeps changing while a day is open, so it is written only for closed days.
  - On the first water read or write of a new day, the days since the last run are finalised (at most
    14, never before the first water entry).
  - A write to an already finalised day recomputes that day and the next one.
  - The last finalised date is kept in `user_setting` key `water.finalized`.
- The app's quick amount and the MCP tools go through the same `logWater` service.
- Design variants chosen (2026-11-19):
  - Water screen: today's total is the big number, with what is due below it.
  - Home tile: led by what is due, with today's total below.
  - Rejected: a water screen led by what is due (with or without a curve of the day), and a home tile
    led by the total.

## Iteration 5: Focus energy ✅

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
- state: `get_focus_state` (energy, ceiling, sleep, state, the running timer, `next`, today's
  minutes)
- logging:
  - `log_focus_session(tier deep | moderate, minutes, time?, tag?, id?)` and `log_unfocus(minutes,
    time?, id?)`, for sessions logged afterwards;
  - `start_focus(kind deep | moderate | unfocus, tag?)` and `stop_focus(time?)`, for timers;
  - `set_sleep_quality(quality, date?)`.
- entries: `list_focus(date | from–to)`, `update_focus_entry` and `delete_focus_entry`
- settings: `get_focus_settings`, `set_focus_settings`

Web Push reminders (for focus and water) are in the backlog.

**Decided details**
- **Rates:** only the first rule that applies counts, in this order:
  - unfocus restores 12 + 0.48 × energy per hour (1.0 × (0.2 + 0.8 × L/100) per minute);
  - deep focus drains 12 per hour;
  - moderate focus drains 6 per hour;
  - the awake baseline drains 3 per hour;
  - asleep, nothing changes.

  Overlapping sessions therefore take the higher drain, and unfocus pauses the drain.
- **Day start:** each day starts fresh at the wake time, from the start energy for that day's sleep.
  - Setting sleep before the wake time starts the day at that tap, and counts as awake.
  - Until sleep is set, the default (ok: start 85, ceiling 90) is assumed, and the home tile asks for
    it.
- **One timer at a time:** starting a timer stops the running one. A timer stopped within a minute was
  a mis-tap and is removed.
- **Forecast:** `next` is the next threshold crossed if the current activity continues, for example
  "↓ 40 in 1 h 20", or "↑ 40 in 12 min" during unfocus.
- **Home tile:**
  - energy, out of the day's ceiling;
  - the running timer;
  - one button that starts deep focus or stops whatever is running; until sleep is set, three sleep
    buttons take its place.
  - Suggest colours the number, recommend outlines the tile, urgent fills it with the warning colour.
- **Focus screen:**
  - the sleep picker, which stays changeable;
  - energy with the forecast, and a 0–100 bar with ticks at the thresholds;
  - today's minutes per tier;
  - the day's sessions; tap one to change its start, length or tag, or delete it;
  - in the footer: the running timer with Stop, start buttons for deep, moderate (pick a tag) and
    unfocus, and "+" to add a session afterwards;
  - settings.
- **Metrics:**
  - for every day: `focus.deep_min`, `focus.deep_sessions`, `focus.moderate_min` (dimension: tag),
    `focus.unfocus_min` and `sleep.quality` (3 good, 2 ok, 1 bad);
  - for closed days with sessions or sleep set: `focus.min_energy`, `focus.low_suggest_min`,
    `focus.low_recommend_min` and `focus.low_urgent_min` (minutes at or below each threshold, from the
    day's start until the sleep time or the end of a later session).

**Implementation notes**
- Two trackers:
  - `focus` (session): the start is in `occurred_at` and the end in `ended_at` (null while running);
    the kind and tag are in `data`;
  - `sleep` (choice): one entry per local date, value 3 / 2 / 1.
- No new table and no migration.
- The simulation is `shared/focus/model.ts`. Like water, the API returns its inputs, and the PWA runs
  it again every minute (every 15 s while a timer runs) and after optimistic writes.
- Running timers are always loaded, whatever day they started on.
- The closed-day stats are finalised through the shared `levels.ts`. The last finalised date is in
  `user_setting` key `focus.finalized`.
- Design variants chosen (2026-11-19):
  - Focus screen: energy with the forecast and a 0–100 bar with ticks at the thresholds.
  - Home tile: energy, the running timer and a 0–100 bar.
  - Rejected: a curve of the day under the number, a curve-led layout, and a tile with the forecast
    line. The curve component was removed; charts come with the stats engine (iteration 7).

**Status:** done (2026-11-19).

## Iteration 6: Deploy to Cloudflare, login, connect Claude

Everything from iterations 1–5 goes live on your own Cloudflare account.

- Cloudflare setup steps A1–A8 ([cloudflare-setup.md](cloudflare-setup.md)): account, GitHub repository
  connected to Workers Builds (deploy on every push to `main`, migrations run on deploy), free
  `*.workers.dev` address.
- **Cloudflare Access** with email one-time-code login and an email allowlist. Run the 30-minute test
  on the iPhone: log in, Add to Home Screen, reopen the next day, check the bypass for the MCP paths.
  Fall back to Better Auth (email + password) only if it fails; otherwise remove `better-auth`.
- **MCP OAuth:** `@cloudflare/workers-oauth-provider` with Access for SaaS as the identity provider
  (steps B1–B3), so claude.ai (web, desktop, mobile) and Claude Code connect with each person's own
  login.
- Install the PWA on the phone. Optional: move local test data over (`wrangler d1 export` locally,
  import remotely), or start fresh.

## Iteration 7: Stats engine and Overview

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

## Iteration 8: Offline-proof logging

Logging works with no signal (gym): mutations queue in IndexedDB and sync on reconnect, without
conflicts thanks to client-generated IDs. Includes a sync-state indicator.

## Iteration 9: WHOOP integration

Each user connects their own WHOOP via OAuth. Sync recovery, sleep, strain/cycles and workouts via cron
plus webhooks. Uses:
- show key numbers on home
- WHOOP sleep sets the focus-energy start and ceiling (replaces the manual good / ok / bad)
- WHOOP sleep and wake times replace the default day schedule
- WHOOP workouts suggest the day type

WHOOP data is exposed through our MCP for cross-feature insights.

## Iteration 10: Habits

Built on the tracking engine as check-type trackers: morning sun exposure, going to sleep early, etc.
One-tap check-off, streaks and weekly completion in the stats engine. Sleep timing can be checked against
WHOOP sleep. MCP via the generic entry tools.

## Iteration 11: Mood and emotions

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
| 2026-11-19 | Build nutrition, water and focus locally first; deploy, Access login and Claude OAuth move to iteration 6. The MCP server is built in iteration 3 and used locally until then. |
| 2026-11-19 | Meals are logged only through Claude (MCP); the app shows them read-only. The app keeps the day-type toggle and a targets screen. Meal photos are never stored. |
| 2026-11-19 | Tracking engine: system trackers are defined in code, all entries share one `entry` table; no `tracker` table and no generic entry MCP tools until user-defined trackers exist. |
| 2026-11-19 | Nutrition targets are per day type (kcal and protein for workout and rest days). Protein above target counts as reached; only kcal above target is a warning. |
| 2026-11-19 | Design: nutrition summary with big side-by-side numbers; home nutrition tile with kcal and protein as two equal numbers. |
| 2026-11-19 | Water is logged in the app (home tile one-tap button, two configurable quick amounts plus a custom amount) and by Claude. |
| 2026-11-19 | Water is one level from −credit cap to +cap and carries over between days. Urgency counts awake time since the last wake. Time at the cap is a metric written for closed days. |
| 2026-11-19 | Design: water screen led by today's total; home water tile led by what is due now. |
| 2026-11-19 | Level engine: pure simulation run on every read, in the Worker and the PWA; no tables. Session-dependent drift waits for focus energy. |
| 2026-11-19 | Focus: one timer at a time (starting one stops the running one); the home tile starts or stops deep focus; until sleep is set, "ok" is assumed. |
| 2026-11-19 | Level engine extended with spans and affine rates (response curves); a daily ceiling is the per-day model's max. Closed-day rollups are finalised by one shared mechanism for water and focus. |
| 2026-11-19 | Design: focus screen with energy, forecast and a threshold bar (no curve); home focus tile with energy and a bar. |
| 2026-11-19 | Focus energy restarts each day at wake; no carry-over. Rate precedence: unfocus, deep, moderate, baseline. Setting sleep before the wake time starts the day early. |
