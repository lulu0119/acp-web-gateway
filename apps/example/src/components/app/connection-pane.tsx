import { createWebSocketStream } from "@agentclientprotocol/sdk/experimental/ws-client";
import { AssistantRuntimeProvider, AuiIf, useAui } from "@assistant-ui/react";
import {
  useAcpAuth,
  useAcpConnection,
  useAcpPermissions,
  useAcpPlan,
  useAcpRuntime,
  useAcpRuntimeExtras,
  useAcpSession,
  useAcpThreadState,
  type AcpConnectionStatus,
} from "@hafbit/react-acp";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRightIcon,
  BotIcon,
  Code2Icon,
  FolderSearchIcon,
  GitPullRequestIcon,
  LoaderCircleIcon,
  PlusIcon,
} from "lucide-react";
import { createPortal } from "react-dom";
import { createDirectoryAdapter } from "@/acp/directory-adapter";
import { AgentPlan } from "@/components/assistant-ui/elements/agent-plan";
import { ApprovalCard } from "@/components/assistant-ui/elements/approval-card";
import { EmptyState, EmptyStateGreeting } from "@/components/assistant-ui/elements/empty-state";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { Button } from "@exterior/ui/button";
import { Skeleton } from "@exterior/ui/skeleton";
import { SidebarTrigger } from "@exterior/ui/sidebar";
import type { ConnectedAgent } from "./connect-form";
import { connectionLabels } from "./connection-status";
import { SessionControls } from "./session-controls";
import { WorkspaceTree } from "./workspace-tree";

export type Connection = ConnectedAgent & { id: string };

/** One live ACP connection. Unmounting it closes the connection. */
export function ConnectionPane({
  connection,
  active,
  treeSlot,
  onStatusChange,
}: {
  connection: Connection;
  active: boolean;
  treeSlot: HTMLElement | null;
  onStatusChange: (id: string, status: AcpConnectionStatus) => void;
}) {
  const [directories] = useState(() =>
    createDirectoryAdapter(() => createWebSocketStream(connection.url), connection.workingDirectory),
  );
  const runtime = useAcpRuntime({
    connection: { type: "adapter", adapter: directories.adapter },
    // The device's directory, for a session created without a chosen one.
    workspace: { cwd: connection.workingDirectory },
    clientInfo: { name: "exterior-example", version: "0.0.0" },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <StatusReporter id={connection.id} onStatusChange={onStatusChange} />
      <section className={active ? "flex h-dvh min-h-0 flex-col" : "hidden"}>
        <PaneHeader />
        <PaneBody />
      </section>
      {active &&
        treeSlot &&
        createPortal(
          <WorkspaceTree
            agentType={connection.label}
            directories={directories}
            defaultDirectory={connection.workingDirectory}
          />,
          treeSlot,
        )}
    </AssistantRuntimeProvider>
  );
}

function StatusReporter({
  id,
  onStatusChange,
}: {
  id: string;
  onStatusChange: (id: string, status: AcpConnectionStatus) => void;
}) {
  const { status } = useAcpConnection();
  useEffect(() => {
    onStatusChange(id, status);
  }, [id, status, onStatusChange]);
  return null;
}

function PaneHeader() {
  const session = useAcpSession();
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b p-4">
      <SidebarTrigger />
      {session && <p className="min-w-0 truncate text-sm font-medium">{session.info?.title ?? "Untitled conversation"}</p>}
    </header>
  );
}

function PaneBody() {
  const { status, error, reconnect } = useAcpConnection();
  const activeSessionId = useAcpThreadState((state) => state.activeSessionId);

  if (status === "auth-required") return <AuthPanel />;
  if (status === "error" || status === "closed") {
    const message = error instanceof Error ? error.message : connectionLabels[status];
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
        <p className="text-muted-foreground text-sm">{message}</p>
        <Button variant="outline" onClick={() => void reconnect()}>
          Reconnect
        </Button>
      </div>
    );
  }
  if (status !== "ready") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
    );
  }
  if (activeSessionId === undefined) {
    return (
      <EmptyState className="m-auto p-6">
        <div className="flex size-12 items-center justify-center rounded-xl border bg-muted/50">
          <BotIcon className="size-6" strokeWidth={1.5} aria-hidden />
        </div>
        <EmptyStateGreeting>Your agent is ready</EmptyStateGreeting>
        <StartConversationButton />
      </EmptyState>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PlanPanel />
      <ApprovalList />
      <div className="min-h-0 flex-1">
        <Thread components={chatComponents} composerControls={<SessionControls />} />
      </div>
    </div>
  );
}

function StartConversationButton() {
  const extras = useAcpRuntimeExtras();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const creating = useRef(false);
  async function create() {
    if (creating.current) return;
    creating.current = true;
    setBusy(true);
    setError("");
    try {
      await extras.createSession();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not start a conversation. Try again.");
    } finally {
      creating.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <Button disabled={busy} onClick={() => void create()}>
        {busy ? <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" /> : <PlusIcon />}
        {busy ? "Starting…" : "Start a conversation"}
      </Button>
      {error && (
        <p role="alert" className="max-w-sm text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

const starters = [
  {
    icon: FolderSearchIcon,
    title: "Explore this project",
    prompt: "Explore the project in the current directory. Summarize its purpose, structure, and how to get started.",
  },
  {
    icon: GitPullRequestIcon,
    title: "Review recent changes",
    prompt: "Review the recent changes in this project. Look for bugs and explain any important findings.",
  },
  {
    icon: Code2Icon,
    title: "Build something small",
    prompt: "Help me build a small improvement in this project. First explore the code and suggest a useful change.",
  },
];

function ChatWelcome() {
  const aui = useAui();
  return (
    <div className="mb-6 flex flex-col gap-6">
      <div className="flex size-12 items-center justify-center rounded-xl border bg-muted/50">
        <BotIcon className="size-6" strokeWidth={1.5} aria-hidden />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">What shall we work on?</h1>
      <AuiIf condition={(s) => s.composer.isEmpty}>
        <div className="grid gap-2 sm:grid-cols-3">
          {starters.map(({ icon: Icon, title, prompt }) => (
            <button
              type="button"
              key={title}
              className="flex flex-col items-start gap-3 rounded-xl border p-4 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              onClick={(event) => {
                aui.composer().setText(prompt);
                event.currentTarget.closest(".aui-thread-root")?.querySelector("textarea")?.focus();
              }}
            >
              <Icon className="size-4 text-muted-foreground" aria-hidden />
              <span className="flex w-full items-center justify-between gap-2">
                {title}
                <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              </span>
            </button>
          ))}
        </div>
      </AuiIf>
    </div>
  );
}

const chatComponents = { Welcome: ChatWelcome };

function AuthPanel() {
  const auth = useAcpAuth();
  return (
    <div className="flex flex-1 flex-wrap items-center justify-center gap-2 p-6">
      {auth.methods.map((method) => (
        <Button key={method.id} variant="outline" onClick={() => void auth.authenticate(method.id)}>
          {method.name}
        </Button>
      ))}
    </div>
  );
}

function PlanPanel() {
  const plan = useAcpPlan();
  const entries = plan?.entries ?? [];
  if (entries.length === 0) return null;
  const firstOpenIndex = entries.findIndex((entry) => entry.status !== "completed");
  return (
    <div className="px-4 pt-3">
      <AgentPlan
        title="Plan"
        steps={entries.map((entry) => entry.content)}
        activeIndex={firstOpenIndex === -1 ? entries.length : firstOpenIndex}
      />
    </div>
  );
}

function ApprovalList() {
  const { pending, reply } = useAcpPermissions();
  if (pending.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 px-4 pt-3">
      {pending.map(({ request }) => {
        const { toolCallId } = request.toolCall;
        const allowOnce = request.options.find((option) => option.kind === "allow_once");
        const allowAlways = request.options.find((option) => option.kind === "allow_always");
        const reject =
          request.options.find((option) => option.kind === "reject_once") ??
          request.options.find((option) => option.kind === "reject_always");
        return (
          <ApprovalCard
            key={toolCallId}
            state="request"
            title={request.toolCall.title ?? "Tool call"}
            subtitle="Needs your confirmation"
            allowOnceLabel="Allow"
            alwaysAllowLabel="Always allow"
            denyLabel="Deny"
            onAllowOnce={allowOnce ? () => void reply(toolCallId, allowOnce.optionId) : undefined}
            onAlwaysAllow={allowAlways ? () => void reply(toolCallId, allowAlways.optionId) : undefined}
            onDeny={() => void reply(toolCallId, reject?.optionId)}
          />
        );
      })}
    </div>
  );
}
