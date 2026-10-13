import type { ReactNode } from "react";

/** A sheet of paper under a band that carries the section's title and its main action. */
export function Section({ id, title, as: Heading = "h2", description, action, children }: {
  id: string;
  title: string;
  as?: "h1" | "h2";
  description: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col bg-card shadow-[0_1px_2px_oklch(0_0_0/0.05),0_10px_28px_-10px_oklch(0.4_0.1_40/0.18)]" aria-labelledby={id}>
      <div className="band-brand flex min-h-13 items-center justify-between gap-4 py-2 pr-2 pl-4 sm:pl-5">
        <Heading id={id} className="font-label text-2xl leading-8 font-medium tracking-[0.02em]">{title}</Heading>
        {action}
      </div>
      <div className="flex flex-col gap-5 p-4 sm:p-6">
        <p className="max-w-prose text-sm leading-6 text-muted-foreground">{description}</p>
        {children}
      </div>
    </section>
  );
}
