/*
 * The toy architecture space shared by every demo: a cell in the style of
 * NAS-Bench-201 (Dong & Yang, 2020). Four nodes, six edges (every i -> j with
 * i < j), one operation per edge, so 5^6 = 15,625 cells. The space is small
 * enough to enumerate, so every distribution a demo shows is exact.
 *
 * The reward is a hand-designed synthetic "accuracy", NOT NAS-Bench-201 data.
 * It depends on a task descriptor d = [d1, d2] in [0, 1]^2 (d1: difficulty,
 * d2: input resolution), so there is a whole family of related "datasets".
 *
 * Runs in the browser (window.NAG.space) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  const OPS = ['none', 'skip', 'conv1x1', 'conv3x3', 'avgpool'];
  const OP = { none: 0, skip: 1, conv1x1: 2, conv3x3: 3, avgpool: 4 };
  const EDGES = [[0, 1], [0, 2], [1, 2], [0, 3], [1, 3], [2, 3]];
  const N_EDGES = EDGES.length;
  const N_OPS = OPS.length;
  const SIZE = Math.pow(N_OPS, N_EDGES); // 15625

  // Every input -> output path, as lists of edge indices.
  const PATHS = [[3], [0, 4], [1, 5], [0, 2, 5]];

  // Accuracy of a cell with no input -> output path: a 10-class coin toss.
  const CHANCE_ACCURACY = 10;

  // ------------------------------------------------------------ encoding

  function decode(index) {
    const ops = new Array(N_EDGES);
    let rest = index;
    for (let e = 0; e < N_EDGES; e++) {
      ops[e] = rest % N_OPS;
      rest = Math.floor(rest / N_OPS);
    }
    return ops;
  }

  function encode(ops) {
    let index = 0;
    for (let e = N_EDGES - 1; e >= 0; e--) index = index * N_OPS + ops[e];
    return index;
  }

  // NAS-Bench-201-style string: |op~0|+|op~0|op~1|+|op~0|op~1|op~2|
  function toString(ops) {
    const byTarget = [1, 2, 3].map(function (j) {
      return EDGES.map(function (edge, e) { return edge[1] === j ? '|' + OPS[ops[e]] + '~' + edge[0] : ''; }).join('') + '|';
    });
    return byTarget.join('+');
  }

  // ---------------------------------------------------------- structure

  function activePaths(ops) {
    return PATHS.filter(function (path) {
      return path.every(function (e) { return ops[e] !== OP.none; });
    });
  }

  // Valid = information reaches the output (at least one path with no "none").
  function isValid(ops) {
    return activePaths(ops).length > 0;
  }

  function count(ops, op) {
    return ops.reduce(function (n, o) { return n + (o === op ? 1 : 0); }, 0);
  }

  // Parameter count of the full network in millions, NAS-Bench-201-like range
  // (about 0.07 M with no convolutions to 1.5 M with six 3x3 convolutions).
  function params(ops) {
    return 0.073 + 0.243 * count(ops, OP.conv3x3) + 0.027 * count(ops, OP.conv1x1);
  }

  // --------------------------------------------------------------- tasks

  // Named tasks for the demos. The descriptors are all the generator sees.
  const TASKS = {
    easy: { d: [0.1, 0.2] },
    medium: { d: [0.5, 0.5] },
    hard: { d: [0.9, 0.3] },
  };

  // Training tasks of the amortized generator: a 4 x 4 grid of descriptors.
  const TRAIN_AXIS = [0.1, 0.1 + 0.8 / 3, 0.1 + 1.6 / 3, 0.9];
  const TRAIN_TASKS = [];
  TRAIN_AXIS.forEach(function (d1) {
    TRAIN_AXIS.forEach(function (d2) { TRAIN_TASKS.push([d1, d2]); });
  });

  // -------------------------------------------------------------- reward

  // Deterministic hash of (cell, task) -> [-1, 1): the small, rugged part of
  // the landscape that no simple rule explains (like seed-to-seed variation).
  function jitter(index, d) {
    let h = (index * 2654435761) ^ Math.round(d[0] * 1000) * 40503 ^ Math.round(d[1] * 1000) * 9973;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h ^= h >>> 16;
    return ((h >>> 0) / 4294967296) * 2 - 1;
  }

  function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  // Per-operation contribution to a path, as a function of the task.
  function opScores(d) {
    const s = new Array(N_OPS);
    s[OP.none] = 0;
    s[OP.skip] = 0.15;
    s[OP.conv1x1] = 0.55;
    s[OP.conv3x3] = 0.9 + 0.5 * d[0];
    s[OP.avgpool] = 0.1 + 0.9 * d[1] - 0.3 * d[0];
    return s;
  }

  /*
   * Synthetic test accuracy (%) of a cell on the task with descriptor d.
   * Ingredients, each loosely inspired by what NAS-Bench-201 shows:
   *  - every active path adds the scores of its operations;
   *  - depth helps up to a point, and deep paths want a skip connection
   *    alongside them (residual learning);
   *  - capacity (convolutions) helps more on harder tasks, with diminishing
   *    returns;
   *  - a small deterministic jitter makes the landscape rugged.
   */
  function reward(ops, d) {
    const paths = activePaths(ops);
    if (paths.length === 0) return CHANCE_ACCURACY;
    const s = opScores(d);

    let flow = 0;
    let deepest = 0;
    paths.forEach(function (path) {
      let score = 0;
      let convs = 0;
      path.forEach(function (e) {
        score += s[ops[e]];
        if (ops[e] === OP.conv1x1 || ops[e] === OP.conv3x3) convs++;
      });
      flow += score;
      deepest = Math.max(deepest, convs);
    });

    const hasShortcut = paths.some(function (path) {
      return path.every(function (e) { return ops[e] === OP.skip; });
    });
    const capacity = Math.log(1 + count(ops, OP.conv3x3) + 0.35 * count(ops, OP.conv1x1));
    const depthTerm = Math.min(deepest, 3) * 0.45 - (deepest >= 3 && !hasShortcut ? 0.9 : 0);
    const shortcutTerm = hasShortcut ? 0.5 : 0;
    const poolsOnly = count(ops, OP.conv1x1) + count(ops, OP.conv3x3) === 0 ? -1.5 : 0;

    const score = 0.55 * flow + depthTerm + shortcutTerm + (0.4 + 0.8 * d[0]) * capacity + poolsOnly - 2.6;
    const top = 94.5 - 22 * d[0] - 3 * d[1];
    const floor = top - 38;
    const accuracy = floor + (top - floor) * sigmoid(score) + 0.9 * jitter(encode(ops), d);
    return Math.round(accuracy * 100) / 100;
  }

  // Rewards of all 15,625 cells for one task, cached by descriptor.
  const tableCache = new Map();
  function rewardTable(d) {
    const key = d[0].toFixed(3) + ',' + d[1].toFixed(3);
    if (tableCache.has(key)) return tableCache.get(key);
    const table = new Float64Array(SIZE);
    for (let i = 0; i < SIZE; i++) table[i] = reward(decode(i), d);
    if (tableCache.size > 64) tableCache.clear();
    tableCache.set(key, table);
    return table;
  }

  function argmax(values) {
    let best = 0;
    for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
    return best;
  }

  // ---------------------------------------------------------------- rng

  // Small seeded PRNG (mulberry32) so demos and tests are reproducible.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function sampleIndex(probs, random) {
    let u = random();
    for (let i = 0; i < probs.length; i++) {
      u -= probs[i];
      if (u < 0) return i;
    }
    return probs.length - 1;
  }

  function randomCell(random) {
    return Array.from({ length: N_EDGES }, function () { return Math.floor(random() * N_OPS); });
  }

  const api = {
    OPS: OPS, OP: OP, EDGES: EDGES, PATHS: PATHS, N_EDGES: N_EDGES, N_OPS: N_OPS, SIZE: SIZE,
    CHANCE_ACCURACY: CHANCE_ACCURACY, TASKS: TASKS, TRAIN_TASKS: TRAIN_TASKS,
    decode: decode, encode: encode, toString: toString, isValid: isValid, activePaths: activePaths,
    count: count, params: params, reward: reward, rewardTable: rewardTable, argmax: argmax,
    rng: rng, sampleIndex: sampleIndex, randomCell: randomCell,
  };
  root.NAG = root.NAG || {};
  root.NAG.space = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
