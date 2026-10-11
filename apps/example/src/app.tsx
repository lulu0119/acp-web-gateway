import type { AcpConnectionStatus } from "@hafbit/react-acp";
import { PlugIcon, PlusIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { ConnectForm, type ConnectedAgent } from "@/components/app/connect-form";
import { ConnectionPane, type Connection } from "@/components/app/connection-pane";
import { StatusDot } from "@/components/app/connection-status";
import { RowMenu } from "@/components/app/row-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
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

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2 py-1 text-sm font-medium">
              <PlugIcon className="size-4" />
              Mukae
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
          <SidebarRail />
        </Sidebar>
        <SidebarInset className="min-h-0">
          {connections.length === 0 && (
            <div className="flex flex-1 items-center justify-center p-6">
              <ConnectForm onConnected={addConnection} />
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
          <ConnectForm onConnected={addConnection} />
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
