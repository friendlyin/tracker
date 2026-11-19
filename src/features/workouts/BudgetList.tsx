import { Link } from "@tanstack/react-router";
import type { GroupPlan } from "../../../shared/workouts/budget";
import { GROUP_LABELS } from "../../../shared/workouts/groups";
import { useVariant } from "../../dev/variants";
import { fmtSets } from "../../lib/format";
import { cx } from "../../ui/cx";
import { CheckIcon } from "../../ui/icons";
import { ProgressBar } from "../../ui/ProgressBar";

type Props = { groups: GroupPlan[] };

const tone = (g: GroupPlan) =>
  g.status === "done" ? "ok" : g.status === "at_risk" ? "warn" : "accent";

/** Where today's plan ends on the weekly bar. */
const todayMarker = (g: GroupPlan) => g.done - g.doneToday + g.todayTarget;

function GroupLink({
  g,
  className,
  children,
}: {
  g: GroupPlan;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to="/workouts/group/$group"
      params={{ group: g.group }}
      className={cx("block active:opacity-60", className)}
    >
      {children}
    </Link>
  );
}

function Today({ g }: { g: GroupPlan }) {
  if (g.status === "done") return <CheckIcon className="text-ok" />;
  if (g.leftToday === 0) return <span className="text-[15px] text-ink-3">0</span>;
  return (
    <span className={cx("num text-[20px] font-semibold", g.status === "at_risk" && "text-warn")}>
      +{g.leftToday}
    </span>
  );
}

/** Variant "bars": label + weekly bar with a tick where today's plan ends; today's sets on the right. */
function Bars({ groups }: Props) {
  return (
    <div className="border-t border-line">
      {groups.map((g) => (
        <GroupLink key={g.group} g={g} className="border-b border-line py-3">
          <div className="flex items-center gap-3">
            <div className={cx("flex-1 text-[17px]", g.status === "done" && "text-ink-3")}>
              {GROUP_LABELS[g.group]}
            </div>
            <span className="num text-[15px] text-ink-2">
              {fmtSets(g.done)}/{g.target}
            </span>
            <span className="flex w-10 justify-end">
              <Today g={g} />
            </span>
          </div>
          <ProgressBar
            className="mt-2"
            value={g.done}
            max={g.target}
            tone={tone(g)}
            marker={g.status === "done" ? undefined : todayMarker(g)}
          />
        </GroupLink>
      ))}
    </div>
  );
}

/** Variant "numbers": today's sets as the big number, week progress as small text. */
function Numbers({ groups }: Props) {
  return (
    <div className="border-t border-line">
      {groups.map((g) => (
        <GroupLink
          key={g.group}
          g={g}
          className="flex min-h-16 items-center gap-4 border-b border-line"
        >
          <span
            className={cx(
              "num w-12 text-[28px] font-semibold",
              g.status === "at_risk" && "text-warn",
              (g.status === "done" || g.leftToday === 0) && "text-ink-3",
            )}
          >
            {g.status === "done" ? <CheckIcon className="text-ok" /> : g.leftToday}
          </span>
          <span className={cx("flex-1 text-[17px]", g.status === "done" && "text-ink-3")}>
            {GROUP_LABELS[g.group]}
          </span>
          <span className="num text-[15px] text-ink-2">
            {fmtSets(g.done)} / {g.target}
          </span>
        </GroupLink>
      ))}
    </div>
  );
}

/** Variant "grid": two columns of compact cells. */
function Grid({ groups }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {groups.map((g) => (
        <GroupLink
          key={g.group}
          g={g}
          className={cx(
            "rounded-md bg-surface p-3",
            g.status === "at_risk" && "outline-2 outline-warn -outline-offset-2",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <span className={cx("text-[15px] leading-tight", g.status === "done" && "text-ink-3")}>
              {GROUP_LABELS[g.group]}
            </span>
            <Today g={g} />
          </div>
          <div className="num mt-3 text-[13px] text-ink-2">
            {fmtSets(g.done)}/{g.target}
          </div>
          <ProgressBar className="mt-1.5" value={g.done} max={g.target} tone={tone(g)} />
        </GroupLink>
      ))}
    </div>
  );
}

export function BudgetList(props: Props) {
  const List = useVariant("workouts.budget", { bars: Bars, numbers: Numbers, grid: Grid });
  return <List {...props} />;
}
