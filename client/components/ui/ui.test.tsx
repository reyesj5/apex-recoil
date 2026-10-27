import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './badge';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';
import { Slider } from './slider';
import { Table, TableBody, TableCell, TableRow } from './table';
import { Tabs, TabsList, TabsTrigger } from './tabs';
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

  it("outlines a neutral group's selected item in field, since its fill stands only 1.4:1 off the track", () => {
    render(
      <ToggleGroup type="single" variant="neutral" aria-label="Fire mode" defaultValue="auto">
        <ToggleGroupItem value="auto">Auto</ToggleGroupItem>
        <ToggleGroupItem value="single">Single</ToggleGroupItem>
      </ToggleGroup>,
    );
    for (const item of screen.getAllByRole('radio')) {
      expect(item).toHaveClass('data-[state=on]:inset-ring', 'data-[state=on]:inset-ring-field');
    }
  });
});

describe('Tabs', () => {
  it('outlines the selected tab in field, like a neutral segmented control', () => {
    render(
      <Tabs defaultValue="live">
        <TabsList aria-label="Capture method">
          <TabsTrigger value="live">Live</TabsTrigger>
          <TabsTrigger value="manual">Manual</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveClass('data-[state=active]:inset-ring', 'data-[state=active]:inset-ring-field');
    }
  });
});

describe('Dialog', () => {
  it("rounds the close button as the Design System's dialog does (radius-sm)", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Changes apply at once and stay in this browser.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('rounded-sm');
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
