import { Button } from "@relay/ui/button";
import { Dialog, DialogContent } from "@relay/ui/dialog";
import { Input } from "@relay/ui/input";
import { cn } from "cn";
import { useEffect, useState } from "react";
import { api, errorText, type RelayView, type SignInEvent } from "./api";
import { SectionHeader } from "./app";
import { relayHost, relayStatus, type Tone } from "./relay-status";

type Load = { kind: "loading" } | { kind: "ready"; relays: RelayView[] } | { kind: "error"; message: string };

type SignIn =
  | { stage: "closed" }
  | { stage: "form"; relay: string; error?: string }
  | { stage: "starting"; relay: string }
  | { stage: "waiting"; relay: string; code: string; url: string; expiresAt: number };

export function RelaysSection() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [signIn, setSignIn] = useState<SignIn>({ stage: "closed" });
  const now = useClock(load.kind === "ready" && load.relays.some((relay) => relay.phase === "restarting"));

  useEffect(() => {
    const ready = (relays: RelayView[]) => setLoad({ kind: "ready", relays });
    api.relays().then(ready, (error: unknown) => setLoad({ kind: "error", message: errorText(error) }));
    const unlisten = api.onRelays(ready);
    return () => void unlisten.then((stop) => stop());
  }, []);

  useEffect(() => {
    const unlisten = api.onSignIn((event: SignInEvent) => {
      setSignIn((current) => {
        if (current.stage === "closed") return current;
        if (event.event === "code") return { stage: "waiting", relay: event.relayUrl, code: event.userCode, url: event.verificationUri, expiresAt: event.expiresAt };
        if (event.event === "signed-in") return { stage: "closed" };
        return { stage: "form", relay: current.relay, error: event.message || "Sign-in stopped." };
      });
    });
    return () => void unlisten.then((stop) => stop());
  }, []);

  const start = async (relay: string) => {
    setSignIn({ stage: "starting", relay });
    try {
      await api.signIn(relay);
    } catch (error) {
      setSignIn({ stage: "form", relay, error: errorText(error) });
    }
  };
  const cancel = () => {
    void api.cancelSignIn();
    setSignIn({ stage: "closed" });
  };

  const relays = load.kind === "ready" ? load.relays : [];
  const openForm = () => setSignIn({ stage: "form", relay: "" });
  return (
    <section aria-labelledby="relays" className="flex flex-col gap-4">
      <SectionHeader
        id="relays"
        title="Relays"
        action={relays.length > 0 && signIn.stage === "closed" ? <Button variant="outline" onClick={openForm}>Sign in to a relay</Button> : undefined}
      >
        Web apps reach this device's agents through the relays it is signed in to.
      </SectionHeader>
      {signIn.stage !== "closed" ? <SignInPanel signIn={signIn} onStart={start} onCancel={cancel} onChange={(relay) => setSignIn({ stage: "form", relay })} /> : null}
      {load.kind === "loading" ? <p className="py-6 text-sm text-muted-foreground">Checking sign-ins…</p> : null}
      {load.kind === "error" ? <p className="text-sm text-danger-600 dark:text-danger-400">Could not read this device's sign-ins: {load.message}</p> : null}
      {load.kind === "ready" && relays.length === 0 && signIn.stage === "closed" ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border px-5 py-5">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">This device is not signed in</p>
            <p className="text-sm text-muted-foreground">Sign in to a relay with your Exterior account, and web apps you allow can open the agents below.</p>
          </div>
          <Button onClick={openForm}>Sign in to a relay</Button>
        </div>
      ) : null}
      {relays.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {relays.map((relay) => <RelayRow key={relay.relayUrl} relay={relay} now={now} onSignIn={() => void start(relay.relayUrl)} />)}
        </ul>
      ) : null}
    </section>
  );
}

function RelayRow({ relay, now, onSignIn }: { relay: RelayView; now: number; onSignIn: () => void }) {
  const status = relayStatus(relay, now);
  const [starting, setStarting] = useState(false);
  return (
    <li className="flex items-start gap-4 px-4 py-3.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="selectable truncate text-sm leading-6 font-medium">{relayHost(relay.relayUrl)}</span>
          <StatusLabel tone={status.tone}>{status.label}</StatusLabel>
        </div>
        <p className="selectable text-sm leading-5 text-muted-foreground">{status.detail}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {status.action === "sign-in" ? <Button size="sm" onClick={onSignIn}>Sign in again</Button> : null}
        {status.action === "start" ? (
          <Button size="sm" variant="outline" loading={starting} onClick={() => { setStarting(true); void api.startDaemon(relay.relayUrl).finally(() => setStarting(false)); }}>
            Start
          </Button>
        ) : null}
        <SignOutButton relayUrl={relay.relayUrl} />
      </div>
    </li>
  );
}

function StatusLabel({ tone, children }: { tone: Tone; children: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-xs leading-5 font-medium",
        tone === "ok" && "text-success-700 dark:text-success-400",
        tone === "busy" && "text-muted-foreground",
        tone === "attention" && "text-warning-700 dark:text-warning-400",
        tone === "off" && "text-muted-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          tone === "ok" && "bg-success-500",
          tone === "busy" && "animate-pulse bg-muted-foreground",
          tone === "attention" && "bg-warning-500",
          tone === "off" && "bg-muted-foreground/40",
        )}
      />
      {children}
    </span>
  );
}

function SignOutButton({ relayUrl }: { relayUrl: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const host = relayHost(relayUrl);
  const confirm = async () => {
    setPending(true);
    setError(undefined);
    try {
      await api.signOut(relayUrl);
      setOpen(false);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setOpen(true)}>Sign out</Button>
      <DialogContent title={`Sign out of ${host}?`} description="Web apps can no longer reach this device through this relay. Signing in again needs a new approval." className="max-w-md">
        {error ? <p className="text-sm text-danger-600 dark:text-danger-400">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" loading={pending} onClick={() => void confirm()}>Sign out</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SignInPanel({ signIn, onStart, onCancel, onChange }: {
  signIn: Exclude<SignIn, { stage: "closed" }>;
  onStart: (relay: string) => void;
  onCancel: () => void;
  onChange: (relay: string) => void;
}) {
  const now = useClock(signIn.stage === "waiting");
  if (signIn.stage === "waiting") {
    const expired = now > signIn.expiresAt;
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/40 px-5 py-5">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Approve this device on {relayHost(signIn.relay)}</p>
          <p className="text-sm text-muted-foreground">
            {expired ? "This code expired. Start again for a new one." : "Your browser opened the approval page. Check that it shows this code, then approve."}
          </p>
        </div>
        <p className="selectable font-mono text-2xl leading-8 font-semibold tracking-[0.2em]" aria-label="Code to approve">{signIn.code}</p>
        <div className="flex gap-2">
          {expired ? (
            <Button onClick={() => onStart(signIn.relay)}>Get a new code</Button>
          ) : (
            <Button variant="outline" onClick={() => void api.openUrl(signIn.url)}>Open the page again</Button>
          )}
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    );
  }
  const starting = signIn.stage === "starting";
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 px-5 py-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (signIn.relay.trim()) onStart(signIn.relay.trim());
      }}
    >
      <label htmlFor="relay-address" className="text-sm font-medium">Relay address</label>
      <div className="flex gap-2">
        <Input
          id="relay-address"
          autoFocus
          spellCheck={false}
          placeholder="relay.example.com"
          value={signIn.relay}
          disabled={starting}
          onChange={(event) => onChange(event.target.value)}
          className="bg-background font-mono"
        />
        <Button type="submit" loading={starting} disabled={!signIn.relay.trim()}>Continue</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      {signIn.stage === "form" && signIn.error ? <p className="selectable text-sm text-danger-600 dark:text-danger-400">{signIn.error}</p> : null}
    </form>
  );
}

/** The current time, ticking each second while something counts down. */
function useClock(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);
  return now;
}
