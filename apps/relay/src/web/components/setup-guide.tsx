import { BotIcon, TerminalIcon } from "lucide-react";
import type { SetupGuideData } from "../../shared/account-web.js";
import { CodeBlock } from "./code-block";
import { Tabs, TabsList, TabsPanel, TabsTab } from "../ui/tabs";

/** How to connect a device, either through an AI assistant on it or by running the commands yourself. */
export function SetupGuide({ guide }: { guide: SetupGuideData }) {
  return (
    <Tabs defaultValue="assistant">
      <TabsList>
        <TabsTab value="assistant"><BotIcon />Ask an AI assistant</TabsTab>
        <TabsTab value="terminal"><TerminalIcon />Use a terminal</TabsTab>
      </TabsList>
      <TabsPanel value="assistant" className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Paste this into the AI assistant on the computer that should run agents. When it signs in, it gives you a link to{" "}
          <a href="/device" className="text-foreground underline underline-offset-4">approve the device</a>.
        </p>
        <CodeBlock code={guide.prompt} label="Copy prompt" wrap />
      </TabsPanel>
      <TabsPanel value="terminal" className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Run these on the computer that should run agents. Node 22 or newer is required. <code className="font-mono">login</code> prints a code to approve.
        </p>
        <CodeBlock code={guide.commands} />
      </TabsPanel>
    </Tabs>
  );
}
