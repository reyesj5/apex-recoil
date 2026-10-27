import { useEffect, useState } from 'react';
import {
  ChartLineIcon,
  CirclePlusIcon,
  CircleHelpIcon,
  EllipsisIcon,
  HandIcon,
  KeyboardIcon,
  MouseIcon,
  MousePointer2Icon,
  MoveIcon,
  PlayIcon,
  Redo2Icon,
  ScanIcon,
  SearchIcon,
  Undo2Icon,
  Volume2Icon,
} from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { ConsentBanner } from '@/components/consent-banner';
import { SpraydownLogo } from '@/components/icons';
import { InputWithUnit } from '@/components/input-with-unit';
import { RunResult, ScoreCard, ScoreDelta } from '@/components/score-card';
import { StatGrid, StatTile, SummaryTile } from '@/components/stat-tile';
import { TierGroup, TierOption, TierSizeInput, type Tier } from '@/components/tier-option';
import { SelectedWeapon, WeaponGrid, WeaponTile } from '@/components/weapon-tile';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Toaster } from '@/components/ui/sonner';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupCount, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Example data in the shape the trainer will use (weapons as the game writes them)
const assaultRifles = [
  { id: 'flatline', name: 'Flatline', rpm: 600, art: '/images/flatline.png' },
  { id: 'r301', name: 'R-301', rpm: 810, art: '/images/r301.png' },
  { id: 'havoc_tc', name: 'HAVOC', rpm: 672, art: '/images/havoc.png' },
  { id: 'hemlok', name: 'Hemlok', rpm: 384, art: '/images/hemlok.png' },
  { id: 'nemesis', name: 'Nemesis', rpm: 582 },
];
const weaponClasses = [
  ['all', 'All', 31],
  ['ar', 'AR', 5],
  ['smg', 'SMG', 5],
  ['lmg', 'LMG', 4],
  ['marksman', 'Marksman', 4],
  ['sniper', 'Sniper', 4],
  ['shotgun', 'Shotgun', 5],
  ['pistol', 'Pistol', 4],
] as const;
const r301Magazines: { tier: Tier; size: number; name: string; label: string }[] = [
  { tier: 'base', size: 21, name: 'Base', label: 'Base magazine, 21 rounds' },
  { tier: 'level1', size: 23, name: 'Lv 1', label: 'Level 1 magazine, 23 rounds' },
  { tier: 'level2', size: 28, name: 'Lv 2', label: 'Level 2 magazine, 28 rounds' },
  { tier: 'level3', size: 31, name: 'Lv 3', label: 'Level 3 magazine, 31 rounds' },
  { tier: 'corrupted', size: 37, name: 'Corrupted', label: 'Corrupted magazine, 37 rounds' },
];
const recentRuns = [
  ['Today 21:42', 'R-301', 'Lv 2 · 28', 'Follow path', 87],
  ['Today 21:41', 'R-301', 'Lv 2 · 28', 'Follow path', 80],
  ['Today 21:40', 'R-301', 'Lv 2 · 28', 'Follow path', 91],
  ['Today 21:37', 'R-99', 'Lv 3 · 27', 'Moving target', 78],
  ['Yesterday 22:10', 'R-99', 'Lv 3 · 27', 'Moving target', 83],
] as const;
const days = [
  { day: 'Oct 13', best: 88, median: 74, tries: 9 },
  { day: 'Oct 14', best: 90, median: 76, tries: 5 },
  { day: 'Oct 15', best: 88, median: 77, tries: 8 },
  { day: 'Oct 16', best: 90, median: 75, tries: 13 },
  { day: 'Oct 17', best: 89, median: 76, tries: 0 },
  { day: 'Oct 18', best: 92, median: 79, tries: 14 },
  { day: 'Oct 19', best: 91, median: 82, tries: 7 },
  { day: 'Oct 20', best: 93, median: 81, tries: 0 },
  { day: 'Oct 21', best: 96, median: 81, tries: 12 },
  { day: 'Oct 22', best: 94, median: 80, tries: 18 },
];
const todayRuns = [62, 70, 68, 74, 79, 77, 83, 78, 85, 91, 80, 87].map((score, run) => ({ run: run + 1, score }));
const scoreChart = {
  best: { label: 'Best', color: 'var(--color-volt)' },
  median: { label: 'Median', color: 'var(--color-text-secondary)' },
  tries: { label: 'Tries', color: 'var(--color-chart-bar)' },
} satisfies ChartConfig;
const trendChart = { score: { label: 'Score', color: 'var(--color-volt)' } } satisfies ChartConfig;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="type-section-label text-text-muted">
        {title}
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Item({
  title,
  description,
  wide = false,
  children,
}: {
  title: string;
  description: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={wide ? 'md:col-span-2' : undefined}>
      <div>
        <h3 className="m-0 type-heading">{title}</h3>
        <p className="m-0 mt-1 text-xs text-text-muted">{description}</p>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </Card>
  );
}

function Actions() {
  return (
    <Section id="actions" title="Actions">
      <Item title="Button" description="One primary per area; secondary, ghost, destructive and icon buttons." wide>
        <div className="flex flex-wrap items-center gap-2">
          <Button>Save spec</Button>
          <Button variant="secondary">Open progress</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="destructive">Delete sample</Button>
          <Button variant="outline" size="icon" aria-label="Help">
            <CircleHelpIcon />
          </Button>
          <Button disabled>Analyze sprays</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-13">
          <Button size="sm">
            Save spec <Kbd variant="inset">Ctrl S</Kbd>
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Undo">
            <Undo2Icon />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Redo" disabled>
            <Redo2Icon />
          </Button>
          <Button variant="secondary" size="sm">
            Compare spec with candidate
          </Button>
          <Button variant="outline" size="icon-compact" aria-label="Mute sounds">
            <Volume2Icon />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="lg" asChild>
            <a href="#data">
              <ChartLineIcon className="size-4" />
              Open progress
            </a>
          </Button>
          <Button size="touch" className="rounded-pill">
            <PlayIcon className="size-3.5 fill-current" />
            Play spray
          </Button>
          <Button variant="secondary" size="touch">
            Copy link
          </Button>
        </div>
      </Item>
      <Item title="Keyboard key" description="Shortcuts in the search trigger, tooltips and buttons.">
        <div className="flex flex-wrap items-center gap-2">
          <Kbd>Ctrl K</Kbd>
          <Kbd>Ctrl S</Kbd>
          <Kbd>Space</Kbd>
          <Kbd>A</Kbd>
        </div>
      </Item>
      <Item title="Tooltip" description="Names an icon-only control and its key; hover or focus the tools.">
        <div className="flex items-center gap-1 self-start rounded-card-lg border border-divider bg-panel p-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle aria-label="Select and move shots" defaultPressed>
                <MousePointer2Icon />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>
              Select and move shots <Kbd>V</Kbd>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle aria-label="Align whole spray">
                <MoveIcon />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>
              Align whole spray <Kbd>A</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </Item>
    </Section>
  );
}

function Selection() {
  const [mode, setMode] = useState('path');
  const [view, setView] = useState('dots');
  const [period, setPeriod] = useState('30');
  const [fireMode, setFireMode] = useState('auto');
  const [weaponClass, setWeaponClass] = useState('ar');
  const [phoneWeapon, setPhoneWeapon] = useState('r301');
  const [weapon, setWeapon] = useState('r301');
  const [magazine, setMagazine] = useState('level2');
  const selected = assaultRifles.find((w) => w.id === weapon) ?? assaultRifles[1];
  const keep = (set: (value: string) => void) => (value: string) => value && set(value);

  return (
    <Section id="selection" title="Selection">
      <Item
        title="Segmented control"
        description="One option of two to four; volt on the range, neutral for fire mode."
        wide
      >
        <div className="flex flex-wrap gap-2">
          <ToggleGroup type="single" variant="floating" aria-label="Mode" value={mode} onValueChange={keep(setMode)}>
            <ToggleGroupItem value="path">Follow path</ToggleGroupItem>
            <ToggleGroupItem value="still">Still target</ToggleGroupItem>
            <ToggleGroupItem value="moving">Moving target</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup
            type="single"
            variant="floating"
            aria-label="Show results as"
            value={view}
            onValueChange={keep(setView)}
          >
            <ToggleGroupItem value="target">Target</ToggleGroupItem>
            <ToggleGroupItem value="dots">Dots</ToggleGroupItem>
            <ToggleGroupItem value="lines">Lines</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup type="single" aria-label="Period" value={period} onValueChange={keep(setPeriod)}>
            <ToggleGroupItem value="7">7 days</ToggleGroupItem>
            <ToggleGroupItem value="30">30 days</ToggleGroupItem>
            <ToggleGroupItem value="all">All time</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="flex max-w-85 items-center justify-between gap-3">
          <span id="fire-mode-label" className="type-label">
            Fire mode
          </span>
          <ToggleGroup
            type="single"
            variant="neutral"
            aria-labelledby="fire-mode-label"
            value={fireMode}
            onValueChange={keep(setFireMode)}
          >
            <ToggleGroupItem value="auto">Auto</ToggleGroupItem>
            <ToggleGroupItem value="single">Single</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </Item>
      <Item title="Filter chips" description="Narrow a list to one class, with counts; 44 px and scrolling on phones.">
        <ToggleGroup
          type="single"
          variant="chips"
          aria-label="Weapon class"
          value={weaponClass}
          onValueChange={keep(setWeaponClass)}
        >
          {weaponClasses.map(([id, label, count]) => (
            <ToggleGroupItem key={id} value={id}>
              {label} <ToggleGroupCount>{count}</ToggleGroupCount>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          type="single"
          variant="chips"
          size="touch"
          aria-label="Weapon"
          value={phoneWeapon}
          onValueChange={keep(setPhoneWeapon)}
        >
          {['R-301', 'R-99', 'Flatline', 'Volt', 'Spitfire'].map((name) => (
            <ToggleGroupItem key={name} value={name.toLowerCase()}>
              {name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Item>
      <Item title="Tabs" description="Switch between panels: the Studio's capture methods.">
        <Tabs defaultValue="live" className="max-w-85">
          <TabsList aria-label="Capture method">
            <TabsTrigger value="live">Live</TabsTrigger>
            <TabsTrigger value="screenshots">Screenshots</TabsTrigger>
            <TabsTrigger value="manual">Manual</TabsTrigger>
          </TabsList>
          <TabsContent value="live" className="text-13 text-text-secondary">
            Stand 20 m from the target wall with a 2× Bruiser scope, then fire the full magazine.
          </TabsContent>
          <TabsContent value="screenshots" className="text-13 text-text-secondary">
            Add wall screenshots from disk or from the library.
          </TabsContent>
          <TabsContent value="manual" className="text-13 text-text-secondary">
            Place the shots by hand on a wall image.
          </TabsContent>
        </Tabs>
      </Item>
      <Item
        title="Weapon tile"
        description="The loadout grid and the selected weapon; the placeholder shows without art."
      >
        <div className="flex max-w-77 flex-col gap-3">
          <SelectedWeapon name={selected.name} art={selected.art} meta={`Assault rifle · ${selected.rpm} RPM`} />
          <WeaponGrid aria-label="Weapon" value={weapon} onValueChange={keep(setWeapon)}>
            {assaultRifles.map((w) => (
              <WeaponTile key={w.id} value={w.id} name={w.name} art={w.art} meta={`${w.rpm} RPM`} />
            ))}
          </WeaponGrid>
        </div>
      </Item>
      <Item title="Magazine tier" description="Tier color, capacity and name; 48 px on phones; editable in the Studio.">
        <div className="flex max-w-77 flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="type-label">Magazine</span>
            <span className="text-xs text-text-muted">
              {r301Magazines.find((m) => m.tier === magazine)?.size} rounds
            </span>
          </div>
          <TierGroup count={5} aria-label="Magazine" value={magazine} onValueChange={keep(setMagazine)}>
            {r301Magazines.map((m) => (
              <TierOption key={m.tier} value={m.tier} tier={m.tier} size={m.size} name={m.name} aria-label={m.label} />
            ))}
          </TierGroup>
        </div>
        <TierGroup count={5} aria-label="Magazine on a phone" defaultValue="level2" className="max-w-83">
          {r301Magazines.map((m) => (
            <TierOption key={m.tier} value={m.tier} tier={m.tier} size={m.size} touch aria-label={m.label} />
          ))}
        </TierGroup>
        <TierGroup count={1} aria-label="Magazine of a one-size weapon" defaultValue="base" className="max-w-16">
          <TierOption value="base" tier="base" size={8} name="Standard" aria-label="Standard magazine, 8 rounds" />
        </TierGroup>
        <div className="grid max-w-72 grid-cols-5 gap-1.5">
          {[18, 21, 24, 27, 33].map((size, i) => (
            <TierSizeInput
              key={r301Magazines[i].tier}
              tier={r301Magazines[i].tier}
              name={r301Magazines[i].name}
              defaultValue={size}
              aria-label={`${r301Magazines[i].name} magazine size`}
            />
          ))}
        </div>
      </Item>
    </Section>
  );
}

function Fields() {
  const [opacity, setOpacity] = useState([80]);
  const [scale, setScale] = useState([100]);

  return (
    <Section id="fields" title="Fields">
      <Item title="Input" description="Inset fill and a field border; numbers with their unit in JetBrains Mono.">
        <div className="flex max-w-85 flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="weapon-filter">Weapon filter</Label>
            <Input id="weapon-filter" type="search" placeholder="Filter weapons" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="distance">Distance</Label>
              <InputWithUnit id="distance" unit="m" defaultValue={20} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fov">Field of view</Label>
              <InputWithUnit id="fov" unit="°" defaultValue={104} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 text-13">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fire-rate">Fire rate</Label>
              <InputWithUnit id="fire-rate" unit="RPM" size="sm" defaultValue={1080} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="multiplier">Multiplier</Label>
              <Input
                id="multiplier"
                type="number"
                step="0.01"
                defaultValue={0.73}
                className="h-control-sm rounded-control px-2.5 font-mono text-13"
              />
            </div>
          </div>
        </div>
      </Item>
      <Item title="Select" description="A field select, the Studio size, the top bar's language and a toolbar select.">
        <div className="flex max-w-85 flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="optic">Optic</Label>
            <Select defaultValue="2x">
              <SelectTrigger id="optic" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2x">2× HCOG Bruiser (standard at 20 m)</SelectItem>
                <SelectItem value="1x">1× HCOG Classic</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="color-correction">Color correction</Label>
            <Select defaultValue="hdr">
              <SelectTrigger id="color-correction" size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hdr">HDR fix (natural)</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select defaultValue="en">
              <SelectTrigger aria-label="Language" className="h-icon rounded-control border-divider bg-panel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ru">Русский</SelectItem>
                <SelectItem value="zh-CN">中文</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex h-control items-center gap-2 rounded-card border border-divider bg-panel px-2.5 text-xs text-text-secondary">
              <span id="replay-label">Replay</span>
              <Select defaultValue="1">
                <SelectTrigger
                  aria-labelledby="replay-label"
                  className="h-segment-sm gap-1 border-0 bg-transparent px-0 font-semibold"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.5">0.5×</SelectItem>
                  <SelectItem value="1">1×</SelectItem>
                  <SelectItem value="2">2×</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </Item>
      <Item title="Switch" description="A setting that applies at once.">
        <div className="flex max-w-85 flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="corrupted-stock" className="type-label text-text">
              Corrupted stock
            </Label>
            <Switch id="corrupted-stock" defaultChecked />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="invert-y" className="type-label text-text">
              Invert Y
            </Label>
            <Switch id="invert-y" />
          </div>
        </div>
      </Item>
      <Item title="Checkbox and slider" description="The Studio's layers: on or off, and a level with its value.">
        <div className="flex max-w-80 flex-col gap-3 text-13">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Checkbox id="layer-wall" defaultChecked />
              <Label htmlFor="layer-wall" className="flex-1 type-label text-text">
                Wall image
              </Label>
              <span className="font-mono text-text-secondary">{opacity[0]}%</span>
            </div>
            <Slider value={opacity} onValueChange={setOpacity} aria-label="Wall image opacity" />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Checkbox id="layer-scale" defaultChecked />
              <Label htmlFor="layer-scale" className="flex-1 type-label text-text">
                Visual scale
              </Label>
              <span className="font-mono text-text-secondary">{scale[0]}%</span>
            </div>
            <Slider value={scale} onValueChange={setScale} min={50} max={150} aria-label="Visual scale" />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="layer-compare" />
            <Label htmlFor="layer-compare" className="flex-1 type-label text-text">
              Comparison
            </Label>
            <span className="font-mono text-text-secondary">60%</span>
          </div>
        </div>
      </Item>
    </Section>
  );
}

function Feedback() {
  useEffect(() => {
    toast.success('Spec saved', {
      description: 'R-99, version 15',
      duration: Infinity,
      action: { label: 'Undo', onClick: () => undefined },
    });
    toast.error('The spec was not saved', {
      description: 'The server did not answer; your changes are still here.',
      duration: Infinity,
    });
  }, []);

  return (
    <Section id="feedback" title="Feedback">
      <Item title="Status badge" description="A state that lasts, always in words; the tag names a product area.">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="warning" dot>
            Unsaved changes
          </Badge>
          <Badge variant="positive" dot>
            Connected
          </Badge>
          <Badge dot>Trigger idle</Badge>
          <Badge variant="danger" dot>
            Major discrepancy
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="warning" size="lg" dot>
            Unsaved changes
          </Badge>
          <Badge size="sm" dot>
            Not connected
          </Badge>
          <Badge size="sm">Trigger idle</Badge>
          <Badge variant="tag">Studio</Badge>
        </div>
      </Item>
      <Item title="Toast" description="Confirms what happened and offers the way back; an error says why.">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              toast.success('Spec saved', {
                description: 'R-99, version 16',
                action: { label: 'Undo', onClick: () => undefined },
              })
            }
          >
            Show a toast
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast.error('The spec was not saved', { description: 'The server did not answer; try again.' })
            }
          >
            Show an error
          </Button>
        </div>
      </Item>
      <Item title="Progress" description="A share or a running job.">
        <div className="flex max-w-95 flex-col gap-3">
          {(
            [
              ['R-301', 114, 100, 96, 74],
              ['R-99', 63, 55, 93, 73],
              ['Flatline', 38, 33, 90, 71],
            ] as const
          ).map(([name, runs, share, best, median]) => (
            <div key={name} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-13">
                <span className="font-semibold">{name}</span>
                <span className="text-text-secondary">{runs} runs</span>
              </div>
              <Progress value={share} aria-label={`${name}: ${runs} runs`} />
              <div className="text-11 text-text-muted">
                Best <strong className="text-text">{best}</strong> · median {median}
              </div>
            </div>
          ))}
        </div>
      </Item>
      <Item title="Skeleton" description="Holds the place of content that is loading.">
        <div className="grid max-w-77 grid-cols-2 gap-2">
          <Skeleton className="h-tile" />
          <Skeleton className="h-tile" />
        </div>
      </Item>
      <Item title="Consent banner" description="Reject and Accept with equal weight; a sheet on phones." wide>
        <div className="flex flex-wrap items-start gap-4">
          <ConsentBanner
            label="Analytics cookies"
            text="We use Google Analytics cookies to see how the trainer is used. Nothing is tracked unless you accept."
            privacyLabel="Privacy policy"
            privacyUrl="#privacy"
            rejectLabel="Reject"
            acceptLabel="Accept"
            onReject={() => undefined}
            onAccept={() => undefined}
          />
          <ConsentBanner
            layout="sheet"
            className="w-91.5"
            label="Analytics cookies"
            text="We use Google Analytics cookies to see how the trainer is used. Nothing is tracked unless you accept."
            privacyLabel="Privacy policy"
            privacyUrl="#privacy"
            rejectLabel="Reject"
            acceptLabel="Accept"
            onReject={() => undefined}
            onAccept={() => undefined}
          />
        </div>
      </Item>
    </Section>
  );
}

function Data() {
  return (
    <Section id="data" title="Data">
      <Item title="Stat tile" description="One number with its label; an en dash before the first run.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatGrid>
            <StatTile label="Tries" value={0} />
            <StatTile label="Median" />
            <StatTile label="Best today" />
            <StatTile label="All-time best" value={86} best />
          </StatGrid>
          <StatGrid>
            <StatTile label="Last score" value={87} best />
            <StatTile label="Median" value={78} />
            <StatTile label="Best today" value={91} />
            <StatTile label="All-time best" value={91} best />
          </StatGrid>
        </div>
      </Item>
      <Item title="Summary tile" description="Page totals on the Progress page.">
        <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SummaryTile label="Runs" value={253} note="last 30 days" />
          <SummaryTile label="Median score" value={74} note="+15 since the first week" />
        </dl>
      </Item>
      <Item
        title="Score card"
        description="The last score in the session panel, and the result after a run: above today’s median, and below it (no volt)."
        wide
      >
        <div className="flex flex-wrap items-start gap-5">
          <ScoreCard label="Last score" hint="Your first run today shows up here." className="w-65" />
          <RunResult
            title="Run complete"
            score={87}
            delta={<ScoreDelta delta={9}>above today’s median</ScoreDelta>}
            meta="R-301 · Lv 2 magazine (28) · Follow path"
            replayLabel="Replay"
            nextLabel="Next run"
          />
          <RunResult
            title="Run complete"
            score={71}
            below
            delta={<ScoreDelta delta={-7}>below today’s median</ScoreDelta>}
            meta="R-301 · Lv 2 magazine (28) · Follow path"
            replayLabel="Replay"
            nextLabel="Next run"
          />
        </div>
      </Item>
      <Item title="Table" description="Recent runs; scores from 85 up in volt." wide>
        <Table aria-label="Recent runs">
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Weapon</TableHead>
              <TableHead>Magazine</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead className="text-right">Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentRuns.map(([when, weapon, magazine, mode, score]) => (
              <TableRow key={when}>
                <TableCell>{when}</TableCell>
                <TableCell className="font-semibold text-text">{weapon}</TableCell>
                <TableCell>{magazine}</TableCell>
                <TableCell>{mode}</TableCell>
                <TableCell
                  className={
                    score >= 85 ? 'text-right type-score-cell text-volt' : 'text-right type-score-cell text-text'
                  }
                >
                  {score}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Item>
      <Item title="Chart" description="Today's trend with its median, and the score per day with tries." wide>
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[288px_1fr]">
          <figure className="m-0 rounded-card-lg border border-outline-card bg-card p-3.5">
            <figcaption className="flex justify-between text-xs text-text-secondary">
              <span>Today’s runs</span>
              <span>12 tries</span>
            </figcaption>
            <ChartContainer
              config={trendChart}
              className="mt-2.5 aspect-auto h-18 w-full"
              role="img"
              aria-label="Scores of today’s 12 runs, from 62 to 87, best 91"
            >
              <LineChart data={todayRuns} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <ReferenceLine y={78} stroke="var(--color-outline-strong)" strokeDasharray="4 4" />
                <Line
                  dataKey="score"
                  stroke="var(--color-score)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartContainer>
            <div className="mt-1.5 flex justify-between text-11 text-text-muted">
              <span>First run</span>
              <span>Median 78 (dashed)</span>
            </div>
          </figure>
          <figure className="m-0 rounded-panel border border-outline bg-panel p-4.5">
            <figcaption className="flex flex-wrap items-center justify-between gap-3">
              <span className="type-heading">Score per day</span>
              <span className="flex gap-3.5 text-xs text-text-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-0.75 w-3.5 rounded-[2px] bg-volt" />
                  Best
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-0.75 w-3.5 rounded-[2px] bg-text-secondary" />
                  Median
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[2px] bg-chart-bar" />
                  Tries
                </span>
              </span>
            </figcaption>
            <ChartContainer
              config={scoreChart}
              className="mt-3.5 aspect-auto h-60 w-full"
              role="img"
              aria-label="Best and median score per day over the last 10 days; best rises to 96, median 81"
            >
              <ComposedChart data={days} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid vertical={false} yAxisId="score" stroke="var(--color-hover)" />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                />
                <YAxis
                  yAxisId="score"
                  domain={[50, 100]}
                  ticks={[50, 60, 70, 80, 90, 100]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                />
                <YAxis yAxisId="tries" hide domain={[0, 60]} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar yAxisId="tries" dataKey="tries" fill="var(--color-tries)" barSize={14} isAnimationActive={false} />
                <Line
                  yAxisId="score"
                  dataKey="median"
                  stroke="var(--color-median)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="score"
                  dataKey="best"
                  stroke="var(--color-best)"
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ChartContainer>
          </figure>
        </div>
      </Item>
    </Section>
  );
}

function Overlays() {
  return (
    <Section id="overlays" title="Overlays">
      <Item
        title="Dialog, alert dialog and drawer"
        description="Not designed yet: the raised surface, an outline-strong line and the panel radius."
      >
        <div className="flex flex-wrap gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">
                <KeyboardIcon />
                Keyboard shortcuts
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Keyboard shortcuts</DialogTitle>
                <DialogDescription>Every action in the Studio has a key.</DialogDescription>
              </DialogHeader>
              <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
                <li className="flex justify-between">
                  Save spec <Kbd>Ctrl S</Kbd>
                </li>
                <li className="flex justify-between">
                  Align whole spray <Kbd>A</Kbd>
                </li>
                <li className="flex justify-between">
                  Pan <Kbd>Space</Kbd>
                </li>
              </ul>
            </DialogContent>
          </Dialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete sample</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this sample?</AlertDialogTitle>
                <AlertDialogDescription>
                  Spray 3 and its wall screenshot are removed from the session.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep sample</AlertDialogCancel>
                <AlertDialogAction variant="destructive">Delete sample</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="secondary">Settings on a phone</Button>
            </DrawerTrigger>
            <DrawerContent>
              <div className="mx-auto w-full max-w-sm">
                <DrawerHeader>
                  <DrawerTitle>Settings</DrawerTitle>
                  <DrawerDescription>Sensitivity, aiming and sound.</DrawerDescription>
                </DrawerHeader>
                <div className="flex items-center justify-between gap-3 px-4 pb-6">
                  <Label htmlFor="drawer-invert-y" className="type-label text-text">
                    Invert Y
                  </Label>
                  <Switch id="drawer-invert-y" />
                </div>
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </Item>
      <Item title="Popover and menu" description="Mouse settings from the range's chip; more actions behind an icon.">
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-control rounded-card text-xs font-normal">
                <MouseIcon className="size-4" />
                Sensitivity <span className="font-mono font-semibold text-text">5.0</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent aria-label="Mouse settings" className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sensitivity">Sensitivity</Label>
                <Input id="sensitivity" type="number" step="0.1" defaultValue={5} className="font-mono" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="popover-invert-y" className="type-label text-text">
                  Invert Y
                </Label>
                <Switch id="popover-invert-y" />
              </div>
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Export CSV</DropdownMenuItem>
              <DropdownMenuItem>Copy link</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">Clear today’s runs</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Item>
      <Item title="Command" description="Search everywhere, opened with Ctrl K; here inline." wide>
        <Command className="max-w-105 border border-outline-strong" label="Search weapons">
          <CommandInput placeholder="Search weapons" />
          <CommandList>
            <CommandEmpty>No weapon matches.</CommandEmpty>
            <CommandGroup heading="Assault rifles">
              {assaultRifles.map((w) => (
                <CommandItem key={w.id} value={w.name}>
                  <SearchIcon />
                  {w.name}
                  <span className="ml-auto text-xs text-text-muted">{w.rpm} RPM</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </Item>
    </Section>
  );
}

function Surfaces() {
  return (
    <Section id="surfaces" title="Surfaces">
      <Item title="Panel, card and well" description="A page's side column, a card inside it and an empty state.">
        <Card className="max-w-80">
          <CardHeader>
            <CardTitle>Session</CardTitle>
            <CardAction>Today</CardAction>
          </CardHeader>
          <Card variant="well">Your runs from today appear here as a trend.</Card>
          <Card variant="card">
            <h4 className="m-0 type-label">Before you start</h4>
            <p className="m-0 text-xs leading-normal text-text-secondary">
              Turn off “Enhance pointer precision” in Windows mouse settings.{' '}
              <a href="#how" className="text-volt underline underline-offset-2 hover:text-volt-bright">
                How
              </a>
            </p>
          </Card>
        </Card>
      </Item>
      <Item title="Scroll area and separator" description="The loadout grid scrolls inside its panel.">
        <ScrollArea className="h-50 max-w-77 pr-2" aria-label="Weapons">
          <WeaponGrid aria-label="Weapon in a scroll area" defaultValue="r301">
            {[...assaultRifles, ...assaultRifles].map((w, i) => (
              <WeaponTile key={`${w.id}-${i}`} value={`${w.id}-${i}`} name={w.name} art={w.art} meta={`${w.rpm} RPM`} />
            ))}
          </WeaponGrid>
        </ScrollArea>
        <Separator />
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <HandIcon className="size-4" />
          <Separator orientation="vertical" className="h-4" />
          <ScanIcon className="size-4" />
          <Separator orientation="vertical" className="h-4" />
          <CirclePlusIcon className="size-4" />
        </div>
      </Item>
    </Section>
  );
}

/** The component gallery: every component of the new UI in its states, on the design tokens. */
export function Gallery() {
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-ground text-text">
        <header className="flex items-center gap-4 border-b border-outline bg-inset px-5 py-3">
          <SpraydownLogo />
          <span className="type-tag text-text-muted">Components</span>
        </header>
        <main className="mx-auto flex max-w-300 flex-col gap-10 px-5 pt-6 pb-8">
          <div>
            <h1 className="m-0 type-page-title">Components</h1>
            <p className="m-0 mt-1.5 text-text-secondary">
              Every component of the new interface in its states, on the design system’s tokens.
            </p>
          </div>
          <Actions />
          <Selection />
          <Fields />
          <Feedback />
          <Data />
          <Overlays />
          <Surfaces />
        </main>
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
