import * as React from 'react';
import { cn } from 'cn';
import { Tabs as TabsPrimitive } from 'radix-ui';

// Tabs switch between panels (the Studio's capture methods): equal-width tabs on an inset track; the
// selected tab fills with divider and its text turns bright (the text change and aria-selected
// carry the state).
function Tabs({ className, orientation = 'horizontal', ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn('group/tabs flex gap-3.5 data-[orientation=horizontal]:flex-col', className)}
      {...props}
    />
  );
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'grid auto-cols-fr grid-flow-col gap-0.5 rounded-card border border-divider bg-inset p-0.75 group-data-[orientation=vertical]/tabs:grid-flow-row',
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-tab cursor-pointer items-center justify-center gap-1.5 rounded-segment px-2 text-13 font-semibold whitespace-nowrap text-text-secondary transition-colors disabled:cursor-not-allowed disabled:text-icon-disabled data-[state=active]:bg-divider data-[state=active]:text-text data-[state=inactive]:hover:text-text [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn('flex-1', className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
