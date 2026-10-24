import { useEffect, useMemo, useState } from 'react';
import { useEditorSettings } from '@/lib/storage/editor';
import { correctImage, imagePixels, loadImage, pixelsToCanvas } from '../media';
import { detectTargets, thresholdOverlay } from '../model/detect';
import { setDetection, setFrameSize, useStudio, type Background } from '../store';

// The canvas' screenshot: loaded (with the color correction for game screenshots) when the background
// changes, and, while the Manual tab is open, the legacy threshold overlay and the targets it finds.
// Its size and the targets go to the store, where the panels and the edits read them.

export interface FrameImage {
  key: string;
  image: HTMLImageElement;
  width: number;
  height: number;
}

/** The background as an image, once it has loaded; null while there is none or it is loading */
export function useFrameImage(background: Background | null): FrameImage | null {
  const hdr = useEditorSettings((s) => s.hdrMode);
  const [loaded, setLoaded] = useState<FrameImage | null>(null);
  const key = background ? `${background.key}:${background.correct ? hdr : 'raw'}` : '';

  useEffect(() => {
    if (!background) return;
    let current = true;
    void (async () => {
      const src = background.correct ? await correctImage(background.src, hdr) : background.src;
      const image = await loadImage(src);
      if (current) setLoaded({ key, image, width: image.naturalWidth, height: image.naturalHeight });
    })().catch((err: unknown) => console.warn('[Studio] The screenshot could not be shown:', err));
    return () => {
      current = false;
    };
  }, [background, hdr, key]);

  const frame = background && loaded?.key === key ? loaded : null;
  const width = frame?.width;
  const height = frame?.height;
  useEffect(() => {
    setFrameSize(width && height ? { width, height } : null);
  }, [width, height]);
  return frame;
}

/** The Manual tab's threshold overlay (marked pixels in red, at the image's size); its targets go to the store */
export function useManualTools(frame: FrameImage | null): HTMLCanvasElement | null {
  const onCapture = useStudio((s) => s.section === 'capture');
  const manualTab = useEditorSettings((s) => s.recordingMethod === 'legacy');
  const threshold = useEditorSettings((s) => s.threshold);
  const showThreshold = useEditorSettings((s) => s.enableThreshold);
  const autoTargets = useEditorSettings((s) => s.autoTargets);
  const from = useEditorSettings((s) => s.targetFrom);
  const to = useEditorSettings((s) => s.targetTo);
  const active = onCapture && manualTab;

  const pixels = useMemo(() => (active && frame ? imagePixels(frame.image) : null), [active, frame]);
  const overlay = useMemo(
    () =>
      pixels && showThreshold && threshold > 0
        ? pixelsToCanvas(pixels.width, pixels.height, thresholdOverlay(pixels, threshold))
        : null,
    [pixels, showThreshold, threshold],
  );
  const detection = useMemo(
    () => (pixels && autoTargets && threshold > 0 ? detectTargets(pixels, threshold, from, to) : null),
    [pixels, autoTargets, threshold, from, to],
  );
  useEffect(() => {
    setDetection(detection);
  }, [detection]);
  return overlay;
}
