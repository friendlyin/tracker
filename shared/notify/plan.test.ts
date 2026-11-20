import { describe, expect, it } from "vitest";
import { parseFocusSettings } from "../focus/settings";
import type { FocusEntryDto, FocusInputsDto } from "../focus/types";
import { parseWaterSettings } from "../water/settings";
import type { WaterInputsDto } from "../water/types";
import { dueNow, markSent, nextDue, notificationPlan, type PlannedEvent } from "./plan";

const at = (iso: string) => Date.parse(iso);
const MIN = 60_000;
const schedule = { wakeTime: "07:00", sleepTime: "23:00" };

/** Water: a big drink at 12:00 leaves 200 ml credit; pending then rises 166.7 ml/h to the 500 cap. */
const water = (patch = {}): WaterInputsDto => ({
  tz: "UTC",
  schedule,
  settings: { ...parseWaterSettings({}), ...patch },
  entries: [
    {
      id: "w",
      drankAt: at("2026-11-18T12:00:00Z"),
      localDate: "2026-11-18",
      ml: 2000,
      source: "app",
    },
  ],
});

const session = (p: Partial<FocusEntryDto>): FocusEntryDto => ({
  id: "f",
  kind: "deep",
  tag: null,
  startedAt: at("2026-11-18T08:00:00Z"),
  endedAt: null,
  minutes: null,
  targetMin: null,
  habitId: null,
  localDate: "2026-11-18",
  source: "app",
  ...p,
});

const focus = (entries: FocusEntryDto[]): FocusInputsDto => ({
  tz: "UTC",
  schedule,
  settings: parseFocusSettings({}),
  entries,
  sleep: [{ id: "s", date: "2026-11-18", quality: "good", setAt: at("2026-11-18T07:05:00Z") }],
});

const off = { timers: false };

describe("notification plan", () => {
  it("reminds when water reaches the cap and when it gets urgent", () => {
    const ev = notificationPlan({ now: at("2026-11-18T13:00:00Z"), water: water(), notify: off });
    const cap = ev.find((e) => e.type === "water.cap");
    // −200 → 500 ml at 166.7 ml/h: 4.2 h after 12:00.
    expect((cap?.at ?? 0) - at("2026-11-18T16:12:00Z")).toBeLessThan(MIN);
    const urgent = ev.find((e) => e.type === "water.urgent");
    expect(urgent?.at).toBe((cap?.at ?? 0) + 60 * MIN);
    expect(urgent?.body).toBe("500 ml due for 1 h");
  });

  it("moves a reminder that falls in the night to the wake time", () => {
    const ev = notificationPlan({
      now: at("2026-11-18T13:00:00Z"),
      water: water({ urgencyDelayMin: 600 }),
      notify: off,
    });
    const urgent = ev.find((e) => e.type === "water.urgent");
    expect(urgent?.dueAt).toBe(at("2026-11-19T07:00:00Z"));
  });

  it("follows the settings", () => {
    const ev = notificationPlan({
      now: at("2026-11-18T13:00:00Z"),
      water: water({ remindCap: false, remindUrgent: false }),
      notify: off,
    });
    expect(ev).toEqual([]);
  });

  it("reminds when energy falls to a threshold while the session runs", () => {
    const ev = notificationPlan({
      now: at("2026-11-18T09:00:00Z"),
      focus: focus([session({})]),
      notify: off,
    });
    // 97 at 08:00, deep drains 12/h: 40 after 4.75 h.
    expect(ev.map((e) => e.type)).toEqual(["focus.recommend"]);
    expect(Math.abs((ev[0]?.at ?? 0) - at("2026-11-18T12:45:00Z"))).toBeLessThan(MIN);
  });

  it("signals a countdown's end, named after its habit", () => {
    const ev = notificationPlan({
      now: at("2026-11-18T08:05:00Z"),
      focus: focus([session({ kind: "moderate", targetMin: 10, habitId: "h" })]),
      notify: { timers: true },
      habitNames: { h: "Meditation" },
    });
    const t = ev.find((e) => e.type === "timer:f");
    expect(t).toMatchObject({
      at: at("2026-11-18T08:10:00Z"),
      title: "Meditation",
      body: "10 min done",
      url: "/habits",
      urgency: "high",
    });
  });
});

describe("sending", () => {
  const ev = (type: string, atIso: string): PlannedEvent => ({
    type,
    at: at(atIso),
    dueAt: at(atIso),
    title: "",
    body: "",
    url: "/",
    tag: type,
    urgency: "normal",
  });

  it("sends what is due once, and drops stale reminders", () => {
    const events = [ev("a", "2026-11-18T10:00:00Z"), ev("b", "2026-11-18T08:00:00Z")];
    const now = at("2026-11-18T10:01:00Z");
    const { send, drop } = dueNow(events, {}, now);
    expect(send.map((e) => e.type)).toEqual(["a"]);
    expect(drop.map((e) => e.type)).toEqual(["b"]);
    const sent = markSent({}, [...send, ...drop], now);
    expect(dueNow(events, sent, now).send).toEqual([]);
    expect(nextDue(events, sent)).toBeNull();
  });

  it("treats a slightly shifted time as the same occurrence, and a later fall as new", () => {
    const sent = { a: at("2026-11-18T10:00:00Z") };
    expect(nextDue([ev("a", "2026-11-18T10:02:00Z")], sent)).toBeNull();
    expect(nextDue([ev("a", "2026-11-18T14:00:00Z")], sent)).toBe(at("2026-11-18T14:00:00Z"));
  });
});
