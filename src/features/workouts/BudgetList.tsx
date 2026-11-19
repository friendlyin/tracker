import { Link } from "@tanstack/react-router";
import type { GroupPlan } from "../../../shared/workouts/budget";
import { GROUP_LABELS } from "../../../shared/workouts/groups";
import { fmtSets } from "../../lib/format";
import { cx } from "../../ui/cx";
import { CheckIcon } from "../../ui/icons";
import { ProgressBar } from "../../ui/ProgressBar";

type Props = { groups: GroupPlan[] };

const tone = (g: GroupPlan) =>
  g.status === "done" ? "ok" : g.status === "at_risk" ? "warn" : "accent";

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

/** Weekly budget as two columns of compact cells, one per muscle group. */
export function BudgetList({ groups }: Props) {
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
