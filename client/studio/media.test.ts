import { describe, expect, it } from 'vitest';
import { correctPixels, dataUrlToBlob, toneCurve } from './media';
import { noise } from './model/parity.cases';

/** The Recoil Editor's correction (client/modules/utils.ts, applyHdrToneMappingToCanvas), on an array */
function legacyCorrect(data: Uint8ClampedArray, mode: string) {
  const isVibrant = mode === 'hdr-vibrant';
  const gamma = isVibrant ? 1.75 : 1.6;
  const exposure = isVibrant ? 0.8 : 0.85;
  const contrast = isVibrant ? 1.3 : 1.2;
  const satBoost: number = isVibrant ? 1.4 : 1.25;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let f = (i / 255.0) * exposure;
    f = Math.pow(Math.min(1.0, Math.max(0.0, f)), gamma);
    f = (f - 0.5) * contrast + 0.5;
    lut[i] = Math.min(255, Math.max(0, Math.round(f * 255.0)));
  }
  for (let i = 0; i < data.length; i += 4) {
    let r = lut[data[i]];
    let g = lut[data[i + 1]];
    let b = lut[data[i + 2]];
    if (satBoost !== 1.0) {
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      r = Math.min(255, Math.max(0, Math.round(y + (r - y) * satBoost)));
      g = Math.min(255, Math.max(0, Math.round(y + (g - y) * satBoost)));
      b = Math.min(255, Math.max(0, Math.round(y + (b - y) * satBoost)));
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

describe('the color correction', () => {
  it('corrects pixels as the Recoil Editor did', () => {
    const pixels = Uint8ClampedArray.from({ length: 4 * 4096 }, (_, i) => Math.floor((noise(i, 1) + 1) * 127.99));
    for (const mode of ['hdr-standard', 'hdr-vibrant'] as const) {
      const ours = pixels.slice();
      const theirs = pixels.slice();
      correctPixels(ours, mode);
      legacyCorrect(theirs, mode);
      expect(ours).toEqual(theirs);
    }
    const untouched = pixels.slice();
    correctPixels(untouched, 'off');
    expect(untouched).toEqual(pixels);
  });

  it('darkens the washed-out mid-tones', () => {
    const curve = toneCurve('hdr-standard');
    expect(curve[0]).toBe(0);
    expect(curve[128]).toBeLessThan(128);
    expect(curve[255]).toBeGreaterThan(200);
  });
});

it('turns a data URL back into a file', async () => {
  const blob = dataUrlToBlob('data:image/png;base64,aGVsbG8=');
  expect(blob.type).toBe('image/png');
  expect(await blob.text()).toBe('hello');
});
