import { cn } from "cn";

/** Mukae's mark: 迎 (to go out and meet) on a square tile. It scales with its size classes. */
export function MukaeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="Mukae" className={cn("size-8 shrink-0 text-primary", className)}>
      <rect width="32" height="32" fill="currentColor" />
      <text
        x="16"
        y="17"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="22"
        fontWeight="600"
        fill="var(--primary-foreground)"
      >
        迎
      </text>
    </svg>
  );
}
