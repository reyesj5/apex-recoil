import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RunResult, ScoreCard, ScoreDelta } from './score-card';

describe('ScoreCard', () => {
  it('shows the last score out of 100', () => {
    render(<ScoreCard label="Last score" score={87} />);
    expect(screen.getByText('87')).toBeInTheDocument();
    expect(screen.getByText('/ 100')).toBeInTheDocument();
  });

  it('shows an en dash and the hint before the first run', () => {
    render(<ScoreCard label="Last score" hint="Your first run today shows up here." />);
    expect(screen.getByText('–')).toBeInTheDocument();
    expect(screen.getByText('Your first run today shows up here.')).toBeInTheDocument();
  });
});

describe('ScoreDelta', () => {
  it('shows the difference without a sign; the words say which way', () => {
    const { rerender } = render(<ScoreDelta delta={9}>above today’s median</ScoreDelta>);
    expect(screen.getByText('9')).toHaveClass('text-volt');
    rerender(<ScoreDelta delta={-4}>below today’s median</ScoreDelta>);
    expect(screen.getByText('4')).not.toHaveClass('text-volt');
    expect(screen.getByText('below today’s median')).toBeInTheDocument();
  });
});

describe('RunResult', () => {
  it('announces the score and offers Replay and Next run', async () => {
    const user = userEvent.setup();
    const onReplay = vi.fn();
    const onNext = vi.fn();
    render(
      <RunResult
        title="Run complete"
        score={87}
        delta={<ScoreDelta delta={9}>above today’s median</ScoreDelta>}
        meta="R-301 · Lv 2 magazine (28) · Follow path"
        replayLabel="Replay"
        nextLabel="Next run"
        onReplay={onReplay}
        onNext={onNext}
      />,
    );
    const result = screen.getByRole('status');
    expect(result).toHaveTextContent('Run complete');
    expect(result).toHaveTextContent('87/ 100');
    await user.click(screen.getByRole('button', { name: 'Replay' }));
    await user.click(screen.getByRole('button', { name: 'Next run' }));
    expect(onReplay).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('keeps volt for good results: a score below today’s median is neutral', () => {
    const card = (score: number, below?: boolean) => (
      <RunResult
        title="Run complete"
        score={score}
        below={below}
        meta="R-301"
        replayLabel="Replay"
        nextLabel="Next run"
      />
    );
    const { rerender } = render(card(87));
    expect(screen.getByText('87')).toHaveClass('text-volt');
    rerender(card(71, true));
    expect(screen.getByText('71')).toHaveClass('text-text');
    expect(screen.getByText('71')).not.toHaveClass('text-volt');
  });
});
