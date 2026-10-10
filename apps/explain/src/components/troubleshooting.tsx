const cases = [
  {
    title: "No confirmation prompt",
    cause: "The link is not registered, or this computer is not running macOS. Chrome shows no prompt and only logs the failure in the console.",
    fix: "Run the instructions, or run register yourself below.",
  },
  {
    title: "Cancelled in the prompt",
    cause: "The gateway refused this connection, and the page stays where it is.",
    fix: "Return to the page, connect again, and choose Open in the prompt.",
  },
  {
    title: "The program exits immediately",
    cause: "The agent command is not on PATH, or the node path recorded at registration is stale.",
    fix: "Read the mukae error in the terminal. If the path is stale, run register again.",
  },
  {
    title: "The page says there is no configuration",
    cause: "This agent type has no configuration yet. The page stays where it is.",
    fix: "Copy the instructions above and let the agent write the configuration.",
  },
];

export function Troubleshooting() {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-2xl font-semibold tracking-tight">Cannot connect</h2>
      <dl className="flex flex-col divide-y divide-zinc-200 border-y border-zinc-200">
        {cases.map((item) => (
          <div key={item.title} className="grid gap-2 py-5 sm:grid-cols-[12rem_1fr] sm:gap-8">
            <dt className="font-medium">{item.title}</dt>
            <dd className="flex flex-col gap-1.5 text-zinc-600">
              <span>{item.cause}</span>
              <span className="text-zinc-900">{item.fix}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
