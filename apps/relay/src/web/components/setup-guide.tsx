import { BotIcon, DownloadIcon, MonitorIcon, TerminalIcon } from "lucide-react";
import type { SetupGuideData } from "../../shared/account-web.js";
import { CodeBlock } from "./code-block";
import { Step } from "./step";
import { buttonVariants } from "@exterior/ui/button";
import { CopyButton } from "@exterior/ui/copy-button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@exterior/ui/tabs";

// Three tabs fit a phone on one line only as single words without icons.
const tab = "min-w-0 [&_svg]:shrink-0 max-sm:[&_svg]:hidden";

/** How to connect a device: with the desktop app, through an AI assistant on it, or by running the commands yourself. */
export function SetupGuide({ guide }: { guide: SetupGuideData }) {
  return (
    <Tabs defaultValue="desktop">
      <TabsList className="max-w-full">
        <TabsTab value="desktop" className={tab}><MonitorIcon /><TabLabel short="Desktop" full="Desktop app" /></TabsTab>
        <TabsTab value="assistant" className={tab}><BotIcon /><TabLabel short="Assistant" full="AI assistant" /></TabsTab>
        <TabsTab value="terminal" className={tab}><TerminalIcon />Terminal</TabsTab>
      </TabsList>
      <TabsPanel value="desktop" className="flex flex-col gap-5">
        <DesktopApp guide={guide} />
      </TabsPanel>
      <TabsPanel value="assistant" className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Paste this into the AI assistant on the computer that should run agents. When it signs in, it gives you a link to{" "}
          <a href="/device" className="text-foreground underline underline-offset-4">approve the device</a>.
        </p>
        <CodeBlock code={guide.prompt} label="Copy prompt" wrap />
      </TabsPanel>
      <TabsPanel value="terminal" className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Run these on the computer that should run agents. Node 22 or newer is required. <code className="font-mono">login</code> prints a code to approve.
        </p>
        <CodeBlock code={guide.commands} />
      </TabsPanel>
    </Tabs>
  );
}

function TabLabel({ short, full }: { short: string; full: string }) {
  return (
    <>
      <span className="sm:hidden">{short}</span>
      <span className="max-sm:hidden">{full}</span>
    </>
  );
}

function DesktopApp({ guide }: { guide: SetupGuideData }) {
  const link = "text-sm text-foreground underline underline-offset-4";
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Install the Exterior app on the computer that should run agents. It keeps the device online and starts at login.
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {guide.download ? (
          <>
            <a href={guide.download.href} className={buttonVariants({ size: "lg" })}>
              <DownloadIcon data-icon="inline-start" aria-hidden />
              Download for {guide.download.platform}
            </a>
            <a href={guide.releaseUrl} className={link}>Other platforms</a>
          </>
        ) : (
          <a href={guide.releaseUrl} className={buttonVariants({ size: "lg" })}>
            <DownloadIcon data-icon="inline-start" aria-hidden />
            Choose a download
          </a>
        )}
      </div>
      <ol className="flex flex-col gap-4">
        <Step n={1} title="Sign in to this relay">
          Open the app, choose Sign in to a relay, and enter this address.
          <div className="mt-1.5 flex items-center gap-1 rounded-[6px] bg-muted py-1 pr-1 pl-3">
            <code className="min-w-0 flex-1 truncate font-mono text-foreground">{guide.relayUrl}</code>
            <CopyButton text={guide.relayUrl} label="Copy address" iconOnly />
          </div>
        </Step>
        <Step n={2} title="Approve the device">
          Your browser opens the approval page. Check that it shows the code in the app, then approve.
        </Step>
        <Step n={3} title="Add its agents">
          Under Agents, add each agent installed on that computer, such as OpenCode or Claude Code.
        </Step>
      </ol>
      <p className="text-xs text-muted-foreground">
        The app is not signed yet. On macOS, open it once, then choose Open Anyway in System Settings › Privacy &amp; Security. On Windows,
        choose More info, then Run anyway, when SmartScreen asks.
      </p>
    </>
  );
}
