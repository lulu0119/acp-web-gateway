import { cn } from "cn";

/** An app's icon as the relay serves it, or the first letter of its name when it sent none. */
export function AppIcon({ label, iconUrl, className }: { label: string; iconUrl?: string; className?: string }) {
  if (iconUrl) {
    return <img src={iconUrl} alt="" className={cn("shrink-0 object-cover", className)} />;
  }
  return (
    <span className={cn("flex shrink-0 items-center justify-center bg-muted font-semibold text-muted-foreground", className)}>
      {(label.trim().charAt(0) || "?").toUpperCase()}
    </span>
  );
}
