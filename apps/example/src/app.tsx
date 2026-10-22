import type { AcpConnectionStatus } from "@hafbit/react-acp";
import { LogOutIcon, PlusIcon } from "lucide-react";
import { lazy, Suspense, useCallback, useState } from "react";
import { ConnectForm, ManageAgentsLink, type ConnectedAgent } from "@/components/app/connect-form";
import { ExteriorMark } from "@exterior/ui/exterior-mark";
import type { Connection } from "@/components/app/connection-pane";
import { StatusDot } from "@/components/app/connection-status";
import { RowMenu } from "@/components/app/row-menu";
import { WelcomePage } from "@/components/app/welcome-page";
import { useAccount } from "@exterioragentprotocol/sdk/client/react";
import { Button } from "@exterior/ui/button";
import { exampleClient } from "@exterior/contract";
import { accountPaths } from "@/lib/account-paths";
import { exteriorRelayUrl } from "@/lib/relay-url";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@exterior/ui/dialog";
import { DropdownMenuItem } from "@exterior/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from "@exterior/ui/sidebar";
import { TooltipProvider } from "@exterior/ui/tooltip";

const ConnectionPane = lazy(() =>
  import("@/components/app/connection-pane").then((module) => ({ default: module.ConnectionPane })),
);

export function App() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>();
  const [statuses, setStatuses] = useState<Record<string, AcpConnectionStatus>>({});
  const [treeSlot, setTreeSlot] = useState<HTMLDivElement | null>(null);
  const [adding, setAdding] = useState(false);

  const reportStatus = useCallback((id: string, status: AcpConnectionStatus) => {
    setStatuses((current) => (current[id] === status ? current : { ...current, [id]: status }));
  }, []);

  function addConnection(agent: ConnectedAgent) {
    const connection: Connection = { ...agent, id: crypto.randomUUID() };
    setConnections((current) => [...current, connection]);
    setActiveId(connection.id);
    setAdding(false);
  }

  function renewConnection(id: string, url: string) {
    setConnections((current) =>
      current.map((connection) => (connection.id === id ? { ...connection, url } : connection)),
    );
  }

  function disconnect(id: string) {
    const remaining = connections.filter((connection) => connection.id !== id);
    setConnections(remaining);
    setActiveId((current) => (current === id ? remaining[0]?.id : current));
    setStatuses((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  const pageOrigin = window.location.origin;
  const base = import.meta.env.BASE_URL;
  const session = useAccount(exteriorRelayUrl(), {
    ...accountPaths(pageOrigin, base),
    clientId: exampleClient.client_id,
  });

  const handleSignOut = useCallback(() => {
    session.signOut();
    setConnections([]);
    setActiveId(undefined);
    setStatuses({});
    setAdding(false);
  }, [session.signOut]);

  const connectSession = { ...session, signOut: handleSignOut };
  if (connections.length === 0) {
    return (
      <TooltipProvider>
        <WelcomePage session={connectSession} onConnected={addConnection} />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader className="p-4">
            <div className="flex items-center gap-3">
              <ExteriorMark className="size-8" />
              <div>
                <p className="text-sm font-semibold">Exterior</p>
                <p className="text-xs text-muted-foreground">Playground</p>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Connections</SidebarGroupLabel>
              <AddConnectionAction onAdd={() => setAdding(true)} />
              <SidebarGroupContent>
                <SidebarMenu>
                  {connections.map((connection) => (
                    <SidebarMenuItem key={connection.id}>
                      <SidebarMenuButton
                        isActive={connection.id === activeId}
                        onClick={() => setActiveId(connection.id)}
                      >
                        <span className="flex size-4 shrink-0 items-center justify-center">
                          <StatusDot status={statuses[connection.id] ?? "idle"} />
                        </span>
                        <span>{connection.label}</span>
                      </SidebarMenuButton>
                      <RowMenu label={`Actions for ${connection.label}`}>
                        <DropdownMenuItem className="text-destructive" onClick={() => disconnect(connection.id)}>
                          Disconnect
                        </DropdownMenuItem>
                      </RowMenu>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <div ref={setTreeSlot} />
          </SidebarContent>
          <SidebarFooter className="gap-1 border-t">
            {session.account.phase === "signed-in" ? (
              <>
                <ManageAgentsLink className="w-full" />
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 border-0 px-2 font-normal text-muted-foreground"
                  onClick={handleSignOut}
                >
                  <LogOutIcon className="size-4" aria-hidden />
                  <span>Sign out</span>
                </Button>
              </>
            ) : (
              <Button
                variant="default"
                size="sm"
                className="w-full justify-start px-2"
                disabled={session.busy || session.account.phase === "checking"}
                onClick={session.signIn}
              >
                {session.account.phase === "checking" ? "Checking…" : "Sign in"}
              </Button>
            )}
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset className="min-h-0">
          <Suspense
            fallback={
              <p role="status" className="m-auto p-6 text-sm text-muted-foreground">
                Opening your agent…
              </p>
            }
          >
            {connections.map((connection) => (
              <ConnectionPane
                key={connection.url}
                connection={connection}
                active={connection.id === activeId}
                treeSlot={treeSlot}
                accessToken={session.account.phase === "signed-in" ? session.account.accessToken : undefined}
                onRenewed={(url) => renewConnection(connection.id, url)}
                onStatusChange={reportStatus}
              />
            ))}
          </Suspense>
        </SidebarInset>
      </SidebarProvider>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 sm:max-w-md">
          <DialogHeader className="sr-only">
            <DialogTitle>Add a connection</DialogTitle>
            <DialogDescription>Choose another agent on an online device.</DialogDescription>
          </DialogHeader>
          {adding && <ConnectForm session={connectSession} onConnected={addConnection} />}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

function AddConnectionAction({ onAdd }: { onAdd: () => void }) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarGroupAction
      title="Add a connection"
      onClick={() => {
        setOpenMobile(false);
        onAdd();
      }}
    >
      <PlusIcon />
      <span className="sr-only">Add a connection</span>
    </SidebarGroupAction>
  );
}
