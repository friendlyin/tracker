import type { WaterStateDto } from "../../../shared/water/types";
import { fmtInt } from "../../lib/format";
import { cx } from "../../ui/cx";
import { ProgressBar } from "../../ui/ProgressBar";

// Pending water (what is due now) and today's total against the target. Only "urgent" (at the cap
// for longer than the urgency delay) uses the warning colour.

const MIN = 60_000;

export const pendingTone = (s: WaterStateDto) => (s.state === "urgent" ? "text-warn" : undefined);

/** "+89 ml ahead · 32 min" while there is credit. */
export function Credit({ s, className }: { s: WaterStateDto; className?: string }) {
  if (s.creditMl <= 0) return null;
  const min = s.buildUpAt ? Math.max(1, Math.round((s.buildUpAt - Date.now()) / MIN)) : null;
  return (
    <span className={cx("num text-ok", className)}>
      +{fmtInt(s.creditMl)} ml ahead{min !== null && ` · ${min} min`}
    </span>
  );
}

/** Today's total as the big number, with what is due now below it. */
export function Summary({ s }: { s: WaterStateDto }) {
  return (
    <div>
      <div className="num text-[52px] leading-none font-semibold">{fmtInt(s.totalMl)}</div>
      <div className="mt-1 text-[13px] text-ink-2">of {fmtInt(s.targetMl)} ml today</div>
      <ProgressBar
        className="mt-3"
        value={s.totalMl}
        max={s.targetMl}
        tone={s.totalMl >= s.targetMl ? "ok" : "accent"}
      />
      <div className="mt-6 flex items-baseline gap-2">
        <span className={cx("num text-[28px] leading-none font-semibold", pendingTone(s))}>
          {fmtInt(s.pendingMl)}
        </span>
        <span className="text-[13px] text-ink-2">ml due</span>
        <Credit s={s} className="text-[13px]" />
      </div>
    </div>
  );
}
