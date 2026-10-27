import { describe, expect, it } from 'vitest';
import {
  addSample,
  audioLevel,
  captureStep,
  discardSample,
  initialCapture,
  MAX_SPRAY_MS,
  reaimRemaining,
  slotAfterDiscard,
  sortImports,
  sprayFileName,
  wallFor,
  type CaptureEvent,
  type CaptureState,
  type Sample,
} from './capture';

/** Runs events through the reducer and collects the commands */
function run(events: CaptureEvent[], state: CaptureState = initialCapture) {
  const commands: string[] = [];
  for (const event of events) {
    const step = captureStep(state, event);
    state = step.state;
    if (step.command) commands.push(step.command);
  }
  return { state, commands };
}

const loud = (now: number): CaptureEvent => ({ type: 'level', now, level: 60, threshold: 25 });
const quiet = (now: number): CaptureEvent => ({ type: 'level', now, level: 3, threshold: 25 });

describe('the live capture', () => {
  it('records a spray from the first shot to the end of the re-aim buffer', () => {
    const { state, commands } = run([
      { type: 'connect' },
      quiet(0),
      loud(100),
      loud(200),
      quiet(800),
      // 700 ms of silence after the last shot: the re-aim buffer
      quiet(901),
      { type: 'tick', now: 3000, bufferMs: 4500 },
      { type: 'tick', now: 5401, bufferMs: 4500 },
    ]);
    expect(commands).toEqual(['start', 'finish']);
    expect(state.phase).toBe('idle');
  });

  it('shows the buffer counting down', () => {
    const { state } = run([{ type: 'connect' }, loud(0), quiet(701)]);
    expect(state).toMatchObject({ phase: 'reaim', reaimStart: 701 });
    expect(reaimRemaining(state, 2701, 4500)).toBe(2500);
    expect(reaimRemaining(state, 9000, 4500)).toBe(0);
  });

  it('carries on when a burst weapon fires again during the buffer', () => {
    const { state, commands } = run([{ type: 'connect' }, loud(0), quiet(701), loud(900), quiet(1500)]);
    expect(commands).toEqual(['start']);
    expect(state).toMatchObject({ phase: 'recording', lastGunfire: 900 });
  });

  it('cuts a spray off after 20 s', () => {
    const levels = Array.from({ length: 30 }, (_, i) => loud(i * 650));
    const { commands } = run([{ type: 'connect' }, ...levels, quiet(MAX_SPRAY_MS + 1)]);
    expect(commands).toEqual(['start', 'finish']);
  });

  it('snaps the wall early, by hand', () => {
    expect(run([{ type: 'connect' }, loud(0), { type: 'snap' }]).commands).toEqual(['start', 'finish']);
    expect(run([{ type: 'connect' }, { type: 'snap' }]).commands).toEqual([]);
    // Manual spray: the button starts and finishes, without the sensor
    expect(
      run([{ type: 'connect' }, { type: 'manual', now: 0 }, quiet(5000), { type: 'manual', now: 6000 }]).commands,
    ).toEqual(['start', 'finish']);
  });

  it("ignores gunfire from the samples' playback", () => {
    const { commands, state } = run([{ type: 'connect' }, { type: 'preview', playing: true }, loud(100)]);
    expect(commands).toEqual([]);
    expect(run([{ type: 'preview', playing: false }, loud(200)], state).commands).toEqual(['start']);
  });

  it('needs the game window', () => {
    expect(run([loud(0), { type: 'manual', now: 0 }]).commands).toEqual([]);
    const { state, commands } = run([{ type: 'connect' }, loud(0), { type: 'disconnect' }]);
    // The spray in progress is kept
    expect(commands).toEqual(['start', 'finish']);
    expect(state).toMatchObject({ connected: false, phase: 'idle' });
  });

  it('reads the sensor level from the waveform', () => {
    expect(audioLevel(new Uint8Array(256).fill(128))).toBe(0);
    expect(audioLevel(new Uint8Array(256).fill(255))).toBe(100);
    expect(audioLevel(new Uint8Array(256).map((_, i) => (i % 2 ? 128 + 20 : 128 - 20)))).toBe(44);
    expect(audioLevel(new Uint8Array())).toBe(0);
  });
});

const sample = (n: number): Sample => ({
  id: `s${n}`,
  name: `Spray #${n}`,
  clip: new Blob([]),
  url: `blob:${n}`,
  durationSec: 2,
});

describe('the samples', () => {
  it('adds a spray, or replaces the one marked for a re-recording', () => {
    const one = addSample([], sample(1), null);
    expect(one.samples.map((s) => s.id)).toEqual(['s1']);
    const two = addSample(one.samples, sample(2), null);
    const redone = addSample(two.samples, { ...sample(3), name: 'Spray #3' }, 0);
    expect(redone.samples.map((s) => [s.id, s.name])).toEqual([
      ['s3', 'Spray #1'],
      ['s2', 'Spray #2'],
    ]);
    expect(redone.replaced?.id).toBe('s1');
    expect(addSample(two.samples, sample(3), 5).samples).toHaveLength(3);
  });

  it('renumbers after a discard', () => {
    const samples = [sample(1), { ...sample(2), name: 'Spray #2 (clip.webm)' }, sample(3)];
    expect(discardSample(samples, 0).map((s) => [s.id, s.name])).toEqual([
      ['s2', 'Spray #1'],
      ['s3', 'Spray #2'],
    ]);
    expect(slotAfterDiscard(2, 0)).toBe(1);
    expect(slotAfterDiscard(0, 0)).toBeNull();
    expect(slotAfterDiscard(0, 2)).toBe(0);
    expect(slotAfterDiscard(null, 1)).toBeNull();
  });

  it('pairs clips with their wall screenshots', () => {
    expect(wallFor('spray_01.webm', ['spray_02_wall.jpg', 'spray_01_wall.jpg'])).toBe('spray_01_wall.jpg');
    expect(wallFor('spray_01.webm', ['spray_01.png'])).toBe('spray_01.png');
    expect(wallFor('spray_01_take2.webm', ['spray_01.png'])).toBe('spray_01.png');
    expect(wallFor('spray_01.webm', ['other.png'])).toBeUndefined();
    const files = [
      { name: 'a.webm', type: '' },
      { name: 'b.MP4', type: '' },
      { name: 'c.jpg', type: 'image/jpeg' },
      { name: 'd.txt', type: 'text/plain' },
      { name: 'e', type: 'video/webm' },
    ];
    expect(sortImports(files)).toEqual({ clips: [files[0], files[1], files[4]], images: [files[2]] });
    expect([sprayFileName(0), sprayFileName(11, true)]).toEqual(['spray_01.webm', 'spray_12_wall.jpg']);
  });
});
