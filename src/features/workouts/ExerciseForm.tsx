import { useState } from "react";
import { GROUP_LABELS, MUSCLE_GROUPS, type MuscleGroup } from "../../../shared/workouts/groups";
import type { Equipment } from "../../../shared/workouts/seed";
import type { ExerciseDto } from "../../../shared/workouts/types";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { SectionLabel } from "../../ui/Row";
import { Stepper } from "../../ui/Stepper";

const EQUIPMENT: { value: Equipment; label: string }[] = [
  { value: "barbell", label: "Barbell" },
  { value: "dumbbell", label: "Dumbbell" },
  { value: "cable", label: "Cable" },
  { value: "machine", label: "Machine" },
  { value: "bodyweight", label: "Bodyweight" },
];

/** Tapping a group cycles its contribution: none → 1 → 0.5 → 0.25 → none. */
const CYCLE: Record<string, number> = { "0": 1, "1": 0.5, "0.5": 0.25, "0.25": 0 };

export interface ExerciseFormValue {
  name: string;
  equipment: Equipment;
  muscles: { group: MuscleGroup; contribution: 1 | 0.5 | 0.25 }[];
  recSets: number;
  recRepsMin: number;
  recRepsMax: number;
}

export function fromExercise(e: ExerciseDto): ExerciseFormValue {
  return {
    name: e.name,
    equipment: e.equipment,
    muscles: e.muscles.map((m) => ({
      group: m.group,
      contribution: m.contribution as 1 | 0.5 | 0.25,
    })),
    recSets: e.recSets,
    recRepsMin: e.recRepsMin,
    recRepsMax: e.recRepsMax,
  };
}

export function ExerciseForm({
  initial,
  onSave,
  saving,
}: {
  initial: ExerciseFormValue;
  onSave: (v: ExerciseFormValue) => void;
  saving?: boolean;
}) {
  const [v, setV] = useState(initial);
  const contribution = (g: MuscleGroup) => v.muscles.find((m) => m.group === g)?.contribution ?? 0;
  const cycle = (g: MuscleGroup) => {
    const next = CYCLE[String(contribution(g))] ?? 0;
    const rest = v.muscles.filter((m) => m.group !== g);
    setV({
      ...v,
      muscles: next ? [...rest, { group: g, contribution: next as 1 | 0.5 | 0.25 }] : rest,
    });
  };
  const valid =
    v.name.trim().length > 0 &&
    v.muscles.some((m) => m.contribution === 1) &&
    v.recRepsMin <= v.recRepsMax;

  return (
    <div className="flex flex-col">
      <input
        className="h-13 border-b border-line bg-transparent text-[22px] font-semibold outline-none placeholder:text-ink-3"
        placeholder="Name"
        value={v.name}
        onChange={(e) => setV({ ...v, name: e.target.value })}
      />

      <SectionLabel>Muscles</SectionLabel>
      <div className="grid grid-cols-2 gap-1.5">
        {MUSCLE_GROUPS.map((g) => {
          const c = contribution(g);
          return (
            <button
              key={g}
              type="button"
              onClick={() => cycle(g)}
              className={cx(
                "flex h-11 items-center justify-between rounded-md px-3 text-[15px]",
                c === 1
                  ? "bg-ink text-on-ink"
                  : c > 0
                    ? "bg-surface outline-1 outline-ink -outline-offset-1"
                    : "bg-surface text-ink-2",
              )}
            >
              <span className="truncate">{GROUP_LABELS[g]}</span>
              {c > 0 && <span className="num">{c}</span>}
            </button>
          );
        })}
      </div>

      <SectionLabel>Equipment</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {EQUIPMENT.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setV({ ...v, equipment: o.value })}
            className={cx(
              "h-10 rounded-md px-3 text-[15px]",
              v.equipment === o.value ? "bg-ink text-on-ink" : "bg-surface text-ink-2",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      <SectionLabel>Sets</SectionLabel>
      <Stepper
        label="sets"
        min={1}
        max={10}
        value={v.recSets}
        onChange={(n) => setV({ ...v, recSets: n ?? 1 })}
      />
      <SectionLabel>Reps</SectionLabel>
      <div className="flex flex-col gap-2">
        <Stepper
          label="min reps"
          unit="min"
          min={1}
          max={100}
          value={v.recRepsMin}
          onChange={(n) => setV({ ...v, recRepsMin: n ?? 1 })}
        />
        <Stepper
          label="max reps"
          unit="max"
          min={1}
          max={100}
          value={v.recRepsMax}
          onChange={(n) => setV({ ...v, recRepsMax: n ?? 1 })}
        />
      </div>

      <Button
        className="mt-8"
        disabled={!valid || saving}
        onClick={() => onSave({ ...v, name: v.name.trim() })}
      >
        Save
      </Button>
    </div>
  );
}
