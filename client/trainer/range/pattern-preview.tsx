import { cn } from 'cn';
import { hintPath, onScreen, recoilPattern, type ScreenScale } from '@/engine/pattern';
import { Point } from '@/engine/point';
import { getWeaponModeConfig, type FireMode, type Weapon } from '@/engine/weapons';

// A weapon's pattern as the path to follow, drawn in SVG: faint on the range before a run, in volt in
// the pattern views (the Patterns page and the phone's viewer), in pattern-ink in the Patterns page's
// library. The same path the range draws during a run (hintPath), from a start point at the origin.

const tones = {
  // The range: pattern-ink at 22 % with its rounds at 60 %, the start point a volt ring with ticks
  faint: { line: 'stroke-pattern-ink/22', dot: 'fill-pattern-ink/60', start: 'stroke-volt' },
  // The pattern views: the pattern in volt, the start point in text
  volt: { line: 'stroke-volt/55', dot: 'fill-volt', start: 'stroke-text' },
  // The library's small patterns: pattern-ink, brighter than on the range, the start point in volt
  ink: { line: 'stroke-pattern-ink/40', dot: 'fill-pattern-ink/85', start: 'stroke-volt' },
};

// A tenth of a pixel is finer than any screen draws the pattern, and keeps the markup short
const round = (n: number) => Math.round(n * 10) / 10;

/** The area a drawing shows, in pattern pixels, the start point at the origin */
export interface Frame {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/** A pattern as PatternPreview draws it: the path to follow, and the frame that holds it */
export function patternDrawing(
  weapon: Weapon,
  count: number,
  mode: FireMode,
  { sens, invertY }: { sens: number; invertY: boolean },
  scale: ScreenScale = { scaleX: 1, scaleY: 1 },
) {
  const pattern = recoilPattern(weapon, count, { sens, invertY }).map((p) => onScreen(p, scale));
  const path = hintPath(pattern, count, mode, getWeaponModeConfig(weapon.name), new Point());
  const xs = path.dots.map((d) => d.at.x);
  const ys = path.dots.map((d) => d.at.y);
  // Room for the start ring and its ticks (14 px out), and for the dots
  const pad = 16;
  const minX = round(Math.min(-14, ...xs) - pad);
  const minY = round(Math.min(-14, ...ys) - pad);
  const frame: Frame = {
    minX,
    minY,
    width: round(Math.max(14, ...xs) + pad - minX),
    height: round(Math.max(14, ...ys) + pad - minY),
  };
  return { path, frame };
}

/**
 * One frame for several patterns, centered on the start point, so that they share a scale and their
 * start points line up: a short burst stays small beside a long spray instead of filling its box
 */
export function sharedFrame(frames: Frame[]): Frame {
  const half = Math.max(...frames.map((f) => Math.max(-f.minX, f.minX + f.width)));
  const minY = Math.min(...frames.map((f) => f.minY));
  const maxY = Math.max(...frames.map((f) => f.minY + f.height));
  return { minX: round(-half), minY, width: round(2 * half), height: round(maxY - minY) };
}

export function PatternPreview({
  weapon,
  count,
  mode,
  sens,
  invertY,
  scale = { scaleX: 1, scaleY: 1 },
  tone = 'faint',
  shown,
  label,
  frame,
  className,
  style,
}: {
  /** The weapon with its attachments */
  weapon: Weapon;
  /** Rounds in the magazine */
  count: number;
  mode: FireMode;
  /** The effective sensitivity (sensitivity × ADS) */
  sens: number;
  invertY: boolean;
  scale?: ScreenScale;
  tone?: keyof typeof tones;
  /** How many rounds show (Play spray); all of them without it */
  shown?: number;
  /** The drawing's name; without one it is decorative, as inside a button that names the weapon */
  label?: string;
  /** The area to show (sharedFrame), instead of just this pattern's */
  frame?: Frame;
  className?: string;
  style?: React.CSSProperties;
}) {
  const drawing = patternDrawing(weapon, count, mode, { sens, invertY }, scale);
  const { path } = drawing;
  const { minX, minY, width, height } = frame ?? drawing.frame;
  const c = tones[tone];
  const visible = shown ?? path.dots.length;

  return (
    <svg
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      viewBox={`${minX} ${minY} ${width} ${height}`}
      width={width}
      height={height}
      className={cn('shrink-0', className)}
      style={style}
    >
      {path.lines.map((line, i) => (
        <polyline
          key={i}
          points={line.points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ')}
          fill="none"
          className={c.line}
          strokeWidth={line.reset ? 1 : 2}
          strokeDasharray={line.reset ? '3 3' : undefined}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {path.dots.slice(0, visible).map((d, i) => (
        <circle key={i} cx={round(d.at.x)} cy={round(d.at.y)} r={2.5} className={c.dot} />
      ))}
      <circle cx={0} cy={0} r={tone === 'faint' ? 9 : 4} fill="none" className={c.start} strokeWidth={2} />
      {tone === 'faint' && (
        <path d="M0 -14V-7M0 7V14M-14 0H-7M7 0H14" fill="none" className={c.start} strokeWidth={2} />
      )}
    </svg>
  );
}
