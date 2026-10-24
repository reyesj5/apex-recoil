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

// The captures (session folders, the screenshot library) at /captures, wherever they are kept: from
// the local folder, or streamed from object storage (STORAGE_PROVIDER, see server/storage.ts), so
// browsers always load them from the app

import { pipeline } from 'node:stream/promises';
import express, { type Request, type Response } from 'express';
import { normalizeKey, type AssetStorageService } from '../storage.ts';

export function capturesRouter(storage: AssetStorageService) {
  const router = express.Router();
  if (storage.isRemote) {
    router.get('/*key', (req, res) => serveStoredCapture(storage, req, res));
  } else {
    router.use(express.static(storage.localBaseDir));
  }
  router.use((req, res) => {
    res.status(404).end();
  });
  return router;
}

// Streams a capture from object storage (S3 provider), with HTTP range support for video
async function serveStoredCapture(storage: AssetStorageService, req: Request, res: Response) {
  let key;
  try {
    // Express decodes each segment of the wildcard
    key = normalizeKey(((req.params.key as unknown as string[] | undefined) || []).join('/'));
  } catch {
    res.status(400).end();
    return;
  }
  try {
    const obj = await storage.getObject(key, { range: req.headers.range });
    if (!obj) {
      res.status(404).end();
      return;
    }
    if (obj.status === 416) {
      if (obj.contentRange) res.set('Content-Range', obj.contentRange);
      res.status(416).end();
      return;
    }
    res.status(obj.status);
    res.set({
      'Content-Type': obj.contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=300',
    });
    if (obj.contentLength !== undefined) res.set('Content-Length', String(obj.contentLength));
    if (obj.contentRange) res.set('Content-Range', obj.contentRange);
    if (obj.etag) res.set('ETag', obj.etag);
    if (obj.lastModified) res.set('Last-Modified', new Date(obj.lastModified).toUTCString());
    if (req.method === 'HEAD') {
      obj.body?.destroy();
      res.end();
      return;
    }
    await pipeline(obj.body!, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ success: false, error: 'Failed to read capture: ' + (err as Error).message });
    } else {
      res.destroy(err as Error);
    }
  }
}
