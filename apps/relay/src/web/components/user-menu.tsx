import { LoaderCircleIcon, LogOutIcon } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@exterior/ui/avatar";
import { Button } from "@exterior/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@exterior/ui/dropdown-menu";

export function UserMenu({ userName, userImage }: { userName: string; userImage?: string }) {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    } catch {
      return;
    } finally {
      window.location.assign("/");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <Avatar size="sm" className="inline-flex after:hidden">
          {userImage && <AvatarImage keepMounted src={userImage} alt="" referrerPolicy="no-referrer" />}
          <AvatarFallback className="text-xs font-semibold text-foreground">
            {userName.trim().charAt(0).toUpperCase() || "?"}
          </AvatarFallback>
        </Avatar>
        {userName || "Account"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {userName ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Signed in as {userName}</DropdownMenuLabel>
          </DropdownMenuGroup>
        ) : null}
        {userName ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem disabled={busy} closeOnClick={false} onClick={() => void signOut()}>
          {busy ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : <LogOutIcon aria-hidden />}
          {busy ? "Signing out" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
