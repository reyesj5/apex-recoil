import { useState } from 'react';
import { ChevronDownIcon, CrosshairIcon, KeyboardIcon, PlusIcon, Redo2Icon, Undo2Icon } from 'lucide-react';
import { SpraydownLogo } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditorSettings } from '@/lib/storage/editor';
import { weapons as classNames } from '@/locales/en.json';
import { weaponClasses, weaponEntry, weaponPosition } from '@/trainer/weapon-list';
import { trainerHref } from '@/trainer/links';
import { requestSave } from './actions';
import { fireModeName, weaponClassName, weaponName } from './names';
import { isUnsaved, openDialog, redoEdit, selectWeapon, specOf, undoEdit, useStudio } from './store';

// The Studio's top bar: the logo with the Studio tag, the weapon picker, and on the right the
// unsaved-changes badge, undo and redo, the shortcuts and Save spec.

export function StudioTopBar() {
  const weapon = useEditorSettings((s) => s.weapon);
  const unsaved = useStudio((s) => isUnsaved(s, weapon));
  const canUndo = useStudio((s) => s.history.past.length > 0);
  const canRedo = useStudio((s) => s.history.future.length > 0);
  const loaded = useStudio((s) => s.saved !== null);

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-outline bg-inset px-4 py-2.5">
      <a
        href={trainerHref('en')}
        aria-label="Spraydown Studio, back to the trainer"
        className="flex items-center gap-2.5 rounded-control"
      >
        <SpraydownLogo className="h-7.5" />
        <Badge variant="tag">Studio</Badge>
      </a>
      <span aria-hidden="true" className="h-7 w-px bg-divider" />
      <WeaponPicker />
      <div className="ml-auto flex items-center gap-2">
        {unsaved && (
          <Badge variant="warning" size="lg" dot role="status">
            Unsaved changes
          </Badge>
        )}
        <IconButton label="Undo" keys="Ctrl Z" disabled={!canUndo} onClick={() => undoEdit(weapon)}>
          <Undo2Icon aria-hidden="true" />
        </IconButton>
        <IconButton label="Redo" keys="Ctrl Y" disabled={!canRedo} onClick={() => redoEdit(weapon)}>
          <Redo2Icon aria-hidden="true" />
        </IconButton>
        <IconButton label="Keyboard shortcuts" keys="?" onClick={() => openDialog({ kind: 'shortcuts' })}>
          <KeyboardIcon aria-hidden="true" />
        </IconButton>
        <Button size="sm" disabled={!loaded} onClick={requestSave} aria-keyshortcuts="Control+S">
          Save spec
          <Kbd variant="inset">Ctrl S</Kbd>
        </Button>
      </div>
    </header>
  );
}

function IconButton({
  label,
  keys,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { label: string; keys: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        <Kbd>{keys}</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}

/** The selected weapon, with its art, class, fire mode and fire rate; opens the list of weapons */
function WeaponPicker() {
  const [open, setOpen] = useState(false);
  const weapon = useEditorSettings((s) => s.weapon);
  const spec = useStudio((s) => specOf(s, weapon));
  const mode = useStudio((s) => s.mode);
  const saved = useStudio((s) => s.saved);
  const drafts = useStudio((s) => s.drafts);
  const { art } = weaponEntry(weapon);
  const meta = [weaponClassName(weapon), fireModeName(mode), spec ? `${spec.rpm} RPM` : undefined].filter(Boolean);

  const names = [...new Set([...(saved ?? []).map((s) => s.name), ...Object.keys(drafts)])].sort(
    (a, b) => weaponPosition(a) - weaponPosition(b),
  );
  const groups = [
    ...weaponClasses.map((c) => ({
      heading: classNames.classLong[c],
      ids: names.filter((n) => weaponEntry(n).weaponClass === c),
    })),
    { heading: 'Other', ids: names.filter((n) => !weaponEntry(n).weaponClass) },
  ].filter((g) => g.ids.length > 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-control-lg min-w-0 cursor-pointer items-center gap-2.5 rounded-control-lg border border-divider bg-panel px-2.5 transition-colors hover:bg-hover"
        >
          <span className="sr-only">Weapon: </span>
          {art ? (
            <img src={art} alt="" className="h-5.5 w-13.5 object-contain" />
          ) : (
            <CrosshairIcon className="size-5 text-text-muted" aria-hidden="true" />
          )}
          <span className="text-sm font-semibold">{weaponName(weapon)}</span>
          <span className="truncate text-13 text-text-muted">{meta.join(' · ')}</span>
          <span className="sr-only">. Change weapon</span>
          <ChevronDownIcon className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Find a weapon" aria-label="Find a weapon" />
          <CommandList className="max-h-96">
            <CommandEmpty>No weapon by that name.</CommandEmpty>
            {groups.map((g) => (
              <CommandGroup key={g.heading} heading={g.heading}>
                {g.ids.map((id) => {
                  const s = specOf({ saved, drafts }, id);
                  return (
                    <CommandItem
                      key={id}
                      value={`${weaponName(id)} ${id}`}
                      data-checked={id === weapon}
                      onSelect={() => {
                        selectWeapon(id);
                        setOpen(false);
                      }}
                    >
                      <span className={id === weapon ? 'font-semibold text-text' : undefined}>{weaponName(id)}</span>{' '}
                      <span className="ml-auto font-mono text-xs text-text-muted">
                        {s ? `${s.x.length} shots · ${s.rpm} RPM` : ''}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
            <CommandGroup>
              <CommandItem
                value="New weapon"
                onSelect={() => {
                  setOpen(false);
                  openDialog({ kind: 'new-weapon' });
                }}
              >
                <PlusIcon aria-hidden="true" />
                New weapon…
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
