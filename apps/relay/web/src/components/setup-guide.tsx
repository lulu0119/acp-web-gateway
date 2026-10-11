import { CopyButton } from "./copy-button";

const previewPackage = "https://pkg.pr.new/lulu0119/mukae@main";

const steps: { label: string; command: string }[] = [
  { label: "Sign the machine in and get a code", command: `npx --package=${previewPackage} -- mukae login` },
  { label: "Add an agent configuration", command: `npx --package=${previewPackage} -- mukae agent-config create --agent-type opencode` },
  { label: "Keep the machine online", command: `npx --package=${previewPackage} -- mukae daemon` },
];

export function SetupGuide() {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">No machine is online</h2>
        <p className="text-muted-foreground">
          Run these on the computer that should run agents, then approve its code on{" "}
          <a href="/device" className="underline underline-offset-4">
            the device page
          </a>
          . Pass <code className="font-mono text-sm">--relay</code> to each command when Mukae is not on this
          computer.
        </p>
      </div>
      <ol className="flex flex-col divide-y divide-border border-y border-border">
        {steps.map((item) => (
          <li key={item.command} className="flex flex-col gap-2 py-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">{item.label}</span>
              <CopyButton text={item.command} label="Copy" />
            </div>
            <code className="font-mono text-sm break-all">{item.command}</code>
          </li>
        ))}
      </ol>
    </section>
  );
}
