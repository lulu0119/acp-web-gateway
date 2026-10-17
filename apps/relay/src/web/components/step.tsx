import type { ReactNode } from "react";

export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full font-display text-sm font-semibold text-gold-ink ring-1 ring-gold/60">{n}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold">{title}</span>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}
