import type { ReactNode } from "react";

/** The section's explanation, in its own card above the groups. */
export function SectionIntro({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-card p-4">
      {icon ? <div className="mt-1 shrink-0 text-foreground">{icon}</div> : null}
      <div className="min-w-0">
        <p className="text-sm leading-5 font-medium text-foreground">{title}</p>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

/** One rounded stack of rows: a title and detail on the left, controls on the right. */
export function InsetGroup({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">{children}</div>;
}

export function InsetRow({ title, detail, children }: { title: string; detail?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0">
        <p className="text-sm leading-5 font-medium">{title}</p>
        {detail ? <div className="mt-1 text-sm leading-5 text-muted-foreground">{detail}</div> : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </div>
  );
}
