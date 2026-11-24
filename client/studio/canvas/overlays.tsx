import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CirclePlusIcon,
  HandIcon,
  MaximizeIcon,
  MinusIcon,
  MousePointer2Icon,
  MoveIcon,
  PlusIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import { cn } from 'cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditorSettings } from '@/lib/storage/editor';
import { describeWarning, type Status } from '../model/discrepancy';
import { zoomAt, type Comparison } from '../model/placement';
import { expectedShots, shotCount } from '../model/spec';
import { frames, goToFrame, requestFit, setComparing, setTool, setView, specOf, useStudio, type Tool } from '../store';

// What floats over the canvas: the tool palette (top left), the spray navigator (top center), the
// comparison's figures (top right), the status pill (bottom center) and the zoom (bottom right).

const tools: { tool: Tool; label: string; key: string; icon: LucideIcon }[] = [
  { tool: 'select', label: 'Select and move shots', key: 'V', icon: MousePointer2Icon },
  { tool: 'pan', label: 'Pan (or hold Space)', key: 'H', icon: HandIcon },
  { tool: 'align', label: 'Align whole spray', key: 'A', icon: MoveIcon },
  { tool: 'correct', label: 'Correct shots: add or remove holes', key: 'C', icon: CirclePlusIcon },
];

const toolButton =
  'flex size-icon cursor-pointer items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-hover hover:text-text aria-pressed:bg-volt aria-pressed:text-volt-ink';

export function CanvasOverlays({ comparison }: { comparison: Comparison | null }) {
  return (
    <>
      <ToolPalette />
      <FrameNavigator />
      {comparison && <ComparisonCard comparison={comparison} />}
      {!comparison && <StatusPill />}
      <ZoomControl />
    </>
  );
}

function ToolPalette() {
  const active = useStudio((s) => s.tool);
  return (
    <div
      role="toolbar"
      aria-label="Canvas tools"
      aria-orientation="vertical"
      className="absolute top-4 left-4 flex flex-col gap-1 rounded-card-lg border border-divider bg-panel p-1"
    >
      {tools.map(({ tool, label, key, icon: Icon }) => (
        <Tooltip key={tool}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-pressed={active === tool}
              aria-label={label}
              aria-keyshortcuts={key}
              className={toolButton}
              onClick={() => setTool(tool)}
            >
              <Icon className="size-4.5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {label}
            <Kbd>{key}</Kbd>
          </TooltipContent>
        </Tooltip>
      ))}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Fit and center"
            aria-keyshortcuts="F"
            className={toolButton}
            onClick={requestFit}
          >
            <MaximizeIcon className="size-4.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          Fit and center
          <Kbd>F</Kbd>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function ZoomControl() {
  const view = useStudio((s) => s.view);
  const zoom = (factor: number) => {
    const canvas = document.querySelector<HTMLElement>('[data-testid="studio-canvas"]');
    const center = { x: (canvas?.clientWidth ?? 0) / 2, y: (canvas?.clientHeight ?? 0) / 2 };
    setView(zoomAt(useStudio.getState().view, factor, center));
  };
  return (
    <div className="absolute right-4 bottom-4 flex items-center gap-0.5 rounded-card border border-divider bg-panel p-[3px]">
      <button
        type="button"
        aria-label="Zoom out"
        className="flex size-segment cursor-pointer items-center justify-center rounded-segment text-text-secondary hover:bg-hover hover:text-text"
        onClick={() => zoom(1 / 1.25)}
      >
        <MinusIcon className="size-4" aria-hidden="true" />
      </button>
      <output aria-label="Zoom" className="min-w-12 text-center font-mono text-xs">
        {Math.round(view.scale * 100)}%
      </output>
      <button
        type="button"
        aria-label="Zoom in"
        className="flex size-segment cursor-pointer items-center justify-center rounded-segment text-text-secondary hover:bg-hover hover:text-text"
        onClick={() => zoom(1.25)}
      >
        <PlusIcon className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="h-segment cursor-pointer rounded-segment bg-hover px-2.5 text-xs font-semibold text-text hover:bg-divider"
        onClick={requestFit}
      >
        Fit
      </button>
    </div>
  );
}

function FrameNavigator() {
  const session = useStudio((s) => s.session);
  const batch = useStudio((s) => s.batch);
  const frame = useStudio((s) => s.frame);
  const list = frames({ session, batch });
  if (list.length < 2) return null;
  const current = list[Math.min(frame, list.length - 1)];
  return (
    <nav
      aria-label="Sprays"
      className="absolute top-4 left-1/2 flex max-w-[calc(100%-200px)] -translate-x-1/2 items-center gap-1 rounded-card border border-divider bg-panel p-[3px] text-xs"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Previous spray"
        aria-keyshortcuts="["
        onClick={() => goToFrame(frame - 1)}
      >
        <ChevronLeftIcon aria-hidden="true" />
      </Button>
      <span className="min-w-0 truncate px-1 text-text-secondary">
        <strong className="font-mono text-text">
          {frame + 1}/{list.length}
        </strong>{' '}
        {current.name}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Next spray"
        aria-keyshortcuts="]"
        onClick={() => goToFrame(frame + 1)}
      >
        <ChevronRightIcon aria-hidden="true" />
      </Button>
    </nav>
  );
}

const toolHints: Record<Tool, string> = {
  select: 'drag to move, right-click to remove',
  correct: 'click to add a shot, right-click to remove',
  align: 'drag the spray onto the decals',
  pan: 'drag to pan',
};

function StatusPill() {
  const weapon = useEditorSettings((s) => s.weapon);
  const spec = useStudio((s) => specOf(s, weapon));
  const shown = useStudio((s) => s.shown);
  const tool = useStudio((s) => s.tool);
  const hovered = useStudio((s) => s.hovered);
  const session = useStudio((s) => s.session);
  const batch = useStudio((s) => s.session?.batch);
  if (!spec) return null;
  const count = shotCount(spec);
  const expected = session ? expectedShots(spec.mags) : 0;
  const missing = expected - count;

  let text: React.ReactNode;
  if (shown === 'saved') text = 'The saved spec (read-only)';
  else if (shown === 'batch') text = `The new samples alone: ${batch ? shotCount(batch) : 0} shots (read-only)`;
  else if (shown === 'decals') text = 'The decals the analysis found on this spray (read-only)';
  else if (hovered !== null && hovered < count) {
    text = (
      <>
        Shot <strong className="font-mono text-text">{hovered + 1}</strong> of {count} · {toolHints[tool]}
      </>
    );
  } else {
    text = (
      <>
        <strong className="font-mono text-text">{count}</strong> shots · {toolHints[tool]}
      </>
    );
  }

  return (
    <div
      role="status"
      className="absolute bottom-4 left-1/2 flex max-w-[calc(100%-22rem)] -translate-x-1/2 items-center gap-2 rounded-pill border border-divider bg-panel px-2.5 py-1.5 text-xs whitespace-nowrap text-text-secondary"
    >
      {expected > 0 && missing !== 0 && shown === 'draft' && (
        <Badge variant="warning" size="sm">
          {count}/{expected} shots ({Math.abs(missing)} {missing > 0 ? 'missing' : 'extra'})
        </Badge>
      )}
      <span className="min-w-0 truncate">{text}</span>
    </div>
  );
}

const statusText: Record<Status, string> = {
  safe: 'Consistent',
  warning: 'Moderate drift',
  danger: 'Major discrepancy',
};

const statusTone = { safe: 'positive', warning: 'warning', danger: 'danger' } as const;

function ComparisonCard({ comparison }: { comparison: Comparison }) {
  const { report } = comparison;
  return (
    <section
      aria-label="Saved spec against the candidate"
      className="absolute top-4 right-4 flex w-72 flex-col gap-3 rounded-card-lg border border-divider bg-panel-glass p-3.5 text-xs shadow-float"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-13 font-semibold">Saved spec against the candidate</h3>
        <Button variant="ghost" size="icon-sm" aria-label="Close the comparison" onClick={() => setComparing(false)}>
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        <dt className="text-text-secondary">Shots</dt>
        <dd className={cn('text-right font-mono', report.shotCountMatches ? 'text-text' : 'text-danger')}>
          {report.savedShots} vs {report.candidateShots}
        </dd>
        <dt className="text-text-secondary">Average stray</dt>
        <dd className="text-right font-mono">
          {report.meanPx.toFixed(1)} px ({report.meanCounts.toFixed(1)} counts)
        </dd>
        <dt className="text-text-secondary">Largest stray</dt>
        <dd className="text-right font-mono">
          {report.maxPx.toFixed(1)} px (shot {report.maxShot + 1})
        </dd>
      </dl>
      <StatusBadge status={report.status} />
      {report.warnings.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-4 text-text-secondary">
          {report.warnings.map((w) => (
            <li key={w.kind}>{describeWarning(w)}</li>
          ))}
        </ul>
      )}
      <ul aria-label="Legend" className="flex flex-col gap-1 border-t border-outline pt-2.5 text-text-secondary">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="w-5 border-t-2 border-dashed border-pattern-ink" />
          Saved spec
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="w-5 border-t-2 border-volt" />
          Candidate to save
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="w-5 border-t-2 border-danger" />
          How far a shot strays
        </li>
      </ul>
    </section>
  );
}

/** How a candidate compares with the saved spec, as a badge */
export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <Badge variant={statusTone[status]} dot className={className}>
      {statusText[status]}
    </Badge>
  );
}
