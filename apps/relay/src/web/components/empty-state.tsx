import { cn } from "cn";
import type { ReactNode } from "react";

export function EmptyState({ icon, title, children, action, className }: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-2xl bg-muted/50 px-6 py-10 text-center", className)}>
      <div className="flex size-11 items-center justify-center rounded-full bg-background text-foreground/70 [&_svg]:size-5">{icon}</div>
      <div className="flex max-w-md flex-col gap-1">
        <p className="font-semibold">{title}</p>
        {children ? <p className="text-sm text-muted-foreground">{children}</p> : null}
      </div>
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
