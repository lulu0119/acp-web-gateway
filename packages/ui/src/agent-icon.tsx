import { cn } from "cn";
import { BotIcon } from "lucide-react";
import { useState } from "react";

/**
 * An agent's mark from the ACP registry, or Lucide's robot when the registry has none or the image
 * fails. Sized by the class the caller passes.
 */
export function AgentIcon({ iconUrl, className }: { iconUrl?: string; className?: string }) {
  if (!iconUrl) return <BotIcon className={cn("shrink-0", className)} aria-hidden />;
  return <RemoteIcon key={iconUrl} iconUrl={iconUrl} className={className} />;
}

function RemoteIcon({ iconUrl, className }: { iconUrl: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <BotIcon className={cn("shrink-0", className)} aria-hidden />;
  return (
    <img
      src={iconUrl}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("shrink-0 object-contain", className)}
    />
  );
}
