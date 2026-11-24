/**
 * Copyright 2021 Mikhail Goncharov
 * Modified by [OWNER NAME], 2025-2026.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// The pages (server/prerender.ts): rendered ahead of time, or, for the Studio (client/studio) at
// /editor and the component gallery at /next/components, in the browser only. With pnpm dev, Vite
// serves the client sources with hot reload: the pages load the source entries and get Vite's client
// and the React Refresh preamble from transformIndexHtml.

import express, { type NextFunction, type Request, type Response } from 'express';
import type { ViteDevServer } from 'vite';
import { httpError, type ErrorPages } from '../errors.ts';
import {
  escapeHtml,
  hasBundle,
  notFound,
  pageAt,
  pages,
  renderPage,
  renderShell,
  robotsTxt,
  serverError,
  shellAt,
  sitemapXml,
  type PageSpec,
} from '../prerender.ts';
import type { SiteValues } from '../site.ts';

export interface Pages extends ErrorPages {
  /** Vite's development server (pnpm dev), which serves the client sources */
  vite: Promise<ViteDevServer> | null;
  /** The pages and the addresses that moved */
  router: express.Router;
  /** An address the app doesn't have: the 404 page for a browser, a bare 404 for anything else */
  notFound: express.RequestHandler;
}

export function createPages({ site, dev }: { site: SiteValues; dev: boolean }): Pages {
  const vite = dev
    ? import('vite').then((v) => v.createServer({ server: { middlewareMode: true }, appType: 'custom' }))
    : null;

  // Pages name the current build's entry files, so browsers check for a new version every time
  function sendHtml(req: Request, res: Response, next: NextFunction | (() => void), html: string, status = 200) {
    res.status(status);
    res.set('Cache-Control', 'no-cache');
    if (!vite) {
      res.type('html').send(html);
      return;
    }
    vite
      .then((server) => server.transformIndexHtml(req.originalUrl, html))
      .then((page) => {
        res.type('html').send(page);
      }, next);
  }

  // The trainer, its Patterns and Progress pages, the documents of docs/ and the pages for an unknown
  // address and a server error: each is rendered ahead of time with this server's site values and
  // served from memory. With pnpm dev, or a build without dist-ssr/, the browser renders it in a bare
  // shell instead.
  const prerendered = new Map<string, Promise<string>>();
  function pageHtml(spec: PageSpec) {
    if (dev || !hasBundle()) {
      return Promise.resolve(
        renderShell(
          {
            title: site.name + ' · ' + spec.title,
            entry: spec.entry,
            page: spec.page,
            locale: spec.locale,
            noindex: spec.page === 'not-found' || spec.page === 'error',
          },
          site,
          { dev },
        ),
      );
    }
    const key = spec.path || spec.page;
    let html = prerendered.get(key);
    if (!html) {
      html = renderPage(spec, site).catch((err) => {
        prerendered.delete(key);
        throw err;
      });
      prerendered.set(key, html);
    }
    return html;
  }

  function sendPage(req: Request, res: Response, next: NextFunction, spec: PageSpec, status: number) {
    pageHtml(spec).then((html) => sendHtml(req, res, next, html, status), next);
  }

  // Every page is rendered once the server has started, so the first visitor after a deploy doesn't wait
  if (!dev && hasBundle()) {
    for (const spec of [...pages, notFound, serverError]) {
      // A failed page renders again on its first request, which reports the error
      pageHtml(spec).catch(() => {});
    }
  }

  const router = express.Router();
  // The new pages were previewed under /next until they replaced the old ones (2026-10-24)
  router.get(/^\/next(\/.*)?$/, (req, res, next) => {
    if (req.path === '/next/components') return next();
    res.redirect(301, (req.params as Record<string, string | undefined>)[0] || '/');
  });
  // The Studio was previewed at /editor/next until it replaced the Recoil Editor (2026-10-24)
  router.get('/editor/next', (req, res) => {
    res.redirect(301, '/editor');
  });
  // For search engines: robots.txt names the sitemap, which lists every page with its versions in each
  // language. Both name full addresses, from site.json's siteUrl; without one there is no sitemap.
  router.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(robotsTxt(site));
  });
  router.get('/sitemap.xml', (req, res, next) => {
    const xml = sitemapXml(site);
    if (!xml) return next();
    res.type('application/xml').send(xml);
  });
  router.get('/{*path}', (req, res, next) => {
    const spec = pageAt(req.path);
    if (spec) return sendPage(req, res, next, spec, 200);
    const shell = shellAt(req.path);
    if (shell) {
      return sendHtml(
        req,
        res,
        next,
        renderShell({ title: shell.title(site.name), entry: shell.entry }, site, { dev }),
      );
    }
    next();
  });

  return {
    vite,
    router,
    notFound(req, res, next) {
      if (req.method === 'GET' && !req.path.startsWith('/api/') && /\btext\/html\b/.test(req.get('Accept') || '')) {
        return sendPage(req, res, next, notFound, 404);
      }
      next(httpError(404, 'Not Found'));
    },
    sendHtml,
    async errorPage(details) {
      const html = await pageHtml(serverError);
      if (!details) return html;
      return html.replace(
        '</body>',
        '<pre style="white-space: pre-wrap; padding: 1rem">' + escapeHtml(details) + '</pre>\n</body>',
      );
    },
  };
}
