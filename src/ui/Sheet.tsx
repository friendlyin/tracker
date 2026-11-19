import { type ReactNode, useEffect } from "react";

/** Bottom sheet over a dimmed backdrop. Tap outside or press Escape to close. */
export function Sheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="pb-safe relative max-h-[85dvh] overflow-y-auto rounded-t-md border-t border-line bg-paper px-4 pt-4">
        {children}
      </div>
    </div>
  );
}
