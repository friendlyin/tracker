import { describe, expect, it } from "vitest";
import { dayStatus, isDue, minutesLeft, progress, weekDots } from "./logic";
import { EVERY_DAY } from "./schemas";
import type { HabitDto, HabitEntryDto } from "./types";

const MIN = 60_000;
const habit = (p: Partial<HabitDto> & Pick<HabitDto, "id" | "kind">): HabitDto => ({
  name: p.id,
  target: null,
  unit: null,
  focus: null,
  days: EVERY_DAY,
  position: 0,
  createdAt: 0,
  ...p,
});
const entry = (p: Partial<HabitEntryDto> & Pick<HabitEntryDto, "habitId">): HabitEntryDto => ({
  id: `${p.habitId}-${p.at ?? 0}`,
  at: 0,
  endedAt: null,
  amount: null,
  session: false,
  targetMin: null,
  source: "app",
  ...p,
});

const meditate = habit({ id: "m", kind: "time", target: 10, focus: "moderate" });
const pushups = habit({ id: "p", kind: "count", target: 50, days: 1 | 4 | 16 }); // Mon Wed Fri
const sun = habit({ id: "s", kind: "check" });

describe("habits", () => {
  it("is due on its weekdays", () => {
    expect(isDue(pushups, "2026-11-16")).toBe(true); // Monday
    expect(isDue(pushups, "2026-11-17")).toBe(false);
    expect(isDue(pushups, "2026-11-20")).toBe(true); // Friday
    expect(isDue(meditate, "2026-11-22")).toBe(true); // Sunday
  });

  it("adds amounts, and a running timer's minutes so far", () => {
    const es = [
      entry({ habitId: "m", amount: 4, session: true }),
      entry({ habitId: "m", at: 10 * MIN, session: true }),
      entry({ habitId: "p", amount: 20 }),
    ];
    expect(progress("m", es, 13 * MIN)).toBe(7);
    expect(minutesLeft(meditate, 7)).toBe(3);
    expect(minutesLeft(meditate, 12)).toBe(1);
  });

  it("counts the day's due habits that are done", () => {
    const es = [entry({ habitId: "s", amount: 1 }), entry({ habitId: "p", amount: 30 })];
    expect(dayStatus([meditate, pushups, sun], "2026-11-20", es, 0)).toEqual({
      due: 3,
      done: 1,
      left: 2,
    });
    // Saturday: push-ups aren't due.
    expect(dayStatus([meditate, pushups, sun], "2026-11-21", [], 0)).toEqual({
      due: 2,
      done: 0,
      left: 2,
    });
  });

  it("marks the week", () => {
    const week = { "2026-11-16": { p: 50 }, "2026-11-17": { p: 10 } };
    expect(weekDots(pushups, "2026-11-18", week, 0)).toEqual([
      "done",
      "off",
      "due",
      "off",
      "due",
      "off",
      "off",
    ]);
    expect(weekDots(sun, "2026-11-18", {}, 1)).toEqual([
      "missed",
      "missed",
      "done",
      "due",
      "due",
      "due",
      "due",
    ]);
    // Created on Wednesday: Monday and Tuesday weren't missed.
    expect(weekDots(sun, "2026-11-18", {}, 0, "2026-11-18")[0]).toBe("off");
  });
});
