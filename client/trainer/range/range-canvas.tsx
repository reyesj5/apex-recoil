import { useEffect, useEffectEvent, useImperativeHandle, useRef } from 'react';
import { cn } from 'cn';
import type { RangeRenderer, RangeSettings, RunEnd } from './renderer';

export interface RangeHandle {
  /** Shows the last run's rounds again, `speed` times as fast as they fired */
  replay(speed: number): void;
  /** Back to the ready state */
  clear(): void;
}

/**
 * The range's canvas: mounts the renderer in an element that fills the range and passes it the
 * settings. The renderer (with Konva) loads as its own chunk once the page is up, since the ready
 * state needs no canvas; it handles the mouse and the frames itself, and this component never
 * re-renders during a run.
 */
export function RangeCanvas({
  ref,
  settings,
  onRunStart,
  onRunEnd,
  onCycleTrace,
  onAreaChange,
  className,
}: {
  ref?: React.Ref<RangeHandle>;
  settings: RangeSettings;
  onRunStart?: () => void;
  onRunEnd?: (end: RunEnd) => void;
  onCycleTrace?: () => void;
  onAreaChange?: (tooSmall: boolean) => void;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const renderer = useRef<RangeRenderer | null>(null);
  const latest = useRef(settings);
  const runStart = useEffectEvent(() => onRunStart?.());
  const runEnd = useEffectEvent((end: RunEnd) => onRunEnd?.(end));
  const cycleTrace = useEffectEvent(() => onCycleTrace?.());
  const areaChange = useEffectEvent((tooSmall: boolean) => onAreaChange?.(tooSmall));

  useEffect(() => {
    let mounted = true;
    void import('./renderer').then(({ RangeRenderer }) => {
      if (!mounted || !container.current) return;
      renderer.current = new RangeRenderer(container.current, {
        runStart: () => runStart(),
        runEnd: (end) => runEnd(end),
        cycleTrace: () => cycleTrace(),
        areaChange: (tooSmall) => areaChange(tooSmall),
      });
      renderer.current.configure(latest.current);
    });
    return () => {
      mounted = false;
      renderer.current?.destroy();
      renderer.current = null;
    };
  }, []);

  useEffect(() => {
    latest.current = settings;
    renderer.current?.configure(settings);
  }, [settings]);

  useImperativeHandle(ref, () => ({
    replay: (speed) => renderer.current?.replay(speed),
    clear: () => renderer.current?.clear(),
  }));

  return (
    <div
      ref={container}
      data-slot="range-canvas"
      className={cn('absolute inset-0 cursor-crosshair touch-none select-none', className)}
    />
  );
}
