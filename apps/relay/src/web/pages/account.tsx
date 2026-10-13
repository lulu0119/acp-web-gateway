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
  TerminalIcon,
  UserIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { AccountPage as AccountPageData, AccountView, PermissionView } from "../../shared/account-web.js";
import { CodeBlock } from "../components/code-block.js";
import { MukaeMark } from "../components/mukae-mark.js";
import { SiteHeader } from "../components/site-header.js";
import { PendingForm, PendingScope, SubmitButton } from "../components/pending-form.js";
import { Avatar } from "../ui/avatar.js";
import { Badge } from "../ui/badge.js";
import { buttonVariants } from "../ui/button.js";
import { OTPField } from "../ui/otp-field.js";
import { Tabs, TabsList, TabsPanel, TabsTab } from "../ui/tabs.js";

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

/** The site header over graph paper, with the page's content on a sheet centered below it. */
export function AccountPage({ page }: { page: AccountPageData }) {
  return (
    <div className="grid-paper min-h-dvh">
      <div className="band-brand h-1" aria-hidden />
      <div className="mx-auto flex w-full max-w-5xl flex-col px-4 pt-5 pb-20 sm:px-6">
        <SiteHeader />
        <main className="flex flex-col items-center pt-8 sm:pt-14">
          <AccountContent page={page} />
        </main>
      </div>
    </div>
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

/**
 * One account page on a sheet of paper: a small label with the signed-in account on a rule, the title beside its mark, a
 * row of squares under it, then the content.
 */
function Shell({ kicker, account, mark, title, lead, children, footer, wide }: {
  kicker: string;
  account?: AccountView;
  mark: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn("flex w-full flex-col gap-7", wide ? "max-w-2xl" : "max-w-md")}>
      <div className="flex flex-col gap-7 bg-card p-5 shadow-[0_1px_2px_oklch(0_0_0/0.05),0_10px_28px_-10px_oklch(0.4_0.1_40/0.18)] sm:p-8">
        <header className="flex flex-col gap-5">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-label tracking-[0.18em] text-primary uppercase">{kicker}</span>
            <span className="h-px flex-1 bg-foreground/15" aria-hidden />
            {account ? <SignedInAs account={account} /> : null}
          </div>
          <div className="flex items-center gap-4">
            {mark}
            <h1 className="font-display text-[1.75rem] leading-tight font-bold text-balance sm:text-3xl sm:leading-tight">{title}</h1>
          </div>
          {lead ? <p className="text-muted-foreground">{lead}</p> : null}
          <span className="tile-rule-brand" aria-hidden />
        </header>
        <div className="flex w-full flex-col gap-6">{children}</div>
      </div>
      {footer ? <div className="text-sm text-muted-foreground">{footer}</div> : null}
    </div>
  );
}

function SignedInAs({ account }: { account: AccountView }) {
  if (!account.name) return null;
  return (
    <p className="flex shrink-0 items-center gap-2 text-muted-foreground">
      <Avatar name={account.name} image={account.image} className="size-5 text-[10px]" />
      <span><span className="sr-only">Signed in as </span><span className="font-semibold text-foreground">{account.name}</span></span>
    </p>
  );
}

function SignIn({ page }: { page: Extract<AccountPageData, { kind: "sign-in" }> }) {
  return (
    <Shell
      kicker="Account"
      mark={<MukaeMark className="size-12" />}
      title="Sign in to Mukae"
      lead="Mukae lets web apps you approve reach agents on devices you own. Sign in to approve an app or a device."
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
          Set <code className="font-mono">GITHUB_CLIENT_ID</code> and <code className="font-mono">GITHUB_CLIENT_SECRET</code>, then start Mukae again.
        </Notice>
      )}
    </Shell>
  );
}

function DeviceCode({ page }: { page: Extract<AccountPageData, { kind: "device-code" }> }) {
  return (
    <Shell
      kicker="Device sign-in"
      account={page.account}
      mark={<IconBadge><TerminalIcon /></IconBadge>}
      title="Connect a device"
      lead={<>Enter the code your device printed after <code className="bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground">mukae login</code>.</>}
      footer="Only enter a code your own device printed. Mukae never sends you a code."
    >
      <PendingForm method="get" action="/device" className="flex flex-col gap-5">
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
          />
          {page.problem ? (
            <p id="user-code-problem" className="flex items-start gap-2 text-sm text-destructive" role="alert">
              <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {page.problem}{/[.!?]$/.test(page.problem) ? "" : "."} Check it against the code on your device, or run{" "}
                <code className="font-mono">mukae login</code> again for a new one.
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
      kicker="Device sign-in"
      account={page.account}
      mark={<IconBadge><LaptopIcon /></IconBadge>}
      title="Connect this device?"
      footer={<a href="/device" className="underline underline-offset-4 hover:text-foreground">Enter a different code</a>}
    >
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Check that this matches the code on your device</p>
        <CodeDisplay code={page.userCode} />
      </div>
      <ul className="flex flex-col gap-3 text-sm">
        <Allowance icon={<BotIcon />}>The device can run agents for your account when an app you approved asks for one.</Allowance>
        <Allowance icon={<LaptopIcon />}>It appears on your dashboard. You can sign it out with <code className="font-mono">mukae logout</code>.</Allowance>
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
      kicker="Device sign-in"
      mark={<StatusMark tone="success" />}
      title="Device connected"
      lead={<>The device is signed in to your account. <code className="font-mono text-sm">mukae login</code> on it finishes on its own.</>}
    >
      <Tabs defaultValue="user">
        <TabsList>
          <TabsTab value="user"><UserIcon />I'm setting it up</TabsTab>
          <TabsTab value="developer"><CodeIcon />I'm a developer</TabsTab>
        </TabsList>
        <TabsPanel value="user" className="flex flex-col gap-6">
          <ol className="flex flex-col gap-5">
            <Step n={1} title="Go back to your AI assistant or terminal">
              If an assistant is setting this device up, it continues by itself: it configures the agents installed there and keeps the device online.
            </Step>
            <Step n={2} title="Wait for the device to come online">
              It shows as online on your dashboard once <code className="font-mono">mukae daemon</code> runs.
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
      kicker="App approval"
      account={page.account}
      mark={<AppMonogram label={name || site} />}
      title={name ? <>{name} wants to use agents on your devices</> : <>{site} wants to use agents on your devices</>}
      lead={(
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono text-foreground">{page.origin || "Unknown address"}</span>
          {page.unverified ? <Badge className="bg-warning-100 text-warning-800">Unverified</Badge> : null}
        </span>
      )}
      footer="You can revoke this app anytime from your Mukae dashboard."
    >
      <section className="flex flex-col gap-4">
        <h2 className="font-label text-sm tracking-[0.14em] text-muted-foreground uppercase">This app will be able to</h2>
        <ul className="flex flex-col gap-5">
          {page.permissions.map((permission) => <Permission key={permission.scope} permission={permission} />)}
        </ul>
      </section>
      {page.unverified ? (
        <Notice tone="warning" title="Mukae has not verified this app">
          {name ? <>The name “{name}” comes from the app itself. </> : null}
          Only continue if you started this from <span className="font-mono">{page.origin || "this app"}</span>.
        </Notice>
      ) : null}
      <details className="group text-sm">
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
    <Shell kicker="Mukae" mark={<StatusMark tone={page.tone} />} title={page.title} lead={page.message}>
      <div className="flex flex-col gap-3">
        {page.action ? (
          <a href={page.action.href} className={cn(buttonVariants({ size: "xl" }), "w-full")}>
            {page.tone === "error" ? <RefreshCwIcon data-icon="inline-start" /> : null}
            {page.action.label}
          </a>
        ) : null}
        <a href="/" className={cn(buttonVariants({ variant: page.action ? "ghost" : "secondary", size: "lg" }), "w-full")}>Back to Mukae</a>
      </div>
    </Shell>
  );
}

/** A permission set like an event in a programme: a round mark, the name, a heavy rule, then what it means. */
function Permission({ permission }: { permission: PermissionView }) {
  const icon = permission.scope === "machines" ? <BotIcon /> : permission.scope === "offline_access" ? <KeyRoundIcon /> : <UserIcon />;
  return (
    <li className="flex gap-3">
      <span className="band-brand flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-4">{icon}</span>
      <div className="flex flex-1 flex-col gap-1.5">
        <span className="pt-1.5 font-semibold tracking-[0.03em]">{permission.title}</span>
        <span className="h-[3px] bg-muted" aria-hidden />
        <span className="text-sm text-muted-foreground">{permission.detail}</span>
      </div>
    </li>
  );
}

function Allowance({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 text-primary [&_svg]:size-4">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="w-9 shrink-0 font-display text-2xl leading-7 font-bold text-primary">#{n}</span>
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold">{title}</span>
        <span className="text-sm text-muted-foreground">{children}</span>
      </div>
    </li>
  );
}

/** A notice with its title on a colored band, like a boxed aside in a printed guide. */
function Notice({ tone, title, children }: { tone: "warning" | "error"; title: string; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : undefined} className="flex flex-col text-sm">
      <div className={cn("flex items-center gap-2 px-3 py-1.5 font-semibold", tone === "warning" ? "bg-brand-amber text-[#3a2a00]" : "bg-danger-600 text-white")}>
        <ShieldAlertIcon className="size-4 shrink-0" aria-hidden />
        {title}
      </div>
      <div className={cn("px-3 py-3", tone === "warning" ? "bg-warning-50 text-warning-900" : "bg-danger-50 text-danger-900")}>{children}</div>
    </div>
  );
}

function CodeDisplay({ code }: { code: string }) {
  const characters = normalizeCode(code).split("");
  return (
    <div className="flex items-center gap-1.5 font-mono text-2xl font-semibold" aria-label={`Code ${code}`}>
      {characters.map((character, index) => (
        <span key={index} className="contents">
          {index === userCodeGroups[0] ? <span className="px-1 text-muted-foreground" aria-hidden>-</span> : null}
          <span className="flex h-12 w-9 items-center justify-center border-2 border-input" aria-hidden>{character}</span>
        </span>
      ))}
    </div>
  );
}

/** A square mark for an outcome: a check for success, an exclamation for an error. */
function StatusMark({ tone }: { tone: "success" | "neutral" | "error" }) {
  const style = tone === "success" ? "bg-success-500 text-white" : tone === "error" ? "bg-danger-500 text-white" : "bg-muted text-muted-foreground";
  const icon = tone === "success" ? <CheckIcon strokeWidth={3} /> : tone === "error" ? <CircleAlertIcon /> : <InfoIcon />;
  return <span className={cn("flex size-12 shrink-0 items-center justify-center [&_svg]:size-6", style)} aria-hidden>{icon}</span>;
}

function IconBadge({ children }: { children: ReactNode }) {
  return <span className="band-brand flex size-12 shrink-0 items-center justify-center rounded-full [&_svg]:size-6">{children}</span>;
}

function AppMonogram({ label }: { label: string }) {
  return (
    <span className="flex size-12 shrink-0 items-center justify-center bg-muted font-display text-xl font-bold text-muted-foreground" aria-hidden>
      {(label.trim().charAt(0) || "?").toUpperCase()}
    </span>
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
