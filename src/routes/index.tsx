import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { HomeDto } from "../../shared/profile";
import { useHome } from "../features/profile";
import { fmtSets } from "../lib/format";
import { cx } from "../ui/cx";
import { PersonIcon } from "../ui/icons";
import { ProgressBar } from "../ui/ProgressBar";
import { IconLink } from "../ui/Screen";

export const Route = createFileRoute("/")({ component: Home });

interface Widget {
  key: string;
  label: string;
  to?: "/workouts";
  value?: ReactNode;
  unit?: string;
  progress?: { value: number; max: number };
  live?: boolean;
}

function widgets(home: HomeDto | undefined): Widget[] {
  const w = home?.workouts;
  return [
    {
      key: "workouts",
      label: "Workouts",
      to: "/workouts",
      value: w ? fmtSets(w.remaining) : "–",
      unit: w ? `of ${w.target} sets left` : undefined,
      progress: w ? { value: w.done, max: w.target } : undefined,
      live: w?.active,
    },
    { key: "nutrition", label: "Nutrition" },
    { key: "water", label: "Water" },
    { key: "focus", label: "Focus" },
  ];
}

function WidgetShell({
  w,
  className,
  children,
}: {
  w: Widget;
  className?: string;
  children: ReactNode;
}) {
  if (!w.to) {
    return <div className={cx(className, "text-ink-3")}>{children}</div>;
  }
  return (
    <Link to={w.to} className={cx(className, "active:opacity-70")}>
      {children}
    </Link>
  );
}

function Label({ w }: { w: Widget }) {
  return (
    <div className="flex items-center gap-2 text-[15px] font-medium">
      {w.label}
      {w.live && <span className="size-2 rounded-full bg-warn" title="in progress" />}
    </div>
  );
}

/** 2-column grid of square tiles. */
function Tiles({ items }: { items: Widget[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((w) => (
        <WidgetShell
          key={w.key}
          w={w}
          className="flex aspect-square flex-col justify-between rounded-md bg-surface p-4"
        >
          <Label w={w} />
          {w.value !== undefined ? (
            <div>
              <div className="num text-[40px] leading-none font-semibold">{w.value}</div>
              <div className="mt-1 text-[13px] text-ink-2">{w.unit}</div>
              {w.progress && <ProgressBar className="mt-3" {...w.progress} />}
            </div>
          ) : (
            <div className="text-[13px]">soon</div>
          )}
        </WidgetShell>
      ))}
    </div>
  );
}

const todayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function Home() {
  const home = useHome();
  return (
    <div className="min-h-dvh px-4">
      <header className="pt-safe flex h-[calc(56px+max(env(safe-area-inset-top),12px))] items-center justify-between">
        <span className="text-[15px] text-ink-2">{todayFmt.format(new Date())}</span>
        <IconLink to="/settings" label="Profile and settings" className="-mr-2">
          <PersonIcon />
        </IconLink>
      </header>
      <Tiles items={widgets(home.data)} />
    </div>
  );
}
