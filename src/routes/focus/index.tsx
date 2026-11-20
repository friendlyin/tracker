import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { entryEffects } from "../../../shared/focus/model";
import type { FocusKind } from "../../../shared/focus/schemas";
import { SLEEP_LABEL, type SleepQuality, sleepQualities } from "../../../shared/focus/settings";
import type { FocusEntryDto, FocusStateDto } from "../../../shared/focus/types";
import {
  useDeleteFocus,
  useFocusDay,
  useFocusLog,
  useFocusState,
  useSetSleep,
  useStopFocus,
  useUpdateFocus,
} from "../../features/focus/api";
import { Elapsed, KIND_LABEL, Summary, sessionLabel, Totals } from "../../features/focus/Summary";
import { useHabitNames } from "../../features/habits/api";
import { TimerClock } from "../../features/timer/Countdown";
import { LengthPicker, useTimerLength } from "../../features/timer/LengthPicker";
import { primeAudio } from "../../features/timer/signal";
import { fmtDuration, fmtTime } from "../../lib/format";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { ChartIcon, PlayIcon, PlusIcon, SlidersIcon, StopIcon } from "../../ui/icons";
import { IconLink, Screen } from "../../ui/Screen";
import { Segmented } from "../../ui/Segmented";
import { Sheet } from "../../ui/Sheet";
import { Stepper } from "../../ui/Stepper";

export const Route = createFileRoute("/focus/")({ component: FocusScreen });

// Timers run live; minutes done earlier are added without a time of day and apply when added.

const MIN = 60_000;
const kinds: FocusKind[] = ["deep", "moderate", "unfocus"];

function SleepPicker({ st }: { st: FocusStateDto }) {
  const set = useSetSleep();
  return (
    <div className="flex items-center gap-3">
      <span className={cx("w-11 text-[13px]", st.sleep ? "text-ink-2" : "font-medium text-warn")}>
        Sleep
      </span>
      <Segmented
        className="flex-1"
        value={st.sleep ?? ("" as SleepQuality)}
        options={sleepQualities.map((q) => ({ value: q, label: SLEEP_LABEL[q] }))}
        onChange={(q) => set.mutate({ quality: q, date: st.date })}
      />
    </div>
  );
}

function TagPicker({
  tags,
  value,
  onChange,
}: {
  tags: string[];
  /** Undefined: nothing selected yet. */
  value?: string | null;
  onChange: (t: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {[null, ...tags].map((t) => (
        <button
          key={t ?? ""}
          type="button"
          aria-pressed={t === value}
          onClick={() => onChange(t)}
          className={cx(
            "h-11 rounded-md px-4 text-[15px] font-medium active:opacity-60",
            t === value ? "bg-ink text-on-ink" : "bg-surface",
          )}
        >
          {t ?? "–"}
        </button>
      ))}
    </div>
  );
}

/** Signed energy change, e.g. −18 or +12. */
function Effect({ value }: { value: number | undefined }) {
  if (value === undefined) return null;
  const n = Math.round(value);
  return (
    <span className={cx("num w-10 text-right text-[15px]", n > 0 ? "text-ok" : "text-ink-3")}>
      {n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0"}
    </span>
  );
}

function Entries({
  entries,
  effects,
  onEdit,
}: {
  entries: FocusEntryDto[];
  effects: Map<string, number>;
  onEdit: (e: FocusEntryDto) => void;
}) {
  const names = useHabitNames();
  if (entries.length === 0) return null;
  return (
    <div className="mt-8">
      {entries.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => onEdit(e)}
          className="flex min-h-13 w-full items-center gap-3 border-b border-line text-left active:opacity-60"
        >
          <span className="num w-24 shrink-0 text-[13px] text-ink-3">
            {e.minutes !== null
              ? "+"
              : `${fmtTime(e.startedAt)}–${e.endedAt === null ? "" : fmtTime(e.endedAt)}`}
          </span>
          <span className="flex-1 text-[17px]">{sessionLabel(e, names)}</span>
          <Effect value={effects.get(e.id)} />
          {e.minutes === null && e.endedAt === null ? (
            <Elapsed since={e.startedAt} className="text-[15px] text-ink-2" />
          ) : (
            <span className="num text-[15px] text-ink-2">
              {fmtDuration(e.minutes !== null ? e.minutes * MIN : (e.endedAt ?? 0) - e.startedAt)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function MinutesStepper({
  value,
  onChange,
  placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  return (
    <Stepper
      label="Minutes"
      unit="min"
      step={5}
      min={1}
      max={24 * 60}
      size="lg"
      placeholder={placeholder}
      value={value}
      onChange={onChange}
    />
  );
}

/** Minutes done earlier: kind, tag and length, no time of day. */
function AddSheet({ open, onClose, tags }: { open: boolean; onClose: () => void; tags: string[] }) {
  return (
    <Sheet open={open} onClose={onClose}>
      <AddForm onClose={onClose} tags={tags} />
    </Sheet>
  );
}

function AddForm({ onClose, tags }: { onClose: () => void; tags: string[] }) {
  const log = useFocusLog();
  const [kind, setKind] = useState<FocusKind>("deep");
  const [tag, setTag] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<number | null>(30);
  return (
    <>
      <Segmented
        value={kind}
        options={kinds.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
        onChange={setKind}
      />
      {kind === "moderate" && tags.length > 0 && (
        <div className="mt-4">
          <TagPicker tags={tags} value={tag} onChange={setTag} />
        </div>
      )}
      <div className="mt-4">
        <MinutesStepper value={minutes} onChange={setMinutes} />
      </div>
      <Button
        className="mt-4 mb-2"
        disabled={!minutes}
        onClick={() => {
          if (!minutes) return;
          log.add(kind, minutes, kind === "moderate" ? (tag ?? undefined) : undefined);
          onClose();
        }}
      >
        Add
      </Button>
    </>
  );
}

/** Fix a session: its length (empty keeps a timer running) and tag; or delete it. */
function EditSheet({
  entry,
  onClose,
  tags,
}: {
  entry: FocusEntryDto | null;
  onClose: () => void;
  tags: string[];
}) {
  return (
    <Sheet open={entry !== null} onClose={onClose}>
      {entry && <EditForm key={entry.id} entry={entry} onClose={onClose} tags={tags} />}
    </Sheet>
  );
}

function EditForm({
  entry,
  onClose,
  tags,
}: {
  entry: FocusEntryDto;
  onClose: () => void;
  tags: string[];
}) {
  const update = useUpdateFocus();
  const del = useDeleteFocus();
  const names = useHabitNames();
  const length =
    entry.minutes ??
    (entry.endedAt === null ? null : Math.round((entry.endedAt - entry.startedAt) / MIN));
  const [minutes, setMinutes] = useState<number | null>(length);
  const [tag, setTag] = useState(entry.tag);
  return (
    <>
      <div className="text-[17px] font-semibold">{sessionLabel(entry, names)}</div>
      {entry.kind === "moderate" && tags.length > 0 && (
        <div className="mt-4">
          <TagPicker tags={tags} value={tag} onChange={setTag} />
        </div>
      )}
      <div className="mt-4">
        <MinutesStepper value={minutes} onChange={setMinutes} placeholder="running" />
      </div>
      <Button
        className="mt-4"
        disabled={length !== null && !minutes}
        onClick={() => {
          update.mutate({
            id: entry.id,
            minutes: minutes !== null && minutes !== length ? minutes : undefined,
            tag: tag === entry.tag ? undefined : tag,
          });
          onClose();
        }}
      >
        Save
      </Button>
      <Button
        variant="danger"
        className="mt-2 mb-2"
        onClick={() => {
          del.mutate(entry.id);
          onClose();
        }}
      >
        Delete
      </Button>
    </>
  );
}

/** Pick what to start: deep, moderate (or one of its tags) or unfocus. */
function StartSheet({
  open,
  onClose,
  tags,
}: {
  open: boolean;
  onClose: () => void;
  tags: string[];
}) {
  const log = useFocusLog();
  const [length, setLength] = useTimerLength("focus.length");
  const start = (k: FocusKind, tag?: string) => {
    primeAudio();
    log.start(k, tag, length ?? undefined);
    onClose();
  };
  const row =
    "flex h-14 w-full items-center gap-3 rounded-md bg-surface px-4 text-[17px] font-semibold active:opacity-60";
  return (
    <Sheet open={open} onClose={onClose}>
      <LengthPicker value={length} onChange={setLength} />
      <div className="mt-4 space-y-2 pb-2">
        {kinds.map((k) => (
          <div key={k}>
            <button type="button" className={row} onClick={() => start(k)}>
              <PlayIcon className="size-4" />
              {KIND_LABEL[k]}
            </button>
            {k === "moderate" && tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2 pl-11">
                {tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => start("moderate", t)}
                    className="h-11 rounded-md bg-surface px-4 text-[15px] font-medium active:opacity-60"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function Actions({
  st,
  onStart,
  onAdd,
}: {
  st: FocusStateDto;
  onStart: () => void;
  onAdd: () => void;
}) {
  const names = useHabitNames();
  const { stop } = useStopFocus();
  return (
    <div className="pb-3">
      {st.running && (
        <div className="mb-3 flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[13px] text-ink-2">{sessionLabel(st.running, names)}</div>
            <TimerClock
              id={st.running.id}
              startedAt={st.running.startedAt}
              targetMin={st.running.targetMin}
              className="text-[28px] leading-none font-semibold"
            />
          </div>
          <button
            type="button"
            onClick={stop}
            className="flex h-14 items-center gap-2 rounded-md bg-ink px-6 text-[17px] font-semibold text-on-ink active:opacity-70"
          >
            <StopIcon className="size-5" />
            Stop
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onStart}
          className={cx(
            "flex h-14 flex-1 items-center justify-center gap-2 rounded-md text-[17px] font-semibold active:opacity-60",
            st.running ? "bg-surface" : "bg-ink text-on-ink",
          )}
        >
          <PlayIcon className="size-5" />
          Start
        </button>
        <button
          type="button"
          aria-label="Add minutes done earlier"
          onClick={onAdd}
          className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-surface active:opacity-60"
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  );
}

function FocusScreen() {
  const { data: d } = useFocusDay();
  const st = useFocusState();
  const [add, setAdd] = useState(false);
  const [starting, setStarting] = useState(false);
  const [editing, setEditing] = useState<FocusEntryDto | null>(null);
  const tags = d?.settings.tags ?? [];
  // Re-computed with each state tick, so a running timer's change grows.
  // biome-ignore lint/correctness/useExhaustiveDependencies: st is the tick
  const effects = useMemo(() => (d ? entryEffects(d, Date.now()) : new Map()), [d, st]);
  const today =
    st && d
      ? d.entries
          .filter((e) => e.startedAt >= st.dayStartedAt)
          .sort((a, b) => b.startedAt - a.startedAt)
      : [];

  return (
    <Screen
      back="/"
      title="Focus"
      right={
        <>
          <IconLink to="/focus/stats" label="Focus stats">
            <ChartIcon />
          </IconLink>
          <IconLink to="/focus/settings" label="Focus settings" className="-mr-1">
            <SlidersIcon />
          </IconLink>
        </>
      }
      footer={
        st && <Actions st={st} onStart={() => setStarting(true)} onAdd={() => setAdd(true)} />
      }
    >
      {st && d && (
        <>
          <div className="mt-2">
            <SleepPicker st={st} />
          </div>
          <div className="mt-6">
            <Summary d={d} st={st} />
          </div>
          <div className="mt-8">
            <Totals st={st} />
          </div>
          <Entries entries={today} effects={effects} onEdit={setEditing} />
        </>
      )}
      {/* Outside the sticky footer, which would trap the sheets under the header. */}
      <StartSheet open={starting} onClose={() => setStarting(false)} tags={tags} />
      <AddSheet open={add} onClose={() => setAdd(false)} tags={tags} />
      <EditSheet entry={editing} onClose={() => setEditing(null)} tags={tags} />
    </Screen>
  );
}
