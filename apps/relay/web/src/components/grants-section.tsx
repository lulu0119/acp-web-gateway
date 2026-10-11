import { useCallback, useEffect, useState } from "react";
import type { GrantedApp } from "../../../src/dashboard-data.js";
import { Button } from "../ui/button";

export function GrantsSection() {
  const [apps, setApps] = useState<GrantedApp[]>([]);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/grants", { headers: { accept: "application/json" } });
      if (!response.ok) return;
      const body = (await response.json()) as { apps: GrantedApp[] };
      setApps(body.apps);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(clientId: string) {
    setBusy(clientId);
    try {
      await fetch("/api/grants/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      await load();
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">Authorized apps</h2>
        <p className="text-muted-foreground">
          These apps were approved in the past. Revoking signs them out the next time they ask for a token.
        </p>
      </div>
      {apps.length === 0 ? (
        <p className="text-sm text-muted-foreground">No app has been approved yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {apps.map((app) => (
            <li key={app.clientId} className="flex items-center justify-between gap-4 py-4">
              <div className="flex min-w-0 items-center gap-3">
                {app.logoUri ? (
                  <img src={app.logoUri} alt="" className="size-8 shrink-0 rounded-md border border-border" />
                ) : null}
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{app.clientName}</span>
                  <span className="font-mono text-xs break-all text-muted-foreground">{app.scopes.join(" ")}</span>
                  <span className="text-xs text-muted-foreground">Approved {formatDate(app.grantedAt)}</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" disabled={busy === app.clientId} onClick={() => void revoke(app.clientId)}>
                {busy === app.clientId ? "Revoking" : "Revoke"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatDate(value: string): string {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return value;
  return new Date(time).toLocaleString();
}
