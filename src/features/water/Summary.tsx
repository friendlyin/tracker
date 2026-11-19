import type { LevelPoint } from "../../../shared/level/engine";
import { zonedInstant } from "../../../shared/schedule";
import { addDays } from "../../../shared/time";
import type { WaterStateDto } from "../../../shared/water/types";
import { useVariant } from "../../dev/variants";
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

function Total({ s }: { s: WaterStateDto }) {
  return (
    <div>
      <ProgressBar
        value={s.totalMl}
        max={s.targetMl}
        tone={s.totalMl >= s.targetMl ? "ok" : "accent"}
      />
      <div className="num mt-2 text-[13px] text-ink-3">
        {fmtInt(s.totalMl)} / {fmtInt(s.targetMl)} ml
      </div>
    </div>
  );
}

function PendingLed({ s }: { s: WaterStateDto }) {
  return (
    <div>
      <div className={cx("num text-[52px] leading-none font-semibold", pendingTone(s))}>
        {fmtInt(s.pendingMl)}
      </div>
      <div className="mt-1 flex gap-3 text-[13px] text-ink-2">
        ml due
        <Credit s={s} />
      </div>
      <div className="mt-6">
        <Total s={s} />
      </div>
    </div>
  );
}

function TotalLed({ s }: { s: WaterStateDto }) {
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

/** Today's pending curve from midnight to midnight; the cap is the top line, zero the bottom. */
export function Curve({ s, cap, credit }: { s: WaterStateDto; cap: number; credit: number }) {
  const W = 320;
  const H = 72;
  const first = s.points[0];
  if (!first) return null;
  const start = first.t;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const end = zonedInstant(addDays(s.date, 1), "00:00", tz);
  const x = (p: LevelPoint) => ((p.t - start) / (end - start)) * W;
  const y = (v: number) => ((cap - v) / (cap + credit)) * H;
  const d = s.points.map((p, i) => `${i ? "L" : "M"}${x(p).toFixed(1)},${y(p.level).toFixed(1)}`);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-18 w-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <line x1="0" x2={W} y1={y(cap)} y2={y(cap)} className="stroke-line" strokeWidth="1" />
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="stroke-line" strokeWidth="1" />
      <path
        d={d.join("")}
        fill="none"
        className="stroke-ink"
        strokeWidth="1.75"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function PendingCurve({ s, cap, credit }: { s: WaterStateDto; cap: number; credit: number }) {
  return (
    <div>
      <PendingLed s={s} />
      <div className="mt-6">
        <Curve s={s} cap={cap} credit={credit} />
      </div>
    </div>
  );
}

export function Summary(props: { s: WaterStateDto; cap: number; credit: number }) {
  const V = useVariant("water.summary", {
    pending: PendingLed,
    total: TotalLed,
    curve: PendingCurve,
  });
  return <V {...props} />;
}
