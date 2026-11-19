import { useVariant } from "../dev/variants";
import { outbox, useOutbox } from "../lib/api";
import { cx } from "./cx";
import { ArrowUpIcon, CloudUpIcon } from "./icons";

// Writes not yet synced (no signal), in the header of every screen. Nothing shows when all is synced.
// Writes the server refused are shown in the warning color until tapped.

interface Props {
  count: number;
  refused: boolean;
}

function IconCount({ count, refused }: Props) {
  return (
    <span className={cx("flex items-center gap-1 px-1", refused ? "text-warn" : "text-ink-2")}>
      <CloudUpIcon className="size-5" />
      <span className="num text-[15px]">{count}</span>
    </span>
  );
}

function ArrowCount({ count, refused }: Props) {
  return (
    <span className={cx("flex items-center px-1", refused ? "text-warn" : "text-ink-2")}>
      <ArrowUpIcon className="size-3.5" strokeWidth={2.25} />
      <span className="num text-[15px]">{count}</span>
    </span>
  );
}

/** A line along the header's bottom edge; the count only when something was refused. */
function Line({ count, refused }: Props) {
  return (
    <>
      <span
        className={cx(
          "pointer-events-none absolute inset-x-0 bottom-0 h-0.5",
          refused ? "bg-warn" : "bg-ink-3",
        )}
      />
      {refused && <span className="num px-1 text-[15px] text-warn">{count}</span>}
    </>
  );
}

export function SyncState() {
  const s = useOutbox();
  const View = useVariant("sync-state", { icon: IconCount, arrow: ArrowCount, line: Line });
  const refused = s.rejected > 0;
  if (!refused && s.pending === 0) return null;
  const view = <View count={refused ? s.rejected : s.pending} refused={refused} />;
  if (!refused) return <span className="flex h-11 items-center">{view}</span>;
  return (
    <button
      type="button"
      onClick={outbox.clearRejected}
      aria-label={`${s.rejected} not saved`}
      className="flex h-11 min-w-11 items-center justify-center"
    >
      {view}
    </button>
  );
}
