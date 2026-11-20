import { readJson, writeJson } from "../../lib/storage";

// The in-app signal when a countdown reaches zero: a short chime (Web Audio, so no asset) and a
// vibration where the browser has one (not iOS). It plays only while the app is visible; when the
// phone is locked or the app is in the background, the push notification is the signal.
// iOS mutes Web Audio when the phone is on silent.

const FIRED_KEY = "timer.fired";
/** A countdown that ended longer ago than this (the app was closed) no longer chimes. */
const LATE_MS = 10_000;

let ctx: AudioContext | null = null;

/** Call from a tap (starting a timer): iOS only lets audio play once a gesture has unlocked it. */
export function primeAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

function chime() {
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const t0 = ctx.currentTime + 0.05;
  for (const [i, freq] of [880, 1175, 880].entries()) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = t0 + i * 0.35;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.32);
  }
}

/** Signals once per timer, when its countdown has just ended and the app is visible. */
export function signalEnd(timerId: string, endAt: number, now = Date.now()) {
  if (now < endAt || now - endAt > LATE_MS) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  const fired = readJson<string[]>(FIRED_KEY, []);
  if (fired.includes(timerId)) return;
  writeJson(FIRED_KEY, [...fired, timerId].slice(-20));
  chime();
  navigator.vibrate?.([300, 150, 300]);
}
