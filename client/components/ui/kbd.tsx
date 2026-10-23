import { cn } from 'cn';

// A keyboard key: JetBrains Mono 11 px, text-secondary, an outline-strong line. Inside a tooltip
// it is plain mono text; inside a primary button pass variant="inset".
function Kbd({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'kbd'> & { variant?: 'default' | 'inset' }) {
  return (
    <kbd
      data-slot="kbd"
      data-variant={variant}
      className={cn(
        'pointer-events-none inline-flex w-fit items-center justify-center gap-1 font-mono font-medium whitespace-nowrap select-none',
        variant === 'default' &&
          'rounded-key border border-outline-strong px-1.5 py-0.5 text-[11px] leading-[1.3] text-text-secondary',
        variant === 'inset' && 'rounded-key-inset bg-volt-ink-wash px-[5px] py-px text-[10px] text-current',
        '[[data-slot=tooltip-content]_&]:ml-1 [[data-slot=tooltip-content]_&]:border-0 [[data-slot=tooltip-content]_&]:p-0 [[data-slot=tooltip-content]_&]:text-xs [[data-slot=tooltip-content]_&]:text-current',
        "[&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return <kbd data-slot="kbd-group" className={cn('inline-flex items-center gap-1', className)} {...props} />;
}

export { Kbd, KbdGroup };
