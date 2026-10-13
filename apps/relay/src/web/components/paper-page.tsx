import { cn } from "cn";
import type { ReactNode } from "react";

/** Account centers one sheet. The dashboard is a column of sections. */
type Frame = "account" | "dashboard";

const wideFrame: Record<Frame, string> = {
  account: "sm:mx-auto sm:flex sm:w-full sm:max-w-5xl sm:flex-col sm:items-center sm:px-s3 sm:pt-s5 sm:pb-s5",
  dashboard: "sm:mx-auto sm:flex sm:w-full sm:max-w-5xl sm:flex-col sm:gap-s4 sm:px-s3 sm:pt-s4 sm:pb-s5",
};

const narrowFrame: Record<Frame, string> = {
  account: "flex w-full flex-col items-center px-s3 pt-s5 pb-s4",
  dashboard: "flex w-full flex-col gap-s3 pt-s3 pb-s5",
};

/**
 * One child tree, two boxes. Below the small breakpoint the wide box is `display: contents`
 * and the narrow box lays the page out; from that breakpoint up, the roles swap.
 * A narrow dashboard has no side inset, so its sections run to the screen edges.
 */
export function PaperPage({ frame, children }: { frame: Frame; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-card sm:bg-background sm:grid-paper">
      <div className="band-brand h-1" aria-hidden />
      <div className={cn("max-sm:contents", wideFrame[frame])}>
        <div className={cn("sm:contents", narrowFrame[frame])}>{children}</div>
      </div>
    </div>
  );
}
