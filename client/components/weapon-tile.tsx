import { cn } from 'cn';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { CrosshairPlaceholder } from '@/components/icons';

/** The loadout's weapon grid: two columns of tiles, one selected. Arrow keys move between tiles. */
function WeaponGrid({
  className,
  ...props
}: Omit<Extract<React.ComponentProps<typeof ToggleGroupPrimitive.Root>, { type: 'single' }>, 'type'>) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      data-slot="weapon-grid"
      className={cn('grid grid-cols-2 gap-2', className)}
      {...props}
    />
  );
}

/**
 * A weapon in the grid: its art (or the crosshair placeholder), its name as the game writes it and,
 * unless compact, its fire rate. Selected: a volt outline over volt-wash, where the fire rate turns
 * text-secondary (text-muted is 4.2:1 there).
 */
function WeaponTile({
  className,
  name,
  art,
  meta,
  compact = false,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & {
  name: string;
  /** Image URL; without it the placeholder shows */
  art?: string;
  /** The line under the name, such as "810 RPM" */
  meta?: string;
  /** 76 px without the meta line */
  compact?: boolean;
}) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="weapon-tile"
      className={cn(
        'group/tile flex cursor-pointer flex-col items-center justify-center gap-1 rounded-card border border-outline-card bg-card p-2 text-center text-text transition-colors data-[state=off]:hover:bg-hover data-[state=on]:border-volt data-[state=on]:bg-volt-wash',
        compact ? 'h-19' : 'h-tile',
        className,
      )}
      {...props}
    >
      {/* Lazy: a grid of 31 tiles shouldn't fetch every image first (nor have the server preload them) */}
      {art ? (
        <img src={art} alt="" loading="lazy" className="h-8.5 max-w-full object-contain" />
      ) : (
        <CrosshairPlaceholder />
      )}
      <span className="type-label">{name}</span>
      {/* The space keeps "R-301 810 RPM" apart in the tile's name; flex layout doesn't render it */}
      {meta && !compact && ' '}
      {meta && !compact && (
        <span className="text-11 text-text-muted group-data-[state=on]/tile:text-text-secondary">{meta}</span>
      )}
    </ToggleGroupPrimitive.Item>
  );
}

/** The selected weapon above the grid: art, name and its class and fire rate. */
function SelectedWeapon({
  className,
  name,
  art,
  meta,
  ...props
}: React.ComponentProps<'div'> & {
  name: string;
  art?: string;
  /** The line under the name, such as "Assault rifle · 810 RPM" */
  meta: React.ReactNode;
}) {
  return (
    <div
      data-slot="selected-weapon"
      className={cn('flex items-center gap-3.5 rounded-card-lg border border-outline-card bg-card p-3', className)}
      {...props}
    >
      <div className="flex h-14 w-28 shrink-0 items-center justify-center">
        {art ? (
          <img src={art} alt={name} className="max-h-14 max-w-28 object-contain" />
        ) : (
          <CrosshairPlaceholder className="size-10" />
        )}
      </div>
      <div className="min-w-0">
        <div className="type-weapon-name">{name}</div>
        <div className="mt-1 text-xs text-text-secondary">{meta}</div>
      </div>
    </div>
  );
}

export { WeaponGrid, WeaponTile, SelectedWeapon };
