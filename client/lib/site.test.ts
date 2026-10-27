import { describe, expect, it } from 'vitest';
import data from '../../site.json';
import { isPlaceholder, readSite, site, type SiteJson } from './site';

const empty: SiteJson = {
  ...data,
  owner: '[OWNER NAME]',
  siteUrl: '',
  contactEmail: '',
  privacyUrl: '',
  faqUrl: '',
  changelogUrl: '',
  repoUrl: '',
  issuesUrl: '',
  communityUrl: '',
  supportUrl: '',
  videoUrl: '',
  gaMeasurementId: '',
};

describe('site', () => {
  it('reads site.json', () => {
    expect(site.name).toBe(data.name);
    expect(site.upstream.url).toBe('https://github.com/metaflow/apex-recoil');
  });

  it('leaves out links that are not set, so the pages hide them', () => {
    const s = readSite({ ...empty, faqUrl: 'https://example.org/faq' });
    expect(s.faqUrl).toBe('https://example.org/faq');
    expect('supportUrl' in s).toBe(false);
    expect('contactEmail' in s).toBe(false);
  });

  it('turns analytics on only with a measurement ID and a privacy policy', () => {
    expect(readSite({ ...empty, gaMeasurementId: 'G-TEST' }).gaMeasurementId).toBeUndefined();
    expect(readSite({ ...empty, privacyUrl: '/privacy' }).gaMeasurementId).toBeUndefined();
    expect(readSite({ ...empty, gaMeasurementId: 'G-TEST', privacyUrl: '/privacy' }).gaMeasurementId).toBe('G-TEST');
  });

  it('recognizes placeholders', () => {
    expect(isPlaceholder('[OWNER NAME]')).toBe(true);
    expect(isPlaceholder('Spraydown')).toBe(false);
    expect(isPlaceholder('[SITE URL]/privacy')).toBe(false);
  });
});
