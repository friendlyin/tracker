import { Button } from "../../ui/Button";
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

/** Set entry: kind, then − / + around weight and reps (both typeable), then Log. */
export function Logger(p: LoggerProps) {
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
