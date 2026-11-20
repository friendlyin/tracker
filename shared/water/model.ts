import {
  classify,
  durationWhere,
  firstReach,
  heldSince,
  type LevelModel,
  pointsFrom,
  type Simulation,
  simulate,
} from "../level/engine";
import {
  awakeHours,
  type DaySchedule,
  isAwake,
  lastWake,
  nextPhaseChange,
  scheduleClock,
  wakeInstant,
  zonedInstant,
} from "../schedule";
import { addDays, type LocalDate, localDate } from "../time";
import type { WaterSettings } from "./settings";
import type { WaterInputsDto, WaterStateDto } from "./types";

// Water debt as a configuration of the level engine. One level L in [−creditCap, cap]: positive is
// pending water, negative is credit (drunk ahead), which is used up at the same rate pending would
// rise, so it delays the next build-up.

const HOUR = 3_600_000;

export interface Drink {
  at: number;
  ml: number;
}

/** ml per hour while awake and asleep; together they add up to the daily target over 24 h. */
export function waterRates(s: WaterSettings, sched: DaySchedule) {
  const awakeH = awakeHours(sched);
  const awake = s.targetMl / (awakeH + s.nightFactor * (24 - awakeH));
  return { awake, asleep: awake * s.nightFactor };
}

/** Drinking pays off pending first; what is left over becomes credit at the credit factor. */
export function drink(level: number, ml: number, s: WaterSettings): number {
  const pending = Math.max(level, 0);
  if (ml <= pending) return level - ml;
  const credit = Math.max(-level, 0);
  return -Math.min(s.creditCapMl, credit + (ml - pending) * s.creditFactor);
}

export function waterModel(s: WaterSettings, sched: DaySchedule): LevelModel<Drink> {
  const r = waterRates(s, sched);
  return {
    min: -s.creditCapMl,
    max: s.capMl,
    rate: (phase) => (phase === "awake" ? r.awake : r.asleep),
    apply: (level, e) => drink(level, e.ml, s),
  };
}

const drinks = (inputs: WaterInputsDto): Drink[] =>
  inputs.entries.map((e) => ({ at: e.drankAt, ml: e.ml }));

/**
 * Simulates from the wake time of the day before `date` with nothing pending. Any drink larger than
 * what is pending resets the history, so this start is effectively exact.
 */
function simulateFrom(inputs: WaterInputsDto, date: LocalDate, to: number): Simulation {
  const { settings, schedule, tz } = inputs;
  return simulate(waterModel(settings, schedule), {
    start: { at: wakeInstant(addDays(date, -1), schedule, tz), level: 0 },
    entries: drinks(inputs),
    to,
    clock: scheduleClock(schedule, tz),
  });
}

export function waterState(inputs: WaterInputsDto, now: number): WaterStateDto {
  const { settings: s, schedule, tz } = inputs;
  const date = localDate(now, tz);
  const sim = simulateFrom(inputs, date, now);
  const cap = { atLeast: s.capMl };
  const state = classify(
    sim.points,
    [
      { state: "urgent", ...cap, forMin: s.urgencyDelayMin },
      { state: "recommend", ...cap },
    ],
    // Urgency counts awake time only: the timer starts again at wake.
    lastWake(now, schedule, tz),
  );

  let buildUpAt: number | null = null;
  if (sim.level < 0) {
    const ahead = simulate(waterModel(s, schedule), {
      start: { at: now, level: sim.level },
      entries: [],
      to: now + 24 * HOUR,
      clock: scheduleClock(schedule, tz),
    });
    buildUpAt = firstReach(ahead.points, 0);
  }

  return {
    date,
    pendingMl: Math.round(Math.max(sim.level, 0)),
    creditMl: Math.round(Math.max(-sim.level, 0)),
    state,
    cappedAt: heldSince(sim.points, cap),
    buildUpAt,
    totalMl: inputs.entries.filter((e) => e.localDate === date).reduce((n, e) => n + e.ml, 0),
    targetMl: s.targetMl,
    points: pointsFrom(sim.points, zonedInstant(date, "00:00", tz)),
  };
}

/**
 * When pending water reaches the cap without drinking: the time it got there if it is at the cap
 * now, else the forecast (within 24 h); null if it doesn't.
 */
export function capReachAt(inputs: WaterInputsDto, now: number): number | null {
  const { settings: s, schedule, tz } = inputs;
  const sim = simulateFrom(inputs, localDate(now, tz), now);
  if (sim.level >= s.capMl - 1e-6) return heldSince(sim.points, { atLeast: s.capMl });
  const ahead = simulate(waterModel(s, schedule), {
    start: { at: now, level: sim.level },
    entries: [],
    to: now + 24 * HOUR,
    clock: scheduleClock(schedule, tz),
  });
  return firstReach(ahead.points, s.capMl - 1e-6);
}

/** Awake minutes of local `date` spent at the cap (a closed day; entries must cover date − 1). */
export function atCapMinutes(inputs: WaterInputsDto, date: LocalDate): number {
  const { schedule, tz } = inputs;
  const dayStart = zonedInstant(date, "00:00", tz);
  const dayEnd = zonedInstant(addDays(date, 1), "00:00", tz);
  const { points } = simulateFrom(inputs, date, dayEnd);
  const cap = { atLeast: inputs.settings.capMl };
  let ms = 0;
  for (let t = dayStart; t < dayEnd; ) {
    const next = Math.min(dayEnd, nextPhaseChange(t, schedule, tz));
    if (isAwake(t, schedule, tz)) ms += durationWhere(points, t, next, cap);
    t = next;
  }
  return Math.round(ms / 60_000);
}
