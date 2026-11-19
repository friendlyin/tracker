import { describe, expect, it } from "vitest";
import {
  classify,
  durationWhere,
  firstReach,
  heldSince,
  type LevelClock,
  type LevelModel,
  levelAt,
  simulate,
} from "./engine";

const H = 3_600_000;
const always: LevelClock = { phaseAt: () => "awake", nextChange: () => Number.POSITIVE_INFINITY };
const model: LevelModel<{ at: number; add: number }> = {
  min: 0,
  max: 10,
  rate: () => 2,
  apply: (l, e) => l + e.add,
};

describe("level engine", () => {
  it("drifts linearly and stops at the bound, with a point where it hits", () => {
    const sim = simulate(model, {
      start: { at: 0, level: 0 },
      entries: [],
      to: 8 * H,
      clock: always,
    });
    expect(sim.level).toBe(10);
    expect(sim.points).toEqual([
      { t: 0, level: 0 },
      { t: 5 * H, level: 10 },
      { t: 8 * H, level: 10 },
    ]);
  });

  it("applies entries as steps and clamps them", () => {
    const sim = simulate(model, {
      start: { at: 0, level: 0 },
      entries: [{ at: 2 * H, add: -100 }],
      to: 3 * H,
      clock: always,
    });
    expect(levelAt(sim.points, 2 * H)).toBe(0);
    expect(sim.level).toBe(2);
  });

  it("uses the rate of each phase", () => {
    const clock: LevelClock = {
      phaseAt: (t) => (t < H ? "awake" : "asleep"),
      nextChange: (t) => (t < H ? H : Number.POSITIVE_INFINITY),
    };
    const m = { ...model, rate: (p: string) => (p === "awake" ? 4 : 1) };
    const sim = simulate(m, { start: { at: 0, level: 0 }, entries: [], to: 3 * H, clock });
    expect(sim.level).toBe(6);
  });

  it("measures time in a range and how long it has held", () => {
    const pts = [
      { t: 0, level: 0 },
      { t: 10, level: 10 },
      { t: 20, level: 10 },
    ];
    expect(durationWhere(pts, 0, 20, { atLeast: 5 })).toBe(15);
    expect(durationWhere(pts, 0, 20, { atLeast: 10 })).toBe(10);
    expect(durationWhere(pts, 0, 20, { atMost: 5 })).toBe(5);
    expect(heldSince(pts, { atLeast: 10 })).toBe(10);
    expect(heldSince(pts, { atLeast: 5 })).toBe(5);
    expect(heldSince(pts, { atMost: 5 })).toBeNull();
    expect(firstReach(pts, 5)).toBe(5);
  });

  it("classifies with the first matching rule and a minimum held time", () => {
    const pts = [
      { t: 0, level: 10 },
      { t: 60 * 60_000, level: 10 },
    ];
    const rules = [
      { state: "urgent" as const, atLeast: 10, forMin: 60 },
      { state: "recommend" as const, atLeast: 10 },
    ];
    expect(classify(pts, rules)).toBe("urgent");
    expect(classify(pts, rules, 30 * 60_000)).toBe("recommend");
    expect(classify([{ t: 0, level: 3 }], rules)).toBe("ok");
  });
});
