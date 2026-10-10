import { useState } from "react";
import { CopyButton } from "./copy-button";

export function PromptSection({ prompt }: { prompt: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-2xl font-semibold tracking-tight">Instructions</h2>

      <div className="rounded-xl border border-zinc-200 bg-white">
        <pre
          className={`overflow-hidden px-5 py-4 font-mono text-[13px] leading-6 whitespace-pre-wrap text-zinc-700 ${
            expanded ? "" : "max-h-60"
          }`}
        >
          {prompt}
        </pre>
        <div className="flex items-center justify-between border-t border-zinc-200 px-5 py-3">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="text-sm text-zinc-500 hover:text-zinc-900"
          >
            {expanded ? "Collapse" : "Show full text"}
          </button>
          <CopyButton text={prompt} label="Copy instructions" variant="text" />
        </div>
      </div>
    </section>
  );
}
