import { buildAgentSetupPrompt } from "@mukae/agent-setup";
import { connectLocalGateway } from "@mukae/client";
import { launchAgentTypes, type LaunchAgentType } from "@mukae/contract";
import { useCopyToClipboard } from "@mukae/react-hooks";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { agentTypeLabels } from "@/lib/agent-types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ConnectedAgent = { agentType: LaunchAgentType; url: string };

// Served by `pnpm explain` (apps/explain), a separate dev server.
const explainPageUrl = "http://127.0.0.1:47101/";

const outcomeMessages: Record<string, string> = {
  unconfigured: "This agent has no configuration yet.",
  cancelled: "No configuration was selected.",
  no_free_port: "Too many connections are open. Disconnect one, then connect again.",
  not_ready: "The local program did not connect.",
};

export function ConnectForm({ onConnected }: { onConnected: (agent: ConnectedAgent) => void }) {
  const [agentType, setAgentType] = useState<LaunchAgentType>("opencode");
  const [status, setStatus] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const { isCopied, copyToClipboard } = useCopyToClipboard();

  const items = launchAgentTypes.map((type) => ({ value: type, label: agentTypeLabels[type] }));

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <h2 className="text-lg font-medium">Connect a local agent</h2>
      <Select
        items={items}
        value={agentType}
        onValueChange={(value) => {
          if (value) setAgentType(value as LaunchAgentType);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        disabled={connecting}
        onClick={() => {
          setConnecting(true);
          setSetupNeeded(false);
          setStatus("Opening the local program. If a prompt appears, allow it.");
          void connectLocalGateway({
            agentType,
            documentationUrl: explainPageUrl,
          })
            .then((outcome) => {
              if (outcome.connected) {
                onConnected({ agentType, url: outcome.url });
                return;
              }
              setSetupNeeded(outcome.reason === "unconfigured");
              setStatus(outcomeMessages[outcome.reason] ?? "The local program did not connect.");
            })
            .finally(() => setConnecting(false));
        }}
      >
        Connect
      </Button>
      {setupNeeded && (
        <Button variant="outline" onClick={() => copyToClipboard(buildAgentSetupPrompt())}>
          {isCopied ? "Copied. Paste it to the agent" : "Copy setup instructions for the agent"}
        </Button>
      )}
      <p className="text-muted-foreground min-h-5 text-sm">{status}</p>
    </div>
  );
}
