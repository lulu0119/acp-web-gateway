import { cn } from "cn";
import { ChevronDownIcon, CircleAlertIcon, KeyRoundIcon, LaptopIcon, PlusIcon, TerminalIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { DashboardData, DeviceView, GrantedApp, LiveSessionInfo, SetupGuideData } from "../../shared/account-web.js";
import { AgentIcon } from "@exterior/ui/agent-icon";
import { DeviceIcon, platformName } from "@exterior/ui/device-icon";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@exterior/ui/empty";
import { AppIcon } from "../components/app-icon";
import { GrantsSection, useGrants } from "../components/grants-section";
import { ExteriorMark } from "@exterior/ui/exterior-mark";
import { SectionHeading } from "@exterior/ui/section-heading";
import { SetupGuide } from "../components/setup-guide";
import { UserMenu } from "../components/user-menu";
import { Alert, AlertDescription } from "@exterior/ui/alert";
import { Button, buttonVariants } from "@exterior/ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "@exterior/ui/button-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@exterior/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@exterior/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@exterior/ui/dropdown-menu";

const refreshMs = 5000;

export function Dashboard({ initialData, guide }: { initialData: DashboardData; guide: SetupGuideData }) {
  const [data, setData] = useState(initialData);
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());
  const [stale, setStale] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [removing, setRemoving] = useState<DeviceView | undefined>();
  const [removePending, setRemovePending] = useState(false);
  const [problem, setProblem] = useState("");
  const grants = useGrants();

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard", { headers: { accept: "application/json" }, signal: AbortSignal.timeout(refreshMs) });
      if (response.status === 401) {
        window.location.assign("/sign-in?next=%2F");
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData((await response.json()) as DashboardData);
      setRefreshedAt(Date.now());
      setStale(false);
    } catch {
      setStale(true);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => void load(), refreshMs);
    return () => clearInterval(timer);
  }, [load]);

  async function remove(device: DeviceView) {
    setRemovePending(true);
    setProblem("");
    try {
      const response = await fetch("/api/devices/remove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: device.id }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData((current) => ({ ...current, devices: current.devices.filter((item) => item.id !== device.id) }));
      setRemoving(undefined);
      void load();
    } catch {
      setProblem(`Could not remove ${device.hostname}. Try again.`);
    } finally {
      setRemovePending(false);
    }
  }

  const online = data.devices.filter((device) => device.online).length;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-8 px-4 pt-6 pb-12 sm:gap-12 sm:px-6">
      <header className="flex items-center justify-between">
        <a href="/" className="flex items-center gap-2">
          <ExteriorMark className="size-7" />
          <span className="font-display text-lg font-bold">Exterior</span>
        </a>
        <UserMenu userName={data.userName} userImage={data.userImage} />
      </header>

      <main className="flex min-w-0 flex-col gap-12">
        <section className="flex flex-col gap-6" aria-labelledby="devices-heading">
          <SectionHeading id="devices-heading" title="Devices" as="h1" action={<AddDeviceMenu onSetUp={() => setSetupOpen(true)} />}>
            Computers signed in to your account. Web apps you authorize open agents on the online ones.
          </SectionHeading>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm leading-6 text-muted-foreground">
            <span><span className="font-medium text-foreground">{data.devices.length}</span> {data.devices.length === 1 ? "device" : "devices"}</span>
            <span className="inline-flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-success-500" />
              <span><span className="font-medium text-foreground">{online}</span> online</span>
            </span>
            <span><span className="font-medium text-foreground">{data.sessions.length}</span> live {data.sessions.length === 1 ? "connection" : "connections"}</span>
            {stale ? (
              <span className="basis-full" role="status">
                Couldn't refresh. Showing data from {new Date(refreshedAt).toLocaleTimeString()}; retrying.
              </span>
            ) : null}
          </div>

          {data.devices.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><LaptopIcon /></EmptyMedia>
                <EmptyTitle>No devices yet</EmptyTitle>
                <EmptyDescription>
                  Connect a computer that has an ACP agent installed, such as opencode or Claude Code. Use Add device to set one up or enter its code.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <DeviceList devices={data.devices} sessions={data.sessions} apps={grants.loaded.state === "ready" ? grants.loaded.apps : []} agentIcons={data.agentIcons} onRemove={(device) => { setProblem(""); setRemoving(device); }} />
          )}
        </section>

        <GrantsSection grants={grants} devices={data.devices} sessions={data.sessions} agentIcons={data.agentIcons} />
      </main>

      <AlertDialog open={removing !== undefined} onOpenChange={(open) => !open && !removePending && setRemoving(undefined)}>
        {removing ? (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display">{`Remove ${removing.hostname}?`}</AlertDialogTitle>
              <AlertDialogDescription>
                {removing.online
                  ? "It goes offline now, its open sessions end, and it is signed out. To use it again, sign it in again."
                  : "It is signed out and leaves this list. To use it again, sign it in again."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {problem ? (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertDescription>{problem}</AlertDescription>
              </Alert>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel variant="secondary" disabled={removePending}>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" loading={removePending} onClick={() => void remove(removing)}>
                {removePending ? "Removing" : "Remove device"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent>
          <DialogHeader className="gap-1 pr-8">
            <DialogTitle className="font-display text-xl font-bold">Set up a new device</DialogTitle>
            <DialogDescription>
              Sign the computer in, configure its agents, and keep it online.
            </DialogDescription>
          </DialogHeader>
          <SetupGuide guide={guide} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddDeviceMenu({ onSetUp }: { onSetUp: () => void }) {
  return (
    <ButtonGroup variant="primary" className="shrink-0" aria-label="Add device">
      <a href="/device" data-slot="button" className={buttonVariants({ size: "lg" })}>
        <PlusIcon data-icon="inline-start" aria-hidden />
        Add device
      </a>
      <ButtonGroupSeparator />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button size="icon-lg" />}
          aria-label="More ways to add a device"
        >
          <ChevronDownIcon aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem onClick={onSetUp} className="items-start gap-2 py-2">
            <TerminalIcon className="mt-1" />
            <span className="flex flex-col">
              <span className="font-medium">Set up a new device</span>
              <span className="text-xs text-muted-foreground">The desktop app, an AI assistant, or a terminal</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem render={<a href="/device" />} className="items-start gap-2 py-2">
            <KeyRoundIcon className="mt-1" />
            <span className="flex flex-col">
              <span className="font-medium">Enter a device code</span>
              <span className="text-xs text-muted-foreground">The code the app or <code className="font-mono">exterior login</code> shows</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}

function DeviceList({ devices, sessions, apps, agentIcons, onRemove }: {
  devices: DeviceView[];
  sessions: DashboardData["sessions"];
  apps: GrantedApp[];
  agentIcons: Record<string, string>;
  onRemove: (device: DeviceView) => void;
}) {
  const appsById = new Map(apps.map((app) => [app.clientId, app]));
  const sorted = [...devices].sort((a, b) => Number(b.online) - Number(a.online) || b.lastSeenAt - a.lastSeenAt);

  return (
    <ul className="grid items-start gap-3 sm:grid-cols-2" aria-label="Devices">
      {sorted.map((device) => {
        const system = device.platform ? platformName(device.platform) : undefined;
        return (
          <li
            key={device.id}
            className={cn(
              "flex min-w-0 flex-col gap-4 rounded-2xl p-4",
              device.online ? "bg-card ring-1 ring-border" : "bg-muted/40 ring-1 ring-border/60",
            )}
          >
            <div className="flex items-start gap-3">
              {device.platform ? (
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-xl text-2xl",
                    device.online ? "bg-muted text-foreground" : "bg-background text-muted-foreground",
                  )}
                  title={system}
                >
                  <DeviceIcon platform={device.platform} />
                </span>
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col">
                <h3 className={cn("text-base leading-6 font-semibold wrap-anywhere", !device.online && "text-muted-foreground")}>{device.hostname}</h3>
                <p className="flex flex-wrap items-center gap-x-2 text-xs leading-5 text-muted-foreground">
                  <Presence device={device} />
                  {system ? <><span aria-hidden>·</span><span>{system}</span></> : null}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => onRemove(device)} aria-label={`Remove ${device.hostname}`}>Remove</Button>
            </div>
            <AgentStack device={device} sessions={sessions.filter((session) => session.deviceId === device.id)} apps={appsById} agentIcons={agentIcons} />
          </li>
        );
      })}
    </ul>
  );
}

const stackLimit = 5;

/** A device's agents as overlapping marks, and the apps using the device. */
function AgentStack({ device, sessions, apps, agentIcons }: {
  device: DeviceView;
  sessions: LiveSessionInfo[];
  apps: Map<string, GrantedApp>;
  agentIcons: Record<string, string>;
}) {
  if (!device.online) return <p className="text-sm leading-6 text-muted-foreground">Agents shown when online</p>;
  if (device.agents.length === 0) {
    return <p className="text-sm leading-6 text-muted-foreground">No agents yet. Add one in the desktop app, or run <code className="font-mono text-xs">exterior agent create</code> on it.</p>;
  }
  const users = [...new Set(sessions.map((session) => session.clientId))];
  const names = device.agents.map((agent) => agent.name);
  const summary = names.length === 1 ? names[0] : `${names.length} agents`;
  const hidden = device.agents.length - stackLimit;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <ul className="flex shrink-0 -space-x-2" aria-label={summary}>
        {device.agents.slice(0, stackLimit).map((agent) => (
          <li key={agent.name} className="flex size-8 items-center justify-center rounded-full border border-border bg-card ring-2 ring-card" title={agent.name}>
            <AgentIcon iconUrl={agentIcons[agent.agentType]} className="size-4" />
          </li>
        ))}
        {hidden > 0 ? (
          <li className="flex size-8 items-center justify-center rounded-full border border-border bg-muted text-[11px] font-semibold text-muted-foreground ring-2 ring-card">
            +{hidden}<span className="sr-only"> more agents</span>
          </li>
        ) : null}
      </ul>
      <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={names.join(", ")} aria-hidden>{summary}</p>
      {users.length > 0 ? <InUseBy users={users} apps={apps} /> : null}
    </div>
  );
}

/** The apps with a session open on the device: their icons, and the name when there is one. */
function InUseBy({ users, apps }: { users: string[]; apps: Map<string, GrantedApp> }) {
  const names = users.map((clientId) => apps.get(clientId)?.clientName ?? "An app");
  return (
    <span className="flex shrink-0 items-center gap-2 text-xs leading-5 text-muted-foreground" title={`In use by ${names.join(", ")}`}>
      <span className="flex -space-x-2">
        {users.slice(0, 3).map((clientId) => {
          const app = apps.get(clientId);
          return <AppIcon key={clientId} label={app?.clientName ?? "An app"} logoUri={app?.logoUri} className="size-6 rounded-md text-[10px] ring-2 ring-card" />;
        })}
      </span>
      <span className="font-medium">{users.length === 1 ? names[0] : `${users.length} apps`}</span>
    </span>
  );
}

function Presence({ device }: { device: DeviceView }) {
  if (device.online) {
    return (
      <span className="inline-flex items-center gap-2 font-medium text-success-700 dark:text-success-400">
        <span className="size-1.5 rounded-full bg-success-500" />
        Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2" title={new Date(device.lastSeenAt).toLocaleString()}>
      <span className="size-1.5 rounded-full bg-muted-foreground/40" />
      {relativeTime(device.lastSeenAt)}
    </span>
  );
}

function relativeTime(at: number): string {
  const seconds = Math.round((at - Date.now()) / 1000);
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [["day", 86_400], ["hour", 3_600], ["minute", 60]];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return "Just now";
}
