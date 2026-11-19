import { describe, expect, it } from "vitest";
import { applyWorkoutSettingsPatch, parseWorkoutSettings, weeklySetTarget } from "./settings";

describe("workout settings", () => {
  it("fills defaults", () => {
    const s = parseWorkoutSettings(undefined);
    expect(s.targets.chest).toBe(12);
    expect(s.targets.biceps).toBe(9);
    expect(s.targets.calves).toBe(3);
    expect(s.workoutsPerWeek).toBe(3);
    expect(weeklySetTarget(s)).toBe(5 * 12 + 3 * 9 + 3);
  });

  it("falls back to defaults for invalid data", () => {
    expect(parseWorkoutSettings({ workoutsPerWeek: 99 }).workoutsPerWeek).toBe(3);
  });

  it("keeps stored targets when a group is added later", () => {
    const { calves: _, ...older } = parseWorkoutSettings({}).targets;
    const s = parseWorkoutSettings({ targets: { ...older, chest: 15 }, workoutsPerWeek: 4 });
    expect(s.targets.chest).toBe(15);
    expect(s.targets.calves).toBe(3);
    expect(s.workoutsPerWeek).toBe(4);
  });

  it("turns settings stored per category into per-group targets", () => {
    const s = parseWorkoutSettings({
      targets: { major: 10, minor: 6 },
      categories: { chest: "major", core: "major", biceps: "minor", calves: "minor" },
      workoutsPerWeek: 4,
    });
    expect(s.targets).toMatchObject({ chest: 10, back: 10, core: 10, biceps: 6, triceps: 6 });
    expect(s.targets.calves).toBe(3);
    expect(s.workoutsPerWeek).toBe(4);
    expect(s).not.toHaveProperty("categories");
  });

  it("applies partial patches", () => {
    const s = applyWorkoutSettingsPatch(parseWorkoutSettings({}), {
      targets: { calves: 3, core: 6 },
    });
    expect(s.targets).toMatchObject({ calves: 3, core: 6, chest: 12, biceps: 9 });
  });
});
