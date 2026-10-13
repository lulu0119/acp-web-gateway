import type { ReactNode } from "react";
import { MukaeMark } from "./mukae-mark.js";

/** The mark and the name on a hairline that runs to whatever sits at the right end. */
export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="flex items-center gap-4">
      <a href="/" className="flex items-center gap-3">
        <MukaeMark className="size-8" />
        <span className="font-label text-xl font-medium tracking-widest uppercase">Mukae</span>
      </a>
      <span className="h-px flex-1 bg-foreground/15" aria-hidden />
      {children}
    </header>
  );
}
