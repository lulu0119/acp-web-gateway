import { useEffect, useState } from "react";

/** Paths the agent may use as a working directory must be absolute on this computer. */
export function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

export function folderName(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? path;
}

export function addWorkspace(workspaces: readonly string[], path: string): string[] {
  return workspaces.includes(path) ? [...workspaces] : [...workspaces, path];
}

export function removeWorkspace(workspaces: readonly string[], path: string): string[] {
  return workspaces.filter((workspace) => workspace !== path);
}

function storageKey(deviceId: string, agentName: string): string {
  return `exterior.workspaces.${deviceId}.${agentName}`;
}

function readStoredWorkspaces(key: string): string[] {
  try {
    const stored = window.localStorage.getItem(key);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && isAbsolutePath(item));
  } catch {
    return [];
  }
}

/** Working directories the person added for one agent on one device, kept in this browser only. */
export function useWorkspaces(
  deviceId: string,
  agentName: string,
): {
  workspaces: readonly string[];
  add(path: string): void;
  remove(path: string): void;
} {
  const key = storageKey(deviceId, agentName);
  const [workspaces, setWorkspaces] = useState(() => readStoredWorkspaces(key));

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(workspaces));
  }, [key, workspaces]);

  return {
    workspaces,
    add: (path) => setWorkspaces((current) => addWorkspace(current, path)),
    remove: (path) => setWorkspaces((current) => removeWorkspace(current, path)),
  };
}
