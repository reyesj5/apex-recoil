import { cn } from 'cn';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';

/** Magazine tiers in game order. A weapon with one magazine shows one `base` option, named Standard. */
type Tier = 'base' | 'level1' | 'level2' | 'level3' | 'corrupted';

// Complete class names, so Tailwind finds them
const tierBar: Record<Tier, string> = {
  base: 'bg-tier-base',
  level1: 'bg-tier-1',
  level2: 'bg-tier-2',
  level3: 'bg-tier-3',
  corrupted: 'bg-tier-corrupted',
};

/** The magazine picker: one option per magazine the weapon has, in one row. */
function TierGroup({
  className,
  count,
  ...props
}: Omit<Extract<React.ComponentProps<typeof ToggleGroupPrimitive.Root>, { type: 'single' }>, 'type'> & {
  /** How many options, for the column count */
  count: number;
}) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      data-slot="tier-group"
      className={cn('grid gap-1.5', className)}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      {...props}
    />
  );
}

/**
 * A magazine: a 3 px bar in the tier color, the capacity in JetBrains Mono and the tier name.
 * Selected: a volt outline over volt-wash. On phones (touch) it is 48 px high without the name.
 * Pass an aria-label that names the tier and capacity in words ("Level 2 magazine, 28 rounds").
 */
function TierOption({
  className,
  tier,
  size,
  name,
  touch = false,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & {
  tier: Tier;
  size: number;
  /** Base, Lv 1, Lv 2, Lv 3, Corrupted or Standard */
  name?: string;
  touch?: boolean;
}) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="tier-option"
      data-tier={tier}
      className={cn(
        'flex cursor-pointer flex-col gap-1.5 rounded-control-lg border border-divider bg-card px-1 pt-2 pb-[7px] text-center text-text transition-colors data-[state=off]:hover:bg-hover data-[state=on]:border-volt data-[state=on]:bg-volt-wash',
        touch && 'h-12 items-center justify-center rounded-card py-1.5',
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className={cn('block h-0.75 w-full rounded-[2px]', tierBar[tier])} />
      <span className={cn('type-readout', touch && 'text-sm')}>{size}</span>
      {name && !touch && <span className="type-micro text-text-secondary">{name}</span>}
    </ToggleGroupPrimitive.Item>
  );
}

/** A magazine size to edit in the Studio inspector: the tier bar over a number field, the name below. */
function TierSizeInput({
  className,
  tier,
  name,
  ...props
}: React.ComponentProps<'input'> & { tier: Tier; name: string }) {
  return (
    <label className={cn('flex flex-col gap-[5px] text-center type-micro text-text-secondary', className)}>
      <span aria-hidden="true" className={cn('block h-0.75 w-full rounded-[2px]', tierBar[tier])} />
      <input
        type="number"
        className="h-tab w-full rounded-segment border border-field bg-inset text-center font-mono text-xs text-text"
        {...props}
      />
      {name}
    </label>
  );
}

export { TierGroup, TierOption, TierSizeInput, type Tier };
