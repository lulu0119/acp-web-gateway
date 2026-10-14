import { expect, test } from "vitest";
import { createSessionDirectoryGate } from "./directory-adapter";

test("a session created without a directory works where the device works", () => {
  const gate = createSessionDirectoryGate("C:\\Users\\person\\.config\\exterior\\workspace");
  expect(gate.cwd()).toBe("C:\\Users\\person\\.config\\exterior\\workspace");
});

test("overlapping session creates keep their own directories", async () => {
  const gate = createSessionDirectoryGate("/home/person/.config/exterior/workspace");
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
