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
    <section className="flex flex-col bg-card sm:shadow-sheet" aria-labelledby={id}>
      <div className="band-brand flex min-h-13 items-center justify-between gap-s3 py-s2 pr-s2 pl-s3">
        <Heading id={id} className="band-title">{title}</Heading>
        {action}
      </div>
      <div className="flex flex-col gap-s3 p-s3">
        <p className="max-w-prose text-sm leading-6 text-muted-foreground">{description}</p>
        {children}
      </div>
    </section>
  );
}
