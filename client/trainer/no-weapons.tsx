import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import type { Locale } from '@/lib/i18n';
import { ConsentPrompt, useAnalyticsStart } from './consent';
import { useMediaQuery } from './hooks';
import { LegalFooter } from './legal-footer';
import { TopBar } from './top-bar';

/**
 * What the trainer and the Patterns page show while no weapon is checked against the current game
 * patch, on a computer and on a phone: a new patch hides every weapon until it's checked against it.
 */
export function NoWeapons({ locale, page }: { locale: Locale; page: 'train' | 'patterns' }) {
  const { t } = useTranslation();
  const wide = useMediaQuery('(min-width: 48rem)');
  useAnalyticsStart();
  return (
    <>
      <div className="flex min-h-screen flex-col">
        <TopBar locale={locale} page={page} />
        <main className="mx-auto flex w-full max-w-340 flex-1 flex-col gap-5 px-5 pt-6 pb-8">
          <Card variant="card" className="max-w-160 items-start gap-3 p-6">
            <h1 className="m-0 type-heading">{t('noWeapons.title')}</h1>
            <p className="m-0 text-sm leading-normal text-text-secondary">{t('noWeapons.text')}</p>
          </Card>
          <LegalFooter className="mt-auto" />
        </main>
      </div>
      <ConsentPrompt sheet={!wide} />
    </>
  );
}
