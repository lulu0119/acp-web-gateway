import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";

export function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root {...props} />;
}

/** A sheet of paper under a band that carries its title, like a section on the dashboard. */
export function DialogContent({ title, description, children, className }: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <DialogPrimitive.Popup
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto bg-card shadow-xl outline-none transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
          className,
        )}
      >
        <div className="band-brand flex min-h-12 items-center justify-between gap-4 px-5">
          <DialogPrimitive.Title className="band-title">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close className="-mr-2 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-white/90 hover:bg-white/15 hover:text-white" aria-label="Close">
            <XIcon className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="flex flex-col gap-5 p-6">
          {description ? <DialogPrimitive.Description className="text-sm text-muted-foreground">{description}</DialogPrimitive.Description> : null}
          {children}
        </div>
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}
