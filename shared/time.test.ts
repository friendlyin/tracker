import { describe, expect, it } from "vitest";
import { addDays, daysLeftInWeek, isoInZone, isoWeekday, localDate, weekRange } from "./time";

describe("time", () => {
  it("derives the local date in a timezone", () => {
    const instant = Date.UTC(2026, 10, 19, 23, 30); // 23:30 UTC
    expect(localDate(instant, "UTC")).toBe("2026-11-19");
    expect(localDate(instant, "Europe/Berlin")).toBe("2026-11-20");
    expect(localDate(instant, "America/New_York")).toBe("2026-11-19");
  });

  it("uses Monday-start weeks", () => {
    expect(isoWeekday("2026-11-16")).toBe(1); // Monday
    expect(isoWeekday("2026-11-22")).toBe(7); // Sunday
    expect(weekRange("2026-11-19")).toEqual({ start: "2026-11-16", end: "2026-11-22" });
    expect(weekRange("2026-11-22")).toEqual({ start: "2026-11-16", end: "2026-11-22" });
    expect(daysLeftInWeek("2026-11-16")).toBe(7);
    expect(daysLeftInWeek("2026-11-22")).toBe(1);
  });

  it("adds days across month ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("formats an instant as local ISO with offset", () => {
    const instant = Date.UTC(2026, 0, 15, 11, 0, 0);
    expect(isoInZone(instant, "Europe/Berlin")).toBe("2026-01-15T12:00:00+01:00");
    expect(isoInZone(instant, "UTC")).toBe("2026-01-15T11:00:00Z");
    expect(isoInZone(instant, "America/New_York")).toBe("2026-01-15T06:00:00-05:00");
  });
});
