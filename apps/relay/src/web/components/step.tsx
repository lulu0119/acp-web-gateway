import type { ReactNode } from "react";

/** One numbered step of an `<ol>`. */
export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">{n}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold">{title}</span>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}
