import type { AcpConnectionStatus } from "@hafbit/react-acp";
import { PlusIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { ConnectForm, ManageAgentsLink, type ConnectedAgent } from "@/components/app/connect-form";
import { ExteriorMark } from "@/components/exterior-mark";
import { ConnectionPane, type Connection } from "@/components/app/connection-pane";
import { StatusDot } from "@/components/app/connection-status";
import { RowMenu } from "@/components/app/row-menu";
import type { AccountSession } from "@exterior/client/react";
import { useAccount } from "@exterior/client/react";
import { Button } from "@/components/ui/button";
import { accountPaths } from "@/lib/account-paths";
import { exampleClientId, exampleLogoUri } from "@/lib/client-id";
import { exteriorRelayUrl } from "@/lib/relay-url";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
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
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

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

  function disconnect(id: string) {
    const remaining = connections.filter((connection) => connection.id !== id);
    setConnections(remaining);
    setActiveId((current) => (current === id ? remaining[0]?.id : current));
  }

  const pageOrigin = window.location.origin;
  const base = import.meta.env.BASE_URL;
  const session = useAccount(exteriorRelayUrl(), {
    ...accountPaths(pageOrigin, base),
    clientId: exampleClientId(pageOrigin, base),
    clientName: "Example",
    logoUri: exampleLogoUri(pageOrigin, base),
  });

  const handleSignOut = useCallback(() => {
    session.signOut();
    setConnections([]);
    setActiveId(undefined);
    setStatuses({});
  }, [session.signOut]);

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2 py-1 text-sm font-medium">
              <ExteriorMark className="size-5" />
              Exterior
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Connections</SidebarGroupLabel>
              <SidebarGroupAction title="Add a connection" onClick={() => setAdding(true)}>
                <PlusIcon />
                <span className="sr-only">Add a connection</span>
              </SidebarGroupAction>
              <SidebarGroupContent>
                <SidebarMenu>
                  {connections.map((connection) => (
                    <SidebarMenuItem key={connection.id}>
                      <SidebarMenuButton isActive={connection.id === activeId} onClick={() => setActiveId(connection.id)}>
                        <StatusDot status={statuses[connection.id] ?? "idle"} />
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
          <SidebarFooter>
            {session.account.phase === "signed-in" ? (
              <div className="flex flex-col gap-1">
                <ManageAgentsLink className="w-full" />
                <div className="flex h-7 items-center justify-between gap-2 pl-2 pr-1">
                  <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                    </span>
                    Signed in
                  </span>
                  <Button variant="outline" size="sm" className="px-2" onClick={handleSignOut}>
                    Sign out
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <Button
                  variant="default"
                  size="sm"
                  className="w-full justify-start px-2"
                  disabled={session.busy || session.account.phase === "checking"}
                  onClick={session.signIn}
                >
                  {session.account.phase === "checking" ? "Checking…" : "Sign in"}
                </Button>
              </div>
            )}
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset className="min-h-0">
          {connections.length === 0 && (
            <div className="flex flex-1 items-center justify-center p-6">
              <ConnectForm session={session} onConnected={addConnection} />
            </div>
          )}
          {connections.map((connection) => (
            <ConnectionPane
              key={connection.id}
              connection={connection}
              active={connection.id === activeId}
              treeSlot={treeSlot}
              onStatusChange={reportStatus}
            />
          ))}
        </SidebarInset>
      </SidebarProvider>
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="sr-only">
            <DialogTitle>Add a connection</DialogTitle>
          </DialogHeader>
          <ConnectForm session={session} onConnected={addConnection} />
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
