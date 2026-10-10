import { buildAgentSetupPrompt } from "@mukae/agent-setup";
import { ChainDiagram } from "./components/chain-diagram";
import { ManualSetup } from "./components/manual-setup";
import { PromptSection } from "./components/prompt-section";
import { Troubleshooting } from "./components/troubleshooting";

export function App() {
  const prompt = buildAgentSetupPrompt();

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-20 px-6 pt-20 pb-24 text-[#1b1d23]">
      <header className="flex flex-col gap-6">
        <p className="text-sm text-zinc-500">mukae</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">The local agent did not connect</h1>
        <p className="text-lg leading-relaxed text-zinc-600">
          Give the instructions below to the AI assistant on this computer. It configures the agents
          already installed here. Then return to the page and connect.
        </p>
      </header>

      <ChainDiagram />
      <PromptSection prompt={prompt} />
      <Troubleshooting />
      <ManualSetup />
    </main>
  );
}
