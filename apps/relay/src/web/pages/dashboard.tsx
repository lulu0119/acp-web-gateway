import { cn } from "cn";
import { ChevronDownIcon, KeyRoundIcon, LaptopIcon, PlusIcon, TerminalIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { DashboardData, DeviceView, SetupGuideData } from "../../shared/account-web.js";
import { EmptyState } from "../components/empty-state";
import { GrantsSection } from "../components/grants-section";
import { PaperPage } from "../components/paper-page";
import { SiteHeader } from "../components/site-header";
import { Section } from "../components/section";
import { SetupGuide } from "../components/setup-guide";
import { UserMenu } from "../components/user-menu";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "../ui/button-group";
import { Dialog, DialogContent } from "../ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";

const refreshMs = 5000;

export function Dashboard({ initialData, guide }: { initialData: DashboardData; guide: SetupGuideData }) {
  const [data, setData] = useState(initialData);
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());
  const [stale, setStale] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/dashboard", { headers: { accept: "application/json" }, signal: AbortSignal.timeout(refreshMs) });
        if (response.status === 401) {
          window.location.assign("/sign-in?next=%2F");
          return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const next = (await response.json()) as DashboardData;
        if (cancelled) return;
        setData(next);
        setRefreshedAt(Date.now());
        setStale(false);
      } catch {
        if (!cancelled) setStale(true);
      }
    };
    const timer = setInterval(load, refreshMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const online = data.devices.filter((device) => device.machineId).length;

  return (
    <PaperPage frame="dashboard">
      <SiteHeader className="px-s3 sm:px-0">
        <UserMenu userName={data.userName} userImage={data.userImage} />
      </SiteHeader>

      <Section
          id="devices-heading"
          title="Devices"
          as="h1"
          action={<AddDeviceMenu onSetUp={() => setSetupOpen(true)} />}
          description="Computers signed in to your account. Web apps you authorize open agents on the online ones."
        >
          <div className="-mt-1 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm leading-6 text-muted-foreground">
            <Stat value={data.devices.length} label={data.devices.length === 1 ? "device" : "devices"} />
            <Stat value={online} label="online" live={online > 0} />
            <Stat value={data.sessions.length} label={data.sessions.length === 1 ? "live connection" : "live connections"} />
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
            <DeviceTable devices={data.devices} sessions={data.sessions} />
          )}
        </Section>

        <GrantsSection />

        <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
          <DialogContent title="Set up a new device" description="Sign the computer in, configure its agents, and keep it online.">
            <SetupGuide guide={guide} />
          </DialogContent>
        </Dialog>
    </PaperPage>
  );
}

function Stat({ value, label, live }: { value: number; label: string; live?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      {live ? <LiveDot className="self-center" /> : null}
      <span className="text-xl leading-6 font-semibold text-foreground">{value}</span>
      {label}
    </span>
  );
}

/** A cyan square, the color of what is connected right now. */
function LiveDot({ className }: { className?: string }) {
  return <span className={cn("size-2 shrink-0 bg-electric", className)} aria-hidden />;
}

function AddDeviceMenu({ onSetUp }: { onSetUp: () => void }) {
  return (
    <ButtonGroup variant="inverse" className="shrink-0" aria-label="Add device">
      <a href="/device" data-slot="button" className={buttonVariants({ variant: "inverse", size: "lg" })}>
        <PlusIcon data-icon="inline-start" aria-hidden />
        Add device
      </a>
      <ButtonGroupSeparator />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="inverse" size="icon-lg" />}
          aria-label="More ways to add a device"
        >
          <ChevronDownIcon aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem onClick={onSetUp} className="items-start gap-2.5 py-2">
            <TerminalIcon className="mt-0.5" />
            <span className="flex flex-col">
              <span className="font-medium">Set up a new device</span>
              <span className="text-xs text-muted-foreground">Steps for an AI assistant or a terminal</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem render={<a href="/device" />} className="items-start gap-2.5 py-2">
            <KeyRoundIcon className="mt-0.5" />
            <span className="flex flex-col">
              <span className="font-medium">Enter a device code</span>
              <span className="text-xs text-muted-foreground">The code <code className="font-mono">mukae login</code> printed</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}

function DeviceTable({ devices, sessions }: { devices: DeviceView[]; sessions: DashboardData["sessions"] }) {
  const live = new Map<string, number>();
  for (const session of sessions) {
    const key = `${session.machineId}\t${session.agentName}`;
    live.set(key, (live.get(key) ?? 0) + 1);
  }
  const sorted = [...devices].sort((a, b) => Number(Boolean(b.machineId)) - Number(Boolean(a.machineId)) || (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0));

  return (
    <div>
      <table className="w-full text-sm leading-6 sm:table-fixed">
        <thead className="hidden text-left font-label text-xs leading-5 font-medium tracking-wider text-muted-foreground uppercase sm:table-header-group">
          <tr>
            <th scope="col" className="tile-underline w-2/5 pt-1 pr-4 pb-3 font-normal">Device</th>
            <th scope="col" className="tile-underline w-2/5 px-4 pt-1 pb-3 font-normal">Agents</th>
            <th scope="col" className="tile-underline w-1/5 pt-1 pb-3 pl-4 font-normal">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((device) => (
            <tr key={device.id} className="group/row tile-underline flex flex-col gap-1 py-4 last:bg-none sm:table-row sm:bg-none sm:p-0">
              <td className="sm:py-4 sm:pr-4 sm:align-top sm:group-not-last/row:tile-underline">
                <div className="flex items-center gap-3">
                  <span className={cn("flex size-8 shrink-0 items-center justify-center", device.machineId ? "band-brand" : "bg-muted text-muted-foreground")}><LaptopIcon className="size-4" /></span>
                  <span className="min-w-0 text-base leading-6 font-semibold wrap-anywhere">{device.hostname}</span>
                </div>
              </td>
              <td className="pl-11 sm:px-4 sm:py-4 sm:align-top sm:group-not-last/row:tile-underline">
                <AgentList device={device} live={live} />
              </td>
              <td className="pl-11 text-xs leading-5 whitespace-nowrap sm:py-4 sm:pl-4 sm:align-top sm:group-not-last/row:tile-underline">
                <Presence device={device} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgentList({ device, live }: { device: DeviceView; live: Map<string, number> }) {
  if (!device.machineId) return <span className="text-muted-foreground">Shown when online</span>;
  if (device.agents.length === 0) {
    return <span className="text-muted-foreground">None configured. Run <code className="font-mono text-xs">mukae agent-config create</code> on it.</span>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {device.agents.map((agent) => {
        const count = live.get(`${device.machineId}\t${agent.name}`) ?? 0;
        return (
          <li key={agent.name}>
            <Badge variant="outline" className="h-6 gap-1.5 px-2 has-data-live:pr-0.5" title={agent.agentType}>
              {agent.name}
              {agent.name !== agent.agentType ? <span className="font-mono text-muted-foreground">{agent.agentType}</span> : null}
              {count > 0 ? <span data-live className="bg-linear-to-r from-electric-mint to-electric px-1.5 font-semibold text-electric-ink">{count} live</span> : null}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

function Presence({ device }: { device: DeviceView }) {
  if (device.machineId) {
    return (
      <span className="inline-flex items-center gap-2 font-medium">
        <LiveDot />
        Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-muted-foreground" title={device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : undefined}>
      <span className="size-2 shrink-0 bg-muted-foreground/40" />
      {device.lastSeenAt ? relativeTime(device.lastSeenAt) : "Offline"}
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
