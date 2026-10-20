import type { AccountSession } from "@exterior/client/react";
import { CheckIcon } from "lucide-react";
import { ConnectForm, type ConnectedAgent } from "./connect-form";
import { ExteriorMark } from "@exterior/ui/exterior-mark";

const steps = [
  { title: "Sign in with Exterior", detail: "Use your GitHub account to get connected." },
  { title: "Choose your agent", detail: "Pick an agent running on one of your devices." },
  { title: "Make something happen", detail: "Chat, follow tool calls, and approve actions." },
];

export function WelcomePage({
  session,
  onConnected,
}: {
  session: AccountSession;
  onConnected: (agent: ConnectedAgent) => void;
}) {
  const signedIn = session.account.phase === "signed-in";
  return (
    <div className="welcome-page flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-4 border-b p-6 md:px-8">
        <a href={import.meta.env.BASE_URL} className="flex items-center gap-3 font-semibold tracking-tight">
          <ExteriorMark variant="tile" className="size-8" />
          <span className="text-lg">Exterior</span>
          <span className="hidden border-l pl-3 text-sm font-normal text-muted-foreground sm:inline">Playground</span>
        </a>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-12 p-6 md:p-12">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <section aria-labelledby="welcome-title" className="flex flex-col items-start gap-6">
            <div className="space-y-4">
              <h1
                id="welcome-title"
                className="text-4xl leading-[1.08] font-semibold tracking-tight sm:text-5xl xl:text-6xl"
              >
                Your agents.
                <br />
                <span className="text-muted-foreground">Right here.</span>
              </h1>
              <p className="max-w-md text-base leading-7 text-muted-foreground">
                Work with the AI agents on your computer, from any browser.
              </p>
            </div>
            <ol aria-label="Get started" className="hidden flex-col gap-6 lg:flex">
              {steps.map((step, index) => (
                <li
                  key={step.title}
                  className="flex items-start gap-3"
                  aria-current={index === (signedIn ? 1 : 0) ? "step" : undefined}
                >
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium ${index === (signedIn ? 1 : 0) ? "border-foreground bg-foreground text-background" : "text-muted-foreground"}`}
                  >
                    {signedIn && index === 0 ? <CheckIcon className="size-3" aria-label="Complete" /> : index + 1}
                  </span>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{step.title}</p>
                    <p className="text-sm text-muted-foreground">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section
            aria-label="Connect an agent"
            className="rounded-2xl border bg-card p-6 shadow-[0_12px_48px_-24px_rgb(0_0_0/0.2)] sm:p-8"
          >
            <ConnectForm session={session} onConnected={onConnected} />
          </section>
        </div>
      </main>
    </div>
  );
}
