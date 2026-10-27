import { AgentIcon } from "@exterior/ui/agent-icon";
import { Badge } from "@exterior/ui/badge";
import { Button } from "@exterior/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@exterior/ui/dialog";
import { useCallback, useEffect, useState } from "react";
import { AddAgentDialog, CommandParts } from "./add-agent-dialog";
import { api, errorText, type AgentConfig, type AgentType } from "./api";
import { InsetGroup, InsetRow, SectionIntro } from "./inset-group";

type Load<T> = { kind: "loading" } | { kind: "ready"; value: T } | { kind: "error"; message: string };

export function AgentsSection() {
  const [agents, setAgents] = useState<Load<AgentConfig[]>>({ kind: "loading" });
  const [types, setTypes] = useState<Load<AgentType[]>>({ kind: "loading" });
  const [adding, setAdding] = useState(false);

  const reload = useCallback(() => {
    api.agents().then(
      (value) => setAgents({ kind: "ready", value }),
      (error: unknown) => setAgents({ kind: "error", message: errorText(error) }),
    );
  }, []);
  useEffect(() => {
    reload();
    // The registry is fetched once per window; it names types and says which can start here.
    api.agentTypes().then(
      (value) => setTypes({ kind: "ready", value }),
      (error: unknown) => setTypes({ kind: "error", message: errorText(error) }),
    );
    // Configurations can also change from the CLI while the window is open.
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, [reload]);

  const typeById = new Map(types.kind === "ready" ? types.value.map((type) => [type.id, type]) : []);
  const list = agents.kind === "ready" ? agents.value : [];
  const addButton = <Button onClick={() => setAdding(true)}>Add agent</Button>;
  return (
    <section aria-labelledby="section-title" className="flex flex-col gap-4">
      <SectionIntro title="Agents">What web apps can open on this device. Changes reach the relays at once.</SectionIntro>
      {list.length > 0 ? <div className="flex justify-end">{addButton}</div> : null}
      {agents.kind === "loading" ? <p className="py-6 text-sm text-muted-foreground">Reading agent configurations…</p> : null}
      {agents.kind === "error" ? <p className="selectable text-sm text-danger-600 dark:text-danger-400">Could not read agent configurations: {agents.message}</p> : null}
      {agents.kind === "ready" && list.length === 0 ? (
        <InsetGroup>
          <InsetRow title="No agents yet" detail="Add an agent from the ACP Registry, or any command that speaks ACP over stdio.">
            <Button onClick={() => setAdding(true)}>Add agent</Button>
          </InsetRow>
        </InsetGroup>
      ) : null}
      {list.length > 0 ? (
        <InsetGroup>
          {list.map((agent) => <AgentRow key={agent.name} agent={agent} type={typeById.get(agent.agentType)} onRemoved={reload} />)}
        </InsetGroup>
      ) : null}
      {types.kind === "error" && list.length > 0 ? (
        <p className="text-xs text-muted-foreground">Could not load the ACP Registry, so agent types show by id. {types.message}</p>
      ) : null}
      <AddAgentDialog
        open={adding}
        onOpenChange={setAdding}
        types={types}
        takenNames={list.map((agent) => agent.name)}
        onAdded={() => {
          setAdding(false);
          reload();
        }}
      />
    </section>
  );
}

function AgentRow({ agent, type, onRemoved }: { agent: AgentConfig; type?: AgentType; onRemoved: () => void }) {
  const custom = agent.command !== undefined;
  return (
    <div className="flex items-start gap-3 p-4">
      <AgentIcon iconUrl={custom ? undefined : type?.icon} className="mt-1 size-5" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="selectable truncate text-sm leading-6 font-medium">{agent.name}</span>
          {!custom ? <span className="truncate text-xs text-muted-foreground">{type?.name ?? agent.agentType}</span> : null}
        </div>
        {agent.command ? <CommandParts command={agent.command} /> : null}
        {type && !type.ready ? <p className="text-xs leading-5 text-amber-700 dark:text-amber-400">Cannot start here: {type.reason}</p> : null}
        {agent.envNames.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {agent.envNames.map((name) => <Badge key={name} variant="secondary" className="font-mono font-normal">{name}</Badge>)}
          </div>
        ) : null}
      </div>
      <RemoveButton name={agent.name} onRemoved={onRemoved} />
    </div>
  );
}

function RemoveButton({ name, onRemoved }: { name: string; onRemoved: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const confirm = async () => {
    setPending(true);
    setError(undefined);
    try {
      await api.removeAgent(name);
      setOpen(false);
      onRemoved();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="shrink-0" onClick={() => setOpen(true)}>Remove</Button>
      <DialogContent className="max-w-md">
        <DialogHeader className="gap-1 pr-8">
          <DialogTitle className="font-display text-xl font-bold">{`Remove ${name}?`}</DialogTitle>
          <DialogDescription>
            Web apps can no longer open it. Sessions already open keep running until they end.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="selectable text-sm text-danger-600 dark:text-danger-400">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" loading={pending} onClick={() => void confirm()}>Remove</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
