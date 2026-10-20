import { AppWindowIcon, CircleAlertIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { DeviceView, GrantedApp, LiveSessionInfo } from "../../shared/account-web.js";
import { AgentIcon } from "@exterior/ui/agent-icon";
import { AppIcon } from "./app-icon.js";
import { Alert, AlertDescription } from "@exterior/ui/alert";
import { Button } from "@exterior/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@exterior/ui/item";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@exterior/ui/empty";
import { Skeleton } from "@exterior/ui/skeleton";
import { SectionHeading } from "@exterior/ui/section-heading";

type Loaded = { state: "loading" } | { state: "error" } | { state: "ready"; apps: GrantedApp[] };

export type Grants = { loaded: Loaded; load: () => Promise<void>; retry: () => void };

/** The account's authorized apps. The dashboard loads them once: this section lists them, devices name the app using an agent. */
export function useGrants(): Grants {
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/grants", { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { apps: GrantedApp[] };
      setLoaded({ state: "ready", apps: body.apps });
    } catch {
      setLoaded((current) => (current.state === "ready" ? current : { state: "error" }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { loaded, load, retry: () => { setLoaded({ state: "loading" }); void load(); } };
}

export function GrantsSection({ grants, devices, sessions, agentIcons }: {
  grants: Grants;
  devices: DeviceView[];
  sessions: LiveSessionInfo[];
  agentIcons: Record<string, string>;
}) {
  const { loaded, load } = grants;
  const [revoking, setRevoking] = useState("");
  const [problem, setProblem] = useState("");
  const hostnames = new Map(devices.map((device) => [device.id, device.hostname]));

  async function revoke(app: GrantedApp) {
    setRevoking(app.clientId);
    setProblem("");
    try {
      const response = await fetch("/api/grants/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: app.clientId }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await load();
    } catch {
      setProblem(`Could not revoke ${app.clientName}. Try again.`);
    } finally {
      setRevoking("");
    }
  }

  return (
    <section className="flex flex-col gap-6" aria-labelledby="apps-heading">
      <SectionHeading id="apps-heading" title="Authorized apps">
        Web apps that can open agents on your devices. Revoking signs an app out the next time it asks for a token.
      </SectionHeading>
      {problem ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      ) : null}
      {loaded.state === "loading" ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading apps">
          {[0, 1].map((key) => <Skeleton key={key} className="h-16 rounded-xl" />)}
        </div>
      ) : loaded.state === "error" ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><CircleAlertIcon /></EmptyMedia>
            <EmptyTitle>Couldn't load authorized apps</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={grants.retry}>Try again</Button>
          </EmptyContent>
        </Empty>
      ) : loaded.apps.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><AppWindowIcon /></EmptyMedia>
            <EmptyTitle>No apps yet</EmptyTitle>
            <EmptyDescription>
              When a web app asks to use your agents and you authorize it, it shows up here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup className="gap-0 border-y border-border">
          {loaded.apps.map((app) => (
            <Item
              key={app.clientId}
              role="listitem"
              className="items-start gap-3 rounded-none border-x-0 border-t-0 border-border px-0 py-4 last:border-b-0"
            >
              <ItemMedia>
                <AppIcon label={app.clientName} logoUri={app.logoUri} className="size-9 rounded-lg ring-1 ring-border" />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="w-full min-w-0 line-clamp-none text-base leading-6 font-semibold wrap-anywhere">{app.clientName}</ItemTitle>
                {app.origin ? <ItemDescription className="line-clamp-none font-mono text-[13px] leading-6 text-foreground/80 wrap-anywhere">{hostOf(app.origin)}</ItemDescription> : null}
                <p className="text-xs leading-5 text-muted-foreground">Authorized {formatDate(app.grantedAt)}</p>
                <InUse sessions={sessions.filter((session) => session.clientId === app.clientId)} hostnames={hostnames} agentIcons={agentIcons} />
              </ItemContent>
              <ItemActions className="shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  loading={revoking === app.clientId}
                  disabled={revoking !== "" && revoking !== app.clientId}
                  onClick={() => void revoke(app)}
                >
                  {revoking === app.clientId ? "Revoking" : "Revoke"}
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
    </section>
  );
}

/** The agents an app has open right now, each with the device it runs on. */
function InUse({ sessions, hostnames, agentIcons }: { sessions: LiveSessionInfo[]; hostnames: Map<string, string>; agentIcons: Record<string, string> }) {
  if (sessions.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2" aria-label="Agents in use">
      {sessions.map((session) => (
        <li key={`${session.deviceId}\t${session.agentName}\t${session.clientId}`} className="flex items-center gap-2 rounded-full bg-success-50 py-1 pr-3 pl-2 text-xs leading-5 text-success-900 ring-1 ring-success-200">
          <AgentIcon iconUrl={agentIcons[session.agentType]} className="size-3.5" />
          <span className="font-medium">{session.agentName}</span>
          <span className="text-success-800/70">on {hostnames.get(session.deviceId) ?? "a removed device"}</span>
        </li>
      ))}
    </ul>
  );
}

function hostOf(uri: string): string {
  try {
    return new URL(uri).host;
  } catch {
    return uri;
  }
}

function formatDate(value: string): string {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return value;
  return new Date(time).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
