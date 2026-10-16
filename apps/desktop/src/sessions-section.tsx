import { Button } from "@exterior/ui/button";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { api, errorText, type WorkingDirectory } from "./api";
import { SectionHeader } from "./app";

type Load = { kind: "loading" } | { kind: "ready"; value: WorkingDirectory } | { kind: "error"; message: string };

/**
 * Where sessions work.
 *
 * The directory is chosen, never typed: the system's own picker hands back one that
 * exists and is absolute, so there is no path here to get wrong.
 */
export function SessionsSection() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string>();

  const reload = useCallback(() => {
    api.workingDirectory().then(
      (value) => setLoad({ kind: "ready", value }),
      (failure: unknown) => setLoad({ kind: "error", message: errorText(failure) }),
    );
  }, []);
  useEffect(() => {
    reload();
    // The directory can also change from the CLI while the window is open.
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, [reload]);

  const choose = async () => {
    setChoosing(true);
    setError(undefined);
    try {
      const current = load.kind === "ready" ? load.value.workingDirectory : undefined;
      const picked = await open({ directory: true, multiple: false, defaultPath: current });
      const directory = Array.isArray(picked) ? picked[0] : picked;
      // Nothing to write when the person closed the dialog.
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
    <section aria-labelledby="sessions" className="flex flex-col gap-4">
      <SectionHeader
        id="sessions"
        title="Sessions"
        action={
          <Button variant="outline" loading={choosing} onClick={() => void choose()}>
            {chosen ? "Change folder" : "Choose folder"}
          </Button>
        }
      >
        Where agents work. A web app can name its own directory, and a session that names none works here.
      </SectionHeader>
      {load.kind === "loading" ? <p className="py-6 text-sm text-muted-foreground">Reading the working directory…</p> : null}
      {load.kind === "error" ? <p className="selectable text-sm text-danger-600 dark:text-danger-400">Could not read the working directory: {load.message}</p> : null}
      {load.kind === "ready" ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3.5">
          <p className="selectable font-mono text-sm break-all">{load.value.workingDirectory}</p>
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              {chosen ? "Chosen for this device." : "This device's own directory. No choice has been made."}
            </p>
            {chosen ? (
              <Button size="sm" variant="ghost" className="shrink-0 text-muted-foreground" loading={choosing} onClick={() => void reset()}>
                Use the default
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {error ? <p className="selectable text-sm text-danger-600 dark:text-danger-400">{error}</p> : null}
      <p className="text-xs text-muted-foreground">Sessions already open keep the directory they started in.</p>
    </section>
  );
}
