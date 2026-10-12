import { cn } from "cn";

/** The person's GitHub avatar, or their initial when GitHub gave none. */
export function Avatar({ name, image, className }: { name: string; image?: string; className?: string }) {
  const base = cn("inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold", className);
  if (image) return <img src={image} alt="" referrerPolicy="no-referrer" className={cn(base, "object-cover")} />;
  return <span className={base} aria-hidden>{(name.trim().charAt(0) || "?").toUpperCase()}</span>;
}
