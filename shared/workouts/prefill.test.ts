import { describe, expect, it } from "vitest";
import { nextKind, prefillSet } from "./prefill";

const w = (weightKg: number | null, reps: number) => ({ kind: "working" as const, weightKg, reps });
const wu = (weightKg: number | null, reps: number) => ({ kind: "warmup" as const, weightKg, reps });

const last = [wu(40, 10), w(60, 8), w(65, 6), w(65, 5)];

describe("prefillSet", () => {
  it("follows last session set by set", () => {
    expect(prefillSet("warmup", last, [], 8)).toEqual({ weightKg: 40, reps: 10 });
    expect(prefillSet("working", last, [wu(40, 10)], 8)).toEqual({ weightKg: 60, reps: 8 });
    expect(prefillSet("working", last, [wu(40, 10), w(60, 8)], 8)).toEqual({
      weightKg: 65,
      reps: 6,
    });
  });

  it("carries today's values after a deviation", () => {
    expect(prefillSet("working", last, [w(62.5, 8)], 8)).toEqual({ weightKg: 62.5, reps: 8 });
  });

  it("repeats the last set beyond last session's count", () => {
    expect(prefillSet("working", last, [w(60, 8), w(65, 6), w(65, 5)], 8)).toEqual({
      weightKg: 65,
      reps: 5,
    });
  });

  it("uses recommended reps without history", () => {
    expect(prefillSet("working", [], [], 10)).toEqual({ weightKg: null, reps: 10 });
    expect(prefillSet("working", [], [wu(30, 10)], 10)).toEqual({ weightKg: 30, reps: 10 });
  });
});

describe("nextKind", () => {
  it("suggests warm-ups until last session's count is reached", () => {
    expect(nextKind(last, [])).toBe("warmup");
    expect(nextKind(last, [wu(40, 10)])).toBe("working");
    expect(nextKind([w(60, 8)], [])).toBe("working");
  });
});
