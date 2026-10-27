import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TierGroup, TierOption, TierSizeInput } from './tier-option';

const magazines = [
  { tier: 'base', size: 21, name: 'Base', label: 'Base magazine, 21 rounds' },
  { tier: 'level2', size: 28, name: 'Lv 2', label: 'Level 2 magazine, 28 rounds' },
  { tier: 'corrupted', size: 37, name: 'Corrupted', label: 'Corrupted magazine, 37 rounds' },
] as const;

function Magazines({ touch = false }: { touch?: boolean }) {
  return (
    <TierGroup aria-label="Magazine" count={magazines.length} defaultValue="level2">
      {magazines.map((m) => (
        <TierOption
          key={m.tier}
          value={m.tier}
          tier={m.tier}
          size={m.size}
          name={m.name}
          aria-label={m.label}
          touch={touch}
        />
      ))}
    </TierGroup>
  );
}

describe('TierOption', () => {
  it('names each magazine in words and marks the selected one', () => {
    render(<Magazines />);
    expect(screen.getByRole('radio', { name: 'Level 2 magazine, 28 rounds' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Base magazine, 21 rounds' })).not.toBeChecked();
    expect(screen.getByText('Corrupted')).toBeInTheDocument();
  });

  it('lays the options out in one row', () => {
    render(<Magazines />);
    expect(screen.getByRole('radiogroup', { name: 'Magazine' })).toHaveStyle({
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    });
  });

  it('selects another magazine with a click', async () => {
    const user = userEvent.setup();
    render(<Magazines />);
    await user.click(screen.getByRole('radio', { name: /Corrupted/ }));
    expect(screen.getByRole('radio', { name: /Corrupted/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Level 2/ })).not.toBeChecked();
  });

  it('leaves out the tier name at the touch size', () => {
    render(<Magazines touch />);
    expect(screen.getByText('37')).toBeInTheDocument();
    expect(screen.queryByText('Corrupted')).toBeNull();
  });
});

describe('TierSizeInput', () => {
  it('is a number field named by its tier', async () => {
    const user = userEvent.setup();
    render(<TierSizeInput tier="level1" name="Lv 1" defaultValue={21} />);
    const field = screen.getByRole('spinbutton', { name: 'Lv 1' });
    expect(field).toHaveValue(21);
    await user.clear(field);
    await user.type(field, '23');
    expect(field).toHaveValue(23);
  });
});
