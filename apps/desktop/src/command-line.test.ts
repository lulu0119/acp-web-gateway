import { describe, expect, it } from "vitest";
import { splitCommandLine } from "./command-line";

describe("splitCommandLine", () => {
  it("splits on spaces and keeps quoted text together", () => {
    expect(splitCommandLine(`npx -y @foo/agent  --acp`)).toEqual(["npx", "-y", "@foo/agent", "--acp"]);
    expect(splitCommandLine(`sh -c "my-agent --name 'work box'"`)).toEqual(["sh", "-c", "my-agent --name 'work box'"]);
    expect(splitCommandLine(`run "" a"b c"d`)).toEqual(["run", "", "ab cd"]);
  });

  it("keeps backslashes, so a Windows path survives", () => {
    expect(splitCommandLine(`C:\\Tools\\agent.exe --dir "C:\\My Projects\\"`)).toEqual(["C:\\Tools\\agent.exe", "--dir", "C:\\My Projects\\"]);
  });

  it("has no result while a quote is open", () => {
    expect(splitCommandLine(`sh -c "my-agent`)).toBeUndefined();
  });
});
