/**
 * Standalone Lightweight Core Aim Trainer Entry Point
 * Excludes heavy computer vision tools, MediaRecorder, and editor stages.
 * Total target payload < 150KB gzip.
 */

import { startApp } from './bootstrap';
import { initGame } from './game';

startApp(initGame);
