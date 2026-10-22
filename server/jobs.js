'use strict';

/**
 * Picks the analysis job queue from the environment:
 * - REDIS_URL set: BullJobQueue (persistent, multi-worker; embedded worker unless
 *   RECOIL_EMBEDDED_WORKER=false)
 * - otherwise:     in-process JobQueue
 */

const { JobQueue } = require('./job_queue');

function createJobQueue({ storage } = {}) {
  if (process.env.REDIS_URL) {
    const { BullJobQueue } = require('./bull_queue');
    return new BullJobQueue({
      redisUrl: process.env.REDIS_URL,
      storage,
      runWorker: process.env.RECOIL_EMBEDDED_WORKER !== 'false'
    });
  }
  return new JobQueue({ storage });
}

module.exports = {
  createJobQueue
};
