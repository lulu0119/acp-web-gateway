import { AgentIcon } from "@exterior/ui/agent-icon";
import { Badge } from "@exterior/ui/badge";
import { Button } from "@exterior/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@exterior/ui/dialog";
import { Input } from "@exterior/ui/input";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@exterior/ui/tabs";
import { cn } from "cn";
import { XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, errorText, type AgentType } from "./api";
import { splitCommandLine } from "./command-line";

type Load<T> = { kind: "loading" } | { kind: "ready"; value: T } | { kind: "error"; message: string };
type Source = "registry" | "command";

export function AddAgentDialog({ open, onOpenChange, types, takenNames, onAdded }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: Load<AgentType[]>;
  takenNames: string[];
  onAdded: () => void;
}) {
  const [source, setSource] = useState<Source>("registry");
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<string>();
  const [line, setLine] = useState("");
  const [name, setName] = useState("");
  const [env, setEnv] = useState<[string, string][]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setSource("registry");
    setSearch("");
    setChosen(undefined);
    setLine("");
    setName("");
    setEnv([]);
    setError(undefined);
  }, [open]);

  const defaultName = source === "registry" ? (chosen ?? "") : "";
  const finalName = name.trim() || defaultName;
  const nameTaken = finalName !== "" && takenNames.includes(finalName);
  const command = splitCommandLine(line);
  const ready = (source === "registry" ? Boolean(chosen) : Boolean(command?.length) && finalName !== "") && !nameTaken;

  const submit = async () => {
    setPending(true);
    setError(undefined);
    try {
      await api.addAgent({
        ...(source === "registry" ? { agentType: chosen } : { command }),
        name: name.trim() || undefined,
        env: env.filter(([key]) => key.trim() !== "").map(([key, value]) => [key.trim(), value]),
      });
      onAdded();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader className="gap-1 pr-8">
          <DialogTitle className="font-display text-xl font-bold">Add an agent</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready && !pending) void submit();
          }}
        >
          <Tabs value={source} onValueChange={(value) => setSource(value as Source)}>
            <TabsList>
              <TabsTab value="registry">ACP Registry</TabsTab>
              <TabsTab value="command">Command</TabsTab>
            </TabsList>
            <TabsPanel value="registry" className="flex flex-col gap-2">
              <Input placeholder="Search agents" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search agents" />
              <TypeList types={types} search={search} chosen={chosen} onChoose={setChosen} />
            </TabsPanel>
            <TabsPanel value="command" className="flex flex-col gap-2">
              <label htmlFor="agent-command" className="text-sm font-medium">Command</label>
              <Input id="agent-command" className="font-mono" spellCheck={false} placeholder="pnpm dlx @agentclientprotocol/claude-agent-acp" value={line} onChange={(event) => setLine(event.target.value)} aria-invalid={command === undefined || undefined} />
              {command === undefined ? <p className="text-xs text-danger-600 dark:text-danger-400">A quote is not closed.</p> : null}
              <p className="text-xs text-muted-foreground">Any program that speaks ACP over stdin and stdout. It must be on this device's PATH, or give its full path.</p>
            </TabsPanel>
          </Tabs>

          <div className="flex flex-col gap-2">
            <label htmlFor="agent-name" className="text-sm font-medium">Name</label>
            <Input id="agent-name" required={source === "command"} placeholder={defaultName || "Name shown to web apps"} value={name} onChange={(event) => setName(event.target.value)} aria-invalid={nameTaken || undefined} />
            {nameTaken ? <p className="text-xs text-danger-600 dark:text-danger-400">An agent named {finalName} already exists. Choose another name.</p> : null}
          </div>

          <EnvironmentFields env={env} onChange={setEnv} />

          {error ? <p className="selectable text-sm text-danger-600 dark:text-danger-400">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={pending} disabled={!ready}>Add agent</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function installChip(reason: string | undefined): string {
  if (!reason || /not installed/i.test(reason)) return "Not installed";
  return reason.replace(/\.$/, "");
}

function TypeList({ types, search, chosen, onChoose }: {
  types: Load<AgentType[]>;
  search: string;
  chosen?: string;
  onChoose: (id: string) => void;
}) {
  const shown = useMemo(() => {
    if (types.kind !== "ready") return [];
    const query = search.trim().toLowerCase();
    return types.value
      .filter((type) => !query || `${type.id} ${type.name} ${type.description ?? ""}`.toLowerCase().includes(query))
      .sort((a, b) => Number(b.ready) - Number(a.ready) || a.name.localeCompare(b.name));
  }, [types, search]);
  if (types.kind === "loading") return <p className="py-8 text-center text-sm text-muted-foreground">Loading the ACP Registry…</p>;
  if (types.kind === "error") return <p className="selectable py-4 text-sm text-danger-600 dark:text-danger-400">Could not load the ACP Registry: {types.message}</p>;
  if (shown.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">No agent matches “{search.trim()}”.</p>;
  return (
    <div role="listbox" aria-label="Agent types" className="flex max-h-64 flex-col overflow-y-auto rounded-lg border border-border p-1">
      {shown.map((type) => (
        <button
          key={type.id}
          type="button"
          role="option"
          aria-selected={chosen === type.id}
          disabled={!type.ready}
          onClick={() => onChoose(type.id)}
          className={cn(
            "flex items-center gap-2 rounded-md p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            type.ready && "hover:bg-muted",
            chosen === type.id && "bg-muted ring-1 ring-border",
            !type.ready && "cursor-default text-muted-foreground",
          )}
        >
          <AgentIcon iconUrl={type.icon} className="size-4" />
          <span className="truncate text-sm font-medium">{type.name}</span>
          {type.ready ? null : <Badge variant="outline">{installChip(type.reason)}</Badge>}
          <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">{type.id}</span>
        </button>
      ))}
    </div>
  );
}

function EnvironmentFields({ env, onChange }: { env: [string, string][]; onChange: (env: [string, string][]) => void }) {
  const set = (index: number, entry: [string, string]) => onChange(env.map((current, at) => (at === index ? entry : current)));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">Environment</span>
        <Button type="button" size="xs" variant="outline" onClick={() => onChange([...env, ["", ""]])}>Add variable</Button>
      </div>
      {env.length === 0 ? <p className="text-xs text-muted-foreground">Keys and settings this agent needs, such as an API key. They stay on this device.</p> : null}
      {env.map(([key, value], index) => (
        <div key={index} className="flex gap-2">
          <Input aria-label="Variable name" placeholder="NAME" className="w-2/5 font-mono" spellCheck={false} value={key} onChange={(event) => set(index, [event.target.value, value])} />
          <Input aria-label="Variable value" placeholder="value" type="password" className="flex-1 font-mono" spellCheck={false} value={value} onChange={(event) => set(index, [key, event.target.value])} />
          <Button type="button" size="icon" variant="outline" aria-label="Remove variable" onClick={() => onChange(env.filter((_, at) => at !== index))}>
            <XIcon />
          </Button>
        </div>
      ))}
    </div>
  );
}
