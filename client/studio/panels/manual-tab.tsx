import { useId, useState } from 'react';
import { CopyIcon, EraserIcon, ImageIcon, ImageOffIcon, WandSparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useEditorSettings } from '@/lib/storage/editor';
import { addShotsAt, opticsOf, placementOf } from '../editing';
import { Card, NumberField, Notice } from '../fields';
import { blobToDataUrl, newId } from '../media';
import { MAX_TARGETS } from '../model/detect';
import { legacySpec } from '../model/pattern';
import { patternToWorld } from '../model/placement';
import { plural } from '../names';
import { applyShots, clearCanvas, setBackground, specOf, useStudio } from '../store';

// The Manual tab: the original apex-recoil editor's tools. Load a wall image, let the threshold find
// the decals (dark blobs of the right size), add them as shots or place shots by hand (Correct
// shots), mark two anchors (middle click) at a known distance, and copy the version 2 export.

const textareaClass =
  'w-full rounded-control border border-field bg-inset px-2.5 py-2 font-mono text-xs text-text selection:bg-volt selection:text-volt-ink';

export function ManualTab() {
  const inputId = useId();
  const settings = useEditorSettings();
  const detection = useStudio((s) => s.detection);
  const hasImage = useStudio((s) => s.background?.key.startsWith('manual:') ?? false);
  const targets = detection?.targets ?? [];

  return (
    <>
      <Card title="Wall image">
        <p className="m-0 text-xs leading-normal text-text-secondary">
          Loading an image starts the pattern over, so the decals you add become the whole pattern (undo brings it
          back). A file name ending in the distance, such as <code className="font-mono">wall 20.png</code>, sets the
          anchors&apos; distance.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" asChild>
            <label htmlFor={inputId} className="cursor-pointer">
              <ImageIcon aria-hidden="true" />
              Choose an image
            </label>
          </Button>
          <input
            id={inputId}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Choose a wall image"
            onChange={(e) => {
              const input = e.currentTarget;
              const file = input.files?.[0];
              input.value = '';
              if (file) void loadManualImage(file);
            }}
          />
          <Button variant="ghost" size="sm" disabled={!hasImage} onClick={() => setBackground(null)}>
            <ImageOffIcon aria-hidden="true" />
            Remove the image
          </Button>
        </div>
      </Card>

      <Card title="Find the decals">
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label="Threshold"
            value={settings.threshold}
            min={0}
            max={255}
            onChange={(v) => settings.set('threshold', v)}
          />
          <NumberField
            label="Size from"
            unit="px"
            value={settings.targetFrom}
            min={0}
            max={100000}
            onChange={(v) => settings.set('targetFrom', v)}
          />
          <NumberField
            label="Size to"
            unit="px"
            value={settings.targetTo}
            min={0}
            max={100000}
            onChange={(v) => settings.set('targetTo', v)}
          />
        </div>
        <SwitchRow
          label="Find targets"
          checked={settings.autoTargets}
          onCheckedChange={(v) => settings.set('autoTargets', v)}
        />
        <SwitchRow
          label="Show the threshold"
          checked={settings.enableThreshold}
          onCheckedChange={(v) => settings.set('enableThreshold', v)}
        />
        {detection && (
          <Notice tone={detection.tooMany ? 'warning' : 'neutral'}>
            {detection.tooMany
              ? `More than ${MAX_TARGETS} blobs: raise the size range or lower the threshold.`
              : `${plural(targets.length, 'target')} found. Click one on the canvas to add it, or add them all.`}
          </Notice>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={targets.length === 0} onClick={() => addShotsAt(targets)}>
            <WandSparklesIcon aria-hidden="true" />
            Add the targets as shots
          </Button>
          <Button variant="ghost" size="sm" onClick={() => applyShots(settings.weapon, [], [])}>
            <EraserIcon aria-hidden="true" />
            Clear the pattern
          </Button>
        </div>
      </Card>

      <LegacyExport />
    </>
  );
}

/** The image becomes the canvas' background, and the pattern starts over */
async function loadManualImage(file: File) {
  const settings = useEditorSettings.getState();
  settings.set('comment', file.name);
  const distance = /(?:.* )?([0-9.]+)\.png$/.exec(file.name);
  if (distance && Number.isFinite(Number(distance[1]))) settings.set('distance', Number(distance[1]));
  const src = await blobToDataUrl(file);
  clearCanvas();
  setBackground({ key: newId('manual:image'), name: file.name, src, correct: false });
  applyShots(settings.weapon, [], []);
}

function SwitchRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={id} className="text-13 font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/** The pattern in the original editor's version 2 format, with the anchors and their distance */
function LegacyExport() {
  const id = useId();
  const settings = useEditorSettings();
  const draft = useStudio((s) => specOf(s, settings.weapon));
  const anchors = useStudio((s) => s.anchors);
  const frameSize = useStudio((s) => s.frameSize);
  const session = useStudio((s) => s.session);
  const frame = useStudio((s) => s.frame);
  const offset = useStudio((s) => s.offset);
  const [copied, setCopied] = useState(false);
  const points = draft
    ? patternToWorld(draft, placementOf({ frameSize, session, frame, offset }, opticsOf(settings), draft))
    : [];
  const json = JSON.stringify(
    legacySpec({
      weapon: settings.weapon,
      points,
      anchors,
      barrel: settings.barrel,
      stock: settings.stock,
      comment: settings.comment,
      distance: settings.distance,
    }),
  );
  const mags = draft?.mags ?? [];

  return (
    <Card title="Version 2 export">
      <div className="grid grid-cols-3 gap-2">
        <NumberField
          label="Anchor distance"
          unit="m"
          value={settings.distance}
          min={0}
          max={1000}
          onChange={(v) => settings.set('distance', v)}
        />
        <NumberField
          label="Barrel"
          value={settings.barrel}
          min={0}
          max={3}
          onChange={(v) => settings.set('barrel', v)}
        />
        <NumberField label="Stock" value={settings.stock} min={0} max={3} onChange={(v) => settings.set('stock', v)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-comment`} className="text-xs font-normal text-text-secondary">
          Comment
        </Label>
        <textarea
          id={`${id}-comment`}
          rows={2}
          value={settings.comment}
          onChange={(e) => settings.set('comment', e.target.value)}
          className={textareaClass}
        />
      </div>
      <p className="m-0 text-xs text-text-secondary">
        {plural(points.length, 'shot')}, a full magazine has {mags.at(-1)?.size ?? 0}.{' '}
        {anchors.length > 0 && anchors.length !== 2
          ? `The distance needs exactly 2 anchors (${anchors.length} marked).`
          : `${plural(anchors.length, 'anchor')} marked (middle-click a shot).`}
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-json`} className="text-xs font-normal text-text-secondary">
          Export
        </Label>
        <textarea id={`${id}-json`} rows={4} readOnly value={json} className={textareaClass} />
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() => {
          void navigator.clipboard.writeText(json).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        <CopyIcon aria-hidden="true" />
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </Card>
  );
}
