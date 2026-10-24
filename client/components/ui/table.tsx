'use client';

import * as React from 'react';
import { cn } from 'cn';

/** Whether the element's content is wider than the element, kept up to date as either resizes. */
function useScrollsSideways(ref: React.RefObject<HTMLElement | null>) {
  const [scrolls, setScrolls] = React.useState(false);
  React.useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setScrolls(element.scrollWidth > element.clientWidth));
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, [ref]);
  return scrolls;
}

// On narrow screens the table scrolls sideways in its own container. While it does, the container
// takes keyboard focus so the arrow keys can scroll it, and is a region named like the table (pass
// aria-label, such as "Recent runs").
function Table({ className, 'aria-label': label, ...props }: React.ComponentProps<'table'>) {
  const container = React.useRef<HTMLDivElement>(null);
  const scrolls = useScrollsSideways(container);
  return (
    <div
      ref={container}
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
      tabIndex={scrolls ? 0 : undefined}
      role={scrolls && label ? 'region' : undefined}
      aria-label={scrolls ? label : undefined}
    >
      <table
        data-slot="table"
        aria-label={label}
        className={cn('w-full caption-bottom text-13', className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('[&_tr]:border-b [&_tr]:border-hover', className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn('border-b border-raised transition-colors data-[state=selected]:bg-hover', className)}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'px-2.5 py-2 text-left align-middle text-xs font-medium whitespace-nowrap text-text-muted [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'p-2.5 align-middle whitespace-nowrap text-text-secondary [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption data-slot="table-caption" className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
