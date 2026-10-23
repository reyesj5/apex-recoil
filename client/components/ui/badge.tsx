import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { Slot } from 'radix-ui';

// Status badges: a state that lasts (unsaved changes, the capture connection, the trigger), always
// in words, with an optional dot. The tag variant names a product area, such as Studio.
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-pill whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        neutral: 'bg-hover text-text-secondary',
        warning: 'bg-warning-wash font-semibold text-warning',
        positive: 'bg-volt-wash font-semibold text-volt',
        tag: 'border border-outline-strong font-semibold tracking-[0.06em] text-text-secondary uppercase',
      },
      size: {
        default: 'h-badge px-2.5 text-xs',
        lg: 'h-segment px-2.5 text-xs',
        sm: 'gap-[5px] px-2 py-0.5 text-[11px]',
      },
    },
    compoundVariants: [{ variant: 'tag', className: 'h-auto px-2 py-0.5 text-[11px]' }],
    defaultVariants: {
      variant: 'neutral',
      size: 'default',
    },
  },
);

const dotColor = {
  neutral: 'bg-text-muted',
  warning: 'bg-warning',
  positive: 'bg-volt',
  tag: 'bg-text-muted',
} as const;

function Badge({
  className,
  variant = 'neutral',
  size = 'default',
  dot = false,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    /** A dot in the status color before the label */
    dot?: boolean;
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'span';
  const tone = variant ?? 'neutral';

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn('size-1.5 shrink-0 rounded-full', dotColor[tone], size === 'lg' && 'size-[7px]')}
        />
      )}
      {children}
    </Comp>
  );
}

export { Badge, badgeVariants };
