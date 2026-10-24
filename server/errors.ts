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

import type { ErrorRequestHandler, Request, Response } from 'express';
import multer from 'multer';

/** An error that answers with its own status */
export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function httpError(status: number, message: string) {
  return new HttpError(status, message);
}

/** What the error handler needs from the pages: the error page, sent as a page is */
export interface ErrorPages {
  errorPage(details: string): Promise<string>;
  sendHtml(req: Request, res: Response, next: (err?: unknown) => void, html: string, status?: number): void;
}

/**
 * The last handler. API clients get JSON (e.g. multer upload limits, oversized JSON bodies); a browser
 * gets the error page, which in development also shows what went wrong; anything else gets plain text.
 */
export function errorHandler(pages: ErrorPages): ErrorRequestHandler {
  return (err, req, res, next) => {
    const error = err as { status?: number; statusCode?: number; message?: string; stack?: string };
    if (res.headersSent) return next(err);

    if (req.path.startsWith('/api/')) {
      let status = error.status || (err instanceof multer.MulterError ? 413 : 500);
      if (err instanceof multer.MulterError && err.code !== 'LIMIT_FILE_SIZE' && err.code !== 'LIMIT_FILE_COUNT') {
        status = 400;
      }
      res.status(status).json({ success: false, error: error.message });
      return;
    }

    const status = error.status || error.statusCode || 500;
    if (status >= 500) console.error(err);
    const details = req.app.get('env') === 'development' ? String(error.stack || error.message) : '';
    const plain = () => {
      res
        .status(status)
        .type('text')
        .send(status + ' ' + (details || error.message || 'Server error'));
    };
    if (!/\btext\/html\b/.test(req.get('Accept') || '')) return plain();
    pages.errorPage(details).then((html) => pages.sendHtml(req, res, plain, html, status), plain);
  };
}
