import { listDevices, openConnection, RelayError, type Device } from "@exterioragentprotocol/sdk/client";
import type { AccountSession } from "@exterioragentprotocol/sdk/client/react";
import { ArrowRightIcon, ArrowUpRightIcon, BotIcon, LaptopIcon, LoaderCircleIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@exterior/ui/button";
import { cn } from "cn";
import { exteriorRelayUrl } from "@/lib/relay-url";

export type ConnectedAgent = {
  url: string;
  label: string;
  workingDirectory: string;
  deviceId: string;
  agentName: string;
};
type DeviceList = { phase: "loading" | "ready" | "error"; devices: Device[]; error?: string; signedOut?: boolean };

export function ConnectForm({
  session,
  onConnected,
}: {
  session: AccountSession;
  onConnected: (agent: ConnectedAgent) => void;
}) {
  const relayUrl = exteriorRelayUrl();
  const [list, setList] = useState<DeviceList>({ phase: "loading", devices: [] });
  const [selection, setSelection] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const opening = useRef<AbortController | null>(null);
  const signedIn = session.account.phase === "signed-in";
  const { accessToken } = session;

  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]);
    setList((current) => ({ phase: "loading", devices: current.devices }));
    void accessToken()
      .then((token) => listDevices(relayUrl, token, signal))
      .then((devices) => {
        if (controller.signal.aborted) return;
        setList({ phase: "ready", devices });
        setSelection((current) => {
          if (devices.some((device) => device.agents.some((agent) => selectionOf(device.id, agent.name) === current)))
            return current;
          const first = devices.find((device) => device.agents.length > 0);
          return first ? selectionOf(first.id, first.agents[0].name) : "";
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setList((current) => ({
            phase: "error",
            devices: current.devices,
            error: requestError(error, "Could not load your agents."),
            signedOut: error instanceof RelayError && error.code === "unauthorized",
          }));
      });
    return () => controller.abort();
  }, [relayUrl, signedIn, accessToken, refresh]);

  useEffect(() => () => opening.current?.abort(), [signedIn]);

  async function connect() {
    if (!signedIn || opening.current) return;
    const chosen = list.devices
      .flatMap((device) => device.agents.map((agent) => ({ device, agent })))
      .find(({ device, agent }) => selectionOf(device.id, agent.name) === selection);
    if (!chosen) return;
    const { device, agent } = chosen;
    const controller = new AbortController();
    opening.current = controller;
    setBusy(true);
    setError("");
    try {
      const opened = await openConnection(
        relayUrl,
        await accessToken(),
        { deviceId: device.id, agentName: agent.name },
        AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
      );
      if (!controller.signal.aborted)
        onConnected({
          url: opened.url,
          label: `${device.hostname} / ${agent.name}`,
          workingDirectory: device.workingDirectory,
          deviceId: device.id,
          agentName: agent.name,
        });
    } catch (error) {
      if (!controller.signal.aborted) setError(requestError(error, "Exterior did not open the agent."));
    } finally {
      opening.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const hasAgents = list.devices.some((device) => device.agents.length > 0);
  return (
    <div data-slot="connect-form" className="flex min-w-0 flex-col gap-6">
      <div className="flex size-12 items-center justify-center rounded-xl border bg-muted/50">
        <BotIcon className="size-6" strokeWidth={1.5} aria-hidden />
      </div>
      <h2 className="text-2xl font-semibold tracking-tight">
        {signedIn ? "Choose your agent" : "Connect your first agent"}
      </h2>
      {session.account.phase === "checking" && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" /> Checking your sign-in…
        </p>
      )}
      {session.account.phase === "signed-out" && (
        <div className="flex flex-col gap-3">
          <Button size="lg" className="h-11 w-full" disabled={session.busy} onClick={session.signIn}>
            {session.busy ? (
              <>
                <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" /> Redirecting…
              </>
            ) : (
              <>
                Sign in with Exterior <ArrowRightIcon />
              </>
            )}
          </Button>
          {session.error && (
            <p role="alert" className="text-sm text-destructive">
              {session.error}
            </p>
          )}
        </div>
      )}
      {signedIn && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {hasAgents
                ? `${list.devices.reduce((count, device) => count + device.agents.length, 0)} agents · ${list.devices.length} devices online`
                : "Online devices"}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={list.phase === "loading" || busy}
              onClick={() => setRefresh((current) => current + 1)}
            >
              <RefreshCwIcon
                className={list.phase === "loading" ? "animate-spin motion-reduce:animate-none" : undefined}
              />{" "}
              Refresh
            </Button>
          </div>
          {list.phase === "loading" && (
            <p role="status" className="text-sm text-muted-foreground">
              Looking for your agents…
            </p>
          )}
          {list.phase === "error" && (
            <div
              role="alert"
              className="space-y-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm"
            >
              <p>{list.error}</p>
              {list.devices.length > 0 && <p className="text-muted-foreground">Showing the last loaded devices.</p>}
              <Button size="sm" variant="outline" onClick={() => setRefresh((current) => current + 1)}>
                Try again
              </Button>
              {list.signedOut && (
                <Button size="sm" disabled={session.busy} onClick={session.signIn}>
                  Sign in again
                </Button>
              )}
            </div>
          )}
          {list.devices.length > 0 && (
            <fieldset disabled={busy} className="max-h-72 space-y-4 overflow-y-auto p-1">
              <legend className="sr-only">Choose an agent</legend>
              {list.devices.map((device) => (
                <div key={device.id} className="space-y-2">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <LaptopIcon className="size-4 text-muted-foreground" aria-hidden /> {device.hostname}
                  </p>
                  {device.agents.length === 0 && (
                    <p className="text-sm text-muted-foreground">No agents configured on this device.</p>
                  )}
                  {device.agents.map((agent) => {
                    const value = selectionOf(device.id, agent.name);
                    return (
                      <label
                        key={agent.name}
                        className={cn(
                          "relative flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/50 has-focus-visible:ring-2 has-focus-visible:ring-ring",
                          selection === value && "border-foreground/60 bg-muted/40",
                        )}
                      >
                        <input
                          type="radio"
                          name="agent"
                          value={value}
                          checked={selection === value}
                          onChange={() => {
                            setSelection(value);
                            setError("");
                          }}
                          className="size-4 shrink-0 accent-foreground"
                        />
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="text-sm font-medium">{agent.name}</span>
                          <span className="text-xs text-muted-foreground">{agent.agentType}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </fieldset>
          )}
          {list.phase === "ready" && !hasAgents && (
            <div className="space-y-2 rounded-xl border border-dashed p-4">
              <h3 className="text-sm font-medium">
                {list.devices.length === 0 ? "No devices online yet" : "Add an agent to your device"}
              </h3>
              <p className="text-sm leading-6 text-muted-foreground">
                {list.devices.length === 0
                  ? "Open Exterior on your computer and connect a device. Then refresh this list."
                  : "Configure an agent in Exterior, then refresh this list to connect."}
              </p>
            </div>
          )}
          {hasAgents && (
            <>
              <Button
                size="lg"
                className="h-11 w-full"
                disabled={busy || !selection || list.phase === "loading"}
                onClick={() => void connect()}
              >
                {busy ? (
                  <>
                    <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" /> Connecting…
                  </>
                ) : (
                  <>
                    Connect agent <ArrowRightIcon />
                  </>
                )}
              </Button>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      )}
      {signedIn && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
          <a
            href={relayUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            Manage devices & agents <ArrowUpRightIcon className="size-3" aria-hidden />
          </a>
          <Button variant="link" size="xs" disabled={busy} onClick={session.signOut}>
            Sign out
          </Button>
        </div>
      )}
    </div>
  );
}

export function ManageAgentsLink({ className }: { className?: string }) {
  return (
    <a
      href={exteriorRelayUrl()}
      target="_blank"
      rel="noreferrer"
      className={cn(buttonVariants({ variant: "ghost" }), "justify-start gap-2 border-0 px-2 font-normal", className)}
    >
      <LaptopIcon className="size-4" aria-hidden /> <span>Devices & agents</span>
      <ArrowUpRightIcon className="ml-auto size-4" aria-hidden />
    </a>
  );
}

export function requestError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.name === "TimeoutError")
    return "Exterior took too long to respond. Please try again.";
  return error instanceof Error ? error.message : fallback;
}

function selectionOf(deviceId: string, agentName: string): string {
  return JSON.stringify([deviceId, agentName]);
}
