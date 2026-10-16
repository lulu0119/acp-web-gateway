import { AppWindowIcon, CircleAlertIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { GrantedApp } from "../../shared/account-web.js";
import { AppIcon } from "./app-icon.js";
import { Button } from "@exterior/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@exterior/ui/item";
import { EmptyState } from "@exterior/ui/empty-state";
import { SectionHeading } from "@exterior/ui/section-heading";

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
    <section className="flex flex-col gap-6" aria-labelledby="apps-heading">
      <SectionHeading id="apps-heading" title="Authorized apps">
        Web apps that can open agents on your devices. Revoking signs an app out the next time it asks for a token.
      </SectionHeading>
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
        <ItemGroup className="gap-0">
          {loaded.apps.map((app) => (
            <Item
              key={app.clientId}
              role="listitem"
              className="items-start gap-3 rounded-none border-x-0 border-t-0 border-border px-0 py-4 last:border-b-0"
            >
              <ItemMedia>
                <AppIcon label={app.clientName} logoUri={app.logoUri} className="size-8 rounded-lg" />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle className="w-full min-w-0 line-clamp-none text-base leading-6 font-semibold wrap-anywhere">{app.clientName}</ItemTitle>
                {app.origin ? <ItemDescription className="line-clamp-none leading-6 font-medium text-foreground wrap-anywhere">{hostOf(app.origin)}</ItemDescription> : null}
                <p className="text-xs leading-5 text-muted-foreground">Authorized {formatDate(app.grantedAt)}</p>
              </ItemContent>
              <ItemActions className="shrink-0">
                <Button
                  variant="secondary"
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
