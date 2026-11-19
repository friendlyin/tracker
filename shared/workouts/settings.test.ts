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
