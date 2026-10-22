/**
 * Dedicated Recoil Editor Entry Point
 * Mounts the Recoil Discovery Studio and stage editing tools.
 */

import { startApp } from './bootstrap';
import { setupEditor } from './editor';

startApp(setupEditor);
