import type { ReactNode } from "react";
import { cn } from "cn";

export function PageLayout({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn("mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-6 pt-20 pb-24", className)}>
      {children}
    </main>
  );
}
