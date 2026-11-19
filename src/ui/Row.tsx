import type { ReactNode } from "react";

/** Plain list row with a hairline divider. Used for settings and lists. */
export function Row({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-h-13 items-center gap-3 border-b border-line ${className}`}>
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="mt-6 mb-1 text-[13px] font-medium text-ink-3">{children}</div>;
}
