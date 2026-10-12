import { useState } from "react";
import { CopyButton } from "./copy-button";

const previewPackage = "https://pkg.pr.new/lulu0119/mukae@main";
const runner = `npx --package=${previewPackage} -- mukae`;

export function buildAgentSetupPrompt(relayUrl: string): string {
  return `Connect this computer to Mukae so my web page can use the ACP agents installed here.

Mukae relay: ${relayUrl}

1. Sign this machine in:
${runner} login --relay ${relayUrl}
It prints a link with the code filled in. Ask me to open that link and approve it, then wait for sign-in to finish.

2. Configure each agent already installed on this computer:
${runner} agent-config types
${runner} agent-config create --agent-type <type>
Use one id from types per installed agent (for example opencode). Run ${runner} agent-config list to show what exists.

3. Keep this machine online:
${runner} daemon --relay ${relayUrl}
Keep it running in the foreground so the page sees this machine.

Limits:
- Do not use sudo or install anything globally.
- Do not write API keys or tokens into the config. If an agent needs environment variables, ask me first.
- If node (22 or newer) or npx is missing, stop and tell me.

When the daemon is online, tell me which agents were configured and remind me to return to the page.`;
}

export function SetupGuide() {
  const [expanded, setExpanded] = useState(false);
  const relayUrl = typeof window === "undefined" ? "" : window.location.origin;
  const prompt = buildAgentSetupPrompt(relayUrl);

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">No machine is online</h2>
        <p className="text-muted-foreground">
          Give the instructions below to the AI assistant on the computer that should run agents. The
          login step prints a code to approve on{" "}
          <a href="/device" className="underline underline-offset-4">
            the device page
          </a>
          .
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card">
        <pre
          className={`overflow-hidden px-5 py-4 font-mono text-[13px] leading-6 whitespace-pre-wrap text-muted-foreground ${expanded ? "" : "max-h-60"}`}
        >
          {prompt}
        </pre>
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {expanded ? "Collapse" : "Show full text"}
          </button>
          <CopyButton text={prompt} label="Copy instructions" />
        </div>
      </div>
    </section>
  );
}
