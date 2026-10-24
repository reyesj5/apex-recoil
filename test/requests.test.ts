// What the server makes of the requests it accepts (shared/requests.ts) and the discovery CLI arguments
// it runs an analysis with: forms send text, JSON sends values, and anything unusable falls back to the
// CLI's defaults, as the API always did
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCliArgs, sessionMetadata } from '../server/analysis-params.ts';
import { saveSpecBody, sessionRequest, specUpdate, staticImageRequest, uploadPlanBody } from '../shared/requests.ts';

const cli = ['-m', 'recoil_discovery.cli', 'session'];

test('reads the analysis settings of a form, with the CLI defaults', () => {
  const fields = sessionRequest.parse({
    weapon: 'R-301 x',
    rpm: '810',
    zoom: '2',
    hdr_mode: 'off',
    save_capture: 'false',
    shots: 'abc',
  });
  assert.equal(fields.weapon, 'R-301x');
  assert.equal(fields.mode, 'auto');
  assert.equal(fields.save_capture, false);
  assert.deepEqual(fields.samples, []);
  assert.deepEqual(buildCliArgs(fields.weapon, fields), [
    ...cli,
    '--weapon',
    'R-301x',
    '--multiplier',
    '0.73',
    '--rpm',
    '810',
    '--zoom',
    '2',
    '--fov',
    '104',
    '--distance',
    '20',
    '--hdr',
    'off',
    '--strategy',
    'accumulate',
  ]);
});

test('takes JSON values as they are, and the defaults for settings it cannot use', () => {
  const fields = sessionRequest.parse({
    weapon: 'r99',
    mode: 'semi',
    rpm: 1080,
    existing_samples: 3,
    strategy: 'overwrite',
    hdr: 'sepia',
    fov: -5,
    multiplier: '0.5',
    save_capture: 'yes',
  });
  assert.equal(fields.save_capture, undefined);
  assert.deepEqual(buildCliArgs('r99', fields), [
    ...cli,
    '--weapon',
    'r99',
    '--multiplier',
    '0.5',
    '--rpm',
    '1080',
    '--fov',
    '104',
    '--distance',
    '20',
    '--hdr',
    'auto',
    '--strategy',
    'overwrite',
    '--existing-samples',
    '3',
  ]);
  assert.deepEqual(sessionMetadata(fields), {
    zoom: 1,
    fov: 104,
    distance: 20,
    multiplier: 0.5,
    hdr: 'auto',
    strategy: 'overwrite',
  });
});

test("reads old clients' base64 lists, and the token of a direct upload", () => {
  const session = sessionRequest.parse({ weapon: 'r99', samples: '[{"data":"AAA","screenshot":"BBB"},null]' });
  assert.deepEqual(session.samples, [{ data: 'AAA', screenshot: 'BBB' }, { data: '' }]);
  assert.deepEqual(sessionRequest.parse({ weapon: 'r99', samples: 'not json' }).samples, []);
  assert.deepEqual(sessionRequest.parse({ weapon: 'r99', upload: { token: 'abc' } }).upload, { token: 'abc' });
  assert.deepEqual(sessionRequest.parse({ weapon: 'r99', upload: {} }).upload, { token: '' });
  assert.equal(sessionRequest.parse({ weapon: 'r99', upload: 'abc' }).upload, undefined);

  const images = staticImageRequest.parse({ weapon: 'r99', images: [{ name: 'a.png', data: 'x' }], image_data: 5 });
  assert.deepEqual(images.images, [{ name: 'a.png', data: 'x' }]);
  assert.equal(images.image_data, undefined);
});

test('plans uploads leniently: the purpose, the files and the tags', () => {
  const plan = uploadPlanBody.parse({
    purpose: 'other',
    weapon: 'R 99',
    save_capture: 'true',
    files: [{ name: 'a.webm', size: '10', type: 'video/webm', field: 'videos' }, null, { name: 7 }],
  });
  assert.equal(plan.purpose, 'session');
  assert.equal(plan.weapon, 'R99');
  assert.equal(plan.mode, 'auto');
  assert.equal(plan.save_capture, true);
  assert.deepEqual(plan.files[0], { name: 'a.webm', size: 10, type: 'video/webm', field: 'videos' });
  assert.equal(plan.files[1], null);
  assert.equal(plan.files[2]?.name, undefined);
  assert.ok(Number.isNaN(plan.files[2]?.size));
  assert.deepEqual(uploadPlanBody.parse({}).files, []);
});

test('a spec update needs a name and a pattern of numbers, all of one length', () => {
  assert.ok(specUpdate.safeParse({ name: 'r99', x: [0, -0.5], y: [0, 1], time_points: [0, 55], mags: [] }).success);
  assert.ok(!specUpdate.safeParse({ name: ' ', x: [], y: [], time_points: [] }).success);
  assert.ok(!specUpdate.safeParse({ name: 'r99', x: [0, 1], y: [0], time_points: [0, 1] }).success);
  assert.ok(!specUpdate.safeParse({ name: 'r99', x: ['0'], y: [0], time_points: [0] }).success);

  // What goes with it is optional, and kept only when it has the right type
  const body = saveSpecBody.parse({ weapon: { name: 'r99', x: [], y: [], time_points: [] }, author: 3, notes: 'n' });
  assert.equal(body.author, undefined);
  assert.equal(body.notes, 'n');
});
