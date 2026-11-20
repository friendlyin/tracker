import { useState } from "react";
import { readJson, writeJson } from "../../lib/storage";
import { Segmented } from "../../ui/Segmented";
import { Stepper } from "../../ui/Stepper";

// The countdown length for a new timer: ∞ counts up, or a number of minutes. The last choice is
// remembered per key on this device.

const PRESETS = [25, 45, 60, 90] as const;
type Choice = "up" | "25" | "45" | "60" | "90" | "custom";

/** The remembered length (minutes, or null to count up). */
export const timerLength = (key: string) => readJson<number | null>(key, null);

export function useTimerLength(key: string) {
  const [value, setValue] = useState(() => timerLength(key));
  const set = (v: number | null) => {
    setValue(v);
    writeJson(key, v);
  };
  return [value, set] as const;
}

const choiceOf = (v: number | null): Choice =>
  v === null ? "up" : (PRESETS as readonly number[]).includes(v) ? (String(v) as Choice) : "custom";

export function LengthPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const [custom, setCustom] = useState(choiceOf(value) === "custom");
  const choice = custom ? "custom" : choiceOf(value);
  return (
    <div>
      <Segmented<Choice>
        value={choice}
        options={[
          { value: "up", label: "∞" },
          ...PRESETS.map((n) => ({ value: String(n) as Choice, label: String(n) })),
          { value: "custom", label: "…" },
        ]}
        onChange={(c) => {
          setCustom(c === "custom");
          if (c === "up") onChange(null);
          else if (c !== "custom") onChange(Number(c));
          else onChange(value ?? 30);
        }}
      />
      {choice === "custom" && (
        <div className="mt-2">
          <Stepper
            label="Timer length"
            value={value}
            onChange={(v) => onChange(v === null ? null : Math.max(1, Math.round(v)))}
            step={5}
            min={1}
            max={1440}
            unit="min"
          />
        </div>
      )}
    </div>
  );
}
