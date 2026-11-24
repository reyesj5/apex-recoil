'use client';

import * as React from 'react';
import { cn } from 'cn';
import { Switch as SwitchPrimitive } from 'radix-ui';

// A setting that applies at once (corrupted stock): 36 x 20, the track field when off and volt when
// on, a 16 px ground thumb.
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-pill p-0.5 transition-colors disabled:cursor-not-allowed data-[state=checked]:bg-volt data-[state=unchecked]:bg-field',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 rounded-full bg-ground transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
