import { describe, expect, it } from "vitest";
import {
  classify,
  durationWhere,
  firstFall,
  firstReach,
  heldSince,
  type LevelClock,
  type LevelModel,
  levelAt,
  minLevel,
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

  it("solves affine rates in closed form and stops at the bound", () => {
    // dL/dt = 12 + 0.48 L per hour: from 34 for 20 min gives (34 + 25) e^0.16 − 25.
    const m: LevelModel<{ at: number }, "rest"> = {
      min: 0,
      max: 100,
      rate: (_p, active) => (active.has("rest") ? { base: 12, perLevel: 0.48 } : 0),
      apply: (l) => l,
    };
    const run = (level: number, min: number) =>
      simulate(m, {
        start: { at: 0, level },
        entries: [],
        spans: [{ from: 0, to: min * 60_000, kind: "rest" }],
        to: 2 * H,
        clock: always,
      });
    expect(run(34, 20).level).toBeCloseTo(59 * Math.exp(0.16) - 25, 9);
    // Points every 5 minutes keep the curve piecewise linear.
    expect(run(34, 20).points.filter((p) => p.t > 0 && p.t < 20 * 60_000)).toHaveLength(3);
    const capped = run(90, 120);
    expect(capped.level).toBe(100);
    const hit = (Math.log(125 / 115) / 0.48) * H;
    expect(capped.points.find((p) => p.level === 100)?.t).toBeCloseTo(hit, 0);
  });

  it("switches rates at span edges", () => {
    const m: LevelModel<{ at: number }, "a" | "b"> = {
      min: 0,
      max: 100,
      rate: (_p, active) => (active.has("a") ? -10 : active.has("b") ? -5 : -1),
      apply: (l) => l,
    };
    const sim = simulate(m, {
      start: { at: 0, level: 100 },
      entries: [],
      spans: [
        { from: H, to: 3 * H, kind: "b" },
        { from: 2 * H, to: 4 * H, kind: "a" },
      ],
      to: 5 * H,
      clock: always,
    });
    // 1 h baseline, 1 h b, 2 h a (wins over b), 1 h baseline.
    expect(sim.level).toBe(100 - 1 - 5 - 20 - 1);
    expect(firstFall(sim.points, 90)).toBeCloseTo(2.4 * H, 0);
    expect(minLevel(sim.points, 0, 5 * H)).toBe(73);
  });
});
