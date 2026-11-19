import { describe, expect, it } from "vitest";
import { progression, trend } from "./progress";

const pts = (...values: number[]) =>
  values.map((value, i) => ({ date: `2026-11-${String(2 + i * 3).padStart(2, "0")}`, value }));

describe("progress", () => {
  it("needs three sessions", () => {
    expect(trend(pts(100, 110))).toBeNull();
  });

  it("is flat for a flat series and ignores one off day", () => {
    expect(trend(pts(100, 100, 100, 100))?.changePct).toBeCloseTo(0);
    const t = trend(pts(100, 100, 80, 100, 100));
    expect(Math.abs(t?.changePct ?? 99)).toBeLessThan(1);
  });

  it("measures rising and falling trends from first to last session", () => {
    expect(trend(pts(100, 105, 110))?.changePct).toBeCloseTo(10);
    expect(trend(pts(100, 95, 90))?.changePct).toBeCloseTo(-10);
  });

  it("uses reps for exercises without weight and averages primary exercises per group", () => {
    const exercises = [
      {
        id: "bench",
        name: "Bench",
        muscles: [
          { group: "chest", contribution: 1 },
          { group: "triceps", contribution: 0.5 },
        ],
      },
      { id: "fly", name: "Fly", muscles: [{ group: "chest", contribution: 1 }] },
      { id: "dips", name: "Dips", muscles: [{ group: "triceps", contribution: 1 }] },
    ];
    const rows = [
      ...pts(100, 105, 110).map((p) => ({
        exerciseId: "bench",
        date: p.date,
        e1rm: p.value,
        topSet: p.value - 20,
        reps: 5,
      })),
      ...pts(50, 50, 50).map((p) => ({ exerciseId: "fly", date: p.date, e1rm: p.value, reps: 10 })),
      ...pts(10, 11, 12).map((p) => ({ exerciseId: "dips", date: p.date, reps: p.value })),
    ];
    const r = progression(exercises, rows);
    const dips = r.exercises.find((e) => e.exerciseId === "dips");
    expect(dips?.measure).toBe("reps");
    expect(dips?.trend?.changePct).toBeCloseTo(20);
    expect(r.exercises.find((e) => e.exerciseId === "bench")?.topSets).toHaveLength(3);
    const chest = r.groups.find((g) => g.group === "chest");
    expect(chest).toMatchObject({ exercises: 2 });
    expect(chest?.changePct).toBeCloseTo(5); // (10 + 0) / 2; bench only counts for triceps at 0.5
    expect(r.groups.find((g) => g.group === "triceps")?.changePct).toBeCloseTo(20);
  });

  it("measures by what most sessions had", () => {
    const ex = [{ id: "pu", name: "Pull-up", muscles: [{ group: "back", contribution: 1 }] }];
    const rows = pts(8, 9, 10, 11).map((p, i) => ({
      exerciseId: "pu",
      date: p.date,
      reps: p.value,
      ...(i === 0 ? { e1rm: 90 } : {}),
    }));
    const pu = progression(ex, rows).exercises[0];
    expect(pu?.measure).toBe("reps");
    expect(pu?.points).toHaveLength(4);
  });
});
