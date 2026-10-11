import { useCallback, useEffect, useState } from "react";
import type { GrantedApp } from "../../../src/dashboard-data.js";
import { Button } from "../ui/button";
import { CopyButton } from "./copy-button";

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
                </div>
              </div>
              <Button variant="ghost" size="sm" disabled={busy === app.clientId} onClick={() => void revoke(app.clientId)}>
                {busy === app.clientId ? "Revoking" : "Revoke"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <RegisterClient onRegistered={load} />
    </section>
  );
}

function RegisterClient({ onRegistered }: { onRegistered: () => void }) {
  const [name, setName] = useState("");
  const [redirects, setRedirects] = useState("");
  const [logo, setLogo] = useState("");
  const [confidential, setConfidential] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ clientId: string; clientSecret?: string } | undefined>();
  const [busy, setBusy] = useState(false);

  async function register() {
    setBusy(true);
    setError("");
    setResult(undefined);
    try {
      const response = await fetch("/api/clients/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientName: name,
          redirectUris: redirects.split("\n").map((line) => line.trim()).filter((line) => line.length > 0),
          logoUri: logo.trim() || undefined,
          confidential,
        }),
      });
      const body = (await response.json()) as { clientId?: string; clientSecret?: string; message?: string };
      if (!response.ok || !body.clientId) {
        setError(body.message ?? "Mukae could not register the client.");
        return;
      }
      setResult({ clientId: body.clientId, clientSecret: body.clientSecret });
      setName("");
      setRedirects("");
      setLogo("");
      onRegistered();
    } catch {
      setError("Mukae did not answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <h3 className="font-medium">Register a client</h3>
      <label className="flex flex-col gap-2 text-sm">
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="My web app" className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring" />
      </label>
      <label className="flex flex-col gap-2 text-sm">
        Redirect addresses, one per line
        <textarea value={redirects} onChange={(event) => setRedirects(event.target.value)} placeholder="https://app.example.test/oauth/callback" rows={2} className="rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring" />
      </label>
      <label className="flex flex-col gap-2 text-sm">
        Logo address, optional
        <input value={logo} onChange={(event) => setLogo(event.target.value)} placeholder="https://app.example.test/logo.png" className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring" />
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={confidential} onChange={(event) => setConfidential(event.target.checked)} className="size-4 accent-primary" />
        The client keeps a secret on its backend
      </label>
      <div>
        <Button disabled={busy} onClick={() => void register()}>
          {busy ? "Registering" : "Register"}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {result ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">Client id</span>
            <CopyButton text={result.clientId} label="Copy" />
          </div>
          <code className="font-mono text-sm break-all">{result.clientId}</code>
          {result.clientSecret ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">Client secret, shown once</span>
                <CopyButton text={result.clientSecret} label="Copy" />
              </div>
              <code className="font-mono text-sm break-all">{result.clientSecret}</code>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
