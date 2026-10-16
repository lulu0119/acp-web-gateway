import { useState } from "react";
import { cn } from "cn";

/**
 * An app's logo, loaded from wherever the app named it, or the first letter of its name when it
 * named none. No referrer goes with it, so the app does not learn which page showed it.
 */
export function AppIcon({ label, logoUri, className }: { label: string; logoUri?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (logoUri && !failed) {
    return <img src={logoUri} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={cn("shrink-0 object-cover", className)} />;
  }
  return (
    <span className={cn("flex shrink-0 items-center justify-center bg-muted font-semibold text-muted-foreground", className)}>
      {(label.trim().charAt(0) || "?").toUpperCase()}
    </span>
  );
}
