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

// Analysis jobs: GET /api/discovery/jobs/:id (its state), GET /api/discovery/jobs/:id/events (its
// progress as Server-Sent Events) and POST /api/discovery/jobs/:id/cancel

import express from 'express';
import type { AnalysisQueue } from '../jobs.ts';

export function jobsRouter(jobQueue: AnalysisQueue) {
  const router = express.Router();

  router.get('/:id', async (req, res) => {
    let job;
    try {
      job = await jobQueue.getJob(req.params.id);
    } catch (err) {
      res.status(503).json({ success: false, error: 'Job queue unavailable: ' + (err as Error).message });
      return;
    }
    if (!job) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }
    res.json({ success: true, job });
  });

  router.get('/:id/events', (req, res) => {
    Promise.resolve(jobQueue.attachSSE(req.params.id, req, res)).catch((err: Error) => {
      if (!res.headersSent) res.status(503).json({ success: false, error: 'Job queue unavailable: ' + err.message });
      else res.end();
    });
  });

  router.post('/:id/cancel', async (req, res) => {
    let ok;
    try {
      ok = await jobQueue.cancelJob(req.params.id);
    } catch (err) {
      res.status(503).json({ success: false, error: 'Job queue unavailable: ' + (err as Error).message });
      return;
    }
    if (!ok) {
      res.status(404).json({ success: false, error: 'Job not found or already finished' });
      return;
    }
    res.json({ success: true, message: 'Job cancelled' });
  });

  return router;
}
