import type { AcpConnectionStatus } from "@hafbit/react-acp";
import { cn } from "@/lib/utils";

export const connectionLabels: Record<AcpConnectionStatus, string> = {
  idle: "Waiting to connect",
  connecting: "Connecting",
  "auth-required": "Sign-in required",
  ready: "Connected",
  error: "Connection failed",
  closed: "Disconnected",
};

const dotTone: Record<AcpConnectionStatus, string> = {
  idle: "bg-muted-foreground/40",
  connecting: "bg-amber-500 animate-pulse motion-reduce:animate-none",
  "auth-required": "bg-amber-500",
  ready: "bg-emerald-500",
  error: "bg-destructive",
  closed: "bg-muted-foreground/40",
};

export function StatusDot({ status, className }: { status: AcpConnectionStatus; className?: string }) {
  return (
    <span
      role="img"
      aria-label={connectionLabels[status]}
      title={connectionLabels[status]}
      className={cn("inline-block size-2 shrink-0 rounded-full", dotTone[status], className)}
    />
  );
}
