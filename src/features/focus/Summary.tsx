import type { FocusKind } from "../../../shared/focus/schemas";
import type { FocusInputsDto, FocusStateDto } from "../../../shared/focus/types";
import type { LevelState } from "../../../shared/level/engine";
import { sleepInstant } from "../../../shared/schedule";
import { useVariant } from "../../dev/variants";
import { fmtDuration, fmtElapsed } from "../../lib/format";
import { useNow } from "../../lib/useNow";
import { cx } from "../../ui/cx";
import { LevelCurve } from "../../ui/LevelCurve";
import { ProgressBar } from "../../ui/ProgressBar";

// Focus energy now, where it is heading, and today's curve. Suggest colours the number; recommend
// also outlines the home tile; urgent fills it.

const MIN = 60_000;
const HOUR = 60 * MIN;

export const KIND_LABEL: Record<FocusKind, string> = {
  deep: "Deep",
  moderate: "Moderate",
  unfocus: "Unfocus",
};

export const energyTone = (state: LevelState) => (state === "ok" ? undefined : "text-warn");

/** "↓ 40 in 1 h 20" (or "↑ 60 in 12 min" while resting). */
export function nextLine(st: FocusStateDto, now = Date.now()): string | null {
  if (!st.next) return null;
  const rising = st.running?.kind === "unfocus";
  return `${rising ? "↑" : "↓"} ${st.next.level} in ${fmtDuration(st.next.reachedAt - now)}`;
}

/** Elapsed time of the running timer, ticking every second. */
export function Elapsed({ since, className }: { since: number; className?: string }) {
  const now = useNow(1000);
  return <span className={cx("num", className)}>{fmtElapsed(now - since)}</span>;
}

/** The day's window on the curve: from its start to the sleep time (or now, if later). */
function dayWindow(d: FocusInputsDto, st: FocusStateDto) {
  const sleep = sleepInstant(st.date, d.schedule, d.tz);
  const to = Number.isFinite(sleep) ? sleep : st.dayStartedAt + 24 * HOUR;
  return { from: st.dayStartedAt, to: Math.max(to, Date.now()) };
}

function Curve({ d, st, className }: { d: FocusInputsDto; st: FocusStateDto; className?: string }) {
  const t = d.settings.thresholds;
  return (
    <LevelCurve
      points={st.points}
      {...dayWindow(d, st)}
      min={0}
      max={100}
      guides={[t.suggest, t.recommend, t.urgent]}
      className={className}
    />
  );
}

function Energy({ st, size = 52 }: { st: FocusStateDto; size?: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className={cx("num leading-none font-semibold", energyTone(st.state))}
        style={{ fontSize: size }}
      >
        {st.energy}
      </span>
      <span className="text-[13px] text-ink-2">of {st.ceiling}</span>
    </div>
  );
}

function Next({ st }: { st: FocusStateDto }) {
  const line = nextLine(st);
  return <div className="num mt-1 h-5 text-[13px] text-ink-2">{line}</div>;
}

type P = { d: FocusInputsDto; st: FocusStateDto };

function NumberCurve({ d, st }: P) {
  return (
    <div>
      <Energy st={st} />
      <Next st={st} />
      <Curve d={d} st={st} className="mt-4 h-20" />
    </div>
  );
}

function CurveLed({ d, st }: P) {
  return (
    <div className="relative">
      <Curve d={d} st={st} className="h-40" />
      <div className="absolute top-0 right-0 flex flex-col items-end">
        <Energy st={st} size={40} />
        <Next st={st} />
      </div>
    </div>
  );
}

function NumberBar({ d, st }: P) {
  const t = d.settings.thresholds;
  return (
    <div>
      <Energy st={st} />
      <Next st={st} />
      <div className="relative mt-4">
        <ProgressBar value={st.energy} max={100} tone={st.state === "ok" ? "accent" : "warn"} />
        {[t.suggest, t.recommend, t.urgent].map((v) => (
          <span
            key={v}
            className="absolute -top-1 h-3.5 w-px bg-ink-3"
            style={{ left: `${v}%` }}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}

export function Summary(props: P) {
  const V = useVariant("focus.summary", {
    "number + curve": NumberCurve,
    "curve-led": CurveLed,
    "number + bar": NumberBar,
  });
  return <V {...props} />;
}

/** Today's minutes per tier. */
export function Totals({ st }: { st: FocusStateDto }) {
  const cols = [
    { label: KIND_LABEL.deep, min: st.deepMin, extra: st.deepSessions || null },
    { label: KIND_LABEL.moderate, min: st.moderateMin, extra: null },
    { label: KIND_LABEL.unfocus, min: st.unfocusMin, extra: null },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {cols.map((c) => (
        <div key={c.label}>
          <div className="num text-[20px] leading-none font-semibold">
            {fmtDuration(c.min * MIN)}
          </div>
          <div className="mt-1 text-[12px] text-ink-2">
            {c.label}
            {c.extra !== null && ` · ${c.extra}`}
          </div>
        </div>
      ))}
    </div>
  );
}
