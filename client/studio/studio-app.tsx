import { useEffect } from 'react';
import { DownloadIcon, FolderIcon, ImageIcon, VideoIcon, type LucideIcon } from 'lucide-react';
import { cn } from 'cn';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useDiscoveryStatus, useSpecs } from '@/lib/api';
import { useEditorSettings } from '@/lib/storage/editor';
import { StudioCanvas } from './canvas/studio-canvas';
import { StudioDialogs } from './dialogs';
import { Inspector } from './inspector';
import { describeProgress } from './panels/analysis-status';
import { CapturePanel } from './panels/capture-panel';
import { ImportPanel, LibraryPanel, SessionsPanel } from './panels/other-panels';
import { LiveCaptureContext, useLiveCapture } from './panels/use-live-capture';
import { weaponName } from './names';
import { setSaved, setSection, specOf, useStudio, type Section } from './store';
import { StudioTopBar } from './top-bar';
import { useShortcuts } from './use-shortcuts';

// The Studio (docs/ui-migration-plan.md, Phase 3): the top bar, the icon rail and its section, the
// canvas, the inspector and the status bar, from the Studio artboard. It is a tool for desktop
// screens, rendered in the browser (no prerender), without analytics or a consent banner.

const sections: { id: Section; short: string; label: string; icon: LucideIcon; title: string }[] = [
  { id: 'capture', short: 'Capture', label: 'Capture', icon: VideoIcon, title: 'Capture' },
  { id: 'library', short: 'Library', label: 'Screenshot library', icon: ImageIcon, title: 'Screenshot library' },
  { id: 'sessions', short: 'Sessions', label: 'Saved sessions', icon: FolderIcon, title: 'Saved sessions' },
  { id: 'import', short: 'Import', label: 'Import discovery JSON', icon: DownloadIcon, title: 'Import' },
];

export function StudioApp() {
  const specs = useSpecs();
  const capture = useLiveCapture();
  const sidebarCollapsed = useEditorSettings((s) => s.sidebarCollapsed);
  const inspectorCollapsed = useEditorSettings((s) => s.toolsCollapsed);
  useShortcuts();

  useEffect(() => {
    if (specs.data) setSaved(specs.data);
  }, [specs.data]);

  return (
    <LiveCaptureContext value={capture}>
      <TooltipProvider>
        <div className="flex h-screen min-h-0 flex-col bg-ground text-13 text-text">
          <StudioTopBar />
          <div className="flex min-h-0 flex-1">
            <Rail />
            {!sidebarCollapsed && <SidePanel />}
            <main aria-label="Canvas" className="flex min-w-0 flex-1 flex-col">
              {specs.isError ? (
                <p role="alert" className="m-auto max-w-sm text-center text-text-secondary">
                  The specs could not be loaded from the server: {specs.error.message}
                </p>
              ) : (
                <StudioCanvas />
              )}
            </main>
            {!inspectorCollapsed && <Inspector />}
          </div>
          <StatusBar />
        </div>
        <StudioDialogs />
        <Toaster position="bottom-center" />
      </TooltipProvider>
    </LiveCaptureContext>
  );
}

function Rail() {
  const current = useStudio((s) => s.section);
  const collapsed = useEditorSettings((s) => s.sidebarCollapsed);
  return (
    <nav
      aria-label="Studio sections"
      className="flex w-16 shrink-0 flex-col items-center gap-1.5 border-r border-outline bg-inset py-3"
    >
      {sections.map(({ id, short, label, icon: Icon }) => {
        const active = current === id && !collapsed;
        return (
          <button
            key={id}
            type="button"
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-13 w-12 cursor-pointer flex-col items-center justify-center gap-0.75 rounded-card text-text-muted transition-colors hover:bg-hover hover:text-text',
              active && 'bg-hover text-text',
            )}
            onClick={() => {
              setSection(id);
              if (collapsed) useEditorSettings.getState().set('sidebarCollapsed', false);
            }}
          >
            <Icon className="size-5" aria-hidden="true" />
            <span className="type-micro">{short}</span>
          </button>
        );
      })}
    </nav>
  );
}

function SidePanel() {
  const section = useStudio((s) => s.section);
  const { title } = sections.find((s) => s.id === section) ?? sections[0];
  return (
    <aside
      aria-label={title}
      className="flex w-85 shrink-0 flex-col gap-3.5 overflow-y-auto border-r border-outline bg-panel p-4"
    >
      <h2 className="m-0 type-panel-title">{title}</h2>
      {section === 'capture' && <CapturePanel />}
      {section === 'library' && <LibraryPanel />}
      {section === 'sessions' && <SessionsPanel />}
      {section === 'import' && <ImportPanel />}
    </aside>
  );
}

function StatusBar() {
  const weapon = useEditorSettings((s) => s.weapon);
  const scale = useEditorSettings((s) => s.scaleFactor);
  const spec = useStudio((s) => specOf(s, weapon));
  const job = useStudio((s) => s.job);
  const status = useDiscoveryStatus().data;
  return (
    <footer className="flex flex-wrap gap-4 border-t border-outline bg-inset px-4 py-1.5 text-11 text-text-muted">
      <span>
        {weaponName(weapon)} · {spec ? `${spec.x.length} shots` : 'loading'} · scale {Math.round(scale * 100)}%
      </span>
      <span className="ml-auto" role="status">
        Job queue{status?.queue === 'redis' ? ' (Redis)' : ''}:{' '}
        {job ? `${describeProgress(job.progress)}, ${Math.round(job.progress.progress)}%` : 'idle'}
      </span>
      <span>Storage: {status ? (status.storage === 's3' ? 'object storage (S3)' : 'local') : '…'}</span>
    </footer>
  );
}
