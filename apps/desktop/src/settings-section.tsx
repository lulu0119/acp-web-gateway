import { Button } from "@exterior/ui/button";
import { open as openFolderPicker } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { api, errorText, type WorkingDirectory } from "./api";
import { InsetGroup, InsetRow, SectionIntro } from "./inset-group";

type Load<T> = { kind: "loading" } | { kind: "ready"; value: T } | { kind: "error"; message: string };

export function SettingsSection() {
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
    reload();
  }, [reload]);

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
  const directory = load.kind === "loading"
    ? "Reading the working directory…"
    : load.kind === "error"
      ? <span className="selectable text-danger-600 dark:text-danger-400">Could not read the working directory: {load.message}</span>
      : <span title={load.value.workingDirectory} className="selectable block truncate font-mono">{load.value.workingDirectory}</span>;

  return (
    <section aria-labelledby="section-title" className="flex flex-col gap-4">
      <SectionIntro title="Settings">How this device runs. These settings stay on this computer.</SectionIntro>
      <InsetGroup>
        <InsetRow title="Working directory" detail={directory}>
          {load.kind === "ready" ? (
            <>
              <Button variant="outline" size="sm" loading={choosing} onClick={() => void choose()}>
                {chosen ? "Change folder" : "Choose folder"}
              </Button>
              {chosen ? (
                <Button size="sm" variant="outline" loading={choosing} onClick={() => void reset()}>
                  Use the default
                </Button>
              ) : null}
            </>
          ) : null}
        </InsetRow>
      </InsetGroup>
      {error ? <p className="selectable text-sm text-danger-600 dark:text-danger-400">{error}</p> : null}
    </section>
  );
}
