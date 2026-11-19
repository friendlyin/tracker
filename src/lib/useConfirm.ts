import { useEffect, useState } from "react";

/** Two-tap confirmation for actions that are hard to undo: first tap arms, second tap runs. */
export function useConfirm(timeoutMs = 3000) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), timeoutMs);
    return () => clearTimeout(id);
  }, [armed, timeoutMs]);
  return {
    armed,
    run(action: () => void) {
      if (armed) {
        setArmed(false);
        action();
      } else setArmed(true);
    },
  };
}
