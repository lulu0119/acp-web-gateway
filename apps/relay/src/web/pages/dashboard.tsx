import { ChevronDownIcon, CircleAlertIcon, KeyRoundIcon, LaptopIcon, PlusIcon, TerminalIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { DashboardData, DeviceView, SetupGuideData } from "../../shared/account-web.js";
import { EmptyState } from "@exterior/ui/empty-state";
import { GrantsSection } from "../components/grants-section";
import { ExteriorMark } from "@exterior/ui/exterior-mark";
import { SectionHeading } from "@exterior/ui/section-heading";
import { SetupGuide } from "../components/setup-guide";
import { UserMenu } from "../components/user-menu";
import { Badge } from "@exterior/ui/badge";
import { Button, buttonVariants } from "@exterior/ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "@exterior/ui/button-group";
import { Dialog, DialogContent } from "@exterior/ui/dialog";
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
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-10 px-4 pt-6 pb-24 sm:gap-12 sm:px-6">
      <header className="flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <ExteriorMark className="size-7" />
          Exterior
        </a>
        <UserMenu userName={data.userName} userImage={data.userImage} />
      </header>

      <section className="flex flex-col gap-6" aria-labelledby="devices-heading">
        <SectionHeading id="devices-heading" title="Devices" as="h1" action={<AddDeviceMenu onSetUp={() => setSetupOpen(true)} />}>
          Computers signed in to your account. Web apps you authorize open agents on the online ones.
        </SectionHeading>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm leading-6 text-muted-foreground">
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
          <div className="flex flex-col gap-6">
            <EmptyState icon={<LaptopIcon />} title="No devices yet">
              Connect a computer that has an ACP agent installed, such as opencode or Claude Code. Follow either set of steps below.
            </EmptyState>
            <SetupGuide guide={guide} />
          </div>
        ) : (
          <DeviceTable devices={data.devices} sessions={data.sessions} onRemove={(device) => { setProblem(""); setRemoving(device); }} />
        )}
      </section>

      <GrantsSection />

      <Dialog open={removing !== undefined} onOpenChange={(open) => !open && !removePending && setRemoving(undefined)}>
        {removing ? (
          <DialogContent
            title={`Remove ${removing.hostname}?`}
            description={removing.online
              ? "It goes offline now, its open sessions end, and it is signed out. To use it again, sign it in again."
              : "It is signed out and leaves this list. To use it again, sign it in again."}
            className="max-w-md"
          >
            {problem ? (
              <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
                <CircleAlertIcon className="size-4" aria-hidden />
                {problem}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" disabled={removePending} onClick={() => setRemoving(undefined)}>Cancel</Button>
              <Button variant="destructive" loading={removePending} onClick={() => void remove(removing)}>
                {removePending ? "Removing" : "Remove device"}
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent title="Set up a new device" description="Sign the computer in, configure its agents, and keep it online.">
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
          <DropdownMenuItem onClick={onSetUp} className="items-start gap-2.5 py-2">
            <TerminalIcon className="mt-0.5" />
            <span className="flex flex-col">
              <span className="font-medium">Set up a new device</span>
              <span className="text-xs text-muted-foreground">The desktop app, an AI assistant, or a terminal</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem render={<a href="/device" />} className="items-start gap-2.5 py-2">
            <KeyRoundIcon className="mt-0.5" />
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

function DeviceTable({ devices, sessions, onRemove }: { devices: DeviceView[]; sessions: DashboardData["sessions"]; onRemove: (device: DeviceView) => void }) {
  const live = new Map<string, number>();
  for (const session of sessions) {
    const key = `${session.deviceId}\t${session.agentName}`;
    live.set(key, (live.get(key) ?? 0) + 1);
  }
  const sorted = [...devices].sort((a, b) => Number(b.online) - Number(a.online) || b.lastSeenAt - a.lastSeenAt);

  return (
    <div>
      <table className="w-full text-sm leading-6 sm:table-fixed">
        <thead className="hidden border-b border-border text-left text-xs leading-5 text-muted-foreground sm:table-header-group">
          <tr>
            <th scope="col" className="w-2/5 py-3 pr-4 font-medium">Device</th>
            <th scope="col" className="w-2/5 px-4 py-3 font-medium">Agents</th>
            <th scope="col" className="w-1/5 px-4 py-3 font-medium">Last seen</th>
            <th scope="col" className="w-24 py-3 pl-4"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((device) => (
            <tr key={device.id} className="flex flex-col gap-1 py-4 sm:table-row sm:p-0">
              <td className="sm:py-4 sm:pr-4 sm:align-top">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><LaptopIcon className="size-4" /></span>
                  <span className="min-w-0 text-base leading-6 font-semibold wrap-anywhere">{device.hostname}</span>
                </div>
              </td>
              <td className="pl-11 sm:px-4 sm:py-4 sm:align-top">
                <AgentList device={device} live={live} />
              </td>
              <td className="pl-11 text-xs leading-5 whitespace-nowrap sm:px-4 sm:py-4 sm:align-top">
                <Presence device={device} />
              </td>
              <td className="pt-1 pl-11 sm:py-3 sm:pl-4 sm:text-right sm:align-top">
                <Button variant="secondary" size="sm" onClick={() => onRemove(device)} aria-label={`Remove ${device.hostname}`}>Remove</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgentList({ device, live }: { device: DeviceView; live: Map<string, number> }) {
  if (!device.online) return <span className="text-muted-foreground">Shown when online</span>;
  if (device.agents.length === 0) {
    return <span className="text-muted-foreground">None configured. Add one in the desktop app, or run <code className="font-mono text-xs">exterior agent-config create</code> on it.</span>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {device.agents.map((agent) => {
        const count = live.get(`${device.id}\t${agent.name}`) ?? 0;
        return (
          <li key={agent.name}>
            <Badge variant="secondary" className="h-6 gap-1.5 px-2" title={agent.agentType}>
              {agent.name}
              {agent.name !== agent.agentType ? <span className="font-mono text-muted-foreground">{agent.agentType}</span> : null}
              {count > 0 ? <span className="rounded-full bg-success-100 px-1.5 text-success-800">{count} live</span> : null}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

function Presence({ device }: { device: DeviceView }) {
  if (device.online) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="size-2 rounded-full bg-success-500" />
        Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-muted-foreground" title={new Date(device.lastSeenAt).toLocaleString()}>
      <span className="size-2 rounded-full bg-muted-foreground/40" />
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
