import { cn } from "cn";
import type { HighlightedCode } from "../../shared/account-web.js";
import { CopyButton } from "./copy-button.js";

/** Code highlighted by the server, with a copy button in its top-right corner. `wrap` suits prose such as a prompt. */
export function CodeBlock({ code, label, wrap, className }: { code: HighlightedCode; label?: string; wrap?: boolean; className?: string }) {
  return (
    <div className={cn("group/code relative rounded-xl border border-border bg-muted/40", className)}>
      <CopyButton text={code.code} label={label ?? "Copy"} className="absolute top-2.5 right-2.5 z-10 bg-background/90 shadow-xs backdrop-blur" />
      <div
        className={cn("code-block overflow-x-auto px-5 pt-12 pb-4 font-mono text-[13px] leading-6 sm:pt-4 sm:pr-32", wrap && "code-wrap max-h-96 overflow-y-auto")}
        dangerouslySetInnerHTML={{ __html: code.html }}
      />
    </div>
  );
}
