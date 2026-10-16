import { cn } from "cn";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./button.js";

/** `iconOnly` keeps the label for assistive technology and the tooltip, and shows only the icon. */
export function CopyButton({ text, label, iconOnly, className }: { text: string; label: string; iconOnly?: boolean; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  const status = state === "copied" ? "Copied" : state === "failed" ? "Select and copy" : label;
  const icon = state === "copied" ? <CheckIcon data-icon="inline-start" className="text-success-600" /> : <CopyIcon data-icon="inline-start" />;
  return (
    <Button
      type="button"
      variant="ghost"
      size={iconOnly ? "icon-sm" : "sm"}
      className={cn(iconOnly && "text-muted-foreground hover:bg-background/80", className)}
      onClick={() => void copy()}
      aria-label={iconOnly ? status : undefined}
      title={iconOnly ? status : undefined}
      aria-live="polite"
    >
      {icon}
      {iconOnly ? null : status}
    </Button>
  );
}
