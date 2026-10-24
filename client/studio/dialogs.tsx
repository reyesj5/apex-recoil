import { useId, useState } from 'react';
import { EyeIcon, SaveIcon, ShieldIcon, ZapIcon } from 'lucide-react';
import { cn } from 'cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import { useEditorSettings } from '@/lib/storage/editor';
import { runAnalysis, save } from './actions';
import { SelectField } from './fields';
import type { Strategy } from './model/analysis';
import { describeWarning, maxStatus, meanStatus, type Report, type Status } from './model/discrepancy';
import { cleanWeaponName, newWeaponSpec } from './model/spec';
import { fireModeName, plural, weaponName } from './names';
import {
  addWeapon,
  closeDialog,
  modes,
  savedOf,
  selectWeapon,
  setComparing,
  specOf,
  useStudio,
  type AnalysisKind,
} from './store';

// The Studio's dialogs: the keyboard shortcuts, the confirmation before an analysis, the checkpoint
// before a changed pattern is saved, a recorded spray enlarged, and a new weapon's name.

export function StudioDialogs() {
  const dialog = useStudio((s) => s.dialog);
  const onOpenChange = (open: boolean) => {
    if (!open) closeDialog();
  };
  return (
    <>
      <ShortcutsDialog open={dialog?.kind === 'shortcuts'} onOpenChange={onOpenChange} />
      {dialog?.kind === 'analysis' && <AnalysisDialog kind={dialog.analysis} onOpenChange={onOpenChange} />}
      {dialog?.kind === 'checkpoint' && <CheckpointDialog report={dialog.report} onOpenChange={onOpenChange} />}
      {dialog?.kind === 'video' && (
        <Dialog open onOpenChange={onOpenChange}>
          <DialogContent className="sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>{dialog.title}</DialogTitle>
              <DialogDescription>
                Check that the decals are sharp and that the camera didn&apos;t move during the spray.
              </DialogDescription>
            </DialogHeader>
            {/* Muted, so its gunfire doesn't trip the sensor */}
            <video src={dialog.url} controls autoPlay muted playsInline className="w-full rounded-card bg-black" />
          </DialogContent>
        </Dialog>
      )}
      <NewWeaponDialog open={dialog?.kind === 'new-weapon'} onOpenChange={onOpenChange} />
    </>
  );
}

const shortcuts: [keys: string[], action: string, detail: string][] = [
  [['Ctrl', 'S'], 'Save spec', "Saves the weapon's pattern and settings."],
  [['Ctrl', 'Z'], 'Undo', 'Takes back the last change to the pattern.'],
  [['Ctrl', 'Y'], 'Redo', 'Or Ctrl Shift Z.'],
  [['V'], 'Select', 'Drag shots to move them; right-click a shot to remove it, middle-click to mark an anchor.'],
  [['H'], 'Pan', 'Or hold Space, or drag with the right or middle button.'],
  [['A'], 'Align', 'Drag the whole spray onto the wall decals.'],
  [['C'], 'Correct shots', 'Click to add a missing shot where it fits the sequence.'],
  [['F'], 'Fit and center', 'Shows the whole screenshot or pattern.'],
  [['Wheel'], 'Zoom', 'Zooms around the pointer.'],
  [['P'], 'Pattern overlay', 'Shows or hides the pattern, to look at the decals.'],
  [['O'], 'Compare', 'The saved spec against the candidate, shot by shot.'],
  [['[', ']'], 'Previous and next spray', 'Goes through the screenshots or the analyzed sprays.'],
  [['M'], 'Capture panel', 'Shows or hides the panel on the left.'],
  [['E'], 'Inspector', 'Shows or hides the panel on the right.'],
  [['Space'], 'Snap the wall', 'While a spray is recording, captures the wall at once.'],
  [['?'], 'Shortcuts', 'Opens this list.'],
];

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Every action in the Studio has a key.</DialogDescription>
        </DialogHeader>
        <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 text-13 sm:grid-cols-2">
          {shortcuts.map(([keys, action, detail]) => (
            <div key={action} className="flex gap-3">
              <dt className="flex w-20 shrink-0 items-start gap-1 pt-0.5">
                {keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </dt>
              <dd className="m-0">
                <span className="font-semibold text-text">{action}</span>
                <span className="block text-xs text-text-secondary">{detail}</span>
              </dd>
            </div>
          ))}
        </dl>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Confirms the weapon, fire mode, whether to keep the files and how to merge before an analysis */
function AnalysisDialog({ kind, onOpenChange }: { kind: AnalysisKind; onOpenChange: (open: boolean) => void }) {
  const id = useId();
  const selected = useEditorSettings((s) => s.weapon);
  const currentMode = useStudio((s) => s.mode);
  const saved = useStudio((s) => s.saved);
  const drafts = useStudio((s) => s.drafts);
  const count = useStudio((s) => (kind === 'session' ? s.samples.length : s.batch.length));
  const [weapon, setWeapon] = useState(selected);
  const [mode, setMode] = useState(currentMode);
  const [saveCapture, setSaveCapture] = useState(kind === 'session');
  const [strategy, setStrategy] = useState<Strategy>('accumulate');
  const names = [...new Set([...(saved ?? []).map((s) => s.name), ...Object.keys(drafts)])];
  const samples = specOf({ saved, drafts }, weapon)?.sample_count || 1;
  const weaponModes = modes(weapon);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{kind === 'session' ? 'Analyze the sprays' : 'Analyze the screenshots'}</DialogTitle>
          <DialogDescription>
            {kind === 'session' ? plural(count, 'recorded spray') : plural(count, 'screenshot')}: check the weapon and
            how the result goes into its spec.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Weapon"
            value={weapon}
            options={names.map((n) => ({ value: n, label: weaponName(n) }))}
            onChange={(w) => {
              setWeapon(w);
              setMode(modes(w).includes(mode) ? mode : modes(w)[0]);
            }}
          />
          <SelectField
            label="Fire mode"
            value={weaponModes.includes(mode) ? mode : weaponModes[0]}
            options={weaponModes.map((m) => ({ value: m, label: fireModeName(m) }))}
            onChange={setMode}
          />
        </div>
        <div className="flex items-start gap-2.5">
          <Checkbox
            id={`${id}-save`}
            checked={saveCapture}
            onCheckedChange={(c) => setSaveCapture(c === true)}
            aria-describedby={`${id}-save-hint`}
          />
          <div className="flex flex-col gap-0.5">
            <Label htmlFor={`${id}-save`} className="type-label">
              Keep the files in the captures
            </Label>
            <p id={`${id}-save-hint`} className="m-0 text-xs text-text-muted">
              Leave it off to analyze a capture already saved, or to try something, without keeping copies.
            </p>
          </div>
        </div>
        <fieldset className="m-0 flex flex-col gap-2 border-t border-outline p-0 pt-3.5">
          <legend className="mb-2 type-label">How the result goes into the spec</legend>
          <StrategyOption
            name={`${id}-strategy`}
            value="accumulate"
            current={strategy}
            onChange={setStrategy}
            title="Blend into the spec"
            detail={`Weighs the new samples against the spec's ${plural(samples, 'sample')} (${samples} saved + ${count} new). Less noise with every capture.`}
          />
          <StrategyOption
            name={`${id}-strategy`}
            value="overwrite"
            current={strategy}
            onChange={setStrategy}
            title="Start a new baseline"
            detail="Builds the spec from these samples alone, as after a balance patch."
          />
        </fieldset>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!weapon || count === 0}
            onClick={() => {
              onOpenChange(false);
              void runAnalysis(kind, { weapon, mode, saveCapture, strategy });
            }}
          >
            <ZapIcon aria-hidden="true" />
            Analyze
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StrategyOption({
  name,
  value,
  current,
  onChange,
  title,
  detail,
}: {
  name: string;
  value: Strategy;
  current: Strategy;
  onChange: (value: Strategy) => void;
  title: string;
  detail: string;
}) {
  const id = useId();
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-card border p-3 transition-colors',
        current === value ? 'border-volt bg-volt-wash' : 'border-divider bg-card hover:bg-hover',
      )}
    >
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={current === value}
        onChange={() => onChange(value)}
        aria-describedby={`${id}-detail`}
        className="mt-0.5 cursor-pointer accent-volt"
      />
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="cursor-pointer type-label">
          {title}
        </label>
        <span id={`${id}-detail`} className="text-xs leading-normal text-text-secondary">
          {detail}
        </span>
      </div>
    </div>
  );
}

const checkpointText: Record<Status, { title: string; detail: string }> = {
  safe: {
    title: 'The pattern matches the saved spec',
    detail: 'The candidate stays close to the saved pattern. It is safe to save.',
  },
  warning: {
    title: 'The pattern drifts from the saved spec',
    detail: 'Some shots land noticeably away from the saved pattern. Look at them before saving.',
  },
  danger: {
    title: 'The pattern differs a lot from the saved spec',
    detail:
      'This can mean a spray tracked only in part, a camera that moved, or decals detected wrongly. Inspect it on the canvas first.',
  },
};

const tone = {
  safe: 'border-volt/40 bg-volt-wash',
  warning: 'border-warning/40 bg-warning-wash',
  danger: 'border-danger-line bg-danger-wash',
};

/** Before a changed or analyzed pattern replaces the saved spec: how far it strays, and why it might */
function CheckpointDialog({ report, onOpenChange }: { report: Report; onOpenChange: (open: boolean) => void }) {
  const weapon = useEditorSettings((s) => s.weapon);
  const session = useStudio((s) => s.session);
  const draft = useStudio((s) => specOf(s, weapon));
  const saved = useStudio((s) => savedOf(s, weapon));
  const text = checkpointText[report.status];
  const savedSamples = saved?.sample_count || 1;
  const candidateSamples = draft?.sample_count || 1;
  const figures: [label: string, detail: string, value: string, status: Status][] = [
    [
      'Shot count',
      'Shots in the candidate against the saved spec',
      report.shotCountMatches
        ? `${report.candidateShots} of ${report.savedShots}, the same`
        : `${report.candidateShots} against ${report.savedShots} (${Math.abs(report.shotCountDelta)} ${report.shotCountDelta < 0 ? 'missing' : 'more'})`,
      report.shotCountMatches ? 'safe' : 'danger',
    ],
    [
      'Average stray',
      'How far a shot lands from its saved place, on average',
      `${report.meanPx.toFixed(1)} px (${report.meanCounts.toFixed(1)} counts)`,
      meanStatus(report.meanPx),
    ],
    [
      'Largest stray',
      'The shot that lands farthest from its saved place',
      `${report.maxPx.toFixed(1)} px, shot ${report.maxShot + 1}`,
      maxStatus(report.maxPx),
    ],
  ];

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldIcon className="size-4.5 text-text-secondary" aria-hidden="true" />
            Check before saving
          </DialogTitle>
          <DialogDescription>
            The candidate replaces the saved spec of {weaponName(weapon)} in the specs and in the trainer.
          </DialogDescription>
        </DialogHeader>
        <div role="status" className={cn('rounded-card border p-3 text-13', tone[report.status])}>
          <strong className="block">{text.title}</strong>
          <span className="text-text-secondary">{text.detail}</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 text-13">
          <div className="flex flex-col gap-1 rounded-card border border-outline-card bg-card p-3">
            <span className="type-section-label text-text-muted">Saved spec</span>
            <span>
              <strong data-testid="checkpoint-saved-shots" className="font-mono">
                {report.savedShots}
              </strong>{' '}
              shots
            </span>
            <span className="text-xs text-text-secondary">{plural(savedSamples, 'sample')}</span>
          </div>
          <div className="flex flex-col gap-1 rounded-card border border-outline-card bg-card p-3">
            <span className="type-section-label text-text-muted">Candidate</span>
            <span>
              <strong data-testid="checkpoint-candidate-shots" className="font-mono">
                {report.candidateShots}
              </strong>{' '}
              shots
            </span>
            <span className="text-xs text-text-secondary">
              {plural(candidateSamples, 'sample')}
              {session && (session.strategy === 'accumulate' ? ', blended' : ', a new baseline')}
            </span>
          </div>
        </div>
        <table className="w-full text-13">
          <tbody>
            {figures.map(([label, detail, value, status]) => (
              <tr key={label} className="border-t border-outline">
                <td className="py-2 pr-3 align-top">
                  <span className="font-semibold">{label}</span>
                  <span className="block text-xs text-text-muted">{detail}</span>
                </td>
                <td className="py-2 text-right align-top">
                  <Badge variant={status === 'safe' ? 'positive' : status} className="font-mono">
                    {value}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {report.warnings.length > 0 && (
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-xs text-text-secondary">
            {report.warnings.map((w) => (
              <li key={w.kind}>{describeWarning(w)}</li>
            ))}
          </ul>
        )}
        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
              setComparing(true);
            }}
          >
            <EyeIcon aria-hidden="true" />
            Inspect on the canvas
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onOpenChange(false);
                void save();
              }}
            >
              <SaveIcon aria-hidden="true" />
              Save spec
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A new weapon's id; one that exists is selected instead */
function NewWeaponDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const id = useId();
  const [name, setName] = useState('');
  const clean = cleanWeaponName(name);
  const exists = useStudio((s) => !!clean && !!specOf(s, clean));
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setName('');
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (!clean) return;
            if (exists) selectWeapon(clean);
            else addWeapon(newWeaponSpec(clean));
            setName('');
            onOpenChange(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>New weapon</DialogTitle>
            <DialogDescription>
              It starts with one shot, four magazines and 600 RPM, and goes to the server with the next Save.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id}>Weapon id</Label>
            <Input
              id={id}
              value={name}
              placeholder="car_smg"
              autoComplete="off"
              aria-describedby={`${id}-hint`}
              onChange={(e) => setName(e.target.value)}
            />
            <p id={`${id}-hint`} className="m-0 text-xs text-text-muted">
              {clean
                ? exists
                  ? `${clean} exists already: it will be selected.`
                  : `Saved as ${clean}.`
                : 'Lowercase letters, digits, _ and -.'}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!clean}>
              {exists ? 'Select it' : 'Add weapon'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
