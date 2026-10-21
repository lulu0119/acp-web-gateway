import { useRef, useState } from "react";
import { FolderIcon, PlusIcon, FolderPlusIcon, LoaderCircleIcon, RefreshCwIcon } from "lucide-react";
import { useAcpConnection, useAcpRuntimeExtras, useAcpThreadState } from "@hafbit/react-acp";
import { hasAgentCapability } from "@hafbit/react-acp/core";
import type { DirectoryAdapter } from "@/acp/directory-adapter";
import { AddWorkspaceDialog } from "@/components/app/add-workspace-dialog";
import { RowMenu } from "@/components/app/row-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@exterior/ui/alert-dialog";
import { DropdownMenuItem } from "@exterior/ui/dropdown-menu";
import { Button } from "@exterior/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@exterior/ui/tooltip";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@exterior/ui/sidebar";
import { folderName, useWorkspaces } from "@/lib/workspaces";

/** Working directories of one connection, each with its sessions. */
export function WorkspaceTree({
  agentType,
  directories,
  defaultDirectory,
}: {
  agentType: string;
  directories: DirectoryAdapter;
  defaultDirectory: string;
}) {
  const state = useAcpThreadState();
  const extras = useAcpRuntimeExtras();
  const connection = useAcpConnection();
  const { workspaces: savedWorkspaces, add, remove } = useWorkspaces(agentType);
  const [adding, setAdding] = useState(false);
  const [creatingDirectory, setCreatingDirectory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const creatingRef = useRef(false);
  const canDelete = hasAgentCapability(connection.capabilities, "delete");
  const canList = hasAgentCapability(connection.capabilities, "list");
  const sessionDirectories = state.sessionOrder.map((id) => state.sessions[id]?.info?.cwd ?? defaultDirectory);
  const workspaces = [...new Set([defaultDirectory, ...savedWorkspaces, ...sessionDirectories])];

  const sessionIdsByDirectory = (directory: string) =>
    state.sessionOrder.filter((id) => (state.sessions[id]?.info?.cwd ?? defaultDirectory) === directory);

  async function refreshSessions() {
    if (refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      await extras.refreshSessions();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not refresh conversations. Try again.");
    } finally {
      setRefreshing(false);
    }
  }

  async function createSession(directory: string) {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreatingDirectory(directory);
    setError("");
    try {
      await directories.createSessionIn(directory, extras.createSession);
      if (canList) await refreshSessions();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not start a conversation. Try again.");
    } finally {
      creatingRef.current = false;
      setCreatingDirectory(null);
    }
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Working directories</SidebarGroupLabel>
      {canList && (
        <SidebarGroupAction
          title="Refresh conversations"
          className="right-9"
          disabled={refreshing}
          onClick={() => void refreshSessions()}
        >
          <RefreshCwIcon />
          <span className="sr-only">Refresh conversations</span>
        </SidebarGroupAction>
      )}
      <SidebarGroupAction title="Add a working directory" onClick={() => setAdding(true)}>
        <FolderPlusIcon />
        <span className="sr-only">Add a working directory</span>
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu>
          {workspaces.map((directory) => (
            <SidebarMenuItem key={directory}>
              <div className="flex items-center gap-2 p-2">
                <div title={directory} className="flex min-w-0 flex-1 items-center gap-2 text-xs font-medium">
                  <FolderIcon className="size-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate">{folderName(directory)}</span>
                    <span className="block truncate text-xs font-normal text-muted-foreground">{directory}</span>
                  </span>
                </div>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`New conversation in ${folderName(directory)}`}
                        aria-busy={creatingDirectory === directory || undefined}
                        disabled={creatingDirectory !== null || connection.status !== "ready"}
                        onClick={() => void createSession(directory)}
                      />
                    }
                  >
                    {creatingDirectory === directory ? (
                      <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
                    ) : (
                      <PlusIcon className="size-4" />
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {creatingDirectory === directory ? "Starting…" : "New conversation"}
                  </TooltipContent>
                </Tooltip>
                {savedWorkspaces.includes(directory) &&
                  directory !== defaultDirectory &&
                  !sessionDirectories.includes(directory) && (
                    <RowMenu label={`Actions for ${folderName(directory)}`} className="static size-7 after:hidden">
                      <DropdownMenuItem onClick={() => remove(directory)}>Remove working directory</DropdownMenuItem>
                    </RowMenu>
                  )}
              </div>
              <SidebarMenuSub className="empty:hidden">
                {sessionIdsByDirectory(directory).map((id) => (
                  <SessionRow
                    key={id}
                    title={state.sessions[id]?.info?.title ?? "Untitled conversation"}
                    active={id === state.activeSessionId}
                    canDelete={canDelete}
                    onSelect={() => void extras.selectSession(id)}
                    onDelete={() => void extras.deleteSession(id)}
                  />
                ))}
              </SidebarMenuSub>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        {error && (
          <p role="alert" className="p-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </SidebarGroupContent>
      <AddWorkspaceDialog open={adding} onOpenChange={setAdding} suggestions={[]} onAdd={add} />
    </SidebarGroup>
  );
}

function SessionRow({
  title,
  active,
  canDelete,
  onSelect,
  onDelete,
}: {
  title: string;
  active: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        render={<button type="button" />}
        size="sm"
        isActive={active}
        onClick={onSelect}
        className={`w-full${canDelete ? " pe-6" : ""}`}
      >
        <span>{title}</span>
      </SidebarMenuSubButton>
      {canDelete && (
        <>
          <RowMenu
            label={`Actions for ${title}`}
            className="top-1/2 right-1 size-4 -translate-y-1/2 text-muted-foreground [&>svg]:size-3"
          >
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmingDelete(true)}>
              Delete
            </DropdownMenuItem>
          </RowMenu>
          <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
                <AlertDialogDescription>
                  The conversation and its history are deleted from the agent and cannot be restored.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel variant="secondary">Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={onDelete}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </SidebarMenuSubItem>
  );
}
