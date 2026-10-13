import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "cn";

export function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root className={cn("flex flex-col gap-4", className)} {...props} />;
}

/** A segmented control: the active tab sits on a solid block that slides between tabs. */
export function TabsList({ className, children, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List className={cn("relative z-0 inline-flex w-fit items-center gap-1 rounded-lg border border-input bg-card p-1", className)} {...props}>
      {children}
      <TabsPrimitive.Indicator className="absolute top-1/2 left-0 -z-1 h-(--active-tab-height) w-(--active-tab-width) translate-x-(--active-tab-left) -translate-y-1/2 rounded-md bg-primary transition-[translate,width] duration-200 ease-out" />
    </TabsPrimitive.List>
  );
}

export function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        "inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none select-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-active:text-primary-foreground [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel className={cn("outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)} {...props} />;
}
