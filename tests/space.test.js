'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const space = require('../assets/js/space.js');
const metrics = require('../assets/js/metrics.js');

test('the space has 15,625 cells and encoding round-trips', () => {
  assert.equal(space.SIZE, 15625);
  for (const i of [0, 1, 777, 15624]) assert.equal(space.encode(space.decode(i)), i);
});

test('a cell without an input-to-output path is degenerate and scores chance level', () => {
  const noPath = [space.OP.conv3x3, space.OP.conv3x3, space.OP.conv3x3, space.OP.none, space.OP.none, space.OP.none];
  assert.equal(space.isValid(noPath), false);
  assert.equal(space.reward(noPath, space.TASKS.medium.d), space.CHANCE_ACCURACY);
  assert.equal(space.isValid([0, 0, 0, space.OP.skip, 0, 0]), true);
});

test('rewards are deterministic and within plausible bounds', () => {
  for (const task of Object.values(space.TASKS)) {
    const table = space.rewardTable(task.d);
    for (let i = 0; i < space.SIZE; i += 97) {
      assert.equal(space.reward(space.decode(i), task.d), table[i]);
      assert.ok(table[i] >= space.CHANCE_ACCURACY && table[i] < 100, String(table[i]));
    }
  }
});

test('the task changes which cell is best', () => {
  const best = Object.values(space.TASKS).map((task) => space.argmax(space.rewardTable(task.d)));
  assert.ok(new Set(best).size > 1);
});

test('p* is uniform at beta = 0 and concentrates on the argmax as beta grows', () => {
  const table = space.rewardTable(space.TASKS.medium.d);
  const uniform = metrics.boltzmann(table, 0);
  assert.ok(Math.abs(uniform.reduce((s, p) => s + p, 0) - 1) < 1e-9);
  assert.ok(Math.abs(uniform[0] - 1 / space.SIZE) < 1e-12);
  const cold = metrics.boltzmann(table, 200);
  assert.ok(cold[space.argmax(table)] > 0.99);
  assert.ok(metrics.effectiveCount(metrics.boltzmann(table, 1)) < metrics.effectiveCount(metrics.boltzmann(table, 0.1)));
});

test('sample metrics on hand-made cases', () => {
  const degenerate = space.encode([1, 1, 1, 0, 0, 0]);
  const a = space.encode([3, 3, 3, 1, 3, 3]);
  const b = space.encode([2, 2, 2, 2, 2, 2]);
  const samples = [a, a, b, degenerate];
  assert.equal(metrics.validity(samples), 0.75);
  assert.equal(metrics.uniqueness(samples), 2 / 3);
  assert.equal(metrics.novelty(samples, [a]), 0.5);
  const p = metrics.histogram([a, b], space.SIZE, 0);
  assert.equal(metrics.kl(p, p), 0);
});
