import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEditorSettings } from '@/lib/storage/editor';
import { Card, NumberField, SelectField } from '../fields';
import type { HdrMode } from '../model/analysis';
import { LiveTab } from './live-tab';
import { ManualTab } from './manual-tab';
import { ScreenshotsTab } from './screenshots-tab';

// The Capture section: recording sprays live from the game, analyzing wall screenshots, or placing
// shots by hand on an image (the original editor's tools). The tab is kept between visits
// (editor_recording_method, as the Recoil Editor stored it).

type Method = 'live' | 'offline' | 'legacy';

export function CapturePanel() {
  const method = useEditorSettings((s) => s.recordingMethod);
  return (
    <Tabs value={method} onValueChange={(v) => useEditorSettings.getState().set('recordingMethod', v as Method)}>
      <TabsList aria-label="Capture method">
        <TabsTrigger value="live">Live</TabsTrigger>
        <TabsTrigger value="offline">Screenshots</TabsTrigger>
        <TabsTrigger value="legacy">Manual</TabsTrigger>
      </TabsList>
      <TabsContent value="live" className="flex flex-col gap-3.5">
        <SetupCard />
        <LiveTab />
      </TabsContent>
      <TabsContent value="offline" className="flex flex-col gap-3.5">
        <SetupCard />
        <ScreenshotsTab />
      </TabsContent>
      <TabsContent value="legacy" className="flex flex-col gap-3.5">
        <ManualTab />
      </TabsContent>
    </Tabs>
  );
}

const optics = [
  { value: '1.0', label: '1× (iron sights, 1× HCOG or Holo)' },
  { value: '2.0', label: '2× HCOG Bruiser (standard at 20 m)' },
  { value: '3.0', label: '3× HCOG Ranger' },
  { value: '4.0', label: '4× (2×–4× Variable or sniper scope)' },
] as const;

const corrections: { value: HdrMode; label: string }[] = [
  { value: 'hdr-standard', label: 'HDR fix (natural)' },
  { value: 'hdr-vibrant', label: 'HDR fix (vibrant)' },
  { value: 'off', label: 'None (SDR)' },
];

/** Where the captures were taken from: distance, field of view, optic and color correction */
function SetupCard() {
  const s = useEditorSettings();
  return (
    <Card title="Setup">
      <div className="grid grid-cols-2 gap-2.5">
        <NumberField
          label="Distance"
          unit="m"
          value={s.captureDistance}
          min={5}
          max={100}
          onChange={(v) => s.set('captureDistance', v)}
        />
        <NumberField
          label="Field of view"
          unit="°"
          value={s.captureFov}
          min={70}
          max={120}
          onChange={(v) => s.set('captureFov', v)}
        />
      </div>
      <SelectField
        label="Optic"
        value={s.captureOptic}
        options={[...optics]}
        onChange={(v) => s.set('captureOptic', v)}
      />
      <SelectField
        label="Color correction"
        value={s.hdrMode}
        options={corrections}
        onChange={(v) => s.set('hdrMode', v)}
      />
      <p className="m-0 text-11 leading-normal text-text-muted">
        The color correction undoes the washed-out colors of Windows HDR and Auto HDR captures.
      </p>
    </Card>
  );
}
