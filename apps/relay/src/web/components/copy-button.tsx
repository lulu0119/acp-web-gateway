import { cn } from "cn";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button.js";

export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
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

  return (
    <Button type="button" variant="outline" size="sm" className={cn(className)} onClick={() => void copy()} aria-live="polite">
      {state === "copied" ? <CheckIcon data-icon="inline-start" className="text-emerald-600" /> : <CopyIcon data-icon="inline-start" />}
      {state === "copied" ? "Copied" : state === "failed" ? "Select and copy" : label}
    </Button>
  );
}
