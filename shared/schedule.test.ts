import { describe, expect, it } from "vitest";
import { awakeHours, isAwake, nextPhaseChange, wakeInstant, zonedInstant } from "./schedule";

const day = { wakeTime: "07:00", sleepTime: "23:00" };
const late = { wakeTime: "08:00", sleepTime: "01:00" };
const at = (iso: string) => Date.parse(iso);

describe("schedule", () => {
  it("counts awake hours, also when sleep is after midnight", () => {
    expect(awakeHours(day)).toBe(16);
    expect(awakeHours(late)).toBe(17);
    expect(awakeHours({ wakeTime: "07:00", sleepTime: "07:00" })).toBe(24);
  });

  it("knows whether the user is awake", () => {
    expect(isAwake(at("2026-11-19T07:00:00Z"), day, "UTC")).toBe(true);
    expect(isAwake(at("2026-11-19T06:59:59Z"), day, "UTC")).toBe(false);
    expect(isAwake(at("2026-11-19T23:00:00Z"), day, "UTC")).toBe(false);
    expect(isAwake(at("2026-11-19T00:30:00Z"), late, "UTC")).toBe(true);
    expect(isAwake(at("2026-11-19T03:00:00Z"), late, "UTC")).toBe(false);
  });

  it("finds the next boundary strictly after an instant", () => {
    expect(nextPhaseChange(at("2026-11-19T07:00:00Z"), day, "UTC")).toBe(
      at("2026-11-19T23:00:00Z"),
    );
    expect(nextPhaseChange(at("2026-11-19T23:30:00Z"), day, "UTC")).toBe(
      at("2026-11-20T07:00:00Z"),
    );
    expect(nextPhaseChange(at("2026-11-19T12:00:00Z"), late, "UTC")).toBe(
      at("2026-11-20T01:00:00Z"),
    );
  });

  it("converts local times in a timezone to instants", () => {
    expect(zonedInstant("2026-11-19", "07:00", "Europe/Berlin")).toBe(at("2026-11-19T06:00:00Z"));
    expect(zonedInstant("2026-07-01", "07:00", "Europe/Berlin")).toBe(at("2026-07-01T05:00:00Z"));
    expect(wakeInstant("2026-11-19", day, "America/New_York")).toBe(at("2026-11-19T12:00:00Z"));
    expect(isAwake(at("2026-11-19T06:30:00Z"), day, "Europe/Berlin")).toBe(true);
  });
});
