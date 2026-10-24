import { useTranslation } from 'react-i18next';
import {
  CircleHelpIcon,
  HeartIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react';
import { SpraydownLogo } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { localeNames, locales, type Locale } from '@/lib/i18n';
import { site } from '@/lib/site';
import { progressHref, trainerHref } from './links';
import { openDialog } from './session';

const pages = { train: trainerHref, progress: progressHref };

/**
 * The top bar: logo, navigation and language, and on the trainer the weapon search (Ctrl K), the
 * Studio, help and settings
 */
export function TopBar({ locale, page }: { locale: Locale; page: keyof typeof pages }) {
  const { t } = useTranslation();
  const train = page === 'train';
  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-outline bg-inset px-5 py-3">
      <a href={trainerHref(locale)} className="flex shrink-0 items-center rounded-control">
        <SpraydownLogo />
      </a>
      <nav aria-label={t('topBar.nav')} className="flex gap-1">
        <NavLink href={trainerHref(locale)} current={train}>
          {t('topBar.train')}
        </NavLink>
        <NavLink href={progressHref(locale)} current={page === 'progress'}>
          {t('topBar.progress')}
        </NavLink>
      </nav>
      {train && (
        <button
          type="button"
          onClick={() => openDialog('search')}
          className="flex h-control-lg max-w-105 flex-[1_1_240px] cursor-pointer items-center gap-2.5 rounded-card border border-divider bg-panel px-3 text-sm text-text-muted transition-colors hover:bg-hover"
        >
          <SearchIcon className="size-4" aria-hidden="true" />
          <span className="flex-1 text-left">{t('topBar.search')}</span>
          <Kbd>Ctrl K</Kbd>
        </button>
      )}
      <div className="ml-auto flex items-center gap-2">
        <Select value={locale} onValueChange={(v) => location.assign(pages[page](v as Locale))}>
          <SelectTrigger aria-label={t('topBar.language')} className="h-icon rounded-control border-divider bg-panel">
            <SelectValue>{localeNames[locale]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {locales.map((l) => (
              <SelectItem key={l} value={l} lang={l}>
                {localeNames[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {train && (
          <>
            <IconLink href="/editor" label={t('topBar.studio')} icon={WrenchIcon} />
            {site.supportUrl && (
              <IconLink href={site.supportUrl} label={t('topBar.support')} icon={HeartIcon} external />
            )}
            <IconButton label={t('topBar.help')} icon={CircleHelpIcon} onClick={() => openDialog('help')} />
            <IconButton
              label={t('topBar.settings')}
              icon={SlidersHorizontalIcon}
              onClick={() => openDialog('settings')}
            />
          </>
        )}
      </div>
    </header>
  );
}

// A page in the navigation; the current one fills with raised
function NavLink({ href, current, children }: { href: string; current: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      aria-current={current ? 'page' : undefined}
      className={
        current
          ? 'rounded-control bg-raised px-3 py-2 text-sm font-semibold text-text'
          : 'rounded-control px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-hover hover:text-text'
      }
    >
      {children}
    </a>
  );
}

function IconButton({ label, icon: Icon, onClick }: { label: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon-compact" aria-label={label} onClick={onClick}>
          <Icon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function IconLink({
  href,
  label,
  icon: Icon,
  external = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  external?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon-compact" asChild>
          <a
            href={href}
            aria-label={label}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer' : undefined}
          >
            <Icon aria-hidden="true" />
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
