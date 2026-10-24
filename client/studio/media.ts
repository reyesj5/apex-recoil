import type { HdrMode } from './model/analysis';
import type { Pixels } from './model/detect';

// Images and files for the Studio: the color correction for screenshots taken with Windows HDR or
// Auto HDR (washed-out, over-bright colors), and conversions between files, blobs and data URLs.
// Moved from client/modules/utils.ts.

const curves = {
  'hdr-standard': { gamma: 1.6, exposure: 0.85, contrast: 1.2, saturation: 1.25 },
  'hdr-vibrant': { gamma: 1.75, exposure: 0.8, contrast: 1.3, saturation: 1.4 },
};

/** The correction's tone curve: exposure, gamma and contrast for each 0 to 255 level */
export function toneCurve(mode: Exclude<HdrMode, 'off'>): Uint8Array {
  const { gamma, exposure, contrast } = curves[mode];
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let f = (i / 255) * exposure;
    f = Math.pow(Math.min(1, Math.max(0, f)), gamma);
    f = (f - 0.5) * contrast + 0.5;
    lut[i] = Math.min(255, Math.max(0, Math.round(f * 255)));
  }
  return lut;
}

const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)));

/** Applies the correction to RGBA pixels in place: the tone curve, then more saturation */
export function correctPixels(data: Uint8ClampedArray, mode: HdrMode) {
  if (mode === 'off') return;
  const lut = toneCurve(mode);
  const boost = curves[mode].saturation;
  for (let i = 0; i < data.length; i += 4) {
    const r = lut[data[i]];
    const g = lut[data[i + 1]];
    const b = lut[data[i + 2]];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    data[i] = clamp(y + (r - y) * boost);
    data[i + 1] = clamp(y + (g - y) * boost);
    data[i + 2] = clamp(y + (b - y) * boost);
  }
}

/** The CSS filter that approximates the correction on the live preview */
export const previewFilter: Record<HdrMode, string> = {
  'hdr-standard': 'brightness(0.85) contrast(1.22) saturate(1.25)',
  'hdr-vibrant': 'brightness(0.78) contrast(1.35) saturate(1.40)',
  off: 'none',
};

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The image could not be loaded.'));
    image.src = src;
  });
}

/** The image's pixels at its own size */
export function imagePixels(image: CanvasImageSource & { naturalWidth?: number; width: number; height: number }) {
  const canvas = document.createElement('canvas');
  canvas.width = (image as HTMLImageElement).naturalWidth || Number(image.width);
  canvas.height = (image as HTMLImageElement).naturalHeight || Number(image.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: data.data } satisfies Pixels;
}

/** Pixels as an image (a canvas), for the threshold overlay */
export function pixelsToCanvas(width: number, height: number, data: Uint8ClampedArray<ArrayBuffer>) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.putImageData(new ImageData(data, width, height), 0, 0);
  return canvas;
}

/** The image with the color correction, as a JPEG data URL; the image itself when the correction is off */
export async function correctImage(src: string, mode: HdrMode): Promise<string> {
  if (mode === 'off' || !src) return src;
  try {
    const image = await loadImage(src);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext('2d');
    if (!context) return src;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    correctPixels(pixels.data, mode);
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.95);
  } catch {
    return src;
  }
}

/** A frame of a playing video as a JPEG data URL, with the color correction; '' before the first frame */
export function videoFrame(video: HTMLVideoElement, mode: HdrMode): string {
  if (!video.videoWidth || !video.videoHeight) return '';
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  if (!context) return '';
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  if (mode !== 'off') {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    correctPixels(pixels.data, mode);
    context.putImageData(pixels, 0, 0);
  }
  return canvas.toDataURL('image/jpeg', 0.95);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body = ''] = dataUrl.split(',');
  const type = /:(.*?);/.exec(head)?.[1] ?? 'image/jpeg';
  const bytes = atob(body);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
  return new Blob([array], { type });
}

/** Saves a data URL as a file */
export function download(dataUrl: string, name: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
}

/** A short id for an item in a list */
export const newId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
