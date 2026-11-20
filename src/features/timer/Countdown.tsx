import { useEffect } from "react";
import { fmtElapsed } from "../../lib/format";
import { useNow } from "../../lib/useNow";
import { cx } from "../../ui/cx";
import { signalEnd } from "./signal";

const MIN = 60_000;

/** "12:30" left, or "+3:05" past zero (in the warning colour); counts up without a target. */
export function timerText(startedAt: number, targetMin: number | null, now: number) {
  if (targetMin === null) return { text: fmtElapsed(now - startedAt), over: false };
  const left = startedAt + targetMin * MIN - now;
  return left > 0
    ? { text: fmtElapsed(left + 999), over: false }
    : { text: `+${fmtElapsed(-left)}`, over: true };
}

/**
 * A running timer: counts down from its target and keeps counting past zero (only Stop ends it),
 * signalling once at zero. Without a target it counts up.
 */
export function TimerClock({
  id,
  startedAt,
  targetMin,
  className,
}: {
  id: string;
  startedAt: number;
  targetMin: number | null;
  className?: string;
}) {
  const now = useNow(1000);
  const { text, over } = timerText(startedAt, targetMin, now);
  useEffect(() => {
    if (targetMin !== null) signalEnd(id, startedAt + targetMin * MIN, now);
  }, [id, startedAt, targetMin, now]);
  return <span className={cx("num", over && "text-warn", className)}>{text}</span>;
}
