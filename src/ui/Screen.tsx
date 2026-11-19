import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { BackIcon } from "./icons";
import { SyncState } from "./SyncState";

interface ScreenProps {
  title?: ReactNode;
  back?: LinkProps["to"];
  backParams?: LinkProps["params"];
  right?: ReactNode;
  children: ReactNode;
  /** Fixed bar at the bottom (primary action in thumb reach). */
  footer?: ReactNode;
}

export function Screen({ title, back, backParams, right, children, footer }: ScreenProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="pt-safe sticky top-0 z-10 flex h-[calc(56px+max(env(safe-area-inset-top),12px))] items-center gap-1 bg-paper px-2">
        {back ? (
          <Link
            to={back}
            params={backParams}
            className="-ml-1 grid size-11 place-items-center text-ink"
            aria-label="Back"
          >
            <BackIcon />
          </Link>
        ) : (
          <span className="w-2" />
        )}
        <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold">{title}</h1>
        <div className="flex items-center">
          <SyncState />
          {right}
        </div>
      </header>
      <main className="flex-1 px-4 pb-6">{children}</main>
      {footer && (
        <div className="pb-safe sticky bottom-0 border-t border-line bg-paper px-4 pt-3">
          {footer}
        </div>
      )}
    </div>
  );
}

export function IconLink(
  props: LinkProps & { label: string; children: ReactNode; className?: string },
) {
  const { label, children, className, ...rest } = props;
  return (
    <Link
      {...rest}
      aria-label={label}
      className={cx("grid size-11 place-items-center text-ink", className)}
    >
      {children}
    </Link>
  );
}
