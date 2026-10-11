import { createWebSocketStream } from "@agentclientprotocol/sdk/experimental/ws-client";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  useAcpAuth,
  useAcpConnection,
  useAcpPermissions,
  useAcpPlan,
  useAcpRuntime,
  useAcpSession,
  useAcpThreadState,
  type AcpConnectionStatus,
} from "@hafbit/react-acp";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createDirectoryAdapter } from "@/acp/directory-adapter";
import { AgentPlan } from "@/components/assistant-ui/elements/agent-plan";
import { ApprovalCard } from "@/components/assistant-ui/elements/approval-card";
import { EmptyState, EmptyStateGreeting } from "@/components/assistant-ui/elements/empty-state";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { ConnectedAgent } from "./connect-form";
import { connectionLabels, StatusDot } from "./connection-status";
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
  const [directories] = useState(() => createDirectoryAdapter(() => createWebSocketStream(connection.url)));
  const runtime = useAcpRuntime({
    connection: { type: "adapter", adapter: directories.adapter },
    // Fallback only: every session takes its directory from `createSessionIn`.
    workspace: { cwd: "/" },
    clientInfo: { name: "mukae-example", version: "0.0.0" },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <StatusReporter id={connection.id} onStatusChange={onStatusChange} />
      <section className={active ? "flex h-dvh min-h-0 flex-col" : "hidden"}>
        <PaneHeader label={connection.label} />
        <PaneBody />
      </section>
      {active &&
        treeSlot &&
        createPortal(<WorkspaceTree agentType={connection.label} directories={directories} />, treeSlot)}
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

function PaneHeader({ label }: { label: string }) {
  const { status } = useAcpConnection();
  const session = useAcpSession();
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger />
        <Breadcrumb>
          <BreadcrumbList className="flex-nowrap">
            <BreadcrumbItem className="shrink-0">{label}</BreadcrumbItem>
            {session && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbPage className="truncate">{session.info?.title ?? session.sessionId}</BreadcrumbPage>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
        {status !== "ready" && (
          <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs">
            <StatusDot status={status} />
            {connectionLabels[status]}
          </span>
        )}
      </div>
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
        <EmptyStateGreeting>Select a session, or start a new one</EmptyStateGreeting>
      </EmptyState>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PlanPanel />
      <ApprovalList />
      <div className="min-h-0 flex-1">
        <Thread composerControls={<SessionControls />} />
      </div>
    </div>
  );
}

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
