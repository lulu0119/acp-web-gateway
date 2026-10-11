import { useCopyToClipboard } from "@mukae/react-hooks";
import { Button } from "../ui/button";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  return (
    <Button type="button" variant="ghost" size="sm" onClick={() => copyToClipboard(text)}>
      {isCopied ? "Copied" : label}
    </Button>
  );
}
