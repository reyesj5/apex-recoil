import data from '../../site.json';

// Owner-specific names, links and IDs from site.json at the repository root, which the current pages
// read too. The rules are the ownership register's (docs/ownership-register.md): a link that is not
// set is left out, so the page hides it; a value in square brackets is a placeholder shown as is; and
// analytics runs only with both a measurement ID and a privacy policy.

const linkKeys = [
  'siteUrl',
  'privacyUrl',
  'faqUrl',
  'changelogUrl',
  'repoUrl',
  'issuesUrl',
  'communityUrl',
  'supportUrl',
  'videoUrl',
] as const;

export type SiteLink = (typeof linkKeys)[number];

export interface Site extends Partial<Record<SiteLink, string>> {
  /** The product name ("Spraydown" for now) */
  name: string;
  /** The legal owner, for the footer copyright; "[OWNER NAME]" until set */
  owner: string;
  contactEmail?: string;
  /** The GA4 measurement ID, only when a privacy policy is set too */
  gaMeasurementId?: string;
  /** The project this one is based on, credited in the footer */
  upstream: { name: string; author: string; url: string; license: string };
}

export type SiteJson = typeof data;

/** site.json with the register's rules applied */
export function readSite(json: SiteJson): Site {
  const site: Site = { name: json.name, owner: json.owner, upstream: json.upstream };
  if (json.contactEmail) site.contactEmail = json.contactEmail;
  for (const key of linkKeys) if (json[key]) site[key] = json[key];
  if (json.gaMeasurementId && json.privacyUrl) site.gaMeasurementId = json.gaMeasurementId;
  return site;
}

/**
 * The values pages render with: site.json as bundled, unless the page carries the server's own (a
 * JSON script with the id site-json, which the server writes into the new pages, so a page and its
 * prerendered markup always agree). The server's prerender sets them with setSite.
 */
export const site: Site = readSite(data);

/** Makes every page render with these values (the prerender does this for each page it renders) */
export function setSite(json: SiteJson) {
  for (const key of Object.keys(site)) delete site[key as keyof Site];
  Object.assign(site, readSite({ ...data, ...json }));
}

if (typeof document !== 'undefined') {
  const embedded = document.getElementById('site-json')?.textContent;
  if (embedded) setSite(JSON.parse(embedded) as SiteJson);
}

/** Whether a value is still a placeholder, such as "[OWNER NAME]" */
export function isPlaceholder(value: string) {
  return /^\[[^\]]+\]$/.test(value.trim());
}
