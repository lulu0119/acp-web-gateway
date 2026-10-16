import type { ReactNode } from "react";

export function SectionHeading({ id, title, as: Heading = "h2", children, action }: {
  id: string;
  title: string;
  as?: "h1" | "h2";
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-2">
        <Heading id={id} className="text-2xl leading-8 font-semibold tracking-tight">{title}</Heading>
        <p className="max-w-prose text-sm leading-6 text-muted-foreground">{children}</p>
      </div>
      {action}
    </div>
  );
}
