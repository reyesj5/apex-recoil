import { create } from 'zustand';
import { site } from './site';

// Google Analytics 4 behind consent, with Consent Mode v2. Nothing loads from Google until the player
// accepts: only then is the tag (gtag.js) added to the page, with analytics storage granted and ad
// storage, ad user data and ad personalization denied. The choice is kept on the device for 12 months
// (localStorage 'consent:analytics'), then the banner asks again. Rejecting after accepting stops
// collection and removes Google's cookies. Only the public trainer uses this; the Studio never does.
// Consent given to the old pages' banner (tarteaucitron) was for another property, so it doesn't carry over.

export type Consent = 'granted' | 'denied';

const consentKey = 'consent:analytics';
const consentMonths = 12;

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/** The stored choice, or undefined when there is none or it has expired */
export function readConsent(storage: Storage | undefined, now: Date): Consent | undefined {
  try {
    const saved = JSON.parse(storage?.getItem(consentKey) ?? 'null') as { choice?: unknown; date?: unknown } | null;
    if (saved?.choice !== 'granted' && saved?.choice !== 'denied') return undefined;
    const expires = new Date(`${String(saved.date)}T00:00:00Z`);
    expires.setUTCMonth(expires.getUTCMonth() + consentMonths);
    return now < expires ? saved.choice : undefined;
  } catch {
    return undefined;
  }
}

function writeConsent(storage: Storage | undefined, choice: Consent, now: Date) {
  try {
    storage?.setItem(consentKey, JSON.stringify({ choice, date: now.toISOString().slice(0, 10) }));
  } catch {
    // the banner asks again next visit
  }
}

// gtag.js reads commands from Arguments objects; it ignores arrays
const gtag: (...args: unknown[]) => void = function () {
  window.dataLayer ??= [];
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
};

function loadTag(id: string) {
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
  });
  gtag('consent', 'update', { analytics_storage: 'granted' });
  gtag('js', new Date());
  gtag('config', id);
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.append(script);
}

/** Removes Google Analytics' cookies (_ga, _ga_<ID>) from this host and the domains above it */
function forgetCookies() {
  const names = document.cookie
    .split(';')
    .map((cookie) => cookie.split('=')[0].trim())
    .filter((name) => name === '_ga' || name.startsWith('_ga_'));
  const labels = location.hostname.split('.');
  const domains = labels.slice(0, -1).map((_, i) => `; Domain=.${labels.slice(i).join('.')}`);
  for (const name of names) {
    for (const domain of ['', ...domains]) document.cookie = `${name}=; Max-Age=0; Path=/${domain}`;
  }
}

export interface AnalyticsState {
  /** The player's choice; undefined until asked, or once it expires */
  consent: Consent | undefined;
  /** Whether the consent banner shows: no choice yet, or Cookie settings reopened it */
  asking: boolean;
  /** Loads the tag if the player already accepted; the trainer calls this once when it starts */
  start(): void;
  accept(): void;
  reject(): void;
  /** Shows the banner again (the footer's Cookie settings) */
  reopen(): void;
}

/** Analytics for a measurement ID; without one it never asks and never loads anything */
export function createAnalytics(
  id: string | undefined,
  { storage = globalThis.localStorage, now = () => new Date() }: { storage?: Storage; now?: () => Date } = {},
) {
  const consent = id ? readConsent(storage, now()) : undefined;
  let loaded = false;
  const load = () => {
    if (!id) return;
    if (loaded) gtag('consent', 'update', { analytics_storage: 'granted' });
    else loadTag(id);
    loaded = true;
  };
  return create<AnalyticsState>()((set, get) => ({
    consent,
    asking: Boolean(id) && consent === undefined,
    start: () => {
      if (get().consent === 'granted') load();
    },
    accept: () => {
      if (!id) return;
      writeConsent(storage, 'granted', now());
      set({ consent: 'granted', asking: false });
      load();
    },
    reject: () => {
      if (!id) return;
      writeConsent(storage, 'denied', now());
      set({ consent: 'denied', asking: false });
      if (loaded) gtag('consent', 'update', { analytics_storage: 'denied' });
      forgetCookies();
    },
    reopen: () => {
      if (id) set({ asking: true });
    },
  }));
}

/** The trainer's analytics, with the owner's measurement ID from site.json (none: analytics off) */
export const useAnalytics = createAnalytics(site.gaMeasurementId);
