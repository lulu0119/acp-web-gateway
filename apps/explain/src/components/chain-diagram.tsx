const hops = [
  { name: "Web page", note: "Starts the connection" },
  { name: "Browser prompt", note: "mukae://" },
  { name: "Local gateway", note: "127.0.0.1" },
  { name: "Agent", note: "stdin / stdout" },
];

export function ChainDiagram() {
  return (
    <figure>
      <div className="relative pt-2">
        <div className="absolute top-[11px] right-3 left-3 h-px bg-zinc-300" />
        <div className="travel-dot absolute top-[7px] size-[9px] -translate-x-1/2 rounded-full bg-zinc-900" />
        <ol className="relative grid grid-cols-4 gap-2">
          {hops.map((hop) => (
            <li key={hop.name} className="flex flex-col gap-1">
              <span className="size-[9px] rounded-full border border-zinc-900 bg-[#f6f7fb]" />
              <span className="mt-4 text-sm font-medium">{hop.name}</span>
              <span className="font-mono text-xs text-zinc-500">{hop.note}</span>
            </li>
          ))}
        </ol>
      </div>
    </figure>
  );
}
