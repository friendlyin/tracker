import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { FocusKind } from "../../../shared/focus/schemas";
import { SLEEP_LABEL, type SleepQuality, sleepQualities } from "../../../shared/focus/settings";
import type { FocusEntryDto, FocusStateDto } from "../../../shared/focus/types";
import { zonedInstant } from "../../../shared/schedule";
import { localDate } from "../../../shared/time";
import {
  useDeleteFocus,
  useFocusDay,
  useFocusLog,
  useFocusState,
  useSetSleep,
  useStopFocus,
  useUpdateFocus,
} from "../../features/focus/api";
import { Elapsed, KIND_LABEL, Summary, Totals } from "../../features/focus/Summary";
import { deviceTimeZone } from "../../lib/api";
import { fmtDuration, fmtTime } from "../../lib/format";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { PlayIcon, PlusIcon, SlidersIcon, StopIcon } from "../../ui/icons";
import { IconLink, Screen } from "../../ui/Screen";
import { Segmented } from "../../ui/Segmented";
import { Sheet } from "../../ui/Sheet";
import { Stepper } from "../../ui/Stepper";

export const Route = createFileRoute("/focus/")({ component: FocusScreen });

const MIN = 60_000;
const kinds: FocusKind[] = ["deep", "moderate", "unfocus"];

/** "HH:MM" of an instant on the device clock (for time inputs). */
const hhmm = (ms: number) => new Date(ms).toTimeString().slice(0, 5);

/** A time typed today; a time later than now means yesterday (just after midnight). */
function todayAt(time: string): number {
  const tz = deviceTimeZone();
  const now = Date.now();
  const t = zonedInstant(localDate(now, tz), time, tz);
  return t > now ? t - 24 * 60 * MIN : t;
}

const label = (e: { kind: FocusKind; tag: string | null }) =>
  e.tag ? `${KIND_LABEL[e.kind]} · ${e.tag}` : KIND_LABEL[e.kind];

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

function Entries({
  entries,
  onEdit,
}: {
  entries: FocusEntryDto[];
  onEdit: (e: FocusEntryDto) => void;
}) {
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
            {fmtTime(e.startedAt)}–{e.endedAt !== null && fmtTime(e.endedAt)}
          </span>
          <span className="flex-1 text-[17px]">{label(e)}</span>
          {e.endedAt === null ? (
            <Elapsed since={e.startedAt} className="text-[15px] text-ink-2" />
          ) : (
            <span className="num text-[15px] text-ink-2">
              {fmtDuration(e.endedAt - e.startedAt)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Add a session afterwards: kind, tag, start and length. */
function AddSheet({ open, onClose, tags }: { open: boolean; onClose: () => void; tags: string[] }) {
  return (
    <Sheet open={open} onClose={onClose}>
      <AddForm onClose={onClose} tags={tags} />
    </Sheet>
  );
}

/** Mounted on open, so the default start is "30 min ago" from now. */
function AddForm({ onClose, tags }: { onClose: () => void; tags: string[] }) {
  const log = useFocusLog();
  const [kind, setKind] = useState<FocusKind>("deep");
  const [tag, setTag] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<number | null>(30);
  const [start, setStart] = useState(() => hhmm(Date.now() - 30 * MIN));
  return (
    <>
      <Segmented
        value={kind}
        options={kinds.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
        onChange={setKind}
      />
      {kind === "moderate" && (
        <div className="mt-4">
          <TagPicker tags={tags} value={tag} onChange={setTag} />
        </div>
      )}
      <div className="mt-4 flex items-center gap-3">
        <input
          type="time"
          aria-label="Start"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="num h-11 w-36 shrink-0 rounded-md bg-surface px-3 text-[17px]"
        />
        <div className="flex-1">
          <Stepper
            label="Minutes"
            unit="min"
            step={5}
            min={1}
            max={24 * 60}
            value={minutes}
            onChange={setMinutes}
          />
        </div>
      </div>
      <Button
        className="mt-4 mb-2"
        disabled={!minutes || !start}
        onClick={() => {
          if (!minutes || !start) return;
          log.log({
            kind,
            tag: kind === "moderate" ? (tag ?? undefined) : undefined,
            at: todayAt(start),
            minutes,
          });
          onClose();
        }}
      >
        Add
      </Button>
    </>
  );
}

/** Fix a session: start, length (empty keeps a timer running), tag; or delete it. */
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
  const length =
    entry.endedAt === null ? null : Math.round((entry.endedAt - entry.startedAt) / MIN);
  const [start, setStart] = useState(hhmm(entry.startedAt));
  const [minutes, setMinutes] = useState<number | null>(length);
  const [tag, setTag] = useState(entry.tag);
  return (
    <>
      <div className="text-[17px] font-semibold">{KIND_LABEL[entry.kind]}</div>
      {entry.kind === "moderate" && (
        <div className="mt-4">
          <TagPicker tags={tags} value={tag} onChange={setTag} />
        </div>
      )}
      <div className="mt-4 flex items-center gap-3">
        <input
          type="time"
          aria-label="Start"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="num h-11 w-36 shrink-0 rounded-md bg-surface px-3 text-[17px]"
        />
        <div className="flex-1">
          <Stepper
            label="Minutes"
            unit="min"
            step={5}
            min={1}
            max={24 * 60}
            placeholder="running"
            value={minutes}
            onChange={setMinutes}
          />
        </div>
      </div>
      <Button
        className="mt-4"
        disabled={!start || (length !== null && !minutes)}
        onClick={() => {
          const at = hhmm(entry.startedAt) === start ? undefined : todayAt(start);
          update.mutate({
            id: entry.id,
            at,
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

function TagSheet({
  open,
  onClose,
  tags,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  tags: string[];
  onPick: (t: string | null) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose}>
      <div className="mb-3 text-[17px] font-semibold">{KIND_LABEL.moderate}</div>
      <div className="mb-2">
        <TagPicker
          tags={tags}
          onChange={(t) => {
            onPick(t);
            onClose();
          }}
        />
      </div>
    </Sheet>
  );
}

function Actions({
  st,
  onModerate,
  onAdd,
}: {
  st: FocusStateDto;
  onModerate: () => void;
  onAdd: () => void;
}) {
  const log = useFocusLog();
  const { stop } = useStopFocus();
  const btn =
    "flex h-14 flex-1 items-center justify-center gap-1.5 rounded-md text-[15px] font-semibold active:opacity-60";
  return (
    <div className="pb-3">
      {st.running && (
        <div className="mb-3 flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[13px] text-ink-2">{label(st.running)}</div>
            <Elapsed
              since={st.running.startedAt}
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
        {kinds.map((k) => {
          const on = st.running?.kind === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => (on ? stop() : k === "moderate" ? onModerate() : log.start(k))}
              className={cx(btn, on ? "bg-ink text-on-ink" : "bg-surface")}
            >
              {!on && <PlayIcon className="size-4" />}
              {KIND_LABEL[k]}
            </button>
          );
        })}
        <button
          type="button"
          aria-label="Add a session afterwards"
          onClick={onAdd}
          className="grid h-14 w-12 shrink-0 place-items-center rounded-md bg-surface active:opacity-60"
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
  const log = useFocusLog();
  const [add, setAdd] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [editing, setEditing] = useState<FocusEntryDto | null>(null);
  const tags = d?.settings.tags ?? [];
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
        <IconLink to="/focus/settings" label="Focus settings" className="-mr-1">
          <SlidersIcon />
        </IconLink>
      }
      footer={
        st && (
          <Actions
            st={st}
            onModerate={() => (tags.length > 0 ? setTagging(true) : log.start("moderate"))}
            onAdd={() => setAdd(true)}
          />
        )
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
          <Entries entries={today} onEdit={setEditing} />
        </>
      )}
      {/* Outside the sticky footer, which would trap the sheets under the header. */}
      <AddSheet open={add} onClose={() => setAdd(false)} tags={tags} />
      <TagSheet
        open={tagging}
        onClose={() => setTagging(false)}
        tags={tags}
        onPick={(t) => log.start("moderate", t ?? undefined)}
      />
      <EditSheet entry={editing} onClose={() => setEditing(null)} tags={tags} />
    </Screen>
  );
}
