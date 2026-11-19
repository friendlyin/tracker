import { describe, expect, it } from "vitest";
import { addMonths, bucketDays, bucketOf, daysBetween, period, shiftPeriod } from "./periods";

describe("periods", () => {
  it("covers Monday to Sunday for a week, by day", () => {
    const p = period("week", "2026-11-19"); // a Thursday
    expect([p.from, p.to, p.bucket]).toEqual(["2026-11-16", "2026-11-22", "day"]);
    expect(p.buckets).toHaveLength(7);
  });

  it("covers the calendar month, by day", () => {
    const p = period("month", "2026-02-10");
    expect([p.from, p.to]).toEqual(["2026-02-01", "2026-02-28"]);
    expect(p.buckets).toHaveLength(28);
  });

  it("covers 3 calendar months by Monday weeks", () => {
    const p = period("3m", "2026-11-19");
    expect([p.from, p.to, p.bucket]).toEqual(["2026-09-01", "2026-11-30", "week"]);
    expect(p.buckets[0]).toBe("2026-08-31"); // the Monday of the week holding Sep 1
    expect(p.buckets.at(-1)).toBe("2026-11-30");
  });

  it("covers 12 months by month, across a year boundary", () => {
    const p = period("year", "2026-03-05");
    expect([p.from, p.to, p.bucket]).toEqual(["2025-04-01", "2026-03-31", "month"]);
    expect(p.buckets).toHaveLength(12);
    expect(p.buckets[0]).toBe("2025-04-01");
  });

  it("pages back and forward", () => {
    expect(shiftPeriod("week", "2026-11-19", -1)).toBe("2026-11-12");
    expect(shiftPeriod("month", "2026-01-31", -1)).toBe("2025-12-01");
    expect(shiftPeriod("6m", "2026-11-19", 1)).toBe("2027-05-01");
    expect(period("6m", shiftPeriod("6m", "2026-11-19", -1)).to).toBe("2026-05-31");
  });

  it("finds bucket starts and clips buckets to the period", () => {
    expect(bucketOf("2026-11-22", "week")).toBe("2026-11-16");
    expect(bucketOf("2026-11-22", "month")).toBe("2026-11-01");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-01");
    const p = period("3m", "2026-11-19");
    expect(bucketDays(p, "2026-08-31")).toEqual({ from: "2026-09-01", to: "2026-09-06" });
    expect(daysBetween("2026-11-16", "2026-11-22")).toBe(7);
    expect(daysBetween("2026-11-16", "2026-11-15")).toBe(0);
  });
});
