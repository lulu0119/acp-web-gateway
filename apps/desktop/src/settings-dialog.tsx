import { Button } from "@exterior/ui/button";
import { Dialog, DialogContent } from "@exterior/ui/dialog";
import { open as openFolderPicker } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { api, errorText, type WorkingDirectory } from "./api";

type Load<T> = { kind: "loading" } | { kind: "ready"; value: T } | { kind: "error"; message: string };

export function SettingsDialog({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [load, setLoad] = useState<Load<WorkingDirectory>>({ kind: "loading" });
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string>();

  const reload = useCallback(() => {
    api.workingDirectory().then(
      (value) => setLoad({ kind: "ready", value }),
      (failure: unknown) => setLoad({ kind: "error", message: errorText(failure) }),
    );
  }, []);
  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  const choose = async () => {
    setChoosing(true);
    setError(undefined);
    try {
      const current = load.kind === "ready" ? load.value.workingDirectory : undefined;
      const picked = await openFolderPicker({ directory: true, multiple: false, defaultPath: current });
      const directory = Array.isArray(picked) ? picked[0] : picked;
      if (!directory) return;
      await api.setWorkingDirectory(directory);
      reload();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setChoosing(false);
    }
  };

  const reset = async () => {
    setChoosing(true);
    setError(undefined);
    try {
      await api.resetWorkingDirectory();
      reload();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setChoosing(false);
    }
  };

  const chosen = load.kind === "ready" && load.value.source === "chosen";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Settings" className="max-w-md">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium">Working directory</span>
            <Button variant="outline" size="sm" loading={choosing} onClick={() => void choose()}>
              {chosen ? "Change folder" : "Choose folder"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">Where agents work.</p>
          {load.kind === "loading" ? <p className="text-sm text-muted-foreground">Reading the working directory…</p> : null}
          {load.kind === "error" ? <p className="selectable text-sm text-danger-600 dark:text-danger-400">Could not read the working directory: {load.message}</p> : null}
          {load.kind === "ready" ? (
            <>
              <p className="selectable font-mono text-sm break-all">{load.value.workingDirectory}</p>
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground">
                  {chosen ? "Chosen for this device." : "The default directory."}
                </p>
                {chosen ? (
                  <Button size="sm" variant="ghost" className="shrink-0 text-muted-foreground" loading={choosing} onClick={() => void reset()}>
                    Use the default
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
          {error ? <p className="selectable text-sm text-danger-600 dark:text-danger-400">{error}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
