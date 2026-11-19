import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { weightStep } from "../../../shared/workouts/seed";
import type { SetDto } from "../../../shared/workouts/types";
import { useDeleteWorkout, useExercises, useWorkout } from "../../features/workouts/api";
import { SetEditor } from "../../features/workouts/SetEditor";
import { fmtDay, fmtDuration, fmtSet } from "../../lib/format";
import { useConfirm } from "../../lib/useConfirm";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { Screen } from "../../ui/Screen";

export const Route = createFileRoute("/workouts/history/$workoutId")({ component: History });

function History() {
  const { workoutId } = Route.useParams();
  const workout = useWorkout(workoutId);
  const exercises = useExercises();
  const remove = useDeleteWorkout();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<SetDto | null>(null);

  const w = workout.data;
  const byExercise = new Map<string, SetDto[]>();
  for (const s of w?.sets ?? [])
    byExercise.set(s.exerciseId, [...(byExercise.get(s.exerciseId) ?? []), s]);
  const exercise = (id: string) => exercises.data?.find((e) => e.id === id);
  const editingEx = editing ? exercise(editing.exerciseId) : undefined;

  return (
    <Screen
      back="/workouts"
      title={w ? fmtDay(w.localDate) : ""}
      right={
        w?.endedAt && (
          <span className="num pr-2 text-[15px] text-ink-2">
            {fmtDuration(w.endedAt - w.startedAt)}
          </span>
        )
      }
      footer={
        w && (
          <Button
            variant="danger"
            onClick={() =>
              confirm.run(() =>
                remove.mutate(w.id, { onSuccess: () => navigate({ to: "/workouts" }) }),
              )
            }
          >
            {confirm.armed ? "Delete workout?" : "Delete workout"}
          </Button>
        )
      }
    >
      {[...byExercise.entries()].map(([exerciseId, sets]) => {
        let n = 0;
        return (
          <section key={exerciseId} className="mb-6">
            <div className="mb-1 text-[17px] font-semibold">
              {exercise(exerciseId)?.name ?? "–"}
            </div>
            <div className="border-t border-line">
              {sets.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setEditing(s)}
                  className="flex min-h-11 w-full items-center gap-3 border-b border-line text-left active:opacity-60"
                >
                  <span className="num w-6 text-[13px] text-ink-3">
                    {s.kind === "warmup" ? "W" : ++n}
                  </span>
                  <span className={cx("num text-[17px]", s.kind === "warmup" && "text-ink-2")}>
                    {fmtSet(s)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
      <SetEditor
        set={editing}
        weightStep={editingEx ? weightStep(editingEx.equipment) : 2.5}
        onClose={() => setEditing(null)}
      />
    </Screen>
  );
}
