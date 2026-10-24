import { useId, useState } from 'react';
import { FolderOpenIcon, PlusIcon, RefreshCwIcon, Trash2Icon, XIcon, ZapIcon } from 'lucide-react';
import { cn } from 'cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useScreenshots } from '@/lib/api';
import { addLibraryScreenshot, addScreenshotFiles, messageOf } from '../actions';
import { Card, EmptyWell, Notice } from '../fields';
import { plural } from '../names';
import { clearBatch, goToFrame, openDialog, removeFromBatch, useStudio, type BatchItem } from '../store';
import { AnalysisStatus } from './analysis-status';

// The Screenshots tab: wall screenshots from disk or the server's library, analyzed together. Each
// one shows on the canvas when clicked, or with [ and ].

type Message = { tone: 'neutral' | 'positive' | 'warning' | 'danger'; text: string } | null;

/** "Added 2 screenshots", with the duplicates left out */
export function addedMessage({ added, duplicates }: { added: number; duplicates: number }): Message {
  if (added === 0 && duplicates > 0) return { tone: 'warning', text: 'Already in the list: nothing was added.' };
  const text = `Added ${plural(added, 'screenshot')}`;
  return duplicates > 0
    ? { tone: 'neutral', text: `${text} (${plural(duplicates, 'duplicate')} left out).` }
    : { tone: 'positive', text: `${text}.` };
}

export function ScreenshotsTab() {
  const inputId = useId();
  const batch = useStudio((s) => s.batch);
  const frame = useStudio((s) => s.frame);
  const session = useStudio((s) => s.session);
  const running = useStudio((s) => s.analyses.static?.state === 'sending' || s.analyses.static?.state === 'running');
  const [message, setMessage] = useState<Message>(null);

  return (
    <>
      <LibraryCard onAdded={setMessage} />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" asChild>
          <label htmlFor={inputId} className="cursor-pointer">
            <FolderOpenIcon aria-hidden="true" />
            Choose images
          </label>
        </Button>
        <input
          id={inputId}
          type="file"
          accept="image/png,image/jpeg"
          multiple
          className="sr-only"
          aria-label="Choose wall screenshots"
          onChange={(e) => {
            const input = e.currentTarget;
            const files = Array.from(input.files ?? []);
            input.value = '';
            if (files.length > 0) void addScreenshotFiles(files).then((r) => setMessage(addedMessage(r)));
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={batch.length === 0}
          onClick={() => {
            clearBatch();
            setMessage(null);
          }}
        >
          <Trash2Icon aria-hidden="true" />
          Clear
        </Button>
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <section aria-label="Screenshots to analyze" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="m-0 type-label">Screenshots</h3>
          <span className="text-xs text-text-muted">{batch.length} loaded</span>
        </div>
        {batch.length === 0 ? (
          <EmptyWell>Screenshots you add appear here. Analyze them together to build a median pattern.</EmptyWell>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {batch.map((item, i) => (
              <li key={item.id}>
                <ScreenshotCard item={item} index={i} active={!session && i === frame} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <Button
        disabled={batch.length === 0 || running}
        onClick={() => openDialog({ kind: 'analysis', analysis: 'static' })}
      >
        <ZapIcon aria-hidden="true" />
        {batch.length > 0 ? `Analyze ${plural(batch.length, 'screenshot')}` : 'Analyze screenshots'}
      </Button>
      <AnalysisStatus kind="static" />
    </>
  );
}

function statusBadge(item: BatchItem) {
  if (item.status === 'analyzing') return <Badge size="sm">Analyzing…</Badge>;
  if (item.status === 'failed')
    return (
      <Badge variant="danger" size="sm">
        Failed
      </Badge>
    );
  if (item.status === 'done' && item.shots !== undefined) {
    return item.expected && item.shots < item.expected ? (
      <Badge variant="warning" size="sm" title={`Expected ${item.expected} shots, found ${item.shots}`}>
        {item.shots}/{item.expected} shots
      </Badge>
    ) : (
      <Badge variant="positive" size="sm">
        {item.shots} shots
      </Badge>
    );
  }
  return <Badge size="sm">Ready</Badge>;
}

function ScreenshotCard({ item, index, active }: { item: BatchItem; index: number; active: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-card border bg-card p-2 transition-colors',
        active ? 'border-volt' : 'border-outline-card',
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
        aria-label={`Show ${item.name} on the canvas`}
        aria-current={active || undefined}
        onClick={() => goToFrame(index)}
      >
        <img src={item.src} alt="" className="h-9 w-16 shrink-0 rounded-sm bg-inset object-cover" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-xs font-semibold">
            {index + 1}. {item.name}
          </span>
          <span className="text-11 text-text-muted">{item.source}</span>
        </span>
      </button>
      {statusBadge(item)}
      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${item.name}`} onClick={() => removeFromBatch(index)}>
        <XIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

/** The server's screenshot library: pick one to add it to the list */
function LibraryCard({ onAdded }: { onAdded: (message: Message) => void }) {
  const id = useId();
  const library = useScreenshots();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const screenshots = library.data ?? [];
  const chosen = screenshots.find((s) => s.url === url);
  return (
    <Card
      title="Server library"
      aside={
        <Button variant="ghost" size="icon-sm" aria-label="Refresh the library" onClick={() => void library.refetch()}>
          <RefreshCwIcon aria-hidden="true" />
        </Button>
      }
    >
      <div className="flex gap-2">
        <Select value={url} onValueChange={setUrl}>
          <SelectTrigger size="sm" aria-labelledby={id} className="w-full min-w-0">
            <SelectValue placeholder={screenshots.length ? 'Choose a saved screenshot' : 'No saved screenshots'}>
              {chosen?.filename}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {screenshots.map((s) => (
              <SelectItem key={s.url} value={s.url}>
                {s.filename} · {dateFormat.format(new Date(s.timestamp))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span id={id} className="sr-only">
          Saved screenshot
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={!chosen || busy}
          onClick={() => {
            if (!chosen) return;
            setBusy(true);
            addLibraryScreenshot(chosen)
              .then((r) => onAdded(addedMessage(r)))
              .catch((err: unknown) =>
                onAdded({ tone: 'danger', text: `The screenshot could not be loaded: ${messageOf(err)}` }),
              )
              .finally(() => setBusy(false));
          }}
        >
          <PlusIcon aria-hidden="true" />
          Add
        </Button>
      </div>
    </Card>
  );
}
