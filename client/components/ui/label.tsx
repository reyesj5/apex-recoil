import * as React from 'react';
import { cn } from 'cn';
import { Label as LabelPrimitive } from 'radix-ui';

// A field label: 12 px text-secondary, above its field (6 px apart in a column).
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-xs text-text-secondary select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:text-text-muted peer-disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  );
}

export { Label };
