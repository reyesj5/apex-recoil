import fs from 'node:fs';
import path from 'node:path';

/** The repository's root, where the server finds site.json, the build and the static folders */
export const root = path.join(import.meta.dirname, '..');

/**
 * Owner-specific names, links and IDs for the pages, from site.json (placeholders until set, see
 * docs/ownership-register.md). The server passes them to every page as they are; the pages apply
 * the register's rules (client/lib/site.ts).
 */
export interface SiteValues {
  /** The product name, "Spraydown" */
  name: string;
  [key: string]: unknown;
}

export function loadSite(file = path.join(root, 'site.json')): SiteValues {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as SiteValues;
}
