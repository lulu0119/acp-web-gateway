import { ExteriorMark } from "@exterior/ui/exterior-mark";
import { cn } from "cn";
import { BotIcon, RadioTowerIcon, SettingsIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { AgentsSection } from "./agents-section";
import { api } from "./api";
import { RelaysSection } from "./relays-section";
import { SettingsSection } from "./settings-section";

const sections = [
  { id: "relays", label: "Relays", icon: RadioTowerIcon },
  { id: "agents", label: "Agents", icon: BotIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
] as const;

type SectionId = (typeof sections)[number]["id"];

// The real window hides the macOS title. The browser preview has no traffic lights to clear.
const overlayTitleBar = "__TAURI_INTERNALS__" in window && /\bMac/.test(navigator.userAgent);

export function App() {
  const [section, setSection] = useState<SectionId>("relays");
  const [device, setDevice] = useState("");
  useEffect(() => {
    void api.deviceName().then(setDevice, () => undefined);
  }, []);
  useEffect(() => {
    if (!overlayTitleBar) return;
    const onDown = (event: MouseEvent) => {
      if (event.button !== 0 || event.detail !== 1) return;
      const target = event.target instanceof Element ? event.target : null;
      const region = target?.closest("[data-tauri-drag-region]");
      if (!region || region.getAttribute("data-tauri-drag-region") === "false") return;
      event.preventDefault();
      event.stopPropagation();
      void api.dragWindow();
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, []);
  const current = sections.find((item) => item.id === section) ?? sections[0];

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-border bg-muted">
        {overlayTitleBar ? <div data-tauri-drag-region className="h-12 shrink-0" /> : null}
        <div data-tauri-drag-region className="flex items-center gap-2.5 px-3 pt-3 pb-4">
          <ExteriorMark className="size-8" />
          <div className="min-w-0">
            <p className="truncate text-sm leading-5 font-semibold">Exterior</p>
            {device ? <p className="truncate text-xs leading-4 text-muted-foreground">{device}</p> : null}
          </div>
        </div>
        <nav aria-label="Sections" className="flex flex-col gap-0.5 px-3">
          {sections.map((item) => {
            const Icon = item.icon;
            const selected = item.id === section;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={selected ? "page" : undefined}
                onClick={() => setSection(item.id)}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-2.5 text-left text-sm",
                  selected ? "bg-primary font-medium text-primary-foreground" : "text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header data-tauri-drag-region className="flex h-12 shrink-0 items-center border-b border-border px-8">
          <h1 id="section-title" className="text-sm font-semibold">{current.label}</h1>
        </header>
        <SectionPane open={section === "relays"}><RelaysSection /></SectionPane>
        <SectionPane open={section === "agents"}><AgentsSection /></SectionPane>
        <SectionPane open={section === "settings"}><SettingsSection /></SectionPane>
      </div>
    </div>
  );
}

/** Keeps a section mounted, so a sign-in in progress survives switching away and back. */
function SectionPane({ open, children }: { open: boolean; children: React.ReactNode }) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto p-4", !open && "hidden")}>{children}</div>;
}
