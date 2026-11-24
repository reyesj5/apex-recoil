import * as React from 'react';
import { cn } from 'cn';

// Surfaces. variant="panel": a page's side column (Loadout, Session), on panel with an outline line.
// variant="card": a card inside a panel, on card with an outline-card line. variant="well": an empty
// state with a dashed line that says what will appear.
const cardVariant = {
  panel: 'gap-3.5 rounded-panel border border-outline bg-panel p-4',
  card: 'gap-2.5 rounded-card-lg border border-outline-card bg-card p-3.5',
  well: 'min-h-18 items-center justify-center rounded-card border border-dashed border-outline-strong p-3 text-center text-xs leading-normal text-text-muted',
} as const;

function Card({
  className,
  variant = 'panel',
  ...props
}: React.ComponentProps<'div'> & { variant?: keyof typeof cardVariant }) {
  return (
    <div
      data-slot="card"
      data-variant={variant}
      className={cn('flex flex-col text-text', cardVariant[variant], className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex items-center justify-between gap-3 has-data-[slot=card-action]:justify-between', className)}
      {...props}
    />
  );
}

/** The uppercase section label that opens a panel (Loadout, Session, Spec) */
function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-title" className={cn('type-section-label text-text-muted', className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-description" className={cn('text-xs text-text-muted', className)} {...props} />;
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-action" className={cn('shrink-0 text-xs text-text-muted', className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('flex flex-col gap-2.5', className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-footer" className={cn('flex items-center gap-2', className)} {...props} />;
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
