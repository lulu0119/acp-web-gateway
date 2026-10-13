import { listMachines, openConnection } from "@exterior/client";
import type { Machine } from "@exterior/contract";
import { useEffect, useState } from "react";
import type { AccountSession } from "@exterior/client/react";
import { Button } from "@/components/ui/button";
import { exteriorRelayUrl } from "@/lib/relay-url";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ConnectedAgent = { agentType: string; url: string; label: string };

export function ConnectForm({ session, onConnected }: { session: AccountSession; onConnected: (agent: ConnectedAgent) => void }) {
  const relayUrl = exteriorRelayUrl();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selection, setSelection] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const accessToken = session.account.phase === "signed-in" ? session.account.accessToken : undefined;

  useEffect(() => {
    if (!accessToken) {
      setMachines([]);
      setSelection("");
      setStatus("");
      return;
    }
    setStatus("Checking the sign-in.");
    let cancelled = false;
    void listMachines(relayUrl, accessToken)
      .then((listed) => {
        if (cancelled) return;
        setMachines(listed);
        const first = listed.find((machine) => machine.agents.length > 0);
        const agent = first?.agents[0];
        if (first && agent) setSelection(selectionOf(first.id, agent.name));
        setStatus(listed.length === 0 ? "No machine is online. On that computer, run exterior daemon." : "");
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Sign in again.");
      });
    return () => {
      cancelled = true;
    };
  }, [relayUrl, accessToken]);

  const items = machines.flatMap((machine) =>
    machine.agents.map((agent) => ({
      value: selectionOf(machine.id, agent.name),
      label: `${machine.hostname} / ${agent.name}`,
    })),
  );
  const selected = items.find((item) => item.value === selection);

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
                  onConnected({ agentType: opened.agentType, url: opened.url, label: selected.label });
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

function selectionOf(machineId: string, agentName: string): string {
  return `${machineId}\t${agentName}`;
}

function parseSelection(value: string): { machineId: string; agentName: string } | undefined {
  const separator = value.indexOf("\t");
  if (separator < 1) return undefined;
  return { machineId: value.slice(0, separator), agentName: value.slice(separator + 1) };
}
