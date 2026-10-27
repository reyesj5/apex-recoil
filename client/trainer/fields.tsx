import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

// The settings' fields: a number typed from the game, an option on or off. (A level set by feel, the
// slider, is in dialogs.tsx, the only place that uses one.)

export function Hint({ id, children }: { id: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="m-0 text-xs leading-normal text-text-muted">
      {children}
    </p>
  );
}

/**
 * A number the player types, such as the sensitivity: kept as typed while editing, stored as soon as
 * it is a number within range, shown as stored once the field loses focus.
 */
export function NumberField({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={draft ?? String(value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
        onBlur={() => setDraft(null)}
        className="[appearance:textfield] font-mono [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <Hint id={`${id}-hint`}>{hint}</Hint>
    </div>
  );
}

/** An option that applies at once; the whole row toggles */
export function SwitchField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="type-label text-text">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
