import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { nextKind, prefillSet } from "../../../shared/workouts/prefill";
import { weightStep } from "../../../shared/workouts/seed";
import type { SetDto } from "../../../shared/workouts/types";
import {
  newSet,
  useAddSet,
  useExerciseHistory,
  useExercises,
  useOverview,
  useStartWorkout,
} from "../../features/workouts/api";
import { type Kind, Logger } from "../../features/workouts/Logger";
import { SetEditor } from "../../features/workouts/SetEditor";
import { fmtDay, fmtSet } from "../../lib/format";
import { cx } from "../../ui/cx";
import { EditIcon } from "../../ui/icons";
import { IconLink, Screen } from "../../ui/Screen";

export const Route = createFileRoute("/workouts/exercise/$exerciseId")({
  component: ExerciseScreen,
});

function SetLine({ s, index, onTap }: { s: SetDto; index: number; onTap?: () => void }) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={!onTap}
      className="flex min-h-11 w-full items-center gap-3 border-b border-line text-left active:opacity-60"
    >
      <span className="num w-6 text-[13px] text-ink-3">{s.kind === "warmup" ? "W" : index}</span>
      <span className={cx("num text-[17px]", s.kind === "warmup" && "text-ink-2")}>
        {fmtSet(s)}
      </span>
    </button>
  );
}

function ExerciseScreen() {
  const { exerciseId } = Route.useParams();
  const exercises = useExercises();
  const overview = useOverview();
  const history = useExerciseHistory(exerciseId);
  const start = useStartWorkout();
  const add = useAddSet();
  const [editing, setEditing] = useState<SetDto | null>(null);

  const ex = exercises.data?.find((e) => e.id === exerciseId);
  const active = overview.data?.active ?? null;
  const today = useMemo(
    () => (active?.sets ?? []).filter((s) => s.exerciseId === exerciseId),
    [active?.sets, exerciseId],
  );
  const last = history.data?.find((h) => h.workoutId !== active?.id);
  const previous = last?.sets ?? [];

  const [kindOverride, setKindOverride] = useState<Kind | null>(null);
  const kind = kindOverride ?? nextKind(previous, today);
  const suggested = prefillSet(kind, previous, today, ex?.recRepsMin ?? 8);
  const [reps, setReps] = useState<number | null>(null);
  const [weight, setWeight] = useState<number | null | undefined>(undefined);

  // When the suggestion changes (new set logged, kind switched, data loaded), drop manual edits.
  const suggestionKey = `${kind}|${suggested.reps}|${suggested.weightKg}|${today.length}`;
  useEffect(() => {
    void suggestionKey;
    setReps(null);
    setWeight(undefined);
  }, [suggestionKey]);

  const repsValue = reps ?? suggested.reps;
  const weightValue = weight === undefined ? suggested.weightKg : weight;

  const log = async () => {
    const workout = active ?? (await start.mutateAsync());
    add.mutate(
      newSet(
        { workoutId: workout.id, exerciseId, kind, reps: repsValue, weightKg: weightValue },
        workout.sets.length,
      ),
    );
    setKindOverride(null);
  };

  let working = 0;
  const numbered = (sets: SetDto[]) => {
    working = 0;
    return sets.map((s) => ({ s, n: s.kind === "working" ? ++working : 0 }));
  };

  return (
    <Screen
      back="/workouts"
      title={ex?.name}
      right={
        ex && (
          <IconLink to="/workouts/edit/$exerciseId" params={{ exerciseId }} label="Edit exercise">
            <EditIcon />
          </IconLink>
        )
      }
      footer={
        ex && (
          <Logger
            kind={kind}
            reps={repsValue}
            weightKg={weightValue}
            weightStep={weightStep(ex.equipment)}
            onKind={setKindOverride}
            onReps={setReps}
            onWeight={setWeight}
            onLog={log}
            busy={start.isPending}
          />
        )
      }
    >
      {ex && (
        <div className="num mb-4 text-[15px] text-ink-2">
          {ex.recSets} ×{" "}
          {ex.recRepsMin === ex.recRepsMax ? ex.recRepsMin : `${ex.recRepsMin}–${ex.recRepsMax}`}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <section>
          <div className="mb-1 text-[13px] text-ink-3">{last ? fmtDay(last.localDate) : "–"}</div>
          <div className="border-t border-line">
            {numbered(previous).map(({ s, n }) => (
              <SetLine key={s.id} s={s} index={n} />
            ))}
          </div>
        </section>
        {today.length > 0 && (
          <section>
            <div className="mb-1 text-[13px] text-ink-3">Today</div>
            <div className="border-t border-line">
              {numbered(today).map(({ s, n }) => (
                <SetLine key={s.id} s={s} index={n} onTap={() => setEditing(s)} />
              ))}
            </div>
          </section>
        )}
      </div>

      {ex && (
        <SetEditor
          set={editing}
          weightStep={weightStep(ex.equipment)}
          onClose={() => setEditing(null)}
        />
      )}
    </Screen>
  );
}
