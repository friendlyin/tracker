import { describe, expect, it } from "vitest";
import { applyWorkoutSettingsPatch, parseWorkoutSettings } from "./settings";

describe("workout settings", () => {
  it("fills defaults", () => {
    const s = parseWorkoutSettings(undefined);
    expect(s.targets).toEqual({ major: 12, minor: 9 });
    expect(s.workoutsPerWeek).toBe(3);
    expect(s.categories.biceps).toBe("minor");
    expect(s.categories.chest).toBe("major");
  });

  it("falls back to defaults for invalid data", () => {
    expect(parseWorkoutSettings({ workoutsPerWeek: 99 }).workoutsPerWeek).toBe(3);
  });

  it("keeps stored settings that predate a muscle group", () => {
    const { calves: _, ...older } = parseWorkoutSettings({}).categories;
    const s = parseWorkoutSettings({
      targets: { major: 10, minor: 6 },
      categories: { ...older, core: "major" },
      workoutsPerWeek: 4,
    });
    expect(s.targets).toEqual({ major: 10, minor: 6 });
    expect(s.workoutsPerWeek).toBe(4);
    expect(s.categories.core).toBe("major");
    expect(s.categories.calves).toBe("minor");
  });

  it("applies partial patches", () => {
    const s = applyWorkoutSettingsPatch(parseWorkoutSettings({}), {
      targets: { minor: 6 },
      categories: { core: "major" },
    });
    expect(s.targets).toEqual({ major: 12, minor: 6 });
    expect(s.categories.core).toBe("major");
    expect(s.categories.biceps).toBe("minor");
  });
});
