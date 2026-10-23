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

// Legacy single entry (/bundle.js) for pages or cached HTML that predate the route
// bundles: loads only the bundle for the current route. Pages normally load
// /trainer.js or /editor.js directly (see views/layout.pug).
if (window.location.pathname.startsWith('/editor')) {
  import('./editor_main');
} else {
  import('./trainer_main');
}