import { expect, test } from "vitest";
import { createSessionDirectoryGate } from "./directory-adapter";

test("overlapping session creates keep their own directories", async () => {
  const gate = createSessionDirectoryGate();
  let releaseFirst: () => void = () => {};
  const firstCanRead = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const seen: string[] = [];
  const first = gate.run("/repo-a", async () => {
    await firstCanRead;
    seen.push(gate.cwd());
    return "a";
  });
  const second = gate.run("/repo-b", async () => {
    seen.push(gate.cwd());
    return "b";
  });
  releaseFirst();
  expect(await Promise.all([first, second])).toEqual(["a", "b"]);
  expect(seen).toEqual(["/repo-a", "/repo-b"]);
});
