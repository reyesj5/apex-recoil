'use client';

import { CheckIcon, InfoIcon, Loader2Icon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

// Toasts: raised with an outline-strong line, radius-card-lg, shadow-toast; the success icon is a
// volt check on a volt-wash-strong disc, the error icon a danger x on a danger-wash disc. One theme,
// so no theme switching.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      icons={{
        success: (
          <span className="flex size-[22px] items-center justify-center rounded-full bg-volt-wash-strong text-volt">
            <CheckIcon className="size-3.5" strokeWidth={3} />
          </span>
        ),
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: (
          <span className="flex size-[22px] items-center justify-center rounded-full bg-danger-wash text-danger">
            <XIcon className="size-3.5" strokeWidth={3} />
          </span>
        ),
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: 'gap-2.5! rounded-card-lg! border-outline-strong! bg-raised! px-3.5! py-3! text-text! shadow-toast!',
          description: 'text-text-secondary!',
          actionButton: 'bg-transparent! font-semibold! text-volt! hover:bg-hover!',
        },
      }}
      style={
        {
          '--normal-bg': 'var(--color-raised)',
          '--normal-text': 'var(--color-text)',
          '--normal-border': 'var(--color-outline-strong)',
          '--border-radius': 'var(--radius-card-lg)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
