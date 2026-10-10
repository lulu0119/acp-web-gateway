import {
  buildCommand,
  createAgentConfigCommand,
  installCommand,
  listAgentConfigsCommand,
  registerCommand,
  shellQuote,
} from "@mukae/agent-setup";
import { CopyButton } from "./copy-button";

export function ManualSetup({ repositoryPath }: { repositoryPath: string }) {
  const commands: { label: string; command: string }[] = [
    { label: "Enter the repository", command: `cd ${shellQuote(repositoryPath)}` },
    { label: "Install dependencies", command: installCommand },
    { label: "Build", command: buildCommand },
    { label: "Register the link and write the config file", command: registerCommand },
    { label: "Add an opencode configuration", command: createAgentConfigCommand("opencode") },
    { label: "List existing configurations", command: listAgentConfigsCommand },
  ];

  return (
    <section id="manual" className="flex scroll-mt-12 flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">Run it yourself</h2>
        <p className="text-zinc-600">
          Replace the type with claude-acp, codex-acp, or gemini. To keep another configuration of
          the same type, pass --name with a different name.
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
