import { useEffect, useId, useRef } from 'react';
import {
  CameraIcon,
  CircleStopIcon,
  DownloadIcon,
  EyeIcon,
  Maximize2Icon,
  RefreshCwIcon,
  RotateCcwIcon,
  Trash2Icon,
  UnplugIcon,
  Volume2Icon,
  XIcon,
  ZapIcon,
} from 'lucide-react';
import { cn } from 'cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditorSettings } from '@/lib/storage/editor';
import { Card, EmptyWell, Notice } from '../fields';
import { download, newId, previewFilter } from '../media';
import type { Sample } from '../model/capture';
import { clearSamples, discard, goToFrame, openDialog, setBackground, toggleSlot, useStudio } from '../store';
import { AnalysisStatus } from './analysis-status';
import { useLiveCaptureContext, type LiveCapture } from './use-live-capture';

// The Live tab: share the game window, fire full sprays at the wall, and the Studio records each one
// with a screenshot of the wall taken once the player has reloaded and aimed back at the decals.

export function LiveTab() {
  const capture = useLiveCaptureContext();
  const samples = useStudio((s) => s.samples);
  const running = useStudio((s) => s.analyses.session?.state === 'sending' || s.analyses.session?.state === 'running');
  return (
    <>
      <RecordingCard capture={capture} />
      <section aria-label="Samples" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="m-0 type-label">Samples</h3>
          <span className="ml-auto text-xs text-text-muted">{samples.length} collected</span>
          {samples.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearSamples}>
              <Trash2Icon aria-hidden="true" />
              Clear
            </Button>
          )}
        </div>
        {samples.length === 0 ? (
          <EmptyWell>
            Recorded sprays appear here, or load a saved session (Sessions). Analyze them together to build a median
            pattern.
          </EmptyWell>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {samples.map((sample, i) => (
              <li key={sample.id}>
                <SampleCard sample={sample} index={i} capture={capture} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <Button
        disabled={samples.length === 0 || running}
        onClick={() => openDialog({ kind: 'analysis', analysis: 'session' })}
      >
        <ZapIcon aria-hidden="true" />
        Analyze the sprays
      </Button>
      <AnalysisStatus kind="session" />
    </>
  );
}

function triggerLabel(capture: LiveCapture) {
  const { state, remaining } = capture;
  if (!state.connected) return 'Trigger idle';
  if (state.phase === 'recording') return 'Recording the spray';
  if (state.phase === 'reaim') return `Aim back at the wall: ${(remaining / 1000).toFixed(1)} s`;
  if (state.previewPlaying) return 'Muted while a sample plays';
  return 'Listening for gunfire';
}

function RecordingCard({ capture }: { capture: LiveCapture }) {
  const id = useId();
  const settings = useEditorSettings();
  const { state } = capture;
  const recording = state.phase !== 'idle';
  return (
    <Card
      title="Live recording"
      aside={
        <div className="flex flex-wrap justify-end gap-1.5">
          <Badge size="sm" variant={state.connected ? 'positive' : 'neutral'} dot role="status">
            {state.connected ? 'Connected' : 'Not connected'}
          </Badge>
          <Badge size="sm" variant={recording ? 'warning' : 'neutral'} role="status">
            {triggerLabel(capture)}
          </Badge>
        </div>
      }
    >
      <ol className="m-0 flex flex-col gap-1.5 pl-4.5 text-13 leading-normal text-text-secondary">
        <li>Stand {settings.captureDistance} m from the target wall with the optic set above.</li>
        <li>Fire the full magazine and let it reload.</li>
        <li>Aim back at the decals: the wall is captured when the buffer ends, or with Snap wall (Space).</li>
      </ol>
      {!state.connected ? (
        <Button size="lg" onClick={capture.connect}>
          Connect game window
        </Button>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-card border border-divider bg-black">
            <video
              ref={(el) => {
                if (el && el.srcObject !== capture.display) {
                  el.srcObject = capture.display;
                  void el.play().catch(() => undefined);
                }
              }}
              autoPlay
              muted
              playsInline
              aria-label="The shared game window"
              className="aspect-video w-full"
              style={{ filter: previewFilter[settings.hdrMode] }}
            />
            {state.phase === 'recording' && (
              <span className="absolute top-2 left-2 rounded-pill bg-danger px-2 py-0.5 text-11 font-bold text-white">
                ● Recording
              </span>
            )}
            {state.phase === 'reaim' && (
              <span className="absolute inset-x-2 top-2 rounded-card bg-panel-glass px-2 py-1 text-center text-xs font-semibold text-warning">
                Reloading: aim back at the wall ({(capture.remaining / 1000).toFixed(1)} s)
              </span>
            )}
          </div>
          <SensorMeter capture={capture} threshold={settings.triggerThreshold} />
          <LevelSlider
            label="Trigger level"
            value={settings.triggerThreshold}
            min={5}
            max={80}
            step={1}
            unit="%"
            onChange={(v) => settings.set('triggerThreshold', v)}
          />
          <LevelSlider
            label="Reload and re-aim time"
            value={settings.reaimBuffer}
            min={1.5}
            max={8}
            step={0.5}
            unit=" s"
            onChange={(v) => settings.set('reaimBuffer', v)}
          />
          <div className="flex flex-col gap-1.5">
            <Label id={`${id}-source`} className="text-xs font-normal text-text-secondary">
              Audio input
            </Label>
            <div className="flex gap-2">
              <Select value={capture.source} onValueChange={capture.selectSource}>
                <SelectTrigger size="sm" aria-labelledby={`${id}-source`} className="w-full min-w-0">
                  <SelectValue>{capture.sources.find((s) => s.id === capture.source)?.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {capture.sources.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="secondary" size="sm" onClick={capture.reconnect}>
                <RefreshCwIcon aria-hidden="true" />
                Reconnect
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={recording ? 'default' : 'secondary'} size="sm" onClick={capture.manual}>
              {recording ? <CircleStopIcon aria-hidden="true" /> : <CameraIcon aria-hidden="true" />}
              {recording ? 'Finish the spray' : 'Record a spray by hand'}
            </Button>
            {recording && (
              <Button variant="secondary" size="sm" onClick={capture.snap} aria-keyshortcuts="Space">
                <CameraIcon aria-hidden="true" />
                Snap wall
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={capture.disconnect}>
              <UnplugIcon aria-hidden="true" />
              Disconnect
            </Button>
          </div>
        </>
      )}
      {capture.alert && (
        <Notice tone="warning">
          <span className="flex items-start gap-2">
            <span className="flex-1">{capture.alert}</span>
            <button
              type="button"
              aria-label="Dismiss"
              className="cursor-pointer text-text-secondary hover:text-text"
              onClick={capture.dismissAlert}
            >
              <XIcon className="size-3.5" aria-hidden="true" />
            </button>
          </span>
        </Notice>
      )}
    </Card>
  );
}

/** The gunfire sensor's level against the trigger level, updated without re-rendering the tab */
function SensorMeter({ capture, threshold }: { capture: LiveCapture; threshold: number }) {
  const bar = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const { subscribeLevel } = capture;
  useEffect(
    () =>
      subscribeLevel((level, triggered) => {
        if (bar.current) {
          bar.current.style.width = `${level}%`;
          bar.current.dataset.triggered = String(triggered);
        }
        if (text.current) text.current.textContent = `${level}%`;
      }),
    [subscribeLevel],
  );
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs text-text-secondary">
        <span>Gunfire sensor</span>
        <span ref={text} className="font-mono text-text">
          0%
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-pill bg-hover">
        <div
          ref={bar}
          className="h-full w-0 bg-text-muted transition-[width] duration-75 data-[triggered=true]:bg-warning"
        />
        <span aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-volt" style={{ left: `${threshold}%` }} />
      </div>
    </div>
  );
}

function LevelSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs text-text-secondary">
        <span id={id}>{label}</span>
        <span className="font-mono text-text">
          {value}
          {unit}
        </span>
      </div>
      <Slider
        aria-labelledby={id}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}

function SampleAction({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={onClick}
          className="aria-pressed:bg-volt-wash aria-pressed:text-volt"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function SampleCard({ sample, index, capture }: { sample: Sample; index: number; capture: LiveCapture }) {
  const weapon = useEditorSettings((s) => s.weapon);
  const slot = useStudio((s) => s.slot);
  const session = useStudio((s) => s.session);
  const target = slot === index;
  const resnapping = capture.resnap?.index === index;
  const show = () => {
    if (session && session.trials.length > index) goToFrame(index);
    else if (sample.wall) setBackground({ key: newId(sample.id), name: sample.name, src: sample.wall, correct: true });
  };
  const play = () => {
    const audio = new Audio(sample.url);
    capture.setPreviewPlaying(true);
    audio.onended = audio.onpause = () => capture.setPreviewPlaying(false);
    void audio.play().catch(() => capture.setPreviewPlaying(false));
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-card border bg-card p-2.5',
        target ? 'border-warning' : 'border-outline-card',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{sample.name}</span>
        {sample.durationSec > 0 && <span className="font-mono text-11 text-text-muted">{sample.durationSec} s</span>}
        {target && (
          <Badge variant="warning" size="sm">
            Next recording replaces it
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <video
          src={sample.url}
          controls
          muted
          preload="metadata"
          aria-label={`${sample.name}: the recorded spray`}
          className="aspect-video w-full rounded-sm bg-black"
          onPlay={() => capture.setPreviewPlaying(true)}
          onPause={() => capture.setPreviewPlaying(false)}
          onEnded={() => capture.setPreviewPlaying(false)}
        />
        {sample.wall ? (
          <button
            type="button"
            className="cursor-pointer"
            aria-label={`Show the wall of ${sample.name} on the canvas`}
            onClick={show}
          >
            <img src={sample.wall} alt="" className="aspect-video w-full rounded-sm bg-inset object-cover" />
          </button>
        ) : (
          <span className="flex aspect-video items-center justify-center rounded-sm border border-dashed border-outline-strong text-11 text-text-muted">
            No wall
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-0.5">
        <SampleAction label="Show on the canvas" onClick={show} disabled={!sample.wall && !session}>
          <EyeIcon aria-hidden="true" />
        </SampleAction>
        <SampleAction
          label={resnapping ? `Capturing the wall in ${capture.resnap?.seconds} s` : 'Capture the wall again (in 3 s)'}
          onClick={() => capture.resnapWall(index)}
          disabled={!capture.state.connected || !!capture.resnap}
        >
          <CameraIcon aria-hidden="true" />
        </SampleAction>
        <SampleAction
          label="Save the wall image"
          onClick={() => sample.wall && download(sample.wall, `${weapon}_spray_${index + 1}_wall.jpg`)}
          disabled={!sample.wall}
        >
          <DownloadIcon aria-hidden="true" />
        </SampleAction>
        <SampleAction label="Play the sound" onClick={play}>
          <Volume2Icon aria-hidden="true" />
        </SampleAction>
        <SampleAction
          label="Enlarge"
          onClick={() => openDialog({ kind: 'video', title: sample.name, url: sample.url })}
        >
          <Maximize2Icon aria-hidden="true" />
        </SampleAction>
        <SampleAction label="Record this spray again" pressed={target} onClick={() => toggleSlot(index)}>
          <RotateCcwIcon aria-hidden="true" />
        </SampleAction>
        <SampleAction label="Discard" onClick={() => discard(index)}>
          <Trash2Icon aria-hidden="true" />
        </SampleAction>
      </div>
      {resnapping && (
        <Notice tone="warning">
          Capturing in {capture.resnap?.seconds} s: switch to the game, aim down sights and point at the decals.
        </Notice>
      )}
    </div>
  );
}
