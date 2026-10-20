import { cn } from "cn";

/** Exterior's mark: a hub reaching three nodes, optionally on a solid tile. */
export function ExteriorMark({ className, variant = "plain" }: { className?: string; variant?: "plain" | "tile" }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="Exterior"
      className={cn("size-8 shrink-0", variant === "tile" ? "text-primary-foreground" : "text-foreground", className)}
    >
      <rect width="32" height="32" rx="9" className={variant === "tile" ? "fill-primary" : "fill-background"} />
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <line x1="16" y1="16" x2="9.5" y2="10.5" />
        <line x1="16" y1="16" x2="22.5" y2="10.5" />
        <line x1="16" y1="16" x2="16" y2="23.5" />
      </g>
      <circle cx="16" cy="16" r="3.2" fill="currentColor" />
      <circle cx="9.5" cy="10.5" r="2" fill="currentColor" />
      <circle cx="22.5" cy="10.5" r="2" fill="currentColor" />
      <circle cx="16" cy="23.5" r="2" fill="currentColor" />
    </svg>
  );
}
