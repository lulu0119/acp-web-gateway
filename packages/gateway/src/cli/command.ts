import type { CAC } from "cac";

export type CliWritable = { write: (chunk: string) => unknown };

export type CliIo = {
  stdout: CliWritable;
  stderr: CliWritable;
  env: NodeJS.ProcessEnv;
  homeDirectory: string;
};

export type CommandContext = { io: CliIo; signal?: AbortSignal };

export type CommandOptions = Record<string, unknown>;

export type CommandOption = {
  flags: string;
  description: string;
  repeatable?: boolean;
};

export type CommandNode = {
  name: string;
  description: string;
  help?: string;
  examples?: readonly string[];
  options?: readonly CommandOption[];
  children?: readonly CommandNode[];
  action?: (context: CommandContext, options: CommandOptions) => number | Promise<number>;
};

/** A mistake in how the command was typed. The CLI prints it with a pointer to `--help` and exits with 2. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export function defineCommand(node: CommandNode): CommandNode {
  return node;
}

export function stringOption(options: CommandOptions, flag: string): string | undefined {
  const value = options[camelCase(flag)];
  if (value === undefined) return undefined;
  if (Array.isArray(value)) throw new UsageError(`--${flag} can be given only once.`);
  return String(value);
}

export function stringsOption(options: CommandOptions, flag: string): string[] {
  const value = options[camelCase(flag)];
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}

/**
 * Registers each root command with cac. cac parses and checks options; a command with children takes the
 * rest of the words and dispatches them here, because cac matches only one word.
 */
export function registerCommandTree(
  cli: CAC,
  nodes: readonly CommandNode[],
  context: CommandContext,
  setPendingResult: (result: Promise<number>) => void,
): void {
  for (const node of nodes) {
    const command = cli.command(node.children ? `${node.name} [...args]` : node.name, node.description);
    if (node.children) command.allowUnknownOptions();
    for (const option of collectOptions(node)) {
      command.option(option.flags, option.description, option.repeatable ? { type: [String] } : undefined);
    }
    command.action((...args: unknown[]) => {
      const options = args.at(-1) as CommandOptions;
      const words = node.children ? ((args[0] as string[] | undefined) ?? []) : [];
      setPendingResult(Promise.resolve().then(() => dispatch(context, node, words, options, [node.name])));
    });
  }
}

/** The commands named by the leading words of `args`, for help and for error hints. */
export function resolveCommandPath(nodes: readonly CommandNode[], args: readonly string[]): CommandNode[] {
  const path: CommandNode[] = [];
  let candidates = nodes;
  for (const arg of args) {
    if (arg.startsWith("-")) continue;
    const node = candidates.find((item) => item.name === arg);
    if (!node) break;
    path.push(node);
    candidates = node.children ?? [];
  }
  return path;
}

export function formatHelp(input: { bin: string; root: CommandNode; path: readonly CommandNode[] }): string {
  const node = input.path.at(-1) ?? input.root;
  const words = [input.bin, ...input.path.map((item) => item.name)].join(" ");
  const sections = [node.help ?? node.description];
  sections.push(`Usage:\n  $ ${words}${node.children ? " <command>" : ""}${node.options?.length ? " [options]" : ""}`);
  if (node.children) {
    sections.push(`Commands:\n${table(node.children.map((child) => [child.name, child.description]))}`);
  }
  if (node.options?.length) {
    sections.push(`Options:\n${table(node.options.map((option) => [option.flags, option.description]))}`);
  }
  if (node.examples?.length) {
    const separator = node.examples.some((example) => example.includes("\n")) ? "\n\n" : "\n";
    sections.push(`Examples:\n${node.examples.map((example) => indent(example)).join(separator)}`);
  }
  if (node.children) sections.push(`Run \`${words} <command> --help\` for a command's options.`);
  return `${sections.join("\n\n")}\n`;
}

function dispatch(context: CommandContext, node: CommandNode, args: readonly string[], options: CommandOptions, path: readonly string[]): number | Promise<number> {
  if (node.children) {
    const [word, ...rest] = args;
    const child = node.children.find((item) => item.name === word);
    if (child) return dispatch(context, child, rest, options, [...path, child.name]);
    const choices = node.children.map((item) => `  mukae ${[...path, item.name].join(" ")}`).join("\n");
    if (word === undefined) throw new UsageError(`mukae ${path.join(" ")} needs a command:\n${choices}`);
    throw new UsageError(`Unknown command "mukae ${[...path, word].join(" ")}". Pick one:\n${choices}`);
  }
  if (args[0] !== undefined) throw new UsageError(`Unexpected argument "${args[0]}".`);
  const known = new Set((node.options ?? []).map((option) => camelCase(optionName(option.flags))));
  for (const key of Object.keys(options)) {
    if (key !== "--" && !key.includes("-") && !known.has(key)) throw new UsageError(`Unknown option --${kebabCase(key)} for mukae ${path.join(" ")}.`);
  }
  if (!node.action) throw new UsageError(`mukae ${path.join(" ")} does nothing on its own.`);
  return node.action(context, options);
}

function collectOptions(node: CommandNode): CommandOption[] {
  const options = new Map<string, CommandOption>();
  for (const option of node.options ?? []) options.set(option.flags, option);
  for (const child of node.children ?? []) for (const option of collectOptions(child)) options.set(option.flags, option);
  return [...options.values()];
}

function optionName(flags: string): string {
  return /--([\w-]+)/.exec(flags)?.[1] ?? flags;
}

function camelCase(name: string): string {
  return name.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase());
}

function kebabCase(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function table(rows: readonly (readonly [string, string])[]): string {
  const width = Math.max(...rows.map(([left]) => left.length));
  return rows.map(([left, right]) => `  ${left.padEnd(width)}  ${right}`).join("\n");
}

function indent(text: string): string {
  return text.split("\n").map((line) => `  ${line}`).join("\n");
}
