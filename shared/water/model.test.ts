import { describe, expect, it } from "vitest";
import { localDate } from "../time";
import { atCapMinutes, drink, waterRates, waterState } from "./model";
import { parseWaterSettings } from "./settings";
import type { WaterInputsDto } from "./types";

const s = parseWaterSettings({});
const schedule = { wakeTime: "07:00", sleepTime: "23:00" };
const at = (iso: string) => Date.parse(iso);

function inputs(drinks: [string, number][] = []): WaterInputsDto {
  return {
    tz: "UTC",
    schedule,
    settings: s,
    entries: drinks.map(([iso, ml], i) => ({
      id: String(i),
      drankAt: at(iso),
      localDate: localDate(at(iso), "UTC"),
      ml,
      source: "app",
    })),
  };
}

describe("water model", () => {
  it("rises to the daily target over 24 h, slower at night", () => {
    const r = waterRates(s, schedule);
    expect(r.awake * 16 + r.asleep * 8).toBeCloseTo(3000);
    expect(r.awake).toBeCloseTo(166.67, 1);
    expect(r.asleep).toBeCloseTo(41.67, 1);
  });

  it("turns extra water into a capped credit", () => {
    expect(drink(400, 250, s)).toBe(150);
    expect(drink(200, 500, s)).toBeCloseTo(-90); // spec example
    expect(drink(-90, 100, s)).toBeCloseTo(-120);
    expect(drink(0, 2000, s)).toBe(-200);
  });

  it("delays the next build-up by the credit (90 ml ≈ 32 min)", () => {
    // At the cap (nothing drunk since yesterday), then 800 ml: 500 pays off pending, 300 × 0.3 = 90 credit.
    const st = waterState(inputs([["2026-11-19T08:00:00Z", 800]]), at("2026-11-19T08:00:00Z"));
    expect(st.pendingMl).toBe(0);
    expect(st.creditMl).toBe(90);
    expect(((st.buildUpAt ?? 0) - at("2026-11-19T08:00:00Z")) / 60_000).toBeCloseTo(32.4, 1);
  });

  it("counts urgency from the last wake time", () => {
    // Nothing drunk: at the cap since yesterday.
    expect(waterState(inputs(), at("2026-11-19T07:30:00Z")).state).toBe("recommend");
    const st = waterState(inputs(), at("2026-11-19T08:00:00Z"));
    expect(st.state).toBe("urgent");
    expect(st.pendingMl).toBe(500);
    expect(st.atCapSince).toBe(at("2026-11-18T10:00:00Z"));
  });

  it("tracks pending and today's total after drinking", () => {
    const st = waterState(
      inputs([
        ["2026-11-18T20:00:00Z", 250],
        ["2026-11-19T07:00:00Z", 500],
      ]),
      at("2026-11-19T08:00:00Z"),
    );
    expect(st.pendingMl).toBe(167);
    expect(st.state).toBe("ok");
    expect(st.totalMl).toBe(500);
    expect(st.atCapSince).toBeNull();
    expect(st.points[0]?.t).toBe(at("2026-11-19T00:00:00Z"));
  });

  it("counts awake minutes at the cap for a closed day", () => {
    expect(atCapMinutes(inputs(), "2026-11-19")).toBe(16 * 60);
    // Paid off at wake: back at the cap 3 h later, until sleep at 23:00.
    expect(atCapMinutes(inputs([["2026-11-19T07:00:00Z", 500]]), "2026-11-19")).toBe(13 * 60);
  });
});
