import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatGrid, StatTile, SummaryTile } from './stat-tile';

describe('StatTile', () => {
  it('pairs each number with its label', () => {
    render(
      <StatGrid>
        <StatTile label="Tries" value={12} />
        <StatTile label="Median" value={78} />
      </StatGrid>,
    );
    const terms = screen.getAllByRole('term').map((term) => term.textContent);
    const values = screen.getAllByRole('definition').map((value) => value.textContent);
    expect(terms).toEqual(['Tries', 'Median']);
    expect(values).toEqual(['12', '78']);
  });

  it('shows an en dash before the first run, but a zero as a zero', () => {
    render(
      <StatGrid>
        <StatTile label="Tries" value={0} />
        <StatTile label="Best today" />
        <StatTile label="Median" value={null} />
      </StatGrid>,
    );
    expect(screen.getAllByRole('definition').map((value) => value.textContent)).toEqual(['0', '–', '–']);
  });

  it('puts a best score in volt', () => {
    render(
      <StatGrid>
        <StatTile label="All-time best" value={91} best />
        <StatTile label="Median" value={78} />
      </StatGrid>,
    );
    expect(screen.getByText('91')).toHaveClass('text-volt');
    expect(screen.getByText('78')).not.toHaveClass('text-volt');
  });
});

describe('SummaryTile', () => {
  it('shows the total with its note', () => {
    render(
      <dl>
        <SummaryTile label="Runs" value={253} note="last 30 days" />
      </dl>,
    );
    expect(screen.getByRole('term')).toHaveTextContent('Runs');
    expect(screen.getByRole('definition')).toHaveTextContent('253last 30 days');
  });
});
