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

// The weapon specs: GET /api/specs (the list in client/specs.json order), GET /api/specs/history/:weapon
// (its versions) and POST /api/specs (a spec saved as a new version, or the whole list replaced)

import fs from 'node:fs';
import express from 'express';
import type { SavedSpec } from '../../shared/api.ts';
import { saveSpecBody, specUpdate } from '../../shared/requests.ts';
import type { DatabaseService, SpecDoc } from '../db.ts';

export function specsRouter(db: DatabaseService) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      // Imports any edits made to specs.json outside the API before reading.
      const dbSpecs = await db.getAllActiveSpecs();
      if (dbSpecs && dbSpecs.length > 0) {
        res.json(dbSpecs);
        return;
      }
    } catch (dbErr) {
      console.warn('[DB] Fallback to specs.json read:', (dbErr as Error).message);
    }
    let data;
    try {
      data = await fs.promises.readFile(db.specsJsonPath, 'utf8');
    } catch {
      res.status(500).json({ error: 'Failed to read specs.json' });
      return;
    }
    try {
      res.json(JSON.parse(data));
    } catch {
      res.status(500).json({ error: 'Invalid JSON in specs.json' });
    }
  });

  router.get('/history/:weapon', async (req, res) => {
    try {
      const weapon = req.params.weapon;
      const history = await db.getSpecHistory(weapon);
      res.json({ success: true, weapon, history });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Failed to load spec history: ' + (err as Error).message });
    }
  });

  router.post('/', async (req, res) => {
    const body: unknown = req.body;
    if (!body) {
      res.status(400).json({ error: 'No data provided' });
      return;
    }

    // A spec is saved as it was sent, with its keys in their order: specs.json keeps it that way, while
    // the parsed copy would list the checked keys first
    try {
      if ((body as { weapon?: unknown }).weapon) {
        const parsed = saveSpecBody.safeParse(body);
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid weapon spec schema' });
          return;
        }
        const { author, notes, diff } = parsed.data;
        // Fields not sent by the client are kept from the current spec (same merge as the
        // original flat-file API).
        const saveResult = await db.saveWeaponSpec((body as { weapon: SpecDoc }).weapon, {
          author: author || 'web_editor',
          notes: notes || 'Updated via web editor',
          diff: diff || {},
        });
        const unchanged = 'unchanged' in saveResult;
        res.json({
          success: true,
          message: unchanged
            ? 'Weapon spec unchanged; no new version created'
            : 'Weapon spec saved and versioned successfully in SQLite',
          version: saveResult.version,
          weapon: saveResult.weapon,
          unchanged,
        } satisfies SavedSpec);
      } else if (Array.isArray(body)) {
        const specs = body as SpecDoc[];
        for (let i = 0; i < specs.length; i++) {
          if (!specUpdate.safeParse(specs[i]).success) {
            res.status(400).json({ error: 'Invalid spec schema at index ' + i });
            return;
          }
        }
        // An array replaces the whole spec list, like the original flat-file API.
        const batchResult = await db.replaceAllSpecs(specs, { author: 'batch_update' });
        res.json({
          success: true,
          message: 'All specs updated and versioned successfully',
          count: specs.length,
          versioned: batchResult.imported,
          removed: batchResult.removed,
        });
      } else {
        res.status(400).json({ error: 'Expected array of specs or { weapon: ... }' });
      }
    } catch (err) {
      res.status(500).json({ error: 'Failed to update specs: ' + (err as Error).message });
    }
  });

  return router;
}
