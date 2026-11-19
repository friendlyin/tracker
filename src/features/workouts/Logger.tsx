import { useState } from "react";
import { useVariant } from "../../dev/variants";
import { fmtKg } from "../../lib/format";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { BackspaceIcon } from "../../ui/icons";
import { Segmented } from "../../ui/Segmented";
import { Stepper } from "../../ui/Stepper";
import { kindOptions } from "./SetEditor";

export type Kind = "warmup" | "working";

export interface LoggerProps {
  kind: Kind;
  reps: number;
  weightKg: number | null;
  weightStep: number;
  onKind: (k: Kind) => void;
  onReps: (n: number) => void;
  onWeight: (n: number | null) => void;
  onLog: () => void;
  busy?: boolean;
}

/** Variant "steppers": − / + around each value, typeable. */
function Steppers(p: LoggerProps) {
  return (
    <div className="flex flex-col gap-3">
      <Segmented value={p.kind} options={kindOptions} onChange={p.onKind} />
      <Stepper
        label="kg"
        unit="kg"
        decimal
        size="lg"
        step={p.weightStep}
        value={p.weightKg}
        onChange={p.onWeight}
      />
      <Stepper
        label="reps"
        unit="reps"
        size="lg"
        min={1}
        value={p.reps}
        onChange={(n) => p.onReps(n ?? 1)}
      />
      <Button onClick={p.onLog} disabled={p.busy}>
        Log
      </Button>
    </div>
  );
}

/** Variant "keypad": two fields and an on-screen number pad; the first key replaces the value. */
function Keypad(p: LoggerProps) {
  const [field, setField] = useState<"kg" | "reps">("kg");
  const [fresh, setFresh] = useState(true);
  const text = field === "kg" ? fmtKg(p.weightKg) : String(p.reps);

  const apply = (t: string) => {
    if (field === "kg") {
      const n = t === "" ? null : Number(t);
      if (n === null || (Number.isFinite(n) && n <= 1000)) p.onWeight(n);
    } else {
      const n = Number(t || "0");
      if (Number.isInteger(n) && n <= 200) p.onReps(Math.max(1, n));
    }
  };
  const press = (k: string) => {
    if (k === "⌫") {
      apply(text.slice(0, -1));
      setFresh(false);
      return;
    }
    if (k === "." && field === "reps") return;
    apply(fresh ? (k === "." ? "0." : k) : text + k);
    setFresh(false);
  };
  const select = (f: "kg" | "reps") => {
    setField(f);
    setFresh(true);
  };

  const renderField = (f: "kg" | "reps", value: string, unit: string) => (
    <button
      key={f}
      type="button"
      onClick={() => select(f)}
      className={cx(
        "flex h-16 flex-1 items-baseline justify-center gap-1 rounded-md pt-3",
        field === f ? "bg-ink text-on-ink" : "bg-surface",
      )}
    >
      <span className="num text-[30px] font-semibold leading-none">{value || "–"}</span>
      <span className="text-[13px] opacity-60">{unit}</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <Segmented value={p.kind} options={kindOptions} onChange={p.onKind} />
      <div className="flex gap-2">
        {renderField("kg", fmtKg(p.weightKg), "kg")}
        {renderField("reps", String(p.reps), "reps")}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((k, i) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className={cx(
              "grid h-12 place-items-center rounded-md bg-surface text-[22px] font-medium active:opacity-60",
              // 3 columns of digits + one column with the Log button
              i % 3 === 0 && "col-start-1",
            )}
            aria-label={k === "⌫" ? "Delete digit" : k}
          >
            {k === "⌫" ? <BackspaceIcon /> : k}
          </button>
        ))}
        <button
          type="button"
          onClick={p.onLog}
          disabled={p.busy}
          className="col-start-4 row-span-4 row-start-1 rounded-md bg-ink text-[17px] font-semibold text-on-ink active:opacity-70 disabled:opacity-40"
        >
          Log
        </button>
      </div>
    </div>
  );
}

export function Logger(props: LoggerProps) {
  const V = useVariant("exercise.logger", { steppers: Steppers, keypad: Keypad });
  return <V {...props} />;
}
