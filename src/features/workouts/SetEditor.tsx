import { useEffect, useState } from "react";
import type { SetDto } from "../../../shared/workouts/types";
import { Button } from "../../ui/Button";
import { Segmented } from "../../ui/Segmented";
import { Sheet } from "../../ui/Sheet";
import { Stepper } from "../../ui/Stepper";
import { useDeleteSet, useUpdateSet } from "./api";

export const kindOptions = [
  { value: "warmup" as const, label: "Warm-up" },
  { value: "working" as const, label: "Working" },
];

/** Edit or delete one logged set. */
export function SetEditor({
  set,
  weightStep,
  onClose,
}: {
  set: SetDto | null;
  weightStep: number;
  onClose: () => void;
}) {
  const update = useUpdateSet();
  const remove = useDeleteSet();
  const [draft, setDraft] = useState(set);
  useEffect(() => setDraft(set), [set]);

  return (
    <Sheet open={set !== null} onClose={onClose}>
      {draft && (
        <div className="flex flex-col gap-4 pb-2">
          <Segmented
            value={draft.kind}
            options={kindOptions}
            onChange={(kind) => setDraft({ ...draft, kind })}
          />
          <Stepper
            label="kg"
            unit="kg"
            decimal
            step={weightStep}
            value={draft.weightKg}
            onChange={(weightKg) => setDraft({ ...draft, weightKg })}
          />
          <Stepper
            label="reps"
            unit="reps"
            min={1}
            value={draft.reps}
            onChange={(reps) => setDraft({ ...draft, reps: reps ?? 1 })}
          />
          <Button
            onClick={() => {
              update.mutate(draft);
              onClose();
            }}
          >
            Save
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              remove.mutate(draft);
              onClose();
            }}
          >
            Delete
          </Button>
        </div>
      )}
    </Sheet>
  );
}
