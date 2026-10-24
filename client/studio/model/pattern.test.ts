import { describe, expect, it } from 'vitest';
import specs from '@/specs.json';
import {
  addShot,
  canvasShots,
  insertionIndex,
  legacySpec,
  measureShots,
  moveShot,
  removeShot,
  toggleAnchor,
  type CanvasShot,
} from './pattern';
import { plainPlacement, type Placement } from './placement';
import { shotsOf, type Spec } from './spec';

const all = specs as Spec[];
const spec = (name: string) => structuredClone(all.find((s) => s.name === name)!);
const line = [
  { x: 0, y: 0 },
  { x: 0, y: -10 },
  { x: 0, y: -20 },
];

describe('adding shots', () => {
  it('puts a shot where it fits the sequence', () => {
    expect(insertionIndex([], { x: 1, y: 1 })).toBe(0);
    expect(insertionIndex([{ x: 0, y: 0 }], { x: 1, y: 1 })).toBe(1);
    // Inside a segment
    expect(insertionIndex(line, { x: 0.5, y: -5 })).toBe(1);
    expect(insertionIndex(line, { x: -1, y: -15 })).toBe(2);
    // Beyond either end, continuing the pattern
    expect(insertionIndex(line, { x: 0, y: -30 })).toBe(3);
    expect(insertionIndex(line, { x: 0, y: 8 })).toBe(0);
    // Near an end of a segment, the 15 penalty sends it past the end instead
    expect(insertionIndex(line, { x: 0, y: -21 })).toBe(3);
  });

  it('moves the anchors along', () => {
    const shots: CanvasShot[] = line.map((at) => ({ at }));
    const added = addShot({ shots, anchors: [0, 2] }, { x: 0.5, y: -5 });
    expect(added.index).toBe(1);
    expect(added.shots.map((s) => s.at)).toEqual([line[0], { x: 0.5, y: -5 }, line[1], line[2]]);
    expect(added.anchors).toEqual([0, 3]);

    const removed = removeShot({ shots: added.shots, anchors: [0, 1, 3] }, 1);
    expect(removed.shots.map((s) => s.at)).toEqual(line);
    expect(removed.anchors).toEqual([0, 2]);

    expect(moveShot({ shots, anchors: [1] }, 1, { x: 3, y: 3 }).shots[1]).toEqual({ at: { x: 3, y: 3 } });
    expect(toggleAnchor([1, 4], 2)).toEqual([1, 2, 4]);
    expect(toggleAnchor([1, 2, 4], 2)).toEqual([1, 4]);
  });
});

describe('measuring the canvas', () => {
  const placement: Placement = { origin: { x: 960, y: 540 }, pxPerCount: 2 };

  it('keeps the shots that did not move', () => {
    const r99 = spec('r99');
    const shots = canvasShots(r99, placement);
    const added = addShot({ shots, anchors: [] }, { x: shots[4].at.x + 1, y: (shots[4].at.y + shots[5].at.y) / 2 });
    const measured = measureShots(added.shots, placement, r99);
    expect(measured).toHaveLength(r99.x.length + 1);
    expect(measured.filter((_, i) => i !== added.index)).toEqual(shotsOf(r99));
  });

  it('measures every shot from shot 0 once shot 0 moves or goes', () => {
    const r99 = spec('r99');
    const shots = canvasShots(r99, placement);
    const moved = measureShots(moveShot({ shots, anchors: [] }, 0, { x: 962, y: 540 }).shots, placement, r99);
    expect(moved[0]).toEqual({ x: 0, y: 0 });
    // Every other shot is now 2 px (1 count) further left of shot 0
    expect(moved[3].x).toBeCloseTo(r99.x[3] - 0.73, 2);
    expect(moved[3].y).toBeCloseTo(r99.y[3], 2);

    const removed = measureShots(removeShot({ shots, anchors: [] }, 0).shots, placement, r99);
    expect(removed).toHaveLength(r99.x.length - 1);
    expect(removed[0]).toEqual({ x: 0, y: 0 });
    expect(removed[1].x).toBeCloseTo(r99.x[2] - r99.x[1], 2);
  });

  it('gives raw values back on specs that have them', () => {
    const havoc = spec('havoc_tc');
    const shots = canvasShots(havoc, plainPlacement);
    const removed = measureShots(removeShot({ shots, anchors: [] }, 0).shots, plainPlacement, havoc);
    expect(removed[0]).toEqual({ x: 0, y: 0, raw: { x: 0, y: 0 } });
    expect(removed[1].raw).toEqual({
      x: Math.round((removed[1].x / 0.73) * 100) / 100,
      y: Math.round((removed[1].y / 0.73) * 100) / 100,
    });
    expect(measureShots([], plainPlacement, havoc)).toEqual([]);
  });
});

it('exports the legacy version 2 spec', () => {
  expect(
    legacySpec({
      weapon: 'r301',
      points: [
        { x: 100.4, y: 200.6 },
        { x: 110.2, y: 150.1 },
      ],
      anchors: [1, 5],
      barrel: 2,
      stock: 1,
      comment: 'wall at 20 m',
      distance: 20,
    }),
  ).toEqual({
    version: 2,
    weapon: 'r301',
    barrel: 2,
    stock: 1,
    comment: 'wall at 20 m',
    x: [0, 10],
    // Math.round takes -50.5 up
    y: [0, -50],
    anchor_indexes: [1],
    anchor_in_game_distance: 20,
  });
  expect(
    legacySpec({ weapon: 'r99', points: [], anchors: [0], barrel: 0, stock: 0, comment: '', distance: 100 }),
  ).toMatchObject({
    x: [],
    y: [],
    anchor_indexes: [],
  });
});
