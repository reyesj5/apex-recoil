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

import type { Howl } from 'howler';

// The range's sounds, as the previous trainer played them: the magazine's recorded spray in full auto,
// at the firing speed, and a shot per round in single and burst fire. Howler loads the first time a
// sound is needed, so a player who keeps the sound off never downloads it.

type Howler = typeof import('howler');

export class SoundPlayer {
  private howl: Howl | null = null;
  private src: string | null = null;
  private volume = 0.2;
  private howler: Promise<Howler> | null = null;

  /** The sound for the next runs (a path from soundFile), or null with the sound off; volume 0 to 1 */
  use(src: string | null, volume: number) {
    this.volume = volume;
    // soundFile names files relative to the trainer at /, which /ru and /next/ru are not
    const url = src && src.replace(/^\.\//, '/');
    if (url === this.src) return;
    this.src = url;
    this.howl?.unload();
    this.howl = null;
    if (!url) return;
    this.howler ??= import('howler');
    void this.howler.then(({ Howl }) => {
      if (this.src === url) this.howl = new Howl({ src: [url] });
    });
  }

  /** A full-auto run starts: the spray plays at the firing speed */
  spray(rate: number) {
    if (!this.howl) return;
    this.howl.volume(this.volume);
    this.howl.rate(rate);
    this.howl.play();
  }

  /** A round in single or burst fire */
  shot() {
    if (!this.howl) return;
    this.howl.volume(this.volume);
    this.howl.stop();
    this.howl.play();
  }

  stop() {
    this.howl?.stop();
  }

  destroy() {
    this.howl?.unload();
    this.howl = null;
    this.src = null;
  }
}
