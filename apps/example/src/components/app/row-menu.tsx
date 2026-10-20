import type { ReactNode } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@exterior/ui/dropdown-menu";
import { SidebarMenuAction } from "@exterior/ui/sidebar";

/** The per-row "more" menu. It is always visible, so actions are discoverable without hover. */
export function RowMenu({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuAction title={label} className={className}>
            <MoreHorizontalIcon />
            <span className="sr-only">{label}</span>
          </SidebarMenuAction>
        }
      />
      <DropdownMenuContent align="end" className="min-w-36">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
