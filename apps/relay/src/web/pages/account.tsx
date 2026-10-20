import { cn } from "cn";
import {
  ArrowRightIcon,
  BotIcon,
  CheckIcon,
  CircleAlertIcon,
  CodeIcon,
  InfoIcon,
  KeyRoundIcon,
  LaptopIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  UserIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { AccountPage as AccountPageData, AccountView, PermissionView } from "../../shared/account-web.js";
import { AppIcon } from "../components/app-icon.js";
import { CodeBlock } from "../components/code-block.js";
import { ExteriorMark } from "@exterior/ui/exterior-mark";
import { PendingForm, PendingScope, SubmitButton } from "../components/pending-form.js";
import { Step } from "../components/step.js";
import { Avatar } from "@exterior/ui/avatar";
import { Badge } from "@exterior/ui/badge";
import { buttonVariants } from "@exterior/ui/button";
import { OTPField } from "@exterior/ui/otp-field";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@exterior/ui/tabs";

const userCodeGroups = [4, 4] as const;

export function accountPageTitle(page: AccountPageData): string {
  switch (page.kind) {
    case "sign-in": return "Sign in";
    case "consent": return "Authorize app";
    case "device":
    case "device-code": return "Connect a device";
    case "device-approved": return "Device connected";
    case "message": return page.title;
  }
}

export function AccountPage({ page }: { page: AccountPageData }) {
  return (
    <main className="flex min-h-dvh w-full flex-col items-center px-4 py-12">
      <AccountContent page={page} />
    </main>
  );
}

function AccountContent({ page }: { page: AccountPageData }) {
  switch (page.kind) {
    case "sign-in": return <SignIn page={page} />;
    case "device-code": return <DeviceCode page={page} />;
    case "device": return <DeviceApproval page={page} />;
    case "device-approved": return <DeviceApproved page={page} />;
    case "consent": return <Consent page={page} />;
    case "message": return <Message page={page} />;
  }
}

function Shell({ header, children, footer, wide, framed = true }: { header: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean; framed?: boolean }) {
  return (
    <div className={cn("flex w-full flex-col items-center gap-8", wide ? "max-w-2xl" : "max-w-md")}>
      <div className="flex flex-col items-center gap-4 text-center">{header}</div>
      <div className={cn("flex w-full flex-col gap-6", framed && "sm:rounded-2xl sm:bg-card sm:p-8 sm:ring-1 sm:ring-border")}>{children}</div>
      {footer ? <div className="text-center text-sm text-muted-foreground">{footer}</div> : null}
    </div>
  );
}

function SignedInAs({ account }: { account: AccountView }) {
  if (!account.name) return null;
  return (
    <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <Avatar name={account.name} image={account.image} className="size-5 text-[10px]" />
      Signed in as <span className="font-semibold text-foreground">{account.name}</span>
    </p>
  );
}

function SignIn({ page }: { page: Extract<AccountPageData, { kind: "sign-in" }> }) {
  return (
    <Shell
      framed={false}
      header={(
        <>
          <ExteriorMark className="size-14" />
          <h1 className="font-display text-2xl font-bold">Sign in to Exterior</h1>
          <p className="max-w-sm text-muted-foreground">
            Exterior lets web apps you approve reach agents on devices you own. Sign in to approve an app or a device.
          </p>
        </>
      )}
    >
      {page.configured ? (
        <PendingForm method="post" action="/sign-in/github" className="flex flex-col">
          <input type="hidden" name="query" value={page.query} />
          <SubmitButton id="github" size="xl">
            <GitHubIcon />
            Continue with GitHub
          </SubmitButton>
        </PendingForm>
      ) : (
        <Notice tone="error" title="GitHub sign-in is not set up">
          Set <code className="font-mono">GITHUB_CLIENT_ID</code> and <code className="font-mono">GITHUB_CLIENT_SECRET</code>, then start Exterior again.
        </Notice>
      )}
    </Shell>
  );
}

function DeviceCode({ page }: { page: Extract<AccountPageData, { kind: "device-code" }> }) {
  return (
    <Shell
      header={(
        <>
          <DeviceSteps current={0} />
          <h1 className="font-display text-2xl font-bold">Connect a device</h1>
          <SignedInAs account={page.account} />
        </>
      )}
      footer="Only enter a code your own device shows. Exterior never sends you a code."
    >
      <p className="text-center text-sm text-muted-foreground">
        Enter the code the desktop app shows, or the one <code className="rounded bg-muted px-2 py-1 font-mono text-foreground">exterior login</code> printed.
      </p>
      <PendingForm method="get" action="/device" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="user-code" className="sr-only">Device code</label>
          <OTPField
            id="user-code"
            name="user_code"
            groups={userCodeGroups}
            defaultValue={normalizeCode(page.userCode)}
            validationType="alphanumeric"
            normalizeValue={(value: string) => value.toUpperCase()}
            required
            aria-invalid={page.problem ? true : undefined}
            aria-describedby={page.problem ? "user-code-problem" : undefined}
            className="justify-center"
          />
          {page.problem ? (
            <p id="user-code-problem" className="flex items-start gap-2 text-sm text-destructive" role="alert">
              <CircleAlertIcon className="mt-1 size-4 shrink-0" aria-hidden />
              <span>
                {page.problem}{/[.!?]$/.test(page.problem) ? "" : "."} Check it against the code on your device, or sign in again there for a new one.
              </span>
            </p>
          ) : null}
        </div>
        <SubmitButton id="continue" size="xl">Continue</SubmitButton>
      </PendingForm>
    </Shell>
  );
}

function DeviceApproval({ page }: { page: Extract<AccountPageData, { kind: "device" }> }) {
  return (
    <Shell
      header={(
        <>
          <DeviceSteps current={1} />
          <h1 className="font-display text-2xl font-bold">Connect this device?</h1>
          <SignedInAs account={page.account} />
        </>
      )}
      footer={<a href="/device" className="underline underline-offset-4 hover:text-foreground">Enter a different code</a>}
    >
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm font-medium">Check that this matches the code on your device</p>
        <CodeDisplay code={page.userCode} />
      </div>
      <ul className="flex flex-col gap-3 text-sm">
        <Allowance icon={<BotIcon />}>The device can run agents for your account when an app you approved asks for one.</Allowance>
        <Allowance icon={<LaptopIcon />}>It appears on your dashboard. You can sign it out from the device.</Allowance>
      </ul>
      <Notice tone="warning" title="Only connect a device you just started">
        If someone sent you this code or link, deny it. Their computer would join your account and receive the agent sessions your apps open.
      </Notice>
      <PendingScope>
        <div className="grid grid-cols-2 gap-3">
          <PendingForm method="post" action="/device" className="flex flex-col">
            <input type="hidden" name="userCode" value={page.userCode} />
            <input type="hidden" name="decision" value="deny" />
            <SubmitButton id="deny" variant="secondary" size="xl">Deny</SubmitButton>
          </PendingForm>
          <PendingForm method="post" action="/device" className="flex flex-col">
            <input type="hidden" name="userCode" value={page.userCode} />
            <input type="hidden" name="decision" value="approve" />
            <SubmitButton id="approve" size="xl">Connect device</SubmitButton>
          </PendingForm>
        </div>
      </PendingScope>
    </Shell>
  );
}

function DeviceApproved({ page }: { page: Extract<AccountPageData, { kind: "device-approved" }> }) {
  return (
    <Shell
      wide
      header={(
        <>
          <DeviceSteps current={2} />
          <StatusMark tone="success" />
          <h1 className="font-display text-2xl font-bold">Device connected</h1>
          <p className="max-w-md text-muted-foreground">
            The device is signed in to your account. Sign-in on it finishes on its own.
          </p>
        </>
      )}
    >
      <Tabs defaultValue="user">
        <TabsList className="self-center">
          <TabsTab value="user"><UserIcon />I'm setting it up</TabsTab>
          <TabsTab value="developer"><CodeIcon />I'm a developer</TabsTab>
        </TabsList>
        <TabsPanel value="user" className="flex flex-col gap-4">
          <ol className="flex flex-col gap-4">
            <Step n={1} title="Add its agents">
              In the desktop app, add them under Agents. An AI assistant setting the device up does this by itself, then keeps the device online.
            </Step>
            <Step n={2} title="Wait for the device to come online">
              The desktop app keeps it online on its own; in a terminal, <code className="font-mono">exterior daemon</code> does. Your dashboard shows it as online.
            </Step>
            <Step n={3} title="Return to the web app">
              The app lists the device and can open an agent on it.
            </Step>
          </ol>
          <a href="/" className={cn(buttonVariants({ size: "xl" }), "w-full")}>
            Open dashboard
            <ArrowRightIcon data-icon="inline-end" />
          </a>
        </TabsPanel>
        <TabsPanel value="developer" className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Run these on the device to configure an agent and keep it connected. <code className="font-mono">daemon</code> stays in the foreground.
          </p>
          <CodeBlock code={page.guide.afterLogin} />
          <a href="/" className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "self-start")}>
            Open dashboard
            <ArrowRightIcon data-icon="inline-end" />
          </a>
        </TabsPanel>
      </Tabs>
    </Shell>
  );
}

function Consent({ page }: { page: Extract<AccountPageData, { kind: "consent" }> }) {
  const site = hostOf(page.origin) || "This app";
  const name = page.clientName.trim();
  return (
    <Shell
      wide
      header={(
        <>
          <div className="flex items-center gap-3" aria-hidden>
            <AppIcon label={name || site} logoUri={page.logoUri} className="size-14 rounded-xl bg-card text-xl ring-1 ring-border" />
            <span className="signal-line h-0.5 w-12 text-gold-ink" aria-hidden />
            <ExteriorMark className="size-14" />
          </div>
          <h1 className="max-w-lg font-display text-2xl font-bold text-balance">
            {name ? <>{name} wants to use agents on your devices</> : <>{site} wants to use agents on your devices</>}
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="font-mono text-foreground">{page.origin || "Unknown address"}</span>
            {page.unverified ? <Badge variant="outline" className="border-gold/50 text-gold-ink">Unverified</Badge> : null}
          </div>
        </>
      )}
      footer="You can revoke this app anytime from your Exterior dashboard."
    >
      <SignedInAs account={page.account} />
      {page.unverified ? (
        <Notice tone="warning" title="Exterior has not verified this app">
          {name ? <>The name “{name}” comes from the app itself. </> : null}
          Only continue if you started this from <span className="font-mono">{page.origin || "this app"}</span>.
        </Notice>
      ) : null}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">This app will be able to</h2>
        <ul className="flex flex-col gap-4">
          {page.permissions.map((permission) => <Permission key={permission.scope} permission={permission} />)}
        </ul>
      </section>
      <details className="group rounded-lg text-sm">
        <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">Details</summary>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
          <dt className="text-muted-foreground">Returns to</dt>
          <dd className="font-mono break-all">{page.redirectUri}</dd>
          {page.clientUri ? (
            <>
              <dt className="text-muted-foreground">Homepage</dt>
              <dd className="font-mono break-all">{page.clientUri}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Client ID</dt>
          <dd className="font-mono break-all">{page.clientId}</dd>
        </dl>
      </details>
      <PendingScope>
        <div className="grid grid-cols-2 gap-3">
          <PendingForm method="post" action="/consent" className="flex flex-col">
            <input type="hidden" name="query" value={page.query} />
            <input type="hidden" name="accept" value="no" />
            <SubmitButton id="cancel" variant="secondary" size="xl">Cancel</SubmitButton>
          </PendingForm>
          <PendingForm method="post" action="/consent" className="flex flex-col">
            <input type="hidden" name="query" value={page.query} />
            <input type="hidden" name="accept" value="yes" />
            <SubmitButton id="authorize" size="xl">Authorize</SubmitButton>
          </PendingForm>
        </div>
      </PendingScope>
    </Shell>
  );
}

function Message({ page }: { page: Extract<AccountPageData, { kind: "message" }> }) {
  return (
    <Shell
      framed={page.tone !== "error"}
      header={(
        <>
          {page.tone === "error" ? <ExteriorMark className="size-14" /> : <StatusMark tone={page.tone} />}
          <h1 className="font-display text-2xl font-bold text-balance">{page.title}</h1>
        </>
      )}
    >
      <p className="text-center text-muted-foreground">{page.message}</p>
      <div className="flex flex-col gap-3">
        {page.action ? (
          <a href={page.action.href} className={cn(buttonVariants({ size: "xl" }), "w-full")}>
            {page.tone === "error" ? <RefreshCwIcon data-icon="inline-start" /> : null}
            {page.action.label}
          </a>
        ) : null}
        <a href="/" className={cn(buttonVariants({ variant: page.action ? "outline" : "default", size: "lg" }), "w-full")}>Back to Exterior</a>
      </div>
      {page.details ? (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground">Technical details</summary>
          <p className="mt-3 whitespace-pre-wrap break-words font-mono text-xs">{page.details}</p>
        </details>
      ) : null}
    </Shell>
  );
}

function Permission({ permission }: { permission: PermissionView }) {
  const icon = permission.scope === "devices" ? <BotIcon /> : permission.scope === "offline_access" ? <KeyRoundIcon /> : <UserIcon />;
  return (
    <li className="flex gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground [&_svg]:size-4">{icon}</span>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">{permission.title}</span>
        <span className="text-sm text-muted-foreground">{permission.detail}</span>
      </div>
    </li>
  );
}

function Allowance({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-1 text-gold-ink [&_svg]:size-4">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

function Notice({ tone, title, children }: { tone: "warning" | "error"; title: string; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "flex gap-3 rounded-xl p-4 text-sm ring-1",
        tone === "warning" ? "bg-muted/60 ring-border" : "bg-danger-50 text-danger-900 ring-danger-200/70",
      )}
    >
      <ShieldAlertIcon className={cn("mt-1 size-4 shrink-0", tone === "warning" && "text-gold-ink")} aria-hidden />
      <div className="flex flex-col gap-1">
        <span className={cn("font-semibold", tone === "warning" && "text-gold-ink")}>{title}</span>
        <span className={tone === "warning" ? "text-muted-foreground" : "opacity-90"}>{children}</span>
      </div>
    </div>
  );
}

function CodeDisplay({ code }: { code: string }) {
  const characters = normalizeCode(code).split("");
  return (
    <div className="flex items-center gap-2 font-mono text-2xl font-semibold" aria-label={`Code ${code}`}>
      {characters.map((character, index) => (
        <span key={index} className="contents">
          {index === userCodeGroups[0] ? <span className="px-1 text-muted-foreground" aria-hidden>-</span> : null}
          <span className="flex h-12 w-9 items-center justify-center rounded-md bg-card ring-1 ring-border" aria-hidden>{character}</span>
        </span>
      ))}
    </div>
  );
}

function StatusMark({ tone }: { tone: "success" | "neutral" }) {
  const style = tone === "success"
    ? "bg-success-500 text-white shadow-lg shadow-success-500/30"
    : "bg-muted text-muted-foreground";
  const icon = tone === "success" ? <CheckIcon strokeWidth={3} /> : <InfoIcon />;
  return <span className={cn("flex size-14 items-center justify-center rounded-full [&_svg]:size-7", style)} aria-hidden>{icon}</span>;
}

const deviceSteps = ["Enter code", "Check device", "Connected"] as const;

/** Where the person is in connecting a device: the code, then the check, then the result. */
function DeviceSteps({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2 text-xs font-medium" aria-label="Connecting a device">
      {deviceSteps.map((label, index) => {
        // The last step is done once it is reached; the others once they are passed.
        const done = index < current || (index === current && index === deviceSteps.length - 1);
        return (
          <li key={label} className="flex items-center gap-2" aria-current={index === current ? "step" : undefined}>
            {index > 0 ? <span className={cn("h-px w-6", index <= current ? "bg-foreground/40" : "bg-border")} aria-hidden /> : null}
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full font-display text-[11px] font-bold",
                index < current && "bg-foreground/10 text-foreground",
                index === current && "bg-primary text-primary-foreground",
                index > current && "text-muted-foreground ring-1 ring-border",
              )}
              aria-hidden
            >
              {done ? <CheckIcon className="size-3" strokeWidth={3} /> : index + 1}
            </span>
            <span className={index === current ? "text-foreground" : "text-muted-foreground"}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden data-icon="inline-start">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function normalizeCode(code: string | undefined): string {
  return (code ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return "";
  }
}
