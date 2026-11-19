import { describe, expect, it } from "vitest";
import { displaySets, emptyVolume, planWeek, weeklyVolume } from "./budget";
import { parseWorkoutSettings } from "./settings";

const settings = parseWorkoutSettings({});
const bench = [
  { group: "chest", contribution: 1 },
  { group: "triceps", contribution: 0.5 },
  { group: "shoulders", contribution: 0.5 },
] as const;

describe("weeklyVolume", () => {
  it("counts working sets with contributions and ignores warm-ups", () => {
    const v = weeklyVolume([
      { kind: "warmup", muscles: bench },
      { kind: "working", muscles: bench },
      { kind: "working", muscles: bench },
    ]);
    expect(v.chest).toBe(2);
    expect(v.triceps).toBe(1);
    expect(v.shoulders).toBe(1);
    expect(v.back).toBe(0);
  });
});

describe("displaySets", () => {
  it("rounds down to 0.5", () => {
    expect(displaySets(2.75)).toBe(2.5);
    expect(displaySets(3)).toBe(3);
    expect(displaySets(0.25)).toBe(0);
  });
});

describe("planWeek", () => {
  it("splits targets over planned workouts on Monday", () => {
    const plan = planWeek({
      settings,
      today: "2026-11-16",
      volume: emptyVolume(),
      volumeToday: emptyVolume(),
      workoutsBeforeToday: 0,
    });
    expect(plan.remainingWorkouts).toBe(3);
    const chest = plan.groups.find((g) => g.group === "chest");
    const biceps = plan.groups.find((g) => g.group === "biceps");
    expect(chest).toMatchObject({ target: 12, todayTarget: 4, leftToday: 4, status: "ok" });
    expect(biceps).toMatchObject({ target: 9, todayTarget: 3, status: "ok" });
    expect(plan.totals.target).toBe(5 * 12 + 3 * 9);
  });

  it("limits remaining workouts by days left and flags groups at risk", () => {
    const plan = planWeek({
      settings,
      today: "2026-11-22", // Sunday
      volume: { ...emptyVolume(), chest: 4 },
      volumeToday: emptyVolume(),
      workoutsBeforeToday: 1,
    });
    expect(plan.remainingWorkouts).toBe(1);
    const chest = plan.groups.find((g) => g.group === "chest");
    expect(chest).toMatchObject({ remaining: 8, todayTarget: 8, status: "at_risk" });
  });

  it("keeps today's target stable while logging and moves done groups last", () => {
    const plan = planWeek({
      settings,
      today: "2026-11-16",
      volume: { ...emptyVolume(), chest: 12, back: 2 },
      volumeToday: { ...emptyVolume(), chest: 12, back: 2 },
      workoutsBeforeToday: 0,
    });
    const back = plan.groups.find((g) => g.group === "back");
    expect(back).toMatchObject({ todayTarget: 4, doneToday: 2, leftToday: 2 });
    expect(plan.groups.at(-1)?.group).toBe("chest");
    const fractional = planWeek({
      settings,
      today: "2026-11-16",
      volume: { ...emptyVolume(), triceps: 1.5 },
      volumeToday: { ...emptyVolume(), triceps: 1.5 },
      workoutsBeforeToday: 0,
    });
    expect(fractional.groups.find((g) => g.group === "triceps")?.leftToday).toBe(2);
    expect(plan.groups.at(-1)?.status).toBe("done");
  });

  it("respects changed categories and workouts per week", () => {
    const custom = parseWorkoutSettings({
      workoutsPerWeek: 2,
      categories: { ...settings.categories, biceps: "major" },
    });
    const plan = planWeek({
      settings: custom,
      today: "2026-11-16",
      volume: emptyVolume(),
      volumeToday: emptyVolume(),
      workoutsBeforeToday: 0,
    });
    expect(plan.groups.find((g) => g.group === "biceps")).toMatchObject({
      target: 12,
      todayTarget: 6,
    });
  });

  it("plans the next workout once today's workout is finished", () => {
    const plan = planWeek({
      settings,
      today: "2026-11-16",
      volume: { ...emptyVolume(), chest: 4 },
      volumeToday: { ...emptyVolume(), chest: 4 },
      workoutsBeforeToday: 0,
      todayFinished: { workouts: 1 },
    });
    expect(plan.remainingWorkouts).toBe(2);
    expect(plan.groups.find((g) => g.group === "chest")).toMatchObject({
      todayTarget: 4,
      doneToday: 0,
      leftToday: 4,
    });
  });
});
