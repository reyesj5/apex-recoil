import { afterEach, describe, expect, it } from 'vitest';
import { createAnalytics, readConsent } from './analytics';

const id = 'G-TEST000';
const day = (date: string) => new Date(`${date}T12:00:00Z`);
const tags = () =>
  [...document.querySelectorAll('script[src*="googletagmanager.com"]')].map((s) => s.getAttribute('src'));
const commands = () => (window.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));

afterEach(() => {
  document.head.innerHTML = '';
  delete window.dataLayer;
  for (const cookie of document.cookie.split(';')) {
    document.cookie = `${cookie.split('=')[0].trim()}=; Max-Age=0; Path=/`;
  }
});

describe('analytics consent', () => {
  it('asks a new visitor and loads nothing before an answer', () => {
    const analytics = createAnalytics(id);
    analytics.getState().start();
    expect(analytics.getState()).toMatchObject({ consent: undefined, asking: true });
    expect(tags()).toEqual([]);
    expect(window.dataLayer).toBeUndefined();
  });

  it('loads the tag with Consent Mode after Accept, and remembers the choice', () => {
    const analytics = createAnalytics(id, { now: () => day('2026-10-23') });
    analytics.getState().accept();
    expect(analytics.getState()).toMatchObject({ consent: 'granted', asking: false });
    expect(tags()).toEqual([`https://www.googletagmanager.com/gtag/js?id=${id}`]);
    expect(commands()).toEqual([
      [
        'consent',
        'default',
        { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' },
      ],
      ['consent', 'update', { analytics_storage: 'granted' }],
      ['js', expect.any(Date)],
      ['config', id],
    ]);
    // The tag reads commands from Arguments objects, not arrays
    expect(Object.prototype.toString.call(window.dataLayer![0])).toBe('[object Arguments]');
    expect(JSON.parse(localStorage.getItem('consent:analytics')!)).toEqual({ choice: 'granted', date: '2026-10-23' });
  });

  it('loads the tag on later visits only for a player who accepted', () => {
    localStorage.setItem('consent:analytics', JSON.stringify({ choice: 'denied', date: '2026-10-01' }));
    const declined = createAnalytics(id, { now: () => day('2026-10-23') });
    declined.getState().start();
    expect(declined.getState()).toMatchObject({ consent: 'denied', asking: false });
    expect(tags()).toEqual([]);

    localStorage.setItem('consent:analytics', JSON.stringify({ choice: 'granted', date: '2026-10-01' }));
    const accepted = createAnalytics(id, { now: () => day('2026-10-23') });
    expect(tags()).toEqual([]);
    accepted.getState().start();
    expect(tags()).toHaveLength(1);
  });

  it('stops collecting and removes the cookies when consent is withdrawn', () => {
    const analytics = createAnalytics(id);
    analytics.getState().accept();
    document.cookie = '_ga=GA1.1.123.456; Path=/';
    document.cookie = '_ga_TEST000=GS2.1.s1; Path=/';
    document.cookie = 'other=kept; Path=/';
    analytics.getState().reopen();
    expect(analytics.getState().asking).toBe(true);
    analytics.getState().reject();
    expect(analytics.getState()).toMatchObject({ consent: 'denied', asking: false });
    expect(commands().at(-1)).toEqual(['consent', 'update', { analytics_storage: 'denied' }]);
    expect(document.cookie).toBe('other=kept');
    // Accepting again grants without a second tag
    analytics.getState().accept();
    expect(commands().at(-1)).toEqual(['consent', 'update', { analytics_storage: 'granted' }]);
    expect(tags()).toHaveLength(1);
  });

  it('asks again after 12 months', () => {
    localStorage.setItem('consent:analytics', JSON.stringify({ choice: 'granted', date: '2025-10-23' }));
    expect(readConsent(localStorage, day('2026-10-22'))).toBe('granted');
    expect(readConsent(localStorage, day('2026-10-23'))).toBeUndefined();
    localStorage.setItem('consent:analytics', 'not json');
    expect(readConsent(localStorage, day('2026-10-23'))).toBeUndefined();
  });

  it('never asks or loads without a measurement ID', () => {
    const analytics = createAnalytics(undefined);
    expect(analytics.getState().asking).toBe(false);
    analytics.getState().reopen();
    analytics.getState().accept();
    expect(analytics.getState()).toMatchObject({ consent: undefined, asking: false });
    expect(tags()).toEqual([]);
    expect(localStorage.getItem('consent:analytics')).toBeNull();
  });
});
