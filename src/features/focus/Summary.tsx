import type { SessionKind } from "../../../shared/focus/schemas";
import type { FocusInputsDto, FocusStateDto } from "../../../shared/focus/types";
import type { LevelState } from "../../../shared/level/engine";
import { fmtDuration, fmtElapsed } from "../../lib/format";
import { useNow } from "../../lib/useNow";
import { cx } from "../../ui/cx";
import { ProgressBar } from "../../ui/ProgressBar";

// Focus energy now and where it is heading. Suggest colours the number; recommend also outlines the
// home tile; urgent fills it.

const MIN = 60_000;

export const KIND_LABEL: Record<SessionKind, string> = {
  deep: "Deep",
  moderate: "Moderate",
  unfocus: "Unfocus",
  other: "Other",
};

/** "Deep", "Moderate · podcast", or a time habit's name. */
export const sessionLabel = (
  e: { kind: SessionKind; tag: string | null; habitId: string | null },
  habitNames: Map<string, string>,
) => {
  const habit = e.habitId ? habitNames.get(e.habitId) : undefined;
  if (habit) return habit;
  return e.tag ? `${KIND_LABEL[e.kind]} · ${e.tag}` : KIND_LABEL[e.kind];
};

export const energyTone = (state: LevelState) => (state === "ok" ? undefined : "text-warn");

/** "↓ 40 in 1 h 20" (or "↑ 60 in 12 min" while resting). */
function nextLine(st: FocusStateDto, now = Date.now()): string | null {
  if (!st.next) return null;
  const rising = st.running?.kind === "unfocus";
  return `${rising ? "↑" : "↓"} ${st.next.level} in ${fmtDuration(st.next.reachedAt - now)}`;
}

/** Elapsed time of the running timer, ticking every second. */
export function Elapsed({ since, className }: { since: number; className?: string }) {
  const now = useNow(1000);
  return <span className={cx("num", className)}>{fmtElapsed(now - since)}</span>;
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

/** Energy, the forecast, and a 0–100 bar with ticks at the thresholds. */
export function Summary({ d, st }: P) {
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
