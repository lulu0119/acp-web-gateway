import { useCopyToClipboard } from "@mukae/react-hooks";

export function CopyButton({
  text,
  label,
  variant = "primary",
}: {
  text: string;
  label: string;
  variant?: "primary" | "text";
}) {
  const { isCopied, copyToClipboard } = useCopyToClipboard();

  if (variant === "text") {
    return (
      <button
        type="button"
        onClick={() => copyToClipboard(text)}
        className="shrink-0 text-sm text-zinc-500 underline-offset-4 hover:text-zinc-900 hover:underline"
      >
        {isCopied ? "Copied" : label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => copyToClipboard(text)}
      className="inline-flex h-11 items-center rounded-lg bg-zinc-900 px-5 text-sm font-medium text-white transition hover:bg-zinc-700"
    >
      {isCopied ? "Copied" : label}
    </button>
  );
}
