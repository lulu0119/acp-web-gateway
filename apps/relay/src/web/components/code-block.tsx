import { cn } from "cn";
import type { HighlightedCode } from "../../shared/account-web.js";
import { CopyButton } from "./copy-button.js";

/**
 * Code highlighted by the server, styled like a GitHub README block, with a copy button in its top-right corner.
 * `wrap` suits prose such as a prompt.
 */
export function CodeBlock({ code, label, wrap, className }: { code: HighlightedCode; label?: string; wrap?: boolean; className?: string }) {
  return (
    <div className={cn("relative rounded-[6px] bg-muted", className)}>
      <CopyButton text={code.code} label={label ?? "Copy"} iconOnly className="absolute top-2 right-2 z-10" />
      <div
        className={cn("code-block overflow-x-auto p-4 pr-12 font-mono", wrap && "code-wrap max-h-96 overflow-y-auto")}
        dangerouslySetInnerHTML={{ __html: code.html }}
      />
    </div>
  );
}
