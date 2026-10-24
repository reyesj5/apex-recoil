import { cn } from 'cn';
import { hintPath, onScreen, recoilPattern, type ScreenScale } from '@/engine/pattern';
import { Point } from '@/engine/point';
import { getWeaponModeConfig, type FireMode, type Weapon } from '@/engine/weapons';

// A weapon's pattern as the path to follow, drawn in SVG: faint on the range before a run, in volt in
// the phone's pattern viewer. The same path the range draws during a run (hintPath), from a start
// point at the origin.

const tones = {
  // The range: pattern-ink at 22 % with its rounds at 60 %, the start point a volt ring with ticks
  faint: { line: 'stroke-pattern-ink/22', dot: 'fill-pattern-ink/60', start: 'stroke-volt' },
  // The phone viewer: the pattern in volt, the start point in text
  volt: { line: 'stroke-volt/55', dot: 'fill-volt', start: 'stroke-text' },
};

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
  label: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const pattern = recoilPattern(weapon, count, { sens, invertY }).map((p) => onScreen(p, scale));
  const path = hintPath(pattern, count, mode, getWeaponModeConfig(weapon.name), new Point());
  const xs = path.dots.map((d) => d.at.x);
  const ys = path.dots.map((d) => d.at.y);
  // Room for the start ring and its ticks (14 px out), and for the dots
  const pad = 16;
  const minX = Math.min(-14, ...xs) - pad;
  const maxX = Math.max(14, ...xs) + pad;
  const minY = Math.min(-14, ...ys) - pad;
  const maxY = Math.max(14, ...ys) + pad;
  const width = maxX - minX;
  const height = maxY - minY;
  const c = tones[tone];
  const visible = shown ?? path.dots.length;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${minX} ${minY} ${width} ${height}`}
      width={width}
      height={height}
      className={cn('shrink-0', className)}
      style={style}
    >
      {path.lines.map((line, i) => (
        <polyline
          key={i}
          points={line.points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          className={c.line}
          strokeWidth={line.reset ? 1 : 2}
          strokeDasharray={line.reset ? '3 3' : undefined}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {path.dots.slice(0, visible).map((d, i) => (
        <circle key={i} cx={d.at.x} cy={d.at.y} r={2.5} className={c.dot} />
      ))}
      <circle cx={0} cy={0} r={tone === 'faint' ? 9 : 4} fill="none" className={c.start} strokeWidth={2} />
      {tone === 'faint' && (
        <path d="M0 -14V-7M0 7V14M-14 0H-7M7 0H14" fill="none" className={c.start} strokeWidth={2} />
      )}
    </svg>
  );
}
