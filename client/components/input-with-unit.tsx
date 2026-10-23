import { cn } from 'cn';

/**
 * A number with its unit after it (20 m, 104°, 1080 RPM): the number in JetBrains Mono, the unit in
 * text-muted. The frame takes the focus ring. size="sm" is the Studio's 34 px.
 */
function InputWithUnit({
  className,
  unit,
  size = 'default',
  ...props
}: Omit<React.ComponentProps<'input'>, 'size'> & { unit: string; size?: 'default' | 'sm' }) {
  return (
    <span
      data-slot="input-with-unit"
      className={cn(
        'flex h-control items-center gap-2 rounded-control-lg border border-field bg-inset px-3 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-volt',
        size === 'sm' && 'h-control-sm rounded-control px-2.5 text-[13px]',
        className,
      )}
    >
      <input
        type="number"
        className="w-full min-w-0 [appearance:textfield] bg-transparent font-mono text-text outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        {...props}
      />
      <span className="text-text-muted">{unit}</span>
    </span>
  );
}

export { InputWithUnit };
