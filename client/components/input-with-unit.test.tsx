import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Label } from '@/components/ui/label';
import { InputWithUnit } from './input-with-unit';

describe('InputWithUnit', () => {
  it('is a number field with its unit after it', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Label htmlFor="distance">Distance</Label>
        <InputWithUnit id="distance" unit="m" defaultValue={20} />
      </>,
    );
    const field = screen.getByRole('spinbutton', { name: 'Distance' });
    expect(field).toHaveValue(20);
    expect(screen.getByText('m')).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, '25');
    expect(field).toHaveValue(25);
  });

  it('takes the Studio size', () => {
    render(<InputWithUnit aria-label="Fire rate" unit="RPM" size="sm" />);
    expect(screen.getByRole('spinbutton', { name: 'Fire rate' }).parentElement).toHaveClass('h-control-sm');
  });
});
