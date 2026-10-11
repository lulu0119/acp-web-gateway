import { beginBrowserSignIn, browserCallbackPath, clearBrowserSignIn, finishBrowserSignIn, listMachines, openConnection, storedAccessToken } from "@mukae/client";
import type { Machine } from "@mukae/contract";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { mukaeRelayUrl } from "@/lib/relay-url";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ConnectedAgent = { agentType: string; url: string; label: string };

export function ConnectForm({ onConnected, onSignOut }: { onConnected: (agent: ConnectedAgent) => void; onSignOut: () => void }) {
  const relayUrl = mukaeRelayUrl();
  const [status, setStatus] = useState("Checking the sign-in.");
  const [accessToken, setAccessToken] = useState<string>();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selection, setSelection] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const store = window.sessionStorage;
    const redirectUri = new URL(browserCallbackPath, window.location.origin).href;
    const returning = window.location.pathname === browserCallbackPath;
    const token = returning
      ? finishBrowserSignIn({ relayUrl, redirectUri, callbackUrl: window.location.href, store }).then((tokens) => {
          window.history.replaceState({}, "", "/");
          return tokens.accessToken;
        })
      : storedAccessToken({ relayUrl, store });
    let cancelled = false;
    void token
      .then(async (current) => {
        if (cancelled) return;
        if (!current) {
          setStatus("");
          return;
        }
        setAccessToken(current);
        const listed = await listMachines(relayUrl, current);
        if (cancelled) return;
        setMachines(listed);
        const first = listed.find((machine) => machine.agents.length > 0);
        const agent = first?.agents[0];
        if (first && agent) setSelection(selectionOf(first.id, agent.name));
        setStatus(listed.length === 0 ? "No machine is online. On that computer, run mukae daemon." : "");
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Sign in again.");
      });
    return () => {
      cancelled = true;
    };
  }, [relayUrl]);

  const items = machines.flatMap((machine) =>
    machine.agents.map((agent) => ({
      value: selectionOf(machine.id, agent.name),
      label: `${machine.hostname} / ${agent.name}`,
    })),
  );
  const selected = items.find((item) => item.value === selection);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Connect an agent</h2>
        {accessToken && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              clearBrowserSignIn(window.sessionStorage);
              onSignOut();
              setAccessToken(undefined);
              setMachines([]);
              setSelection("");
              setBusy(false);
              setStatus("");
            }}
          >
            Sign out
          </Button>
        )}
      </div>
      {!accessToken && (
        <Button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            const redirectUri = new URL(browserCallbackPath, window.location.origin).href;
            void beginBrowserSignIn({ relayUrl, redirectUri, store: window.sessionStorage })
              .then((url) => {
                window.location.assign(url);
              })
              .catch((error: unknown) => {
                setStatus(error instanceof Error ? error.message : "Mukae did not answer.");
                setBusy(false);
              });
          }}
        >
          Sign in with Mukae
        </Button>
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
                  setStatus(error instanceof Error ? error.message : "Mukae did not open the agent.");
                })
                .finally(() => setBusy(false));
            }}
          >
            Connect
          </Button>
        </>
      )}
      <p className="text-muted-foreground min-h-5 text-sm">{status}</p>
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
