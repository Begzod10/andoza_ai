import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A pill that switches a list filter on or off (`aria-pressed`), for the admin
 * Do'kon lists: the order stages and the materials' "smeta only" switch.
 *
 * The app keeps one arrow cursor everywhere, so a chip has to show it is live
 * by itself: a hover fill, a press, and a focus ring for the keyboard.
 */
export function FilterChip({ pressed, onClick, icon, children, className }: {
  pressed: boolean;
  onClick: () => void;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 select-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-semibold",
        "transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.96]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B84F5]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        pressed
          ? "border-ink bg-ink text-card"
          : "border-line bg-card-soft text-ink-muted hover:border-ink/30 hover:bg-ink/10 hover:text-ink",
        className,
      )}
    >
      {icon && <span className="flex shrink-0 items-center" aria-hidden="true">{icon}</span>}
      {children}
    </button>
  );
}
