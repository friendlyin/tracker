import { describe, expect, it } from "vitest";
import { timerText } from "./Countdown";

const MIN = 60_000;

describe("timerText", () => {
  it("counts up without a target", () => {
    expect(timerText(0, null, 90 * 1000)).toEqual({ text: "1:30", over: false });
  });

  it("counts down to zero, rounding up the seconds", () => {
    expect(timerText(0, 90, 0)).toEqual({ text: "1:30:00", over: false });
    expect(timerText(0, 10, 9 * MIN + 500)).toEqual({ text: "1:00", over: false });
  });

  it("keeps counting past zero", () => {
    expect(timerText(0, 10, 10 * MIN)).toEqual({ text: "+0:00", over: true });
    expect(timerText(0, 10, 13 * MIN + 5000)).toEqual({ text: "+3:05", over: true });
  });
});
