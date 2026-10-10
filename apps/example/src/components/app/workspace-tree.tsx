import { useState } from "react";
import { FolderIcon, PlusIcon, FolderPlusIcon } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { folderName, useWorkspaces } from "@/lib/workspaces";

/** Working directories of one connection, each with its sessions. */
export function WorkspaceTree({ agentType, directories }: { agentType: string; directories: DirectoryAdapter }) {
  const state = useAcpThreadState();
  const extras = useAcpRuntimeExtras();
  const connection = useAcpConnection();
  const { workspaces, add, remove } = useWorkspaces(agentType);
  const [adding, setAdding] = useState(false);
  const canDelete = hasAgentCapability(connection.capabilities, "delete");

  const sessionIdsByDirectory = (directory: string) =>
    state.sessionOrder.filter((id) => state.sessions[id]?.info?.cwd === directory);

  // Directories the agent already has sessions in, offered as shortcuts in the add dialog.
  const knownDirectories = [
    ...new Set(state.sessionOrder.map((id) => state.sessions[id]?.info?.cwd).filter((cwd): cwd is string => !!cwd)),
  ].filter((cwd) => !workspaces.includes(cwd));

  async function createSession(directory: string) {
    await directories.createSessionIn(directory, extras.createSession);
    await extras.refreshSessions();
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Working directories</SidebarGroupLabel>
      <SidebarGroupAction title="Add a working directory" onClick={() => setAdding(true)}>
        <FolderPlusIcon />
        <span className="sr-only">Add a working directory</span>
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu>
          {workspaces.map((directory) => (
            <SidebarMenuItem key={directory}>
              <SidebarMenuButton title={directory} className="font-medium">
                <FolderIcon />
                <span>{folderName(directory)}</span>
              </SidebarMenuButton>
              <RowMenu label={`Actions for ${folderName(directory)}`}>
                <DropdownMenuItem onClick={() => remove(directory)}>Remove working directory</DropdownMenuItem>
              </RowMenu>
              <SidebarMenuSub>
                {sessionIdsByDirectory(directory).map((id) => (
                  <SessionRow
                    key={id}
                    title={state.sessions[id]?.info?.title ?? "Untitled session"}
                    active={id === state.activeSessionId}
                    canDelete={canDelete}
                    onSelect={() => void extras.selectSession(id)}
                    onDelete={() => void extras.deleteSession(id)}
                  />
                ))}
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton onClick={() => void createSession(directory)}>
                    <PlusIcon />
                    <span>New session</span>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              </SidebarMenuSub>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
      <AddWorkspaceDialog
        open={adding}
        onOpenChange={setAdding}
        suggestions={knownDirectories}
        onAdd={add}
      />
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
      <SidebarMenuSubButton isActive={active} onClick={onSelect} className={canDelete ? "pe-7" : undefined}>
        <span>{title}</span>
      </SidebarMenuSubButton>
      {canDelete && (
        <>
          <RowMenu label={`Actions for ${title}`}>
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmingDelete(true)}>
              Delete session
            </DropdownMenuItem>
          </RowMenu>
          <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this session?</AlertDialogTitle>
                <AlertDialogDescription>
                  The session and its history are deleted from the agent and cannot be restored.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
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
