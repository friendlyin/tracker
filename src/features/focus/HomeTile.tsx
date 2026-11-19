import { Link } from "@tanstack/react-router";
import { SLEEP_LABEL, sleepQualities } from "../../../shared/focus/settings";
import type { FocusStateDto } from "../../../shared/focus/types";
import { useVariant } from "../../dev/variants";
import { cx } from "../../ui/cx";
import { PlayIcon, StopIcon } from "../../ui/icons";
import { ProgressBar } from "../../ui/ProgressBar";
import { useFocusLog, useFocusState, useSetSleep, useStopFocus } from "./api";
import { Elapsed, energyTone, KIND_LABEL, nextLine } from "./Summary";

// Home tile: energy and state, and one tap to start deep focus or stop the running timer. Until the
// day's sleep is set, three sleep buttons take that place. Buttons sit above the tile's link (a
// button inside a link is invalid HTML).

type P = { st: FocusStateDto };

function EnergyNumber({ st, size = 40 }: { st: FocusStateDto; size?: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="num leading-none font-semibold" style={{ fontSize: size }}>
        {st.energy}
      </span>
      <span className="text-[12px] opacity-70">of {st.ceiling}</span>
    </div>
  );
}

function Running({ st }: { st: FocusStateDto }) {
  if (!st.running) return <div className="h-4" />;
  return (
    <div className="h-4 text-[12px]">
      {KIND_LABEL[st.running.kind]} · <Elapsed since={st.running.startedAt} />
    </div>
  );
}

function BarBody({ st }: P) {
  return (
    <div>
      <EnergyNumber st={st} />
      <div className="mt-1">
        <Running st={st} />
      </div>
      <ProgressBar className="mt-2" value={st.energy} max={100} />
    </div>
  );
}

function NextBody({ st }: P) {
  return (
    <div>
      <EnergyNumber st={st} />
      <div className="mt-1 space-y-0.5">
        <Running st={st} />
        <div className="num h-4 text-[12px] opacity-70">{nextLine(st)}</div>
      </div>
    </div>
  );
}

function SleepPrompt({ st }: { st: FocusStateDto }) {
  const set = useSetSleep();
  return (
    <div>
      <EnergyNumber st={st} size={28} />
      <div className="pointer-events-auto relative mt-2 flex gap-1">
        {sleepQualities.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => set.mutate({ quality: q, date: st.date })}
            className="h-11 flex-1 rounded-md bg-paper text-[13px] font-medium text-ink active:opacity-60"
          >
            {SLEEP_LABEL[q]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FocusTile({ className }: { className: string }) {
  const st = useFocusState();
  const log = useFocusLog();
  const { stop } = useStopFocus();
  const Body = useVariant("home.focus", { bar: BarBody, next: NextBody });
  const urgent = st?.state === "urgent";
  const recommend = st?.state === "recommend";

  return (
    <div
      className={cx(
        className,
        "relative",
        urgent && "bg-warn text-on-ink",
        recommend && "ring-2 ring-warn ring-inset",
      )}
    >
      <Link
        to="/focus"
        aria-label="Focus"
        className="absolute inset-0 rounded-md active:bg-ink/5"
      />
      <div className="pointer-events-none flex items-center justify-between">
        <span className={cx("text-[15px] font-medium", !urgent && st && energyTone(st.state))}>
          Focus
        </span>
        {st?.sleep && (
          <button
            type="button"
            aria-label={st.running ? "Stop timer" : "Start deep focus"}
            onClick={() => (st.running ? stop() : log.start("deep"))}
            className={cx(
              "pointer-events-auto relative -mt-2 -mr-2 grid size-11 place-items-center rounded-md active:opacity-60",
              "bg-paper text-ink",
            )}
          >
            {st.running ? <StopIcon className="size-5" /> : <PlayIcon className="size-5" />}
          </button>
        )}
      </div>
      <div className="pointer-events-none">
        {!st ? "–" : st.sleep ? <Body st={st} /> : <SleepPrompt st={st} />}
      </div>
    </div>
  );
}
