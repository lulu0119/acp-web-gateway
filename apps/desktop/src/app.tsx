import { ExteriorMark } from "@relay/components/exterior-mark";
import { useEffect, useState } from "react";
import { AgentsSection } from "./agents-section";
import { api } from "./api";
import { RelaysSection } from "./relays-section";

export function App() {
  const [device, setDevice] = useState("");
  useEffect(() => {
    void api.deviceName().then(setDevice, () => undefined);
  }, []);
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-10 px-8 pt-7 pb-10">
      <header className="flex items-center gap-3">
        <ExteriorMark className="size-7" />
        <div className="flex min-w-0 flex-col">
          <h1 className="text-sm leading-5 font-semibold">Exterior</h1>
          {device ? <p className="truncate text-xs leading-4 text-muted-foreground">{device}</p> : null}
        </div>
      </header>
      <RelaysSection />
      <AgentsSection />
    </main>
  );
}

export function SectionHeader({ id, title, children, action }: { id: string; title: string; children: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id={id} className="text-lg leading-7 font-semibold tracking-tight">{title}</h2>
        <p className="text-sm leading-5 text-muted-foreground">{children}</p>
      </div>
      {action}
    </div>
  );
}
