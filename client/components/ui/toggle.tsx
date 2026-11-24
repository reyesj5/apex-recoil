'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { Toggle as TogglePrimitive } from 'radix-ui';

// A button that stays pressed. tool: a Studio tool, no frame, volt while active. outline: an icon
// button that toggles (sound, hints), with the outline button's frame and a volt outline while on.
const toggleVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 text-sm font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:text-icon-disabled [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4.5",
  {
    variants: {
      variant: {
        tool: 'rounded-control text-text-secondary data-[state=off]:hover:bg-hover data-[state=off]:hover:text-text data-[state=on]:bg-volt data-[state=on]:text-volt-ink',
        outline:
          'rounded-control border border-divider bg-panel text-text-secondary data-[state=off]:hover:bg-hover data-[state=off]:hover:text-text data-[state=on]:border-volt data-[state=on]:bg-volt-wash data-[state=on]:text-text',
      },
      size: {
        default: 'size-icon',
        control: 'size-control',
        touch: 'size-touch rounded-card',
      },
    },
    defaultVariants: {
      variant: 'tool',
      size: 'default',
    },
  },
);

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root data-slot="toggle" className={cn(toggleVariants({ variant, size, className }))} {...props} />
  );
}

export { Toggle, toggleVariants };
