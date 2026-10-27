import { cn } from 'cn';
import { Button } from '@/components/ui/button';

/**
 * Asks once whether analytics may run, with Reject and Accept given equal weight. A card in a bottom
 * corner on desktop; a bottom sheet with 44 px buttons on phones. Shown only where analytics runs
 * (the public trainer), never in the Studio.
 */
function ConsentBanner({
  className,
  layout = 'card',
  label,
  text,
  privacyLabel,
  privacyUrl,
  rejectLabel,
  acceptLabel,
  onReject,
  onAccept,
  ...props
}: React.ComponentProps<'div'> & {
  layout?: 'card' | 'sheet';
  /** The banner's accessible name, such as "Analytics cookies" */
  label: string;
  text: string;
  privacyLabel: string;
  privacyUrl?: string;
  rejectLabel: string;
  acceptLabel: string;
  onReject: () => void;
  onAccept: () => void;
}) {
  const sheet = layout === 'sheet';
  return (
    <div
      role="dialog"
      aria-label={label}
      data-slot="consent-banner"
      className={cn(
        'flex flex-col border border-outline-strong bg-raised',
        sheet ? 'gap-3 rounded-sheet p-4 shadow-sheet' : 'max-w-90 gap-2.5 rounded-panel p-3.5',
        className,
      )}
      {...props}
    >
      <p className={cn('m-0 leading-normal text-text-soft', sheet ? 'text-13' : 'text-xs')}>
        {text}{' '}
        {privacyUrl && (
          <a href={privacyUrl} className="text-volt underline underline-offset-2 hover:text-volt-bright">
            {privacyLabel}
          </a>
        )}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size={sheet ? 'touch' : 'default'}
          className={cn('flex-1 bg-panel', !sheet && 'h-icon')}
          onClick={onReject}
        >
          {rejectLabel}
        </Button>
        <Button size={sheet ? 'touch' : 'default'} className={cn('flex-1', !sheet && 'h-icon')} onClick={onAccept}>
          {acceptLabel}
        </Button>
      </div>
    </div>
  );
}

export { ConsentBanner };
