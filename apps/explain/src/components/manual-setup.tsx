import { createAgentConfigCommand, installCommand, listAgentConfigsCommand } from "@mukae/agent-setup";
import { CopyButton } from "./copy-button";

export function ManualSetup() {
  const commands: { label: string; command: string }[] = [
    { label: "Install mukae and configure installed agents", command: installCommand },
    { label: "List configurations", command: listAgentConfigsCommand },
    { label: "Add an opencode configuration", command: createAgentConfigCommand("opencode") },
  ];

  return (
    <section id="manual" className="flex scroll-mt-12 flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">Run it yourself</h2>
        <p className="text-zinc-600">
          The install command writes a configuration for each agent that is already installed. To
          keep another configuration of the same type, pass --name with a different name. Replace
          opencode with claude-acp, codex-acp, or gemini.
        </p>
      </div>
      <ol className="flex flex-col divide-y divide-zinc-200 border-y border-zinc-200">
        {commands.map((item) => (
          <li key={item.command} className="flex flex-col gap-2 py-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-zinc-500">{item.label}</span>
              <CopyButton text={item.command} label="Copy" variant="text" />
            </div>
            <code className="font-mono text-sm break-all text-zinc-800">{item.command}</code>
          </li>
        ))}
      </ol>
    </section>
  );
}
