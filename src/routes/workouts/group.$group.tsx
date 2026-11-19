import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { GROUP_LABELS, isMuscleGroup } from "../../../shared/workouts/groups";
import type { ExerciseDto } from "../../../shared/workouts/types";
import { useExercises, useOverview } from "../../features/workouts/api";
import { fmtSets } from "../../lib/format";
import { ChevronIcon, PlusIcon } from "../../ui/icons";
import { IconLink, Screen } from "../../ui/Screen";

export const Route = createFileRoute("/workouts/group/$group")({
  beforeLoad: ({ params }) => {
    if (!isMuscleGroup(params.group)) throw notFound();
  },
  component: Group,
});

function Group() {
  const { group: raw } = Route.useParams();
  const group = isMuscleGroup(raw) ? raw : "chest";
  const exercises = useExercises();
  const overview = useOverview();
  const plan = overview.data?.plan.groups.find((g) => g.group === group);
  const todaySets = overview.data?.active?.sets ?? [];

  const contributionOf = (e: ExerciseDto) =>
    e.muscles.find((m) => m.group === group)?.contribution ?? 0;
  const list = (exercises.data ?? []).filter((e) => !e.archived && contributionOf(e) > 0);
  const primary = list.filter((e) => contributionOf(e) === 1);
  const secondary = list.filter((e) => contributionOf(e) < 1);

  const row = (e: ExerciseDto) => {
    const done = todaySets.filter((s) => s.exerciseId === e.id && s.kind === "working").length;
    return (
      <Link
        key={e.id}
        to="/workouts/exercise/$exerciseId"
        params={{ exerciseId: e.id }}
        className="flex min-h-14 items-center gap-3 border-b border-line active:opacity-60"
      >
        <span className="min-w-0 flex-1 truncate text-[17px]">{e.name}</span>
        {contributionOf(e) < 1 && (
          <span className="num text-[13px] text-ink-3">×{contributionOf(e)}</span>
        )}
        {done > 0 && <span className="num text-[15px] font-semibold">{done}</span>}
        <ChevronIcon className="text-ink-3" width={18} height={18} />
      </Link>
    );
  };

  return (
    <Screen
      back="/workouts"
      title={GROUP_LABELS[group]}
      right={
        <IconLink to="/workouts/new" search={{ group }} label="New exercise">
          <PlusIcon />
        </IconLink>
      }
    >
      {plan && (
        <div className="mt-1 mb-4 flex items-baseline gap-2 text-ink-2">
          <span className="num text-[28px] font-semibold text-ink">{fmtSets(plan.done)}</span>
          <span className="num text-[15px]">/ {plan.target}</span>
          {plan.leftToday > 0 && (
            <span className="num ml-auto text-[15px]">+{plan.leftToday} today</span>
          )}
        </div>
      )}
      <div className="border-t border-line">{primary.map(row)}</div>
      {secondary.length > 0 && (
        <div className="mt-6 border-t border-line">{secondary.map(row)}</div>
      )}
    </Screen>
  );
}
