import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { server } from './msw';

// Guards the component test toolchain (React 19, Testing Library, user events, MSW) until the
// first real components arrive in Phase 1 of docs/ui-migration-plan.md.

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount(count + 1)}>
      Clicked {count}
    </button>
  );
}

function SpecNames() {
  const [names, setNames] = useState<string[]>([]);
  const load = async () => {
    const specs: { name: string }[] = await (await fetch('/api/specs')).json();
    setNames(specs.map((s) => s.name));
  };
  return (
    <div>
      <button type="button" onClick={load}>
        Load
      </button>
      <ul>
        {names.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </div>
  );
}

describe('component test toolchain', () => {
  it('renders React components and handles user events', async () => {
    render(<Counter />);
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('Clicked 1');
  });

  it('answers API requests with MSW handlers', async () => {
    server.use(http.get('/api/specs', () => HttpResponse.json([{ name: 'r301' }, { name: 'r99' }])));
    render(<SpecNames />);
    await userEvent.click(screen.getByRole('button', { name: 'Load' }));
    expect(await screen.findAllByRole('listitem')).toHaveLength(2);
  });
});
