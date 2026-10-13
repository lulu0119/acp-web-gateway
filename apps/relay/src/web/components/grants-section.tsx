import { AppWindowIcon, CircleAlertIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { GrantedApp } from "../../shared/account-web.js";
import { Button } from "../ui/button";
import { EmptyState } from "./empty-state";

type Loaded = { state: "loading" } | { state: "error" } | { state: "ready"; apps: GrantedApp[] };

export function GrantsSection() {
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [revoking, setRevoking] = useState("");
  const [problem, setProblem] = useState("");

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
    <section className="flex flex-col gap-5" aria-labelledby="apps-heading">
      <div className="flex flex-col gap-2">
        <h2 id="apps-heading" className="text-xl font-semibold tracking-tight">Authorized apps</h2>
        <p className="text-muted-foreground">Web apps that can open agents on your devices. Revoking signs an app out the next time it asks for a token.</p>
      </div>
      {problem ? (
        <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
          <CircleAlertIcon className="size-4" aria-hidden />
          {problem}
        </p>
      ) : null}
      {loaded.state === "loading" ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading apps">
          {[0, 1].map((key) => <div key={key} className="h-16 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : loaded.state === "error" ? (
        <EmptyState
          icon={<CircleAlertIcon />}
          title="Couldn't load authorized apps"
          action={<Button variant="secondary" onClick={() => { setLoaded({ state: "loading" }); void load(); }}>Try again</Button>}
        />
      ) : loaded.apps.length === 0 ? (
        <EmptyState icon={<AppWindowIcon />} title="No apps yet">
          When a web app asks to use your agents and you authorize it, it shows up here.
        </EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {loaded.apps.map((app) => (
            <li key={app.clientId} className="flex items-center justify-between gap-4 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted font-semibold text-muted-foreground">
                  {(app.clientName.trim().charAt(0) || "?").toUpperCase()}
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold">{app.clientName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {app.clientUri ? `${hostOf(app.clientUri)} · ` : ""}Authorized {formatDate(app.grantedAt)}
                  </span>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                loading={revoking === app.clientId}
                disabled={revoking !== "" && revoking !== app.clientId}
                onClick={() => void revoke(app)}
              >
                {revoking === app.clientId ? "Revoking" : "Revoke"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
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
