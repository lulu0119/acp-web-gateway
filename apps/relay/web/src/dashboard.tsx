import { useEffect, useState } from "react";
import type { DashboardData } from "../../src/dashboard-data.js";
import { Badge } from "./ui/badge";
import { readProps } from "./lib/props";
import { SetupGuide } from "./components/setup-guide";
import { UserMenu } from "./components/user-menu";

const fallback: DashboardData = { userName: "", machines: [], sessions: [] };

export function Dashboard() {
  const [data, setData] = useState<DashboardData>(() => readProps(fallback));
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/dashboard", { headers: { accept: "application/json" } });
        if (!response.ok) {
          if (!cancelled) setStale(true);
          return;
        }
        const next = (await response.json()) as DashboardData;
        if (cancelled) return;
        setData(next);
        setStale(false);
      } catch {
        if (!cancelled) setStale(true);
      }
    };
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const liveByAgent = new Map<string, number>();
  for (const session of data.sessions) {
    liveByAgent.set(`${session.machineId}\t${session.agentName}`, (liveByAgent.get(`${session.machineId}\t${session.agentName}`) ?? 0) + 1);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-10 px-6 pt-20 pb-24">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">mukae</p>
          <UserMenu userName={data.userName} />
        </div>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Machines</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          {data.userName ? `Signed in as ${data.userName}. ` : ""}A web app reaches an agent on one of these
          computers through your account.
        </p>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            {data.machines.length} online
          </Badge>
          <Badge variant="secondary">{data.sessions.length} connections</Badge>
          {stale ? <span className="text-sm text-muted-foreground">Couldn't refresh just now. Retrying…</span> : null}
        </div>
      </header>

      {data.machines.length === 0 ? (
        <SetupGuide />
      ) : (
        <div className="flex flex-col gap-4">
          {data.machines.map((machine) => (
            <section key={machine.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-medium">{machine.hostname}</h2>
                <Badge variant="secondary">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  online
                </Badge>
              </div>
              <ul className="mt-4 flex flex-col divide-y divide-border border-t border-border">
                {machine.agents.map((agent) => {
                  const live = liveByAgent.get(`${machine.id}\t${agent.name}`) ?? 0;
                  return (
                    <li key={agent.name} className="flex items-center justify-between gap-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{agent.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{agent.agentType}</span>
                      </div>
                      {live > 0 ? <Badge>{live} live</Badge> : <span className="text-sm text-muted-foreground">idle</span>}
                    </li>
                  );
                })}
              </ul>
              {machine.agents.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">No agent is configured on this machine.</p>
              ) : null}
            </section>
          ))}
        </div>
      )}


      <p className="text-sm text-muted-foreground">
        <a href="/device" className="underline underline-offset-4">
          Approve another machine
        </a>
      </p>
    </main>
  );
}
