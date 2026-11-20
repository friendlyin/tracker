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

type Marker = "dot" | "outline" | "bar";

/** Progress bar with today's sets as a separate segment at the end. */
function SplitBar({ g }: { g: GroupPlan }) {
  const max = g.target > 0 ? g.target : 1;
  const done = Math.min(g.done, max);
  const today = Math.min(g.trainedToday, done);
  const pct = (n: number) => `${(n / max) * 100}%`;
  return (
    <div className="mt-1.5 flex h-1.5 w-full bg-line">
      <div
        className={cx(
          "h-full",
          g.status === "done" ? "bg-ok" : g.status === "at_risk" ? "bg-warn" : "bg-ink-3",
        )}
        style={{ width: pct(done - today) }}
      />
      <div className="h-full bg-accent" style={{ width: pct(today) }} />
    </div>
  );
}

/** Weekly budget as two columns of compact cells, one per muscle group. */
export function BudgetList({ groups }: Props) {
  const marker = useVariant<Marker>("workouts.today", {
    dot: "dot",
    outline: "outline",
    bar: "bar",
  });
  return (
    <div className="grid grid-cols-2 gap-2">
      {groups.map((g) => {
        // Secondary contributions alone (half a set) don't mark a group as trained.
        const today = g.trainedToday >= 1;
        return (
          <GroupLink
            key={g.group}
            g={g}
            className={cx(
              "rounded-md bg-surface p-3",
              g.status === "at_risk"
                ? "outline-2 outline-warn -outline-offset-2"
                : today && marker === "outline" && "outline-2 outline-accent -outline-offset-2",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className={cx(
                  "flex items-center gap-1.5 text-[15px] leading-tight",
                  g.status === "done" && "text-ink-3",
                )}
              >
                {today && marker === "dot" && (
                  <span aria-hidden className="size-2 shrink-0 rounded-full bg-accent" />
                )}
                {GROUP_LABELS[g.group]}
              </span>
              <Today g={g} />
            </div>
            <div className="num mt-3 text-[13px] text-ink-2">
              {fmtSets(g.done)}/{g.target}
              {today && <span className="text-accent"> · {fmtSets(g.trainedToday)} today</span>}
            </div>
            {marker === "bar" ? (
              <SplitBar g={g} />
            ) : (
              <ProgressBar className="mt-1.5" value={g.done} max={g.target} tone={tone(g)} />
            )}
          </GroupLink>
        );
      })}
    </div>
  );
}
