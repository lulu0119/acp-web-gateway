import { OTPField as OTPFieldPrimitive } from "@base-ui/react/otp-field";
import { cn } from "cn";
import { Fragment } from "react";

/**
 * One box per character, split into groups with a dash between them, like a device code printed as `ABCD-EFGH`.
 * Pasting a whole code fills every box.
 */
export function OTPField({
  groups,
  className,
  ...props
}: Omit<OTPFieldPrimitive.Root.Props, "length"> & { groups: readonly number[] }) {
  const length = groups.reduce((sum, size) => sum + size, 0);
  let index = 0;
  return (
    <OTPFieldPrimitive.Root length={length} className={cn("flex w-full items-center gap-1.5 sm:gap-2", className)} {...props}>
      {groups.map((size, group) => (
        <Fragment key={group}>
          {group > 0 ? <OTPFieldPrimitive.Separator className="w-3 shrink-0 text-center text-muted-foreground">-</OTPFieldPrimitive.Separator> : null}
          {Array.from({ length: size }, () => {
            index += 1;
            return (
              <OTPFieldPrimitive.Input
                key={index}
                aria-label={index === 1 ? undefined : `Character ${index} of ${length}`}
                className="h-12 w-full max-w-12 min-w-0 flex-1 border-2 border-input bg-card text-center font-mono text-xl font-semibold uppercase caret-primary transition-[border-color,box-shadow] outline-none focus:border-primary focus:ring-3 focus:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-disabled:opacity-50"
              />
            );
          })}
        </Fragment>
      ))}
    </OTPFieldPrimitive.Root>
  );
}
