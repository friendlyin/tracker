import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  type FocusSettingsPatch,
  SLEEP_LABEL,
  type SleepQuality,
  sleepQualities,
} from "../../../shared/focus/settings";
import { useFocusSettings, useUpdateFocusSettings } from "../../features/focus/api";
import { CloseIcon, PlusIcon } from "../../ui/icons";
import { SectionLabel } from "../../ui/Row";
import { Screen } from "../../ui/Screen";
import { Segmented } from "../../ui/Segmented";
import { Stepper } from "../../ui/Stepper";

export const Route = createFileRoute("/focus/settings")({ component: FocusSettingsScreen });

function Tags({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setText("");
  };
  return (
    <div>
      {tags.map((t) => (
        <div key={t} className="flex min-h-13 items-center border-b border-line">
          <span className="flex-1 text-[17px]">{t}</span>
          <button
            type="button"
            aria-label={`Remove ${t}`}
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="-mr-2 grid size-11 place-items-center text-ink-3 active:opacity-60"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>
      ))}
      <form
        className="flex min-h-13 items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          aria-label="New tag"
          value={text}
          maxLength={30}
          onChange={(e) => setText(e.target.value)}
          placeholder="tag"
          className="h-11 min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-ink-3"
        />
        <button
          type="submit"
          aria-label="Add tag"
          disabled={!text.trim()}
          className="-mr-2 grid size-11 place-items-center disabled:opacity-40"
        >
          <PlusIcon />
        </button>
      </form>
    </div>
  );
}

function FocusSettingsScreen() {
  const { data: s } = useFocusSettings();
  const update = useUpdateFocusSettings();
  const set = (patch: FocusSettingsPatch) => update.mutate(patch);
  const num = (f: (n: number) => FocusSettingsPatch) => (n: number | null) =>
    n !== null && set(f(n));

  return (
    <Screen back="/focus" title="Focus">
      {s && (
        <>
          <SectionLabel>Sleep: start / ceiling</SectionLabel>
          <div className="space-y-3">
            {sleepQualities.map((q: SleepQuality) => (
              <div key={q} className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-[13px] text-ink-2">{SLEEP_LABEL[q]}</span>
                <div className="min-w-0 flex-1">
                  <Stepper
                    label={`${q} start`}
                    step={5}
                    min={0}
                    max={100}
                    value={s.sleep[q].start}
                    onChange={num((n) => ({ sleep: { [q]: { start: n } } }))}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <Stepper
                    label={`${q} ceiling`}
                    step={5}
                    min={0}
                    max={100}
                    value={s.sleep[q].ceiling}
                    onChange={num((n) => ({ sleep: { [q]: { ceiling: n } } }))}
                  />
                </div>
              </div>
            ))}
          </div>

          <SectionLabel>Until sleep is set</SectionLabel>
          <Segmented
            value={s.defaultSleep}
            options={sleepQualities.map((q) => ({ value: q, label: SLEEP_LABEL[q] }))}
            onChange={(q) => set({ defaultSleep: q })}
          />

          <SectionLabel>Drain per hour</SectionLabel>
          <div className="space-y-3">
            {(["baseline", "moderate", "deep"] as const).map((k) => (
              <Stepper
                key={k}
                label={`${k} drain`}
                unit={k === "baseline" ? "per hour, ordinary" : `per hour, ${k} focus`}
                step={1}
                min={0}
                max={100}
                value={s.drain[k]}
                onChange={num((n) => ({ drain: { [k]: n } }))}
              />
            ))}
          </div>

          <SectionLabel>Unfocus</SectionLabel>
          <div className="space-y-3">
            <Stepper
              label="Restore per minute"
              unit="per min at full energy"
              step={0.1}
              min={0}
              max={10}
              decimal
              value={s.restorePerMin}
              onChange={num((n) => ({ restorePerMin: n }))}
            />
            <Stepper
              label="Restore floor"
              unit="× restore at zero energy"
              step={0.05}
              min={0}
              max={1}
              decimal
              value={s.restoreFloor}
              onChange={num((n) => ({ restoreFloor: n }))}
            />
          </div>

          <SectionLabel>At or below</SectionLabel>
          <div className="space-y-3">
            {(["suggest", "recommend", "urgent"] as const).map((k) => (
              <Stepper
                key={k}
                label={`${k} threshold`}
                unit={k}
                step={5}
                min={0}
                max={100}
                value={s.thresholds[k]}
                onChange={num((n) => ({ thresholds: { [k]: n } }))}
              />
            ))}
          </div>
          {update.isError && (
            <div className="mt-2 text-[13px] text-warn">{update.error.message}</div>
          )}

          <SectionLabel>Moderate tags</SectionLabel>
          <Tags tags={s.tags} onChange={(tags) => set({ tags })} />
        </>
      )}
    </Screen>
  );
}
