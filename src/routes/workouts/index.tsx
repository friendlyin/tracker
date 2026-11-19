import { createFileRoute, Link } from "@tanstack/react-router";
import { useFinishWorkout, useOverview, useStartWorkout } from "../../features/workouts/api";
import { BudgetList } from "../../features/workouts/BudgetList";
import { fmtClock, fmtDay, fmtSets } from "../../lib/format";
import { useConfirm } from "../../lib/useConfirm";
import { useNow } from "../../lib/useNow";
import { Button } from "../../ui/Button";
import { ChartIcon, ChevronIcon, SlidersIcon } from "../../ui/icons";
import { IconLink, Screen } from "../../ui/Screen";

export const Route = createFileRoute("/workouts/")({ component: Workouts });

function Workouts() {
  const { data } = useOverview();
  const start = useStartWorkout();
  const finish = useFinishWorkout();
  const confirm = useConfirm();
  const now = useNow();
  const active = data?.active ?? null;

  const footer = active ? (
    <Button
      variant={confirm.armed ? "primary" : "quiet"}
      onClick={() => confirm.run(() => finish.mutate(active.id))}
    >
      {confirm.armed ? "Finish?" : "Finish"}
      <span className="num font-normal opacity-60">{fmtClock(now - active.startedAt)}</span>
    </Button>
  ) : (
    <Button onClick={() => start.mutate()} disabled={start.isPending || !data}>
      Start
    </Button>
  );

  return (
    <Screen
      back="/"
      title="Workouts"
      right={
        <>
          <IconLink to="/workouts/stats" label="Workout stats">
            <ChartIcon />
          </IconLink>
          <IconLink to="/workouts/settings" label="Workout settings">
            <SlidersIcon />
          </IconLink>
        </>
      }
      footer={footer}
    >
      {data && (
        <>
          <div className="mt-1 mb-5 flex items-baseline gap-2">
            <span className="num text-[40px] leading-none font-semibold">
              {fmtSets(data.plan.totals.done)}
            </span>
            <span className="num text-[17px] text-ink-2">/ {data.plan.totals.target}</span>
            <span className="num ml-auto text-[15px] text-ink-2">
              {data.plan.remainingWorkouts} × left
            </span>
          </div>

          <BudgetList groups={data.plan.groups} />

          {!active && data.recent.length > 0 && (
            <div className="mt-8 border-t border-line">
              {data.recent.map((w) => (
                <Link
                  key={w.id}
                  to="/workouts/history/$workoutId"
                  params={{ workoutId: w.id }}
                  className="flex min-h-14 items-center gap-3 border-b border-line active:opacity-60"
                >
                  <span className="w-24 shrink-0 text-[15px]">{fmtDay(w.localDate)}</span>
                  <span className="min-w-0 flex-1 truncate text-[15px] text-ink-2">
                    {w.exercises.join(", ")}
                  </span>
                  <span className="num text-[15px] text-ink-2">{w.workingSets}</span>
                  <ChevronIcon className="text-ink-3" width={18} height={18} />
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </Screen>
  );
}
