import { lazy, Suspense } from 'react';
import type { i18n } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Locale } from '@/lib/i18n';
import { ConsentPrompt, useAnalyticsStart } from './consent';
import { useHotkeys, useMediaQuery, useStoredSettings } from './hooks';
import { LoadoutPanel } from './loadout-panel';
import { actions } from './loadout';
import { PhoneViewer } from './phone-viewer';
import { RangePanel } from './range-panel';
import { SessionPanel } from './session-panel';
import { openDialog, useSession } from './session';
import { TopBar } from './top-bar';

// Settings, help and the weapon search load the first time one opens
const Dialogs = lazy(() => import('./dialogs'));

/** The trainer (docs/ui-redesign.md): loadout, range and session on a computer, the pattern viewer on a phone */
export function TrainerApp({ i18n, locale }: { i18n: i18n; locale: Locale }) {
  return (
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <Trainer locale={locale} />
      </TooltipProvider>
    </I18nextProvider>
  );
}

function Trainer({ locale }: { locale: Locale }) {
  // The range needs a mouse and room; phones get the pattern viewer. CSS picks the layout, so the
  // first render is the same everywhere; only the range's canvas waits for a wide screen.
  const wide = useMediaQuery('(min-width: 48rem)');
  const dialogsWanted = useSession((s) => s.dialogsWanted);
  useStoredSettings();
  useAnalyticsStart();

  useHotkeys({
    b: actions.toggleFireMode,
    a: () => actions.setPractice('path'),
    s: () => actions.setPractice('still'),
    d: () => actions.setPractice('moving'),
    'mod+k': () => openDialog('search'),
  });

  return (
    <>
      {/* On wide screens the page fits the window, so the range and its corners stay in view: the
          weapon grid takes the loadout's spare height and the session panel scrolls on its own */}
      <div className="hidden min-h-screen flex-col md:flex xl:h-screen">
        <TopBar locale={locale} page="train" />
        <div className="flex flex-1 flex-wrap items-stretch gap-4 px-5 pt-4 pb-5 xl:min-h-0 xl:flex-nowrap">
          <LoadoutPanel className="max-w-85 flex-[1_1_300px] xl:min-h-0 xl:overflow-y-auto" />
          <main className="flex min-w-0 flex-[999_1_560px]">
            <RangePanel live={wide} />
          </main>
          <SessionPanel locale={locale} className="max-w-80 flex-[1_1_260px] xl:min-h-0 xl:overflow-y-auto" />
        </div>
      </div>
      <PhoneViewer locale={locale} className="flex min-h-screen flex-col md:hidden" />
      <ConsentPrompt sheet={!wide} />
      {dialogsWanted && (
        <Suspense fallback={null}>
          <Dialogs />
        </Suspense>
      )}
    </>
  );
}
