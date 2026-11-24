import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConsentBanner } from './consent-banner';

const text = 'We use Google Analytics cookies to see how the trainer is used. Nothing is tracked unless you accept.';

function banner(props: Partial<React.ComponentProps<typeof ConsentBanner>> = {}) {
  const handlers = { onReject: vi.fn(), onAccept: vi.fn() };
  render(
    <ConsentBanner
      label="Analytics cookies"
      text={text}
      privacyLabel="Privacy policy"
      privacyUrl="/privacy"
      rejectLabel="Reject"
      acceptLabel="Accept"
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('ConsentBanner', () => {
  it('asks with its text and links the privacy policy', () => {
    banner();
    const dialog = screen.getByRole('dialog', { name: 'Analytics cookies' });
    expect(dialog).toHaveTextContent(text);
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy');
  });

  it('calls the handler of the button pressed', async () => {
    const user = userEvent.setup();
    const { onReject, onAccept } = banner();
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onReject).toHaveBeenCalledOnce();
    expect(onAccept).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it('gives Reject and Accept the same size, 44 px on the phone sheet', () => {
    banner({ layout: 'sheet' });
    expect(screen.getByRole('button', { name: 'Reject' })).toHaveClass('h-touch', 'flex-1');
    expect(screen.getByRole('button', { name: 'Accept' })).toHaveClass('h-touch', 'flex-1');
  });

  it('leaves the link out until there is a privacy policy', () => {
    banner({ privacyUrl: undefined });
    expect(screen.queryByRole('link')).toBeNull();
  });
});
