import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

type Variant = "primary" | "quiet" | "danger";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={cx(
        "flex h-13 w-full items-center justify-center gap-2 rounded-md px-4 text-[17px] font-semibold active:opacity-70 disabled:opacity-40",
        variant === "primary" && "bg-ink text-on-ink",
        variant === "quiet" && "border border-line text-ink",
        variant === "danger" && "border border-line text-warn",
        className,
      )}
      {...props}
    />
  );
}
