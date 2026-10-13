import { cn } from "cn";

/** Exterior's mark: 外 on a dark tile. It scales with its size classes. */
export function ExteriorMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="Exterior" className={cn("size-8 shrink-0 text-primary", className)}>
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <text x="16" y="17" textAnchor="middle" dominantBaseline="central" fontSize="17" fontWeight="600" fill="var(--primary-foreground)">外</text>
    </svg>
  );
}
