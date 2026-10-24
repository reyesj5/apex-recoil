import { useId, useState } from 'react';
import { DownloadIcon, FileUpIcon, PlusIcon, RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useScreenshots, useSessions, type CaptureSession, type Screenshot } from '@/lib/api';
import { useEditorSettings } from '@/lib/storage/editor';
import { addLibraryScreenshot, importFiles, loadSavedSession, messageOf } from '../actions';
import { EmptyWell, Notice } from '../fields';
import { newId } from '../media';
import { importDiscoveryJson } from '../model/spec';
import { fireModeName, plural, weaponName } from '../names';
import { editSpec, setBackground, setSection, specOf, useStudio } from '../store';
import { addedMessage } from './screenshots-tab';

// The rail's other sections: the server's screenshot library, the saved capture sessions (with clips
// to import), and a discovery JSON to apply to the weapon.

type Message = { tone: 'neutral' | 'positive' | 'warning' | 'danger'; text: string } | null;

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });
const sizeFormat = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

function RefreshButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      <RefreshCwIcon aria-hidden="true" />
      {label}
    </Button>
  );
}

/** Wall screenshots kept on the server, from analyses saved with them */
export function LibraryPanel() {
  const library = useScreenshots();
  const [message, setMessage] = useState<Message>(null);
  const screenshots = library.data ?? [];
  const add = (s: Screenshot) =>
    addLibraryScreenshot(s)
      .then((r) => setMessage(addedMessage(r)))
      .catch((err: unknown) => setMessage({ tone: 'danger', text: messageOf(err) }));

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 text-xs text-text-secondary">{plural(screenshots.length, 'screenshot')} on the server</p>
        <RefreshButton label="Refresh" onClick={() => void library.refetch()} />
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {library.isError && <Notice tone="danger">The library could not be loaded.</Notice>}
      {screenshots.length === 0 && !library.isLoading ? (
        <EmptyWell>Screenshots analyzed with Keep the files in the captures appear here.</EmptyWell>
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
          {screenshots.map((s) => (
            <li key={s.url} className="flex flex-col gap-1.5 rounded-card border border-outline-card bg-card p-2">
              <button
                type="button"
                className="cursor-pointer"
                aria-label={`Show ${s.filename} on the canvas`}
                onClick={() =>
                  setBackground({ key: newId(`library:${s.filename}`), name: s.filename, src: s.url, correct: true })
                }
              >
                <img
                  src={s.url}
                  alt=""
                  loading="lazy"
                  className="aspect-video w-full rounded-sm bg-inset object-cover"
                />
              </button>
              <span className="truncate text-11 font-semibold" title={s.filename}>
                {s.filename}
              </span>
              <span className="text-11 text-text-muted">
                {dateFormat.format(new Date(s.timestamp))} · {sizeFormat(s.sizeBytes)}
              </span>
              <Button variant="secondary" size="sm" onClick={() => void add(s)}>
                <PlusIcon aria-hidden="true" />
                Add to Screenshots
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Saved capture sessions, to load into the Live tab again; and clips from disk */
export function SessionsPanel() {
  const inputId = useId();
  const sessions = useSessions();
  const [message, setMessage] = useState<Message>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const list = sessions.data ?? [];

  const load = (session: CaptureSession) => {
    setLoading(session.id);
    loadSavedSession(session)
      .then((count) => {
        setMessage({
          tone: 'positive',
          text: `Loaded ${plural(count, 'spray')} of ${weaponName(session.weapon)} into the Live tab. Analyze them there.`,
        });
        useEditorSettings.getState().set('recordingMethod', 'live');
      })
      .catch((err: unknown) =>
        setMessage({ tone: 'danger', text: `The session could not be loaded: ${messageOf(err)}` }),
      )
      .finally(() => setLoading(null));
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" asChild>
          <label htmlFor={inputId} className="cursor-pointer">
            <FileUpIcon aria-hidden="true" />
            Import clips
          </label>
        </Button>
        <input
          id={inputId}
          type="file"
          multiple
          accept="video/webm,video/mp4,image/jpeg,image/png"
          className="sr-only"
          aria-label="Import clips and their wall screenshots"
          onChange={(e) => {
            const input = e.currentTarget;
            const files = Array.from(input.files ?? []);
            input.value = '';
            if (files.length === 0) return;
            void importFiles(files).then((result) => {
              if (result.kind === 'screenshots') {
                setMessage(addedMessage(result));
                useEditorSettings.getState().set('recordingMethod', 'offline');
                return;
              }
              const { added, duplicates } = result;
              setMessage(
                added === 0
                  ? { tone: 'warning', text: 'These clips are imported already.' }
                  : {
                      tone: duplicates ? 'neutral' : 'positive',
                      text: `Imported ${plural(added, 'clip')} into the Live tab${duplicates ? ` (${plural(duplicates, 'duplicate')} left out)` : ''}.`,
                    },
              );
              useEditorSettings.getState().set('recordingMethod', 'live');
            });
          }}
        />
        <RefreshButton label="Refresh" onClick={() => void sessions.refetch()} />
      </div>
      <p className="m-0 text-xs leading-normal text-text-muted">
        Import recorded clips (.webm, .mp4) with their wall screenshots (spray_01.webm and spray_01_wall.jpg go
        together), or images alone into the Screenshots tab.
      </p>
      {message && (
        <Notice tone={message.tone}>
          {message.text}{' '}
          {message.tone !== 'danger' && (
            <button type="button" className="cursor-pointer text-volt underline" onClick={() => setSection('capture')}>
              Go to Capture
            </button>
          )}
        </Notice>
      )}
      {sessions.isError && <Notice tone="danger">The sessions could not be loaded.</Notice>}
      {list.length === 0 && !sessions.isLoading ? (
        <EmptyWell>Sprays analyzed with Keep the files in the captures appear here as sessions.</EmptyWell>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {list.map((s) => (
            <SessionItem key={s.id} session={s} loading={loading} onLoad={load} />
          ))}
        </ul>
      )}
    </>
  );
}

function SessionItem({
  session: s,
  loading,
  onLoad,
}: {
  session: CaptureSession;
  loading: string | null;
  onLoad: (session: CaptureSession) => void;
}) {
  const figures = [
    s.shot_count ? `${s.shot_count} shots` : '',
    s.measured_rpm ? `${Math.round(s.measured_rpm)} RPM` : '',
    s.convergence_score ? `convergence ${s.convergence_score}` : '',
  ].filter(Boolean);
  return (
    <li className="flex flex-col gap-1.5 rounded-card border border-outline-card bg-card p-3">
      <span className="text-13 font-semibold">
        {weaponName(s.weapon)} <span className="font-normal text-text-secondary">{fireModeName(s.mode)}</span>
      </span>
      <span className="text-xs text-text-secondary">
        {plural(s.samplesCount, 'spray')} · {s.date}
      </span>
      {figures.length > 0 && <span className="font-mono text-11 text-text-muted">{figures.join(' · ')}</span>}
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        disabled={loading !== null}
        onClick={() => onLoad(s)}
        aria-label={`Load the ${weaponName(s.weapon)} session of ${s.date}`}
      >
        <DownloadIcon aria-hidden="true" />
        {loading === s.id ? 'Loading…' : 'Load'}
      </Button>
    </li>
  );
}

/** A discovery JSON (the analysis' answer, or a spec) applied to the selected weapon */
export function ImportPanel() {
  const id = useId();
  const weapon = useEditorSettings((s) => s.weapon);
  const spec = useStudio((s) => specOf(s, weapon));
  const [text, setText] = useState('');
  const [message, setMessage] = useState<Message>(null);
  return (
    <>
      <p className="m-0 text-xs leading-normal text-text-secondary">
        Paste a pattern from the discovery tools (<code className="font-mono">recoil_discovery process --json</code>) or
        a spec. Its pattern, fire rate, shot times and magazines replace those of {weaponName(weapon)}; Save spec keeps
        them.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id} className="text-xs font-normal text-text-secondary">
          Discovery JSON
        </Label>
        <textarea
          id={id}
          rows={10}
          value={text}
          placeholder='{"x": [0, 1.5, …], "y": [0, -12.3, …], "rpm": 600}'
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-control border border-field bg-inset px-2.5 py-2 font-mono text-xs text-text placeholder:text-text-muted"
        />
      </div>
      <Button
        disabled={!spec || text.trim() === ''}
        onClick={() => {
          if (!spec) return;
          const result = importDiscoveryJson(spec, text);
          if ('error' in result) {
            setMessage({ tone: 'danger', text: result.error });
            return;
          }
          editSpec(weapon, () => result.spec);
          setMessage({ tone: 'positive', text: `Applied to ${weaponName(weapon)}: ${result.spec.x.length} shots.` });
        }}
      >
        Apply to {weaponName(weapon)}
      </Button>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </>
  );
}
