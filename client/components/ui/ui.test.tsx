import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './badge';
import { Slider } from './slider';
import { Table, TableBody, TableCell, TableRow } from './table';
import { ToggleGroup, ToggleGroupCount, ToggleGroupItem } from './toggle-group';

// What our versions of the shadcn/ui components add to the generated code.

describe('Slider', () => {
  it('names its thumb, which carries the slider role', () => {
    render(<Slider aria-label="Wall image opacity" defaultValue={[80]} />);
    expect(screen.getByRole('slider', { name: 'Wall image opacity' })).toHaveAttribute('aria-valuenow', '80');
  });
});

describe('ToggleGroup', () => {
  it('names a chip by its label and count', () => {
    render(
      <ToggleGroup type="single" variant="chips" aria-label="Weapon class" defaultValue="ar">
        <ToggleGroupItem value="all">
          All <ToggleGroupCount>31</ToggleGroupCount>
        </ToggleGroupItem>
        <ToggleGroupItem value="ar">
          AR <ToggleGroupCount>5</ToggleGroupCount>
        </ToggleGroupItem>
      </ToggleGroup>,
    );
    expect(screen.getByRole('radio', { name: 'AR 5' })).toBeChecked();
  });

  it('scrolls touch chips sideways in one row, and wraps the others', () => {
    const { rerender } = render(
      <ToggleGroup type="single" variant="chips" size="touch" aria-label="Weapon">
        <ToggleGroupItem value="r301">R-301</ToggleGroupItem>
      </ToggleGroup>,
    );
    expect(screen.getByRole('radiogroup')).toHaveClass('flex-nowrap', 'overflow-x-auto');
    expect(screen.getByRole('radio')).toHaveClass('h-touch');
    rerender(
      <ToggleGroup type="single" variant="chips" aria-label="Weapon">
        <ToggleGroupItem value="r301">R-301</ToggleGroupItem>
      </ToggleGroup>,
    );
    expect(screen.getByRole('radiogroup')).toHaveClass('flex-wrap');
    expect(screen.getByRole('radiogroup')).not.toHaveClass('overflow-x-auto');
  });
});

describe('Badge', () => {
  it('says the state in words; the dot is decoration', () => {
    const { container } = render(
      <Badge variant="warning" dot>
        Unsaved changes
      </Badge>,
    );
    expect(screen.getByText('Unsaved changes')).toHaveClass('text-warning');
    expect(container.querySelector('[aria-hidden="true"]')).toHaveClass('bg-warning');
  });
});

describe('Table', () => {
  it('names the table, and stays out of the tab order while it fits', () => {
    render(
      <Table aria-label="Recent runs">
        <TableBody>
          <TableRow>
            <TableCell>R-301</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole('table', { name: 'Recent runs' })).toBeInTheDocument();
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.getByRole('table').parentElement).not.toHaveAttribute('tabindex');
  });
});
