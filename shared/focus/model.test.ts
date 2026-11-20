import { describe, expect, it } from "vitest";
import { localDate } from "../time";
import { entryEffects, focusDayStats, focusState } from "./model";
import type { FocusKind } from "./schemas";
import { parseFocusSettings, type SleepQuality } from "./settings";
import type { FocusInputsDto } from "./types";

const settings = parseFocusSettings({});
const at = (iso: string) => Date.parse(iso);
type E = [FocusKind, string, string | null];

function inputs(entries: E[], sleep: [string, SleepQuality, string][] = []): FocusInputsDto {
  return {
    tz: "UTC",
    schedule: { wakeTime: "07:00", sleepTime: "23:00" },
    settings,
    entries: entries.map(([kind, from, to], i) => ({
      id: String(i),
      kind,
      tag: null,
      startedAt: at(from),
      endedAt: to ? at(to) : null,
      minutes: null,
      targetMin: null,
      habitId: null,
      localDate: localDate(at(from), "UTC"),
      source: "app",
    })),
    sleep: sleep.map(([date, quality, setAt], i) => ({
      id: `s${i}`,
      date,
      quality,
      setAt: at(setAt),
    })),
  };
}

const good: [string, SleepQuality, string][] = [["2026-11-18", "good", "2026-11-18T07:05:00Z"]];

// The spec's example day: 07:00 good sleep, 1 h ordinary, 3 h focus, 1 h ordinary, 2 h focus,
// 20 min unfocus, 2 h film.
const example: E[] = [
  ["deep", "2026-11-18T08:00:00Z", "2026-11-18T11:00:00Z"],
  ["deep", "2026-11-18T12:00:00Z", "2026-11-18T14:00:00Z"],
  ["unfocus", "2026-11-18T14:00:00Z", "2026-11-18T14:20:00Z"],
  ["moderate", "2026-11-18T14:20:00Z", "2026-11-18T16:20:00Z"],
];

describe("focus model", () => {
  it("follows the spec's example day", () => {
    const i = inputs(example, good);
    const e = (iso: string) => focusState(i, at(iso)).energy;
    expect(e("2026-11-18T08:00:00Z")).toBe(97);
    const s11 = focusState(i, at("2026-11-18T11:00:00Z"));
    expect(s11.energy).toBe(61);
    expect(s11.state).toBe("ok");
    expect(focusState(i, at("2026-11-18T11:20:00Z")).state).toBe("suggest");
    const s14 = focusState(i, at("2026-11-18T14:00:00Z"));
    expect(s14.energy).toBe(34);
    expect(s14.state).toBe("recommend");
    const after = focusState(i, at("2026-11-18T14:20:00Z"));
    expect(after.energy).toBe(44); // 59 e^0.16 − 25 = 44.2
    const end = focusState(i, at("2026-11-18T16:20:00Z"));
    expect(end.energy).toBe(32);
    expect(end.deepMin).toBe(300);
    expect(end.deepSessions).toBe(2);
    expect(end.moderateMin).toBe(120);
    expect(end.unfocusMin).toBe(20);
  });

  it("assumes the default sleep until it is set, and caps energy at the ceiling", () => {
    const none = focusState(inputs([]), at("2026-11-18T07:00:00Z"));
    expect(none.sleep).toBeNull();
    expect(none.energy).toBe(85);
    expect(none.ceiling).toBe(90);
    // A long unfocus from 85 stops at the ok ceiling.
    const rest = inputs([["unfocus", "2026-11-18T07:00:00Z", "2026-11-18T09:00:00Z"]]);
    expect(focusState(rest, at("2026-11-18T09:00:00Z")).energy).toBe(90);
  });

  it("runs a timer up to now and forecasts the next state", () => {
    const i = inputs([["deep", "2026-11-18T08:00:00Z", null]], good);
    const s = focusState(i, at("2026-11-18T09:00:00Z"));
    expect(s.energy).toBe(85); // 100 − 3 − 12
    expect(s.running?.kind).toBe("deep");
    // 85 → 60 at 12/h: 125 min later.
    expect(s.next).toEqual({ state: "suggest", level: 60, reachedAt: at("2026-11-18T11:05:00Z") });
    // While resting it forecasts the way back up.
    const r = inputs(
      [
        ["deep", "2026-11-18T07:00:00Z", "2026-11-18T10:00:00Z"],
        ["unfocus", "2026-11-18T10:00:00Z", null],
      ],
      good,
    );
    const up = focusState(r, at("2026-11-18T10:00:00Z"));
    expect(up.energy).toBe(64);
    expect(up.next).toBeNull(); // already ok
    const low = inputs(
      [
        ["deep", "2026-11-18T07:00:00Z", "2026-11-18T12:00:00Z"],
        ["unfocus", "2026-11-18T12:00:00Z", null],
      ],
      good,
    );
    const rest = focusState(low, at("2026-11-18T12:00:00Z")).next;
    expect(rest?.state).toBe("suggest");
    expect(rest?.level).toBe(40); // 100 − 60 = 40 → crossing 40 leaves recommend
  });

  it("starts the day early when sleep is set before the wake time", () => {
    const i = inputs([], [["2026-11-18", "bad", "2026-11-18T06:00:00Z"]]);
    const s = focusState(i, at("2026-11-18T06:30:00Z"));
    expect(s.date).toBe("2026-11-18");
    expect(s.sleep).toBe("bad");
    expect(s.energy).toBe(69); // 70 − 1.5, baseline from the early start
    // Without it, 06:30 still belongs to the day before (night owls).
    expect(focusState(inputs([]), at("2026-11-18T06:30:00Z")).date).toBe("2026-11-17");
  });

  it("summarises a closed day", () => {
    const st = focusDayStats(inputs(example, good), "2026-11-18");
    // 16:20 at 32, then baseline until 23:00: 32 − 20 = 12.
    expect(st.minEnergy).toBe(12);
    expect(st.lowMin.urgent).toBeGreaterThan(0);
    expect(st.lowMin.suggest).toBeGreaterThan(st.lowMin.recommend);
  });

  it("applies minutes added afterwards at once, without a time of day", () => {
    const base = inputs([], good);
    const lump = (kind: FocusKind, min: number, iso: string, id: string) => ({
      id,
      kind,
      tag: null,
      startedAt: at(iso),
      endedAt: null,
      minutes: min,
      targetMin: null,
      habitId: null,
      localDate: "2026-11-18",
      source: "app" as const,
    });
    // Two 60-min deep lumps added at the same moment both count: 9 extra drain each.
    const twice = {
      ...base,
      entries: [
        lump("deep", 60, "2026-11-18T12:00:00Z", "a"),
        lump("deep", 60, "2026-11-18T12:00:00Z", "b"),
      ],
    };
    const s = focusState(twice, at("2026-11-18T12:00:00Z"));
    expect(s.energy).toBe(100 - 15 - 18);
    expect(s.deepMin).toBe(120);
    expect(s.deepSessions).toBe(2);
    expect(s.running).toBeNull();
    // 20 min unfocus from 34: the restore curve (44.2) plus the paused baseline (1).
    const rest = {
      ...base,
      entries: [
        lump("deep", 330, "2026-11-18T08:00:00Z", "c"),
        lump("unfocus", 20, "2026-11-18T08:00:00Z", "d"),
      ],
    };
    // 100 − 3 (07–08) − 49.5 (330 min × 9/h) = 47.5; then 20 min restore.
    const r = focusState(rest, at("2026-11-18T08:00:00Z"));
    expect(r.energy).toBe(Math.round((47.5 + 25) * Math.exp(0.16) - 25 + 1));
    expect(r.unfocusMin).toBe(20);
  });

  it("gives each entry's total energy change, matching the bar", () => {
    const i = inputs(example, good);
    const now = at("2026-11-18T16:20:00Z");
    const fx = entryEffects(i, now);
    const e = (iso: string) => focusState(i, at(iso)).energy;
    // 3 h deep at 12/h; unfocus 14:00–14:20 restores 34 → 44.
    expect(fx.get("0")).toBeCloseTo(-36, 5);
    expect(Math.round(fx.get("2") ?? 0)).toBe(
      e("2026-11-18T14:20:00Z") - e("2026-11-18T14:00:00Z"),
    );
    expect(Math.round(fx.get("3") ?? 0)).toBe(-12);
  });

  it("counts a running timer up to now", () => {
    const i = inputs([["deep", "2026-11-18T08:00:00Z", null]], good);
    expect(entryEffects(i, at("2026-11-18T08:30:00Z")).get("0")).toBeCloseTo(-6, 5);
  });

  it("gives added minutes the same total as a timer", () => {
    const i = inputs([], good);
    const lump = (kind: FocusKind, minutes: number, iso: string, id: string) => ({
      id,
      kind,
      tag: null,
      startedAt: at(iso),
      endedAt: null,
      minutes,
      targetMin: null,
      habitId: null,
      localDate: "2026-11-18",
      source: "app" as const,
    });
    i.entries = [
      lump("deep", 30, "2026-11-18T10:00:00Z", "d"),
      lump("unfocus", 20, "2026-11-18T08:00:00Z", "u"),
    ];
    const fx = entryEffects(i, at("2026-11-18T12:00:00Z"));
    expect(fx.get("d")).toBeCloseTo(-6, 5);
    // At 08:00 energy is 97 of 100: the restore is capped at the ceiling.
    expect(fx.get("u")).toBeCloseTo(3, 0);
  });

  it("shows no change for unfocus at full energy", () => {
    const i = inputs([["unfocus", "2026-11-18T07:00:00Z", "2026-11-18T07:20:00Z"]], good);
    expect(entryEffects(i, at("2026-11-18T08:00:00Z")).get("0")).toBeCloseTo(0, 5);
  });
});
