import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SelectedWeapon, WeaponGrid, WeaponTile } from './weapon-tile';

function Loadout({ compact = false }: { compact?: boolean }) {
  const [weapon, setWeapon] = useState('r301');
  return (
    <WeaponGrid aria-label="Weapon" value={weapon} onValueChange={(value) => value && setWeapon(value)}>
      <WeaponTile value="flatline" name="Flatline" art="/images/flatline.png" meta="600 RPM" compact={compact} />
      <WeaponTile value="r301" name="R-301" art="/images/r301.png" meta="810 RPM" compact={compact} />
      <WeaponTile value="nemesis" name="Nemesis" meta="582 RPM" compact={compact} />
    </WeaponGrid>
  );
}

describe('WeaponTile', () => {
  it('names each tile by its weapon and fire rate, and marks the selected one', () => {
    render(<Loadout />);
    expect(screen.getByRole('radiogroup', { name: 'Weapon' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'R-301 810 RPM' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Flatline 600 RPM' })).not.toBeChecked();
  });

  it('selects with a click, and with the arrow keys and Space', async () => {
    const user = userEvent.setup();
    render(<Loadout />);
    await user.click(screen.getByRole('radio', { name: /Flatline/ }));
    expect(screen.getByRole('radio', { name: /Flatline/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /R-301/ })).not.toBeChecked();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: /R-301/ })).toHaveFocus();
    await user.keyboard(' ');
    expect(screen.getByRole('radio', { name: /R-301/ })).toBeChecked();
  });

  it('keeps the art decorative and shows the placeholder for a weapon without art', () => {
    const { container } = render(<Loadout />);
    // The names are in the tiles, so the art has empty alt text and the placeholder is hidden
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(container.querySelectorAll('img[alt=""]')).toHaveLength(2);
    const nemesis = screen.getByRole('radio', { name: /Nemesis/ });
    expect(nemesis.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('leaves out the fire rate when compact', () => {
    render(<Loadout compact />);
    expect(screen.getByRole('radio', { name: 'R-301' })).toBeInTheDocument();
    expect(screen.queryByText('810 RPM')).toBeNull();
  });
});

describe('SelectedWeapon', () => {
  it('shows the art named by the weapon, and its class and fire rate', () => {
    render(<SelectedWeapon name="R-301" art="/images/r301.png" meta="Assault rifle · 810 RPM" />);
    expect(screen.getByRole('img', { name: 'R-301' })).toHaveAttribute('src', '/images/r301.png');
    expect(screen.getByText('Assault rifle · 810 RPM')).toBeInTheDocument();
  });
});
