import { createContext, useContext, useEffect, useState, type FormHTMLAttributes, type ReactNode } from "react";
import { Button } from "@exterior/ui/button";

type Pending = { submitter: string; start(submitter: string): void };

const PendingContext = createContext<Pending | undefined>(undefined);

/**
 * Shares one pending state between the forms inside it, so pressing Approve also disables Deny in its own form.
 * The browser still performs each submission and navigation; nothing here prevents it.
 */
export function PendingScope({ children }: { children: ReactNode }) {
  const [submitter, setSubmitter] = useState("");

  // Coming back through the browser's history restores the page from its cache with the pending state still set.
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setSubmitter("");
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  return <PendingContext.Provider value={{ submitter, start: setSubmitter }}>{children}</PendingContext.Provider>;
}

/**
 * A plain HTML form whose submit buttons show which one is running. Keep submitted values in hidden inputs, not on
 * the buttons: a button disabled during submission drops its own name and value.
 */
export function PendingForm({ children, ...props }: FormHTMLAttributes<HTMLFormElement> & { children: ReactNode }) {
  const scope = useContext(PendingContext);
  if (!scope) return <PendingScope><PendingForm {...props}>{children}</PendingForm></PendingScope>;
  return (
    <form
      {...props}
      onSubmit={(event) => {
        if (scope.submitter) {
          event.preventDefault();
          return;
        }
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        scope.start(submitter?.dataset.submitter ?? "form");
      }}
    >
      {children}
    </form>
  );
}

/** A submit button inside a `PendingForm`. It spins when it was the one pressed and is disabled while another runs. */
export function SubmitButton({ id, ...props }: Omit<Parameters<typeof Button>[0], "type" | "loading" | "id"> & { id: string }) {
  const submitter = useContext(PendingContext)?.submitter ?? "";
  return <Button type="submit" data-submitter={id} loading={submitter === id || submitter === "form"} disabled={submitter !== "" && submitter !== id} {...props} />;
}
