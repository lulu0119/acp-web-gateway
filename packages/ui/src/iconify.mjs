// Tailwind plugin for `icon-[set--name]` classes. Mingcute resolves by its prefix; lobe-icons is
// not an @iconify-json package, so its file is named here. Only icons a class names reach the CSS.
import { fileURLToPath } from "node:url";
import iconify from "@iconify/tailwind4";

const lobeIcons = fileURLToPath(import.meta.resolve("@proj-airi/lobe-icons/icons.json"));

export default iconify({ "icon-sets": `from-json(lobe-icons, ${lobeIcons})` });
