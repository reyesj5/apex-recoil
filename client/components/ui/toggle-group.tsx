'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';

// Picking one option (or several) at once:
// - segmented: a segmented control; the selected option fills with volt (mode, result style, period)
// - floating: the same on the range or in a page header, on the panel surface
// - neutral: a segmented control beside other volt accents (fire mode); the selected option fills
//   with divider, which stands only 1.4:1 off the track, so a 1 px field outline (3.6:1) marks it too
// - chips: filter chips that wrap (weapon class, with counts); volt outline when selected. At the
//   touch size (phones) they scroll sideways in one row, inset so the focus outline isn't clipped
// Radix lets a single-choice group be emptied by clicking the selected item: segmented controls
// should ignore an empty value in onValueChange.
const toggleGroupVariants = cva('flex w-fit items-center', {
  variants: {
    variant: {
      segmented: 'gap-0.5 rounded-card border border-divider bg-inset p-0.75',
      floating: 'gap-0.5 rounded-card border border-divider bg-panel p-0.75',
      neutral: 'gap-0.5 rounded-control-lg border border-divider bg-inset p-0.75',
      chips: 'flex-wrap gap-1.5',
    },
    size: {
      default: '',
      touch: '',
    },
  },
  compoundVariants: [
    {
      variant: 'chips',
      size: 'touch',
      className: '-m-1 max-w-[calc(100%+--spacing(2))] flex-nowrap overflow-x-auto p-1',
    },
  ],
  defaultVariants: {
    variant: 'segmented',
    size: 'default',
  },
});

const toggleGroupItemVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 text-xs font-semibold whitespace-nowrap text-text-secondary transition-colors disabled:cursor-not-allowed disabled:text-icon-disabled data-[state=off]:hover:bg-hover data-[state=off]:hover:text-text',
  {
    variants: {
      variant: {
        segmented: 'h-segment rounded-segment px-3 data-[state=on]:bg-volt data-[state=on]:text-volt-ink',
        floating: 'h-segment rounded-segment px-3 data-[state=on]:bg-volt data-[state=on]:text-volt-ink',
        neutral:
          'h-segment-sm rounded-sm px-3 data-[state=on]:bg-divider data-[state=on]:text-text data-[state=on]:inset-ring data-[state=on]:inset-ring-field',
        chips:
          'h-segment rounded-pill border border-divider bg-raised px-2.5 data-[state=on]:border-volt data-[state=on]:bg-volt-wash data-[state=on]:text-text',
      },
      size: {
        default: '',
        touch: 'h-touch px-3.5 text-13',
      },
    },
    defaultVariants: {
      variant: 'segmented',
      size: 'default',
    },
  },
);

type ToggleGroupStyle = VariantProps<typeof toggleGroupItemVariants>;

const ToggleGroupContext = React.createContext<ToggleGroupStyle>({ variant: 'segmented', size: 'default' });

function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> & ToggleGroupStyle) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      className={cn(toggleGroupVariants({ variant, size }), className)}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>{children}</ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & ToggleGroupStyle) {
  const context = React.useContext(ToggleGroupContext);

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      className={cn(
        toggleGroupItemVariants({ variant: context.variant || variant, size: context.size || size }),
        className,
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

/** The count after a filter chip's label (All 31, AR 5); text-secondary in the selected chip, whose volt-wash
 * leaves text-muted at 4.2:1 */
function ToggleGroupCount({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="toggle-group-count"
      className={cn('font-medium text-text-muted in-data-[state=on]:text-text-secondary', className)}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem, ToggleGroupCount, toggleGroupVariants, toggleGroupItemVariants };
