import * as React from 'react';
import { cn } from 'cn';

// A text field: inset fill, a field border (3:1 or more on every surface), 38 px. In the Studio
// pass `h-control-sm rounded-control px-2.5 text-13`; numbers take `font-mono`.
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-control w-full min-w-0 rounded-control-lg border border-field bg-inset px-3 text-sm text-text transition-colors selection:bg-volt selection:text-volt-ink file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-text placeholder:text-text-muted disabled:cursor-not-allowed disabled:text-text-muted aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
