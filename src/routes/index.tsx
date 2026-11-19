import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { HomeDto } from "../../shared/profile";
import { useVariant } from "../dev/variants";
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

/** Variant "tiles": 2-column grid of square tiles. */
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

/** Variant "rows": full-width rows, number right-aligned. */
function Rows({ items }: { items: Widget[] }) {
  return (
    <div className="border-t border-line">
      {items.map((w) => (
        <WidgetShell key={w.key} w={w} className="block border-b border-line py-5">
          <div className="flex items-baseline justify-between gap-4">
            <Label w={w} />
            {w.value !== undefined ? (
              <div className="text-right">
                <span className="num text-[28px] font-semibold">{w.value}</span>
                <span className="ml-1.5 text-[13px] text-ink-2">{w.unit}</span>
              </div>
            ) : (
              <span className="text-[13px]">soon</span>
            )}
          </div>
          {w.progress && <ProgressBar className="mt-3" {...w.progress} />}
        </WidgetShell>
      ))}
    </div>
  );
}

/** Variant "lead": the first feature large and full-width, the rest in a compact grid. */
function Lead({ items }: { items: Widget[] }) {
  const [first, ...rest] = items;
  if (!first) return null;
  return (
    <div className="flex flex-col gap-2">
      <WidgetShell w={first} className="block rounded-md bg-ink p-5 text-on-ink">
        <Label w={first} />
        <div className="mt-8 flex items-baseline gap-2">
          <span className="num text-[56px] leading-none font-semibold">{first.value}</span>
          <span className="text-[15px] opacity-70">{first.unit}</span>
        </div>
        {first.progress && (
          <div className="mt-4 h-1.5 bg-on-ink/20">
            <div
              className="h-full bg-on-ink"
              style={{
                width: `${Math.min(100, (first.progress.value / Math.max(1, first.progress.max)) * 100)}%`,
              }}
            />
          </div>
        )}
      </WidgetShell>
      <div className="grid grid-cols-3 gap-2">
        {rest.map((w) => (
          <WidgetShell
            key={w.key}
            w={w}
            className="flex h-24 flex-col justify-between rounded-md bg-surface p-3"
          >
            <Label w={w} />
            <div className="text-[13px]">soon</div>
          </WidgetShell>
        ))}
      </div>
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
  const Grid = useVariant("home.grid", { tiles: Tiles, rows: Rows, lead: Lead });
  return (
    <div className="min-h-dvh px-4">
      <header className="pt-safe flex h-[calc(56px+max(env(safe-area-inset-top),12px))] items-center justify-between">
        <span className="text-[15px] text-ink-2">{todayFmt.format(new Date())}</span>
        <IconLink to="/settings" label="Profile and settings" className="-mr-2">
          <PersonIcon />
        </IconLink>
      </header>
      <Grid items={widgets(home.data)} />
    </div>
  );
}
