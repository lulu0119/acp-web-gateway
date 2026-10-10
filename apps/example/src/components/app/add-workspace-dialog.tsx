import { FolderIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { folderName, isAbsolutePath } from "@/lib/workspaces";

/**
 * Type an absolute path, or pick a directory the agent already has sessions in.
 * The input's invalid border is the only validation message.
 */
export function AddWorkspaceDialog({
  open,
  onOpenChange,
  suggestions,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: readonly string[];
  onAdd: (path: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const trimmed = draft.trim();

  function submit(path: string) {
    if (!isAbsolutePath(path)) {
      setInvalid(true);
      return;
    }
    onAdd(path);
    setDraft("");
    setInvalid(false);
    onOpenChange(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(trimmed);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md grid-cols-[minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle>Add a working directory</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            autoFocus
            spellCheck={false}
            value={draft}
            placeholder="/Users/you/project"
            aria-invalid={invalid || undefined}
            onChange={(event) => {
              setDraft(event.currentTarget.value);
              setInvalid(false);
            }}
          />
          {suggestions.length > 0 && (
            <ul className="flex max-h-60 flex-col overflow-y-auto">
              {suggestions.map((path) => (
                <li key={path}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start gap-2 py-2 font-normal"
                    onClick={() => submit(path)}
                  >
                    <FolderIcon className="text-muted-foreground size-4 shrink-0" />
                    <span className="font-medium">{folderName(path)}</span>
                    <span className="text-muted-foreground min-w-0 truncate text-xs">{path}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={trimmed === ""}>
              Add
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
