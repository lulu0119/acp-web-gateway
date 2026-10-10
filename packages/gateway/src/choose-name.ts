import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const dialogScript = `on run argv
  set agentType to item 1 of argv
  set configNames to items 2 thru -1 of argv
  set promptText to "Choose a configuration for " & agentType
  set chosen to choose from list configNames with prompt promptText
  if chosen is false then
    return ""
  end if
  return item 1 of chosen
end run`;

export function systemDialogCommand(
  agentType: string,
  names: readonly string[],
): { command: string; args: string[] } {
  return {
    command: "osascript",
    args: ["-e", dialogScript, "--", agentType, ...names],
  };
}

export async function chooseNameFromSystemDialog(
  agentType: string,
  names: readonly string[],
): Promise<string | undefined> {
  if (names.length === 0) return undefined;
  const invocation = systemDialogCommand(agentType, names);
  try {
    const { stdout } = await execFileAsync(invocation.command, invocation.args, { encoding: "utf8" });
    const chosen = stdout.trim();
    return names.includes(chosen) ? chosen : undefined;
  } catch {
    return undefined;
  }
}
