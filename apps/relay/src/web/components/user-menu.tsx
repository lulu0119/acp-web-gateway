import { useState } from "react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export function UserMenu({ userName }: { userName: string }) {
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
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>{userName || "Account"}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {userName ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Signed in as {userName}</DropdownMenuLabel>
          </DropdownMenuGroup>
        ) : null}
        {userName ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem render={<a href="/device" />}>Approve a machine</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={busy} onClick={() => void signOut()}>
          {busy ? "Signing out" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
