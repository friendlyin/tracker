import {
  after,
  classify,
  durationWhere,
  firstFall,
  firstReach,
  type LevelClock,
  type LevelModel,
  type LevelPoint,
  type LevelSpan,
  levelAt,
  minLevel,
  pointsFrom,
  type Simulation,
  simulate,
} from "../level/engine";
import { scheduleClock, sleepInstant, wakeDate, wakeInstant } from "../schedule";
import { addDays, type LocalDate, localDate } from "../time";
import type { FocusKind } from "./schemas";
import type { FocusSettings, SleepQuality } from "./settings";
import type { FocusEntryDto, FocusInputsDto, FocusStateDto, SleepDto } from "./types";

// Focus energy as the level engine's second configuration: 0–100, drained while awake (faster during
// focus sessions), restored by unfocus (faster when more energy is left), capped by the day's ceiling
// from sleep quality. Each day starts fresh at wake time.

const MIN = 60_000;
const HOUR = 60 * MIN;
const FORECAST_H = 12;

export const sleepValue: Record<SleepQuality, number> = { good: 3, ok: 2, bad: 1 };

/** Minutes added afterwards, without a time: applied at once when they are added. */
export interface FocusLump {
  at: number;
  kind: FocusKind;
  minutes: number;
}

/**
 * Rates per hour. Only the first that applies counts: unfocus, deep, moderate, awake baseline.
 *
 * Added minutes are a lump: the extra drain of the tier beyond the baseline (which already ran for
 * that time), or for unfocus the restore over that many minutes plus the baseline it paused.
 */
export function focusModel(s: FocusSettings, ceiling: number): LevelModel<FocusLump, FocusKind> {
  const perMin = s.restorePerMin;
  const restore = {
    base: 60 * perMin * s.restoreFloor,
    perLevel: (60 * perMin * (1 - s.restoreFloor)) / 100,
  };
  return {
    min: 0,
    max: ceiling,
    rate(phase, active) {
      if (active.has("unfocus")) return restore;
      if (active.has("deep")) return -s.drain.deep;
      if (active.has("moderate")) return -s.drain.moderate;
      return phase === "awake" ? -s.drain.baseline : 0;
    },
    apply(level, e) {
      const h = e.minutes / 60;
      if (e.kind === "unfocus")
        return after(level, restore, e.minutes * MIN) + s.drain.baseline * h;
      return level - (s.drain[e.kind] - s.drain.baseline) * h;
    },
  };
}

const sleepOn = (inputs: FocusInputsDto, date: LocalDate): SleepDto | undefined =>
  inputs.sleep.find((s) => s.date === date);

/** When the day woken up on `date` starts: the wake time, or earlier if sleep was set before it. */
function startOf(inputs: FocusInputsDto, date: LocalDate): number {
  const wake = wakeInstant(date, inputs.schedule, inputs.tz);
  const s = sleepOn(inputs, date);
  return s ? Math.min(wake, s.setAt) : wake;
}

export interface FocusDay {
  date: LocalDate;
  start: number;
  sleep: SleepQuality | null;
  startLevel: number;
  ceiling: number;
}

/** The focus day at `now`: the day of the last wake, or today once sleep is set before the wake. */
export function focusDay(inputs: FocusInputsDto, now: number): FocusDay {
  const { schedule, tz, settings } = inputs;
  const today = localDate(now, tz);
  let date = wakeDate(now, schedule, tz);
  if (date !== today && startOf(inputs, today) <= now) date = today;
  return dayOn(inputs, date, settings);
}

function dayOn(inputs: FocusInputsDto, date: LocalDate, settings: FocusSettings): FocusDay {
  const sleep = sleepOn(inputs, date)?.quality ?? null;
  const row = settings.sleep[sleep ?? settings.defaultSleep];
  return { date, start: startOf(inputs, date), sleep, startLevel: row.start, ceiling: row.ceiling };
}

/** The schedule's clock, awake from an early day start (sleep set before the wake time). */
function dayClock(inputs: FocusInputsDto, day: FocusDay): LevelClock {
  const base = scheduleClock(inputs.schedule, inputs.tz);
  const wake = wakeInstant(day.date, inputs.schedule, inputs.tz);
  if (day.start >= wake) return base;
  const early = (t: number) => t >= day.start && t < wake;
  return {
    phaseAt: (t) => (early(t) ? "awake" : base.phaseAt(t)),
    nextChange: (t) =>
      early(t)
        ? wake
        : t < day.start
          ? Math.min(day.start, base.nextChange(t))
          : base.nextChange(t),
  };
}

/** Timer sessions run over time; a running one until `openUntil`. */
const spansOf = (entries: readonly FocusEntryDto[], openUntil: number): LevelSpan<FocusKind>[] =>
  entries
    .filter((e) => e.minutes === null)
    .map((e) => ({ from: e.startedAt, to: e.endedAt ?? openUntil, kind: e.kind }));

const lumpsOf = (entries: readonly FocusEntryDto[]): FocusLump[] =>
  entries.flatMap((e) =>
    e.minutes === null ? [] : [{ at: e.startedAt, kind: e.kind, minutes: e.minutes }],
  );

export const isRunning = (e: FocusEntryDto) => e.minutes === null && e.endedAt === null;

function simulateDay(
  inputs: FocusInputsDto,
  day: FocusDay,
  to: number,
  openUntil = to,
): Simulation {
  return simulate(focusModel(inputs.settings, day.ceiling), {
    start: { at: day.start, level: day.startLevel },
    entries: lumpsOf(inputs.entries),
    spans: spansOf(inputs.entries, openUntil),
    to,
    clock: dayClock(inputs, day),
  });
}

function stateRules(s: FocusSettings) {
  const t = s.thresholds;
  return [
    { state: "urgent", atMost: t.urgent },
    { state: "recommend", atMost: t.recommend },
    { state: "suggest", atMost: t.suggest },
  ] as const;
}

/** The next state change if the current activity continues for up to 12 h. */
function forecast(
  inputs: FocusInputsDto,
  day: FocusDay,
  level: number,
  now: number,
  running: FocusEntryDto | undefined,
): FocusStateDto["next"] {
  const { settings: s } = inputs;
  const ahead = simulate(focusModel(s, day.ceiling), {
    start: { at: now, level },
    entries: [],
    spans: running ? [{ from: now, to: now + FORECAST_H * HOUR, kind: running.kind }] : [],
    to: now + FORECAST_H * HOUR,
    clock: dayClock(inputs, day),
  });
  const rules = stateRules(s);
  if (running?.kind === "unfocus") {
    // Rising: past the lowest threshold still at or above the level, into the state above it.
    const k = rules.findIndex((r) => level <= r.atMost);
    const r = rules[k];
    if (!r) return null;
    const at = firstReach(ahead.points, r.atMost + 1e-6, now);
    return at === null
      ? null
      : { state: rules[k + 1]?.state ?? "ok", level: r.atMost, reachedAt: at };
  }
  // Falling: the highest threshold below the level.
  for (const r of [...rules].reverse()) {
    if (level > r.atMost) {
      const at = firstFall(ahead.points, r.atMost, now);
      return at === null ? null : { state: r.state, level: r.atMost, reachedAt: at };
    }
  }
  return null;
}

const minutesIn = (e: FocusEntryDto, from: number, to: number) =>
  e.minutes ?? Math.max(0, Math.min(e.endedAt ?? to, to) - Math.max(e.startedAt, from)) / MIN;

export function focusState(inputs: FocusInputsDto, now: number): FocusStateDto {
  const day = focusDay(inputs, now);
  const sim = simulateDay(inputs, day, now);
  const running = inputs.entries
    .filter((e) => isRunning(e) && e.startedAt <= now)
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  const mine = inputs.entries.filter((e) => e.startedAt >= day.start && e.startedAt <= now);
  const sum = (k: FocusKind) =>
    Math.round(
      mine.filter((e) => e.kind === k).reduce((n, e) => n + minutesIn(e, day.start, now), 0),
    );

  return {
    date: day.date,
    dayStartedAt: day.start,
    energy: Math.round(sim.level),
    ceiling: day.ceiling,
    sleep: day.sleep,
    state: classify(sim.points, stateRules(inputs.settings)),
    running: running
      ? {
          id: running.id,
          kind: running.kind,
          tag: running.tag,
          startedAt: running.startedAt,
          targetMin: running.targetMin,
        }
      : null,
    next: forecast(inputs, day, sim.level, now, running),
    deepMin: sum("deep"),
    deepSessions: mine.filter((e) => e.kind === "deep").length,
    moderateMin: sum("moderate"),
    unfocusMin: sum("unfocus"),
    points: pointsFrom(sim.points, day.start),
  };
}

/** The level just before and just after the step at `t` (the same when there is none). */
function stepAt(points: readonly LevelPoint[], t: number): [number, number] {
  const at = points.filter((p) => p.t === t);
  const first = at[0];
  const last = at[at.length - 1];
  if (!first || !last) return [levelAt(points, t), levelAt(points, t)];
  return [first.level, last.level];
}

/**
 * How much each of the current day's entries moved energy: the total change while it ran, including
 * the normal awake drain, so it matches the bar. A timer: the level at its end (or `now`) minus the
 * level at its start. Added minutes apply at once as the drain beyond the baseline (or the restore
 * plus the paused baseline), so the baseline for that time is added back to give the same total.
 */
export function entryEffects(inputs: FocusInputsDto, now: number): Map<string, number> {
  const day = focusDay(inputs, now);
  const { points } = simulateDay(inputs, day, now);
  const baseline = inputs.settings.drain.baseline;
  const effects = new Map<string, number>();
  for (const e of inputs.entries) {
    if (e.startedAt < day.start || e.startedAt > now) continue;
    if (e.minutes === null) {
      const end = Math.min(e.endedAt ?? now, now);
      effects.set(e.id, levelAt(points, end) - levelAt(points, e.startedAt));
    } else {
      const [before, after] = stepAt(points, e.startedAt);
      const step = after - before;
      // Capped at the ceiling: the step is what the bar shows, as for a timer that reaches it.
      const capped = e.kind === "unfocus" && after >= day.ceiling - 1e-9;
      effects.set(e.id, capped ? step : step - (baseline * e.minutes) / 60);
    }
  }
  return effects;
}

export interface FocusDayStats {
  minEnergy: number;
  /** Minutes at or below each threshold. */
  lowMin: { suggest: number; recommend: number; urgent: number };
}

/**
 * A closed day: from its start to the sleep time (or the end of a later session), and never past
 * the next day's start. Inputs must cover `date` and the day after.
 */
export function focusDayStats(inputs: FocusInputsDto, date: LocalDate): FocusDayStats {
  const { settings: s, schedule, tz } = inputs;
  const day = dayOn(inputs, date, s);
  const next = startOf(inputs, addDays(date, 1));
  const lastEnd = Math.max(
    0,
    ...inputs.entries
      .filter((e) => e.startedAt >= day.start && e.startedAt < next)
      .map((e) => e.endedAt ?? e.startedAt),
  );
  const end = Math.min(next, Math.max(sleepInstant(date, schedule, tz), lastEnd));
  const { points } = simulateDay(inputs, day, end);
  const low = (atMost: number) =>
    Math.round(durationWhere(points, day.start, end, { atMost }) / MIN);
  return {
    minEnergy: Math.round(minLevel(points, day.start, end)),
    lowMin: {
      suggest: low(s.thresholds.suggest),
      recommend: low(s.thresholds.recommend),
      urgent: low(s.thresholds.urgent),
    },
  };
}
