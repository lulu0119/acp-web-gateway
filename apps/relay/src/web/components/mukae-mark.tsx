import { cn } from "cn";

/**
 * Mukae's mark: 迎 (to go out and meet) in serif on a square tile. It scales with its size classes.
 * `inverse` draws a white tile for use on the band.
 */
export function MukaeMark({ className, inverse }: { className?: string; inverse?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="Mukae" className={cn("size-8 shrink-0", inverse ? "text-white" : "text-primary", className)}>
      <rect width="32" height="32" fill="currentColor" />
      <text
        x="16"
        y="17"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="22"
        fontWeight="800"
        className="font-display"
        fill={inverse ? "var(--primary)" : "var(--primary-foreground)"}
      >
        迎
      </text>
    </svg>
  );
}
