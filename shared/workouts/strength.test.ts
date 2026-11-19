import { describe, expect, it } from "vitest";
import { bestE1rm, e1rm, topSet } from "./strength";

describe("strength", () => {
  it("estimates 1RM with Epley", () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 10)).toBeCloseTo(133.33, 1);
    expect(e1rm(0, 10)).toBe(0);
  });

  it("finds the top set and best e1RM", () => {
    const sets = [
      { reps: 10, weightKg: 80 },
      { reps: 5, weightKg: 90 },
      { reps: 8, weightKg: 90 },
      { reps: 12, weightKg: null },
    ];
    expect(topSet(sets)).toEqual({ reps: 8, weightKg: 90 });
    expect(bestE1rm(sets)).toBeCloseTo(114, 0);
  });
});
