const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const zlib = require('node:zlib');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..', 'dist');
const { targetGroupSize, groupVotes, ridingIndex, placeGroups } = require(path.join(root, 'aggregation.js'));

test('the target group size doubles at each wider zoom', () => {
  assert.deepEqual([14, 13, 12, 11, 10].map(z => targetGroupSize(z)), [1, 2, 4, 8, 16]);
  assert.deepEqual([1, 2, 4].map(d => targetGroupSize(11, d)), [8, 4, 2]);
  assert.equal(targetGroupSize(13, 4), 2);
  assert.equal(targetGroupSize(14, 4), 1);
});

test('every zoom preserves exact votes by riding and party, including remainders', () => {
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'meta.json')));
  const ridings = JSON.parse(fs.readFileSync(path.join(root, 'ridings.json'))).features
    .map(f => ({ counts: meta.parties.map(p => f.properties.votes[p] || 0) }));
  for (const density of [1, 2, 4]) for (let z = 4; z <= 14; z++) {
    const { scale, groups } = groupVotes(ridings, z, density);
    const totals = ridings.map(() => Array(meta.parties.length).fill(0));
    for (const g of groups) {
      assert.ok(g.n >= 1 && g.n <= scale);
      totals[g.r][g.p] += g.n;
    }
    assert.deepEqual(totals, ridings.map(r => r.counts));
  }
});

test('placement keeps every group and is stable at the same zoom', () => {
  const points = new Float32Array([-0.5, 0.5, 0, -0.5, 0.5, 1]);
  const ids = new Uint8Array([0, 1]);
  const ridings = [{ counts: [5, 0] }, { counts: [0, 3] }];
  const { groups } = groupVotes(ridings, 13);
  const index = ridingIndex(ids, 2);
  const first = placeGroups(groups, points, index, 256 * 2 ** 13, 13);
  const second = placeGroups(groups, points, index, 256 * 2 ** 13, 13);
  assert.deepEqual([...first], [...second]);
  assert.equal([...first.values()].flat().reduce((n, g) => n + g.n, 0), 8);
  assert.equal([...first.values()].flat().length, groups.length);
  assert.ok([...first.values()].some(cell => cell.length > 1));
});

test('overlapping groups are grey and inspectable; filtering isolates a party', () => {
  const messages = [];
  const context = { Uint8ClampedArray, Uint32Array, Uint8Array, Float32Array, Math, Number, Map, Error,
    self: { postMessage: m => messages.push(m) } };
  vm.createContext(context);
  context.importScripts = () => vm.runInContext(fs.readFileSync(path.join(root, 'aggregation.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'aggregate-worker.js'), 'utf8'), context);
  const send = data => context.self.onmessage({ data });
  const votes = new Float32Array([-0.5, 0.5, 0, -0.5, 0.5, 1]);
  send({ type: 'init', votes: votes.buffer, ridingIds: new Uint8Array([0, 1]).buffer,
    colors: [[20, 30, 40], [80, 90, 100]], parties: ['A', 'B'],
    ridings: [{ name: 'One', counts: [1, 0] }, { name: 'Two', counts: [0, 1] }] });
  const view = { x: 0, y: 0, width: 256, height: 256, world: 256 };
  send({ type: 'render', id: 1, view, zoom: 13, selected: -1 });
  let rgba = new Uint8ClampedArray(messages.at(-1).pixels), offset = (64 * 256 + 64) * 4;
  assert.deepEqual([...rgba.slice(offset, offset + 4)], [105, 105, 105, 255]);
  send({ type: 'inspect', id: 1, x: 64, y: 64 });
  const groups = JSON.parse(JSON.stringify(messages.at(-1).groups)).sort((a, b) => a.name.localeCompare(b.name));
  assert.deepEqual(groups, [{ name: 'One', party: 'A', count: 1 }, { name: 'Two', party: 'B', count: 1 }]);
  send({ type: 'render', id: 2, view, zoom: 13, selected: 0 });
  rgba = new Uint8ClampedArray(messages.at(-1).pixels);
  assert.deepEqual([...rgba.slice(offset, offset + 4)], [20, 30, 40, 255]);
});

test('changing density at the same zoom rebuilds the groups', () => {
  const messages = [];
  const context = { Uint8ClampedArray, Uint32Array, Uint8Array, Float32Array, Math, Number, Map, Error,
    self: { postMessage: m => messages.push(m) } };
  vm.createContext(context);
  context.importScripts = () => vm.runInContext(fs.readFileSync(path.join(root, 'aggregation.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'aggregate-worker.js'), 'utf8'), context);
  const send = data => context.self.onmessage({ data });
  const votes = new Float32Array([-0.5, 0.5, 0, -0.4, 0.5, 0, -0.3, 0.5, 0, -0.2, 0.5, 0]);
  send({ type: 'init', votes: votes.buffer, ridingIds: new Uint8Array([0, 0, 0, 0]).buffer,
    colors: [[20, 30, 40]], parties: ['A'], ridings: [{ name: 'One', counts: [4] }] });
  const view = { x: 0, y: 0, width: 256, height: 256, world: 256 };
  send({ type: 'render', id: 1, view, zoom: 12, density: 1, selected: -1 });
  assert.equal(messages.at(-1).visibleGroups, 1);
  send({ type: 'render', id: 2, view, zoom: 12, density: 2, selected: -1 });
  assert.equal(messages.at(-1).visibleGroups, 2);
});

test('the shipped population position files contain one coordinate per recorded vote', () => {
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'meta.json')));
  const parts = Array.from({ length: 8 }, (_, i) => fs.readFileSync(path.join(root, `votes-${String(i).padStart(2, '0')}.gz`)));
  const coordinates = zlib.gunzipSync(Buffer.concat(parts));
  const ids = zlib.gunzipSync(fs.readFileSync(path.join(root, 'riding-ids.gz')));
  assert.equal(coordinates.length / 12, meta.total);
  assert.equal(ids.length, meta.total);
});
