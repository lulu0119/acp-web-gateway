import { listDevices, openConnection } from "@exterior/client";
import type { Device } from "@exterior/contract";
import { BotIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { AccountSession } from "@exterior/client/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { exteriorRelayUrl } from "@/lib/relay-url";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ConnectedAgent = { agentType: string; url: string; label: string; workingDirectory: string };

export function ConnectForm({ session, onConnected }: { session: AccountSession; onConnected: (agent: ConnectedAgent) => void }) {
  const relayUrl = exteriorRelayUrl();
  const [devices, setDevices] = useState<Device[]>([]);
  const [selection, setSelection] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const accessToken = session.account.phase === "signed-in" ? session.account.accessToken : undefined;

  useEffect(() => {
    if (!accessToken) {
      setDevices([]);
      setSelection("");
      setStatus("");
      return;
    }
    setStatus("Checking the sign-in.");
    let cancelled = false;
    void listDevices(relayUrl, accessToken)
      .then((listed) => {
        if (cancelled) return;
        setDevices(listed);
        const first = listed.find((device) => device.agents.length > 0);
        const agent = first?.agents[0];
        if (first && agent) setSelection(selectionOf(first.id, agent.name));
        setStatus(agentListStatus(listed));
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Sign in again.");
      });
    return () => {
      cancelled = true;
    };
  }, [relayUrl, accessToken]);

  const items = devices.flatMap((device) =>
    device.agents.map((agent) => ({
      value: selectionOf(device.id, agent.name),
      label: `${device.hostname} / ${agent.name}`,
      workingDirectory: device.workingDirectory,
    })),
  );
  const selected = items.find((item) => item.value === selection);

  if (accessToken && items.length === 0 && emptyAgentList(status)) {
    return <NoAgents status={status} />;
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <h2 className="text-lg font-medium">Connect an agent</h2>
      {session.account.phase === "checking" && <p className="text-muted-foreground text-sm">Checking the sign-in.</p>}
      {session.account.phase === "signed-out" && (
        <>
          <Button disabled={session.busy} onClick={session.signIn}>
            Sign in with Exterior
          </Button>
          {session.error ? <p className="text-muted-foreground text-sm">{session.error}</p> : null}
        </>
      )}
      {accessToken && items.length > 0 && (
        <>
          <Select
            items={items}
            value={selection}
            onValueChange={(value) => {
              if (value) setSelection(value);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose an agent" />
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
            disabled={busy || !selected}
            onClick={() => {
              if (!selected || !accessToken) return;
              const parsed = parseSelection(selected.value);
              if (!parsed) return;
              setBusy(true);
              void openConnection(relayUrl, accessToken, parsed)
                .then((opened) => {
                  onConnected({
                    agentType: opened.agentType,
                    url: opened.url,
                    label: selected.label,
                    workingDirectory: selected.workingDirectory,
                  });
                })
                .catch((error: unknown) => {
                  setStatus(error instanceof Error ? error.message : "Exterior did not open the agent.");
                })
                .finally(() => setBusy(false));
            }}
          >
            Connect
          </Button>
        </>
      )}
      <p className="text-muted-foreground min-h-5 text-sm">{accessToken ? status : ""}</p>
    </div>
  );
}

export function ManageAgentsLink({ className }: { className?: string }) {
  return (
    <a
      href={exteriorRelayUrl()}
      target="_blank"
      rel="noreferrer"
      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "justify-start gap-2 px-2", className)}
    >
      <BotIcon className="size-4" aria-hidden />
      Agents
    </a>
  );
}

function NoAgents({ status }: { status: string }) {
  const noDevice = status === "No device is online.";
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-foreground/70">
        <BotIcon className="size-5" aria-hidden />
      </div>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="font-semibold">No agents online</p>
        <p className="text-sm leading-6 text-muted-foreground">
          {noDevice
            ? "A session needs an agent on a device that is online. Set that up on Exterior."
            : "The online devices have no agents. Configure one on Exterior, then connect it here."}
        </p>
      </div>
      <a href={exteriorRelayUrl()} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: "lg" }), "mt-1")}>
        Manage agents
      </a>
    </div>
  );
}

function emptyAgentList(status: string): boolean {
  return status === "No device is online." || status === "The online devices have no agents.";
}

function agentListStatus(devices: Device[]): string {
  if (devices.length === 0) return "No device is online.";
  if (devices.every((device) => device.agents.length === 0)) return "The online devices have no agents.";
  return "";
}

function selectionOf(deviceId: string, agentName: string): string {
  return `${deviceId}\t${agentName}`;
}

function parseSelection(value: string): { deviceId: string; agentName: string } | undefined {
  const separator = value.indexOf("\t");
  if (separator < 1) return undefined;
  return { deviceId: value.slice(0, separator), agentName: value.slice(separator + 1) };
}
