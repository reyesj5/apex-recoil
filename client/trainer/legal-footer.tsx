import { Trans, useTranslation } from 'react-i18next';
import { cn } from 'cn';
import { useAnalytics } from '@/lib/analytics';
import { site } from '@/lib/site';

/**
 * A link inside a sentence, underlined (its color alone doesn't set it apart). Translations fill in
 * its text, as in `<Trans components={{ link: <TextLink href=... /> }} />`.
 */
export function TextLink({
  href,
  children,
  tone = 'quiet',
  external = false,
}: {
  href: string;
  children?: React.ReactNode;
  tone?: 'quiet' | 'volt';
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className={cn(
        'underline underline-offset-2',
        tone === 'volt' ? 'text-volt hover:text-volt-bright' : 'text-text-secondary hover:text-text',
      )}
    >
      {children}
    </a>
  );
}

/**
 * The legal footer: the owner's links (each only when site.json sets it), Cookie settings where
 * analytics runs, the copyright, the credit to the project this one is based on and the EA disclaimer.
 */
export function LegalFooter({ className }: { className?: string }) {
  const { t } = useTranslation();
  const reopen = useAnalytics((s) => s.reopen);
  const links = [
    [t('legal.privacy'), site.privacyUrl],
    [t('legal.faq'), site.faqUrl],
    [t('legal.changelog'), site.changelogUrl],
  ].filter((link): link is [string, string] => Boolean(link[1]));
  const analytics = Boolean(site.gaMeasurementId);

  return (
    <footer
      className={cn(
        'mt-auto flex flex-col gap-2 border-t border-outline pt-3 type-legal leading-normal text-text-muted max-md:type-legal-phone',
        className,
      )}
    >
      {(links.length > 0 || analytics) && (
        <nav aria-label={t('legal.nav')} className="flex flex-wrap gap-x-3 gap-y-1">
          {/* The app's own pages (/privacy) open in place, other sites in a new tab */}
          {links.map(([label, href]) => (
            <a
              key={label}
              href={href}
              target={href.startsWith('/') ? undefined : '_blank'}
              rel={href.startsWith('/') ? undefined : 'noopener noreferrer'}
              className="text-text-secondary hover:text-text"
            >
              {label}
            </a>
          ))}
          {analytics && (
            <a
              href="#cookies"
              onClick={(e) => {
                e.preventDefault();
                reopen();
              }}
              className="text-text-secondary hover:text-text"
            >
              {t('legal.cookies')}
            </a>
          )}
        </nav>
      )}
      {/* The year is the prerender's; on New Year's Day the browser's may differ for a moment */}
      <span suppressHydrationWarning>
        {t('legal.copyright', { year: new Date().getFullYear(), owner: site.owner })}
      </span>
      <span>
        <Trans
          i18nKey="legal.basedOn"
          values={{ name: site.upstream.name, author: site.upstream.author, license: site.upstream.license }}
          components={{ upstream: <TextLink href={site.upstream.url} external /> }}
        />
      </span>
      <span>
        <Trans
          i18nKey="legal.disclaimer"
          components={{
            ea: <TextLink href="https://ea.com" external />,
            respawn: <TextLink href="https://www.respawn.com/" external />,
            wiki: <TextLink href="https://apexlegends.fandom.com/wiki/" external />,
          }}
        />
      </span>
    </footer>
  );
}
