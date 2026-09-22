'use strict';

// Checks that each illustrated mechanism really shows the behavior the page
// describes. Seeds are fixed, so these are deterministic.
const test = require('node:test');
const assert = require('node:assert/strict');
const space = require('../assets/js/space.js');
const metrics = require('../assets/js/metrics.js');
const generator = require('../assets/js/generator.js');
const search = require('../assets/js/search.js');
const flow = require('../assets/js/flow.js');
const diffusion = require('../assets/js/diffusion.js');
const latent = require('../assets/js/latent.js');
const pareto = require('../assets/js/pareto.js');

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

test('regularized evolution finds the best cell of a task within 300 evaluations', () => {
  const d = space.TASKS.medium.d;
  const table = space.rewardTable(d);
  const history = search.run(search.regularizedEvolution(d, space.rng(3)), 300);
  assert.equal(history.length, 300);
  assert.ok(search.best(history).reward >= table[space.argmax(table)] - 0.5);
});

test('the amortized generator beats random sampling on held-out tasks, with no search', () => {
  let rows = [];
  space.TRAIN_TASKS.forEach((d, k) => {
    rows = rows.concat(generator.weightedRows(d, search.run(search.regularizedEvolution(d, space.rng(100 + k)), 300), 2));
  });
  const model = generator.fit(generator.create(2), rows, { epochs: 200 });
  for (const d of [[0.3, 0.7], [0.7, 0.2]]) {
    const table = space.rewardTable(d);
    const random = space.rng(7);
    const generated = generator.sample(model, d, 200, random).map((i) => table[i]);
    const uniform = Array.from({ length: 200 }, () => table[space.encode(space.randomCell(random))]);
    assert.ok(mean(generated) > mean(uniform) + 5, `${mean(generated)} vs ${mean(uniform)}`);
    assert.ok(Math.max(...generated.slice(0, 20)) > table[space.argmax(table)] - 1);
  }
});

test('trajectory balance approaches p proportional to R; REINFORCE collapses to one cell', () => {
  const table = space.rewardTable(space.TASKS.medium.d);
  const best = table[space.argmax(table)];
  const beta = 0.5;
  const gfn = flow.createPolicy();
  const rl = flow.createPolicy();
  const r1 = space.rng(1);
  const r2 = space.rng(2);
  const rlState = {};
  const klBefore = metrics.kl(metrics.boltzmann(table, beta), flow.distribution(gfn));
  for (let s = 0; s < 150000; s++) {
    flow.tbStep(gfn, (i) => beta * (table[i] - best), r1, 0.05, 0.3);
    flow.reinforceStep(rl, (i) => table[i] / 10, r2, 0.05, rlState);
  }
  const target = metrics.boltzmann(table, beta);
  const klAfter = metrics.kl(target, flow.distribution(gfn));
  assert.ok(klAfter < 0.6 && klAfter < klBefore / 3, `KL ${klBefore} -> ${klAfter}`);
  const prl = flow.distribution(rl);
  assert.ok(Math.max(...prl) > 0.9);
  assert.ok(metrics.effectiveCount(flow.distribution(gfn)) > 100 * metrics.effectiveCount(prl));
});

test('the exact denoiser memorizes; the per-edge denoiser generalizes; guidance raises accuracy', () => {
  const table = space.rewardTable(space.TASKS.medium.d);
  const random = space.rng(11);
  const target = metrics.boltzmann(table, 0.3);
  const archive = Array.from({ length: 300 }, () => {
    const i = space.sampleIndex(target, random);
    return { index: i, reward: table[i] };
  });
  const surrogate = diffusion.fitSurrogate(archive, 1);
  const draw = (den, g) => {
    const r = space.rng(5);
    return Array.from({ length: 150 }, () => space.encode(diffusion.sample(den, g, r).slice(-1)[0]));
  };
  const exact = diffusion.exactDenoiser(archive, surrogate);
  const perEdge = diffusion.perEdgeDenoiser(archive, surrogate);
  const archiveSet = new Set(archive.map((x) => x.index));
  assert.equal(metrics.novelty(draw(exact, 0), archiveSet), 0);
  assert.ok(metrics.novelty(draw(perEdge, 0), archiveSet) > 0.5);
  const unguided = mean(draw(perEdge, 0).map((i) => table[i]));
  const guided = mean(draw(perEdge, 1).map((i) => table[i]));
  assert.ok(guided > unguided + 2, `${unguided} -> ${guided}`);
});

test('latent decoding returns the nearest encoded cell', () => {
  const d = space.TASKS.medium.d;
  const table = space.rewardTable(d);
  const random = space.rng(4);
  const training = Array.from({ length: 120 }, () => {
    const i = space.encode(space.randomCell(random));
    return { index: i, reward: table[i] };
  });
  const map = latent.build(d, training);
  for (const z of [[0.1, 0.9], [0.5, 0.5], [0.93, 0.07]]) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < space.SIZE; i++) {
      const dist = (map.coords[2 * i] - z[0]) ** 2 + (map.coords[2 * i + 1] - z[1]) ** 2;
      if (dist < bestD) { bestD = dist; best = i; }
    }
    const found = map.decode(z);
    const foundD = (map.coords[2 * found] - z[0]) ** 2 + (map.coords[2 * found + 1] - z[1]) ** 2;
    assert.ok(Math.abs(foundD - bestD) < 1e-12, `${found} vs ${best}`);
  }
});

test('the Pareto front is non-dominated and increasing', () => {
  const pts = pareto.points(space.TASKS.medium.d);
  const front = pareto.front(pts);
  for (let k = 1; k < front.length; k++) {
    assert.ok(front[k].params > front[k - 1].params);
    assert.ok(front[k].reward > front[k - 1].reward);
  }
  // Every cell is matched or beaten by a front point that is no larger.
  for (const p of pts) {
    assert.ok(front.some((f) => f.params <= p.params && f.reward >= p.reward), String(p.index));
  }
});
