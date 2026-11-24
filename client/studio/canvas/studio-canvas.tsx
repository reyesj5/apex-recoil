import type Konva from 'konva';
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { Circle, Image as KonvaImage, Layer, Line, Stage, Text } from 'react-konva';
import { useEditorSettings } from '@/lib/storage/editor';
import { tokenColor } from '@/trainer/range/colors';
import { addShotsAt, comparisonOf, decalsOf, moveShotTo, placementOf, removeShotAt, toggleAnchorAt } from '../editing';
import { boundsOf, fitView, patternToWorld, zoomAt, type Comparison, type Optics } from '../model/placement';
import type { Pt, Spec } from '../model/spec';
import { savedOf, setHovered, setOffset, setView, specOf, useStudio, type StudioState } from '../store';
import { CanvasOverlays } from './overlays';
import { useFrameImage, useManualTools } from './use-frame-image';

// The Studio's canvas (react-konva): the screenshot, the pattern being edited with its shots and
// anchors, and the read-only patterns (the saved spec, the new samples alone, the decals found, the
// comparison). It works in the screenshot's pixels, or in the spec's units without one; the stage's
// zoom and position are the view. Shots keep their size on screen whatever the zoom.

const color = {
  volt: tokenColor('volt'),
  target: tokenColor('target'),
  ink: tokenColor('pattern-ink'),
  canvas: tokenColor('canvas'),
  text: tokenColor('text'),
  warning: tokenColor('warning'),
  danger: tokenColor('danger'),
};

const toneColor = { ok: color.target, warn: color.warning, bad: color.danger };

function useElementSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** Holding Space pans, as in other canvas tools */
function useSpaceHeld() {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const typing = (e: KeyboardEvent) =>
      e.target instanceof HTMLElement && !!e.target.closest('input, textarea, select');
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing(e)) setHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setHeld(false);
    };
    const blur = () => setHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);
  return held;
}

type PlacementState = Pick<StudioState, 'frameSize' | 'session' | 'frame' | 'offset'>;

/** The read-only pattern shown in place of the one being edited */
function readOnlyPoints(state: PlacementState & Pick<StudioState, 'shown'>, optics: Optics, saved: Spec | undefined) {
  if (state.shown === 'decals') return decalsOf(state, optics);
  const spec = state.shown === 'saved' ? saved : state.shown === 'batch' ? state.session?.batch : undefined;
  return spec ? patternToWorld(spec, placementOf(state, optics, spec)) : [];
}

export function StudioCanvas() {
  const container = useRef<HTMLDivElement>(null);
  const size = useElementSize(container);
  const weapon = useEditorSettings((s) => s.weapon);
  const zoom = Number(useEditorSettings((s) => s.captureOptic));
  const fov = useEditorSettings((s) => s.captureFov);
  const scaleFactor = useEditorSettings((s) => s.scaleFactor);
  const optics: Optics = { zoom, fov, scaleFactor };
  const draft = useStudio((s) => specOf(s, weapon));
  const saved = useStudio((s) => savedOf(s, weapon));
  const session = useStudio((s) => s.session);
  const frameIndex = useStudio((s) => s.frame);
  const frameSize = useStudio((s) => s.frameSize);
  const offset = useStudio((s) => s.offset);
  const background = useStudio((s) => s.background);
  const shown = useStudio((s) => s.shown);
  const comparing = useStudio((s) => s.comparing);
  const tool = useStudio((s) => s.tool);
  const layers = useStudio((s) => s.layers);
  const anchors = useStudio((s) => s.anchors);
  const view = useStudio((s) => s.view);
  const fits = useStudio((s) => s.fits);
  const hovered = useStudio((s) => s.hovered);
  const detection = useStudio((s) => s.detection);
  const frame = useFrameImage(background);
  const overlay = useManualTools(frame);
  const spaceHeld = useSpaceHeld();

  // While a shot is dragged: where it is, or how far the whole spray moved (Align)
  const [drag, setDrag] = useState<{ index: number; at: Pt } | null>(null);
  const [shift, setShift] = useState<Pt | null>(null);
  const [panning, setPanning] = useState(false);

  const placementState: PlacementState = { frameSize, session, frame: frameIndex, offset };
  const shots = draft ? patternToWorld(draft, placementOf(placementState, optics, draft)) : [];
  const positions = shots.map((p, i) => {
    if (shift) return { x: p.x + shift.x, y: p.y + shift.y };
    return drag?.index === i ? drag.at : p;
  });
  const editable = shown === 'draft' && !comparing && !!draft;
  const panMode = tool === 'pan' || spaceHeld;
  const readOnly = comparing || editable ? [] : readOnlyPoints({ ...placementState, shown }, optics, saved);
  const comparison: Comparison | null =
    comparing && saved && draft ? comparisonOf({ frameSize, session, frame: frameIndex }, optics, saved, draft) : null;

  // Fit: on request (F, Fit), for a new screenshot or weapon, and on resize until the view is moved
  const fitted = useRef(true);
  const fitBounds = frame ? { x: 0, y: 0, width: frame.width, height: frame.height } : boundsOf(shots);
  const fitNow = useEffectEvent(() => {
    if (size.width === 0 || size.height === 0) return;
    setView(fitView(fitBounds, size, frame ? 20 : 48, 1));
    fitted.current = true;
  });
  const fitKey = frame ? frame.key : `${weapon}:${shots.length > 0}`;
  useEffect(() => {
    fitNow();
  }, [fits, fitKey]);
  useEffect(() => {
    if (fitted.current) fitNow();
  }, [size.width, size.height]);

  const scale = view.scale;
  const radius = Math.max(0.8, 4.5 / scale);
  const lineWidth = Math.max(0.5, 1.8 / scale);

  const worldOf = (stage: Konva.Stage): Pt | null => {
    const p = stage.getPointerPosition();
    return p ? { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale } : null;
  };

  const startPan = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const start = { x: e.evt.clientX, y: e.evt.clientY };
    const from = useStudio.getState().view;
    let request = 0;
    let next = from;
    setPanning(true);
    fitted.current = false;
    const move = (event: MouseEvent) => {
      next = { ...from, x: from.x + event.clientX - start.x, y: from.y + event.clientY - start.y };
      if (!request) {
        request = requestAnimationFrame(() => {
          request = 0;
          setView(next);
        });
      }
    };
    const up = () => {
      cancelAnimationFrame(request);
      setView(next);
      setPanning(false);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const { button, altKey } = e.evt;
    const name = e.target.name();
    const empty = e.target === e.target.getStage() || name === 'background' || name === 'threshold';
    if (button === 1 || altKey || panMode || (button === 2 && empty)) {
      e.evt.preventDefault();
      startPan(e);
      return;
    }
    const stage = e.target.getStage();
    if (button === 0 && empty && editable && tool === 'correct' && stage) {
      const at = worldOf(stage);
      if (at) addShotsAt([at]);
    }
  };

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const pointer = e.target.getStage()?.getPointerPosition();
    if (!pointer) return;
    fitted.current = false;
    setView(zoomAt(useStudio.getState().view, e.evt.deltaY > 0 ? 1 / 1.1 : 1.1, pointer));
  };

  const onShotMouseDown = (index: number) => (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (panMode) return;
    if (e.evt.button === 2) {
      e.cancelBubble = true;
      e.evt.preventDefault();
      removeShotAt(index);
      setHovered(null);
    } else if (e.evt.button === 1) {
      e.cancelBubble = true;
      e.evt.preventDefault();
      toggleAnchorAt(index);
    }
  };

  const cursor = panning ? 'grabbing' : panMode ? 'grab' : tool === 'correct' && editable ? 'copy' : 'crosshair';
  const placed = (p: Pt) => positions.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < 2);
  const targets = editable ? (detection?.targets.filter((t) => !placed(t)) ?? []) : [];

  return (
    <div
      ref={container}
      data-testid="studio-canvas"
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-canvas bg-[radial-gradient(var(--color-canvas-dot)_1px,transparent_1px)] bg-size-[20px_20px]"
      style={{ cursor }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {size.width > 0 && (
        <Stage
          width={size.width}
          height={size.height}
          scaleX={scale}
          scaleY={scale}
          x={view.x}
          y={view.y}
          onMouseDown={onStageMouseDown}
          onWheel={onWheel}
        >
          <Layer>
            {frame && (
              <KonvaImage
                name="background"
                image={frame.image}
                width={frame.width}
                height={frame.height}
                opacity={layers.wallOpacity / 100}
                visible={layers.wall}
              />
            )}
            {frame && overlay && (
              <KonvaImage
                name="threshold"
                image={overlay}
                width={frame.width}
                height={frame.height}
                listening={false}
              />
            )}
          </Layer>

          <Layer name="pattern" visible={layers.pattern} opacity={layers.patternOpacity / 100}>
            {positions.length > 1 && (
              <Line
                points={positions.flatMap((p) => [p.x, p.y])}
                stroke={color.volt}
                strokeWidth={lineWidth}
                opacity={0.8}
                lineJoin="round"
                visible={editable}
                listening={false}
              />
            )}
            {editable &&
              positions.map((p, i) => {
                const first = i === 0;
                const anchor = anchors.includes(i);
                return (
                  <Circle
                    key={i}
                    name="shot"
                    x={p.x}
                    y={p.y}
                    radius={first ? radius * 1.2 : radius}
                    fill={first ? color.target : color.canvas}
                    stroke={anchor ? color.danger : first ? color.target : color.volt}
                    strokeWidth={(anchor || first ? 2 : 1.4) / scale}
                    hitStrokeWidth={Math.max(2, 6 / scale)}
                    draggable={!panMode}
                    onMouseDown={onShotMouseDown(i)}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => {
                      if (!drag && !shift) setHovered(null);
                    }}
                    onDragStart={() => setHovered(i)}
                    onDragMove={(e) => {
                      const at = e.target.position();
                      if (tool === 'align') setShift({ x: at.x - shots[i].x, y: at.y - shots[i].y });
                      else setDrag({ index: i, at });
                    }}
                    onDragEnd={(e) => {
                      const at = e.target.position();
                      if (tool === 'align') {
                        setOffset({ x: offset.x + at.x - shots[i].x, y: offset.y + at.y - shots[i].y });
                      } else {
                        moveShotTo(i, at);
                      }
                      setDrag(null);
                      setShift(null);
                    }}
                  />
                );
              })}
            {editable && hovered !== null && positions[hovered] && (
              <Circle
                x={positions[hovered].x}
                y={positions[hovered].y}
                radius={radius * 2.1}
                stroke={color.text}
                strokeWidth={1.2 / scale}
                listening={false}
              />
            )}
            {targets.map((t, i) => (
              <Circle
                key={`target-${i}`}
                name="auto-target"
                x={t.x}
                y={t.y}
                radius={Math.max(2, 10 / scale)}
                stroke={color.target}
                strokeWidth={1.5 / scale}
                onMouseDown={(e) => {
                  if (e.evt.button !== 0) return;
                  e.cancelBubble = true;
                  addShotsAt([t]);
                }}
              />
            ))}
            {readOnly.length > 1 && (
              <Line
                points={readOnly.flatMap((p) => [p.x, p.y])}
                stroke={color.ink}
                strokeWidth={lineWidth}
                opacity={0.6}
                listening={false}
              />
            )}
            {readOnly.map((p, i) => (
              <Circle
                key={`read-${i}`}
                name={shown === 'decals' ? 'decal' : 'read-only'}
                x={p.x}
                y={p.y}
                radius={radius}
                fill={color.canvas}
                stroke={i === 0 ? color.target : color.ink}
                strokeWidth={1.4 / scale}
                listening={false}
              />
            ))}
          </Layer>

          {comparison && (
            <ComparisonLayer comparison={comparison} scale={scale} radius={radius} lineWidth={lineWidth} />
          )}
        </Stage>
      )}
      <CanvasOverlays comparison={comparison} />
    </div>
  );
}

/** The saved spec (dashed) and the candidate (volt), with a line from each saved shot to the candidate's */
function ComparisonLayer({
  comparison,
  scale,
  radius,
  lineWidth,
}: {
  comparison: Comparison;
  scale: number;
  radius: number;
  lineWidth: number;
}) {
  const flat = (points: Pt[]) => points.flatMap((p) => [p.x, p.y]);
  return (
    <Layer listening={false}>
      <Line
        points={flat(comparison.saved)}
        stroke={color.ink}
        strokeWidth={lineWidth}
        dash={[4 / scale, 4 / scale]}
        opacity={0.9}
      />
      {comparison.saved.map((p, i) => (
        <Circle
          key={`saved-${i}`}
          name="saved"
          x={p.x}
          y={p.y}
          radius={radius * 0.9}
          stroke={color.ink}
          strokeWidth={1.2 / scale}
        />
      ))}
      <Line points={flat(comparison.candidate)} stroke={color.volt} strokeWidth={lineWidth * 1.2} />
      {comparison.candidate.map((p, i) => (
        <Circle
          key={`candidate-${i}`}
          name="candidate"
          x={p.x}
          y={p.y}
          radius={radius}
          fill={color.canvas}
          stroke={i === 0 ? color.target : color.volt}
          strokeWidth={(i === 0 ? 2 : 1.4) / scale}
        />
      ))}
      {comparison.deltas.map((d, i) => (
        <Line
          key={`stray-${i}`}
          name="stray"
          points={[d.from.x, d.from.y, d.to.x, d.to.y]}
          stroke={toneColor[d.tone]}
          strokeWidth={(d.tone === 'bad' ? 2.2 : 1.5) / scale}
          dash={d.tone === 'bad' ? undefined : [3 / scale, 2 / scale]}
        />
      ))}
      {comparison.deltas.map(
        (d, i) =>
          d.label && (
            <Text
              key={`label-${i}`}
              x={(d.from.x + d.to.x) / 2 + 4 / scale}
              y={(d.from.y + d.to.y) / 2 - 6 / scale}
              text={d.label}
              fontSize={11 / scale}
              fontFamily="JetBrains Mono Variable, monospace"
              fontStyle="bold"
              fill={color.text}
              stroke={color.canvas}
              strokeWidth={2 / scale}
              fillAfterStrokeEnabled
            />
          ),
      )}
    </Layer>
  );
}
