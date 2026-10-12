import { useCopyToClipboard } from "react-use";
import { Button } from "../ui/button";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, copyToClipboard] = useCopyToClipboard();
  const isCopied = state.value === text;
  return (
    <Button type="button" variant="ghost" size="sm" onClick={() => copyToClipboard(text)}>
      {isCopied ? "Copied" : label}
    </Button>
  );
}
