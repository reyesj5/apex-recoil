import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { Slot } from 'radix-ui';

// The design system's Button. One primary (default) per area; secondary, ghost and destructive for
// the rest; outline is the frame of icon buttons. Sizes are the control heights: 38 px by default,
// 34 px in the Studio (sm), 36 px in the top bar (compact), 40 px for link buttons in panels (lg),
// 44 px on phones (touch).
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2.5 rounded-control-lg border border-transparent text-sm font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:text-icon-disabled aria-invalid:border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4.5",
  {
    variants: {
      variant: {
        default: 'bg-volt font-bold text-volt-ink hover:bg-volt-bright disabled:bg-hover',
        secondary: 'border-outline-strong bg-raised text-text hover:bg-hover',
        ghost: 'text-text-secondary hover:bg-hover hover:text-text',
        destructive: 'border-danger-line bg-danger-wash text-danger',
        outline: 'border-divider bg-panel text-text-secondary hover:bg-hover hover:text-text',
        link: 'text-volt underline-offset-4 hover:text-volt-bright hover:underline',
      },
      size: {
        default: 'h-control px-3.5',
        sm: "h-control-sm gap-2 rounded-control px-3 text-[13px] [&_svg:not([class*='size-'])]:size-4",
        compact: 'h-icon rounded-control px-3',
        lg: 'h-control-lg rounded-card px-3.5',
        touch: 'h-touch rounded-card px-3.5',
        icon: 'size-control',
        'icon-sm': "size-control-sm rounded-control [&_svg:not([class*='size-'])]:size-4",
        'icon-compact': 'size-icon rounded-control',
        'icon-touch': 'size-touch rounded-card',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
