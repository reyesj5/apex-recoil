import { describe, expect, it } from 'vitest';
import { cn } from './utils';

// cn knows the design system's token names, so a class passed later replaces one of the same kind
// (shadcn components rely on this for className overrides) and classes of different kinds stay.

describe('cn', () => {
  it('lets a later token class replace one of the same kind', () => {
    expect(cn('bg-panel', 'bg-raised')).toBe('bg-raised');
    expect(cn('text-text-muted', 'text-volt')).toBe('text-volt');
    expect(cn('border-field', 'border-volt')).toBe('border-volt');
    expect(cn('rounded-card', 'rounded-panel')).toBe('rounded-panel');
    expect(cn('shadow-float', 'shadow-toast')).toBe('shadow-toast');
    expect(cn('h-control', 'h-touch')).toBe('h-touch');
    expect(cn('size-icon', 'size-touch')).toBe('size-touch');
    expect(cn('font-sans', 'font-display')).toBe('font-display');
    expect(cn('type-label', 'type-heading')).toBe('type-heading');
  });

  it('keeps classes of different kinds', () => {
    expect(cn('text-xs', 'text-volt')).toBe('text-xs text-volt');
    expect(cn('type-label', 'text-text-secondary')).toBe('type-label text-text-secondary');
    expect(cn('bg-volt', 'text-volt-ink', 'rounded-control', 'h-control')).toBe(
      'bg-volt text-volt-ink rounded-control h-control',
    );
  });

  it('still merges Tailwind classes and drops falsy values', () => {
    expect(cn('px-3', false, undefined, 'px-2.5')).toBe('px-2.5');
    expect(cn('p-4', { 'p-3': true, hidden: false })).toBe('p-3');
  });
});
