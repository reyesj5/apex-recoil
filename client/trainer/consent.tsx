import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ConsentBanner } from '@/components/consent-banner';
import { useAnalytics } from '@/lib/analytics';
import { site } from '@/lib/site';
import { useHydrated } from './hooks';

/**
 * Starts analytics on a public page (loading the tag if the player accepted before) and opens the
 * consent settings when the address ends in #cookies, as the footer's Cookie settings link does.
 */
export function useAnalyticsStart() {
  useEffect(() => {
    useAnalytics.getState().start();
    if (location.hash === '#cookies') useAnalytics.getState().reopen();
  }, []);
}

/**
 * Asks once whether analytics may run (only with a measurement ID and a privacy policy in site.json).
 * The choice is stored on the device, so the prompt shows only in the browser, after hydration.
 */
export function ConsentPrompt({ sheet }: { sheet: boolean }) {
  const { t } = useTranslation();
  const hydrated = useHydrated();
  const asking = useAnalytics((s) => s.asking);
  if (!hydrated || !asking) return null;
  const { accept, reject } = useAnalytics.getState();
  return (
    <ConsentBanner
      layout={sheet ? 'sheet' : 'card'}
      label={t('consent.label')}
      text={t('consent.text')}
      privacyLabel={t('consent.privacy')}
      privacyUrl={site.privacyUrl}
      rejectLabel={t('consent.reject')}
      acceptLabel={t('consent.accept')}
      onReject={reject}
      onAccept={accept}
      className={sheet ? 'fixed inset-x-3 bottom-3 z-40' : 'fixed right-5 bottom-5 z-40'}
    />
  );
}
