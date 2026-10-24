import { useId } from 'react';
import { HistoryIcon, RotateCcwIcon, ScaleIcon, Undo2Icon } from 'lucide-react';
import { TierSizeInput, type Tier } from '@/components/tier-option';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSpecHistory } from '@/lib/api';
import { useEditorSettings } from '@/lib/storage/editor';
import { NumberField, SectionLabel, SelectField } from './fields';
import { shotInterval, tierNames, withMagazineSize, withRpm, type Spec } from './model/spec';
import { plural } from './names';
import {
  editSpec,
  isUnsaved,
  revert,
  savedOf,
  setComparing,
  setLayers,
  setShown,
  specOf,
  useStudio,
  type Shown,
} from './store';

// The inspector, right of the canvas: the spec (fire rate, multiplier, magazine sizes), the layers
// (the screenshot, the pattern, the optic's visual scale) and the comparison with the saved spec.

const tiers: Tier[] = ['base', 'level1', 'level2', 'level3', 'corrupted'];

export function Inspector() {
  const weapon = useEditorSettings((s) => s.weapon);
  const spec = useStudio((s) => specOf(s, weapon));
  return (
    <aside
      aria-label="Inspector"
      className="flex w-75 shrink-0 flex-col gap-5 overflow-y-auto border-l border-outline bg-panel p-4"
    >
      {spec ? <SpecSection spec={spec} /> : <p className="text-13 text-text-muted">Loading the specs…</p>}
      <LayersSection />
      <CompareSection />
    </aside>
  );
}

function SpecSection({ spec }: { spec: Spec }) {
  const id = useId();
  const name = spec.name;
  const samples = spec.sample_count || 1;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5">
      <SectionLabel id={id}>Spec</SectionLabel>
      <div className="grid grid-cols-2 gap-2.5">
        <NumberField
          label="Fire rate"
          unit="RPM"
          value={spec.rpm}
          min={1}
          max={2000}
          onChange={(rpm) => editSpec(name, (s) => withRpm(s, rpm))}
        />
        <NumberField
          label="Multiplier"
          value={spec.multiplier ?? 1}
          min={0.01}
          max={5}
          step={0.01}
          onChange={(multiplier) => editSpec(name, (s) => ({ ...s, multiplier }))}
        />
      </div>
      <div className="flex items-center justify-between gap-2 rounded-control bg-card px-2.5 py-2 text-xs text-text-secondary">
        <span>
          Shots <strong className="font-mono text-text">{spec.x.length}</strong>
        </span>
        <span>
          Interval <strong className="font-mono text-text">{shotInterval(spec.rpm)} ms</strong>
        </span>
        <span className="flex items-center gap-1">
          Samples <strong className="font-mono text-text">{samples}</strong>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Reset the sample count to 1"
                disabled={samples === 1}
                className="flex size-5 cursor-pointer items-center justify-center rounded-key text-text-muted hover:text-text disabled:cursor-default disabled:text-icon-disabled"
                onClick={() => editSpec(name, (s) => ({ ...s, sample_count: 1 }))}
              >
                <RotateCcwIcon className="size-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Reset the sample count to 1 (after a balance patch)</TooltipContent>
          </Tooltip>
        </span>
      </div>
      <MagazineSizes spec={spec} />
    </section>
  );
}

/** One field per magazine tier; a tier can be added after the last, and cleared from the last */
function MagazineSizes({ spec }: { spec: Spec }) {
  const id = useId();
  const mags = spec.mags;
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-2">
      <h4 id={id} className="m-0 type-label">
        Magazine sizes
      </h4>
      <div className="grid grid-cols-5 gap-1.5">
        {tiers.map((tier, i) => (
          <TierSizeInput
            key={`${spec.name}-${tier}-${mags[i]?.size ?? 'none'}`}
            tier={tier}
            name={tierNames[i]}
            aria-label={`${tierNames[i]} magazine size`}
            min={1}
            max={200}
            defaultValue={mags[i]?.size}
            placeholder={i === mags.length ? '+' : undefined}
            disabled={i > mags.length}
            onBlur={(e) => {
              const raw = e.target.value.trim();
              const size = raw === '' ? undefined : Number(raw);
              const next = withMagazineSize(spec, i, size);
              if (next === spec) e.target.value = mags[i] ? String(mags[i].size) : '';
              else editSpec(spec.name, () => next);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        ))}
      </div>
    </div>
  );
}

function LayersSection() {
  const id = useId();
  const layers = useStudio((s) => s.layers);
  const scaleFactor = useEditorSettings((s) => s.scaleFactor);
  const setScale = (value: number) => useEditorSettings.getState().set('scaleFactor', value);
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <SectionLabel id={id}>Layers</SectionLabel>
      <Layer
        label="Wall image"
        checked={layers.wall}
        onCheckedChange={(wall) => setLayers({ wall })}
        value={layers.wallOpacity}
        min={10}
        onValueChange={(wallOpacity) => setLayers({ wallOpacity })}
      />
      <Layer
        label="Pattern overlay"
        keys="P"
        checked={layers.pattern}
        onCheckedChange={(pattern) => setLayers({ pattern })}
        value={layers.patternOpacity}
        onValueChange={(patternOpacity) => setLayers({ patternOpacity })}
      />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span id={`${id}-scale`} className="flex-1 type-label text-text">
            Visual scale
          </span>
          <span className="font-mono text-13 text-text-secondary">{Math.round(scaleFactor * 100)}%</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Reset the visual scale to 100%"
                disabled={scaleFactor === 1}
                className="flex size-5 cursor-pointer items-center justify-center rounded-key text-text-muted hover:text-text disabled:cursor-default disabled:text-icon-disabled"
                onClick={() => setScale(1)}
              >
                <RotateCcwIcon className="size-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Reset to 100%</TooltipContent>
          </Tooltip>
        </div>
        <Slider
          aria-labelledby={`${id}-scale`}
          min={80}
          max={120}
          value={[Math.round(scaleFactor * 100)]}
          onValueChange={([v]) => setScale(v / 100)}
        />
        <p className="m-0 text-11 leading-normal text-text-muted">
          Fine-tunes the optic's scale on screenshots without measured decals.
        </p>
      </div>
    </section>
  );
}

function Layer({
  label,
  keys,
  checked,
  onCheckedChange,
  value,
  min = 0,
  onValueChange,
}: {
  label: string;
  keys?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  value: number;
  min?: number;
  onValueChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(c) => onCheckedChange(c === true)}
          aria-keyshortcuts={keys}
        />
        <Label htmlFor={id} className="flex-1 type-label text-text">
          {label}
        </Label>
        <span className="font-mono text-13 text-text-secondary">{value}%</span>
      </div>
      <Slider
        aria-label={`${label} opacity`}
        min={min}
        max={100}
        value={[value]}
        onValueChange={([v]) => onValueChange(v)}
      />
    </div>
  );
}

function CompareSection() {
  const id = useId();
  const weapon = useEditorSettings((s) => s.weapon);
  const shown = useStudio((s) => s.shown);
  const comparing = useStudio((s) => s.comparing);
  const session = useStudio((s) => s.session);
  const saved = useStudio((s) => savedOf(s, weapon));
  const unsaved = useStudio((s) => isUnsaved(s, weapon));
  const options: { value: Shown; label: string }[] = [
    { value: 'draft', label: session ? `Median of ${plural(session.sampleCount, 'sample')}` : 'Spec being edited' },
    ...(saved ? [{ value: 'saved' as const, label: 'Saved spec' }] : []),
    ...(session?.batch ? [{ value: 'batch' as const, label: 'New samples alone' }] : []),
    ...(session ? [{ value: 'decals' as const, label: 'Decals found on this spray' }] : []),
  ];
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5">
      <SectionLabel id={id}>Compare</SectionLabel>
      <SelectField label="Shown pattern" value={shown} options={options} onChange={setShown} />
      <Button
        variant="secondary"
        aria-pressed={comparing}
        aria-keyshortcuts="O"
        disabled={!saved}
        onClick={() => setComparing(!comparing)}
        className="aria-pressed:border-volt aria-pressed:bg-volt-wash"
      >
        <ScaleIcon aria-hidden="true" />
        {comparing ? 'Stop comparing' : 'Compare spec with candidate'}
      </Button>
      {unsaved && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => revert(weapon)}>
          <Undo2Icon aria-hidden="true" />
          Discard unsaved changes
        </Button>
      )}
      <SavedVersion weapon={weapon} />
    </section>
  );
}

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

/** The saved spec's version, with its history */
function SavedVersion({ weapon }: { weapon: string }) {
  const history = useSpecHistory(weapon);
  const versions = history.data ?? [];
  const active = versions.find((v) => v.is_active) ?? versions[0];
  if (!active) return <p className="m-0 text-xs text-text-muted">No saved versions yet.</p>;
  return (
    <p className="m-0 flex flex-wrap items-center gap-1 text-xs text-text-muted">
      Saved spec: version {active.version}, {dateFormat.format(new Date(active.created_at))}.
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="cursor-pointer text-volt underline underline-offset-2 hover:text-volt-bright"
          >
            History
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" aria-label={`Saved versions of ${weapon}`} className="w-80 p-0">
          <ol className="m-0 flex max-h-80 list-none flex-col overflow-y-auto p-1">
            {versions.map((v) => (
              <li key={v.id} className="flex items-start gap-2.5 rounded-control px-2.5 py-2 text-xs">
                <HistoryIcon className="mt-0.5 size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold text-text">
                    Version {v.version}
                    {v.is_active && <span className="ml-1.5 font-normal text-volt">current</span>}
                  </span>
                  <span className="text-text-secondary">
                    {dateFormat.format(new Date(v.created_at))} · {v.rpm} RPM · {plural(v.sample_count, 'sample')}
                  </span>
                  {v.notes && <span className="text-text-muted">{v.notes}</span>}
                </span>
              </li>
            ))}
          </ol>
        </PopoverContent>
      </Popover>
    </p>
  );
}
