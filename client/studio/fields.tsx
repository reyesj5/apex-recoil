import { useId, useState } from 'react';
import { cn } from 'cn';
import { InputWithUnit } from '@/components/input-with-unit';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// The Studio's fields and blocks, at its 34 px control size: numbers with their unit, selects, cards
// for related settings, and the section labels of the inspector.

/** A small uppercase heading (SPEC, LAYERS, COMPARE) */
export function SectionLabel({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="m-0 type-section-label text-text-muted">
      {children}
    </h3>
  );
}

/** A card of related settings with its title, and an aside on the right (badges, a count) */
export function Card({
  title,
  aside,
  className,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn('flex flex-col gap-2.5 rounded-card-lg border border-outline-card bg-card p-3.5', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={id} className="m-0 type-label">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * A number with its unit: kept as typed while editing, set as soon as it is a number within range,
 * shown as set once the field loses focus
 */
export function NumberField({
  label,
  unit,
  value,
  min,
  max,
  step = 1,
  onChange,
  className,
  ...props
}: {
  label: string;
  unit?: string;
  value: number | undefined;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
} & Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'size'>) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  return (
    // At the bottom of their cell: a row whose label wraps keeps its inputs in line
    <div className={cn('flex min-w-0 flex-col justify-end gap-1.5', className)}>
      <Label htmlFor={id} className="text-xs font-normal text-text-secondary">
        {label}
      </Label>
      <InputWithUnit
        id={id}
        size="sm"
        unit={unit ?? ''}
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={draft ?? (value === undefined ? '' : String(value))}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
        onBlur={() => setDraft(null)}
        {...props}
      />
    </div>
  );
}

/** A labeled select of a few options */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const id = useId();
  const current = options.find((o) => o.value === value);
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label id={id} className="text-xs font-normal text-text-secondary">
        {label}
      </Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger size="sm" aria-labelledby={id} className="w-full">
          <SelectValue>{current?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** A dashed box that says what will appear */
export function EmptyWell({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 rounded-card border border-dashed border-outline-strong p-4 text-center text-xs leading-normal text-text-muted">
      {children}
    </p>
  );
}

/** A result or a problem, in words, under the action that produced it */
export function Notice({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'positive' | 'warning' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        'rounded-card border px-3 py-2.5 text-xs leading-normal',
        tone === 'neutral' && 'border-divider bg-card text-text-secondary',
        tone === 'positive' && 'border-volt/40 bg-volt-wash text-text',
        tone === 'warning' && 'border-warning/40 bg-warning-wash text-text',
        tone === 'danger' && 'border-danger-line bg-danger-wash text-text',
      )}
    >
      {children}
    </div>
  );
}
