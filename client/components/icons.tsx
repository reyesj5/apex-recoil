import { cn } from 'cn';
import logoUrl from '../../brand/spraydown-logo.svg';
import { site } from '@/lib/site';

// The brand and app-specific icons. Generic icons come from lucide-react; game art (weapons) stays
// as images in assets/images.

/** The logo (mark and wordmark) for dark surfaces, from brand/spraydown-logo.svg */
function SpraydownLogo({ className, ...props }: React.ComponentProps<'img'>) {
  return <img src={logoUrl} alt={site.name} className={cn('h-8 w-auto', className)} {...props} />;
}

/** The mark's five shot dots, drawn in currentColor (put it on a volt square for the app icon) */
function SpraydownDots({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true" className={className} {...props}>
      <circle cx="16" cy="19.95" r="4.6" />
      <circle cx="48" cy="19.95" r="4.6" />
      <circle cx="24" cy="30.95" r="5.2" />
      <circle cx="40" cy="30.95" r="5.2" />
      <circle cx="32" cy="42.45" r="6.2" />
    </svg>
  );
}

/** Shown for a weapon without art, in icon-disabled */
function CrosshairPlaceholder({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
      className={cn('size-7.5 text-icon-disabled', className)}
      {...props}
    >
      <circle cx="12" cy="12" r="8" />
      <line x1="22" x2="17" y1="12" y2="12" />
      <line x1="7" x2="2" y1="12" y2="12" />
      <line x1="12" x2="12" y1="7" y2="2" />
      <line x1="12" x2="12" y1="22" y2="17" />
    </svg>
  );
}

export { SpraydownLogo, SpraydownDots, CrosshairPlaceholder };
