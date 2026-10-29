import { writeFileSync } from "node:fs";

writeFileSync(new URL("../dist/.npmignore", import.meta.url), "*.test.js\n*.test.js.map\n*.test.d.ts\n*.test.d.ts.map\n*.tsbuildinfo\n");
