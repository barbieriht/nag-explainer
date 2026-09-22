/*
 * Budget-conditioned generation: one generator p_theta(A | lambda) for every
 * parameter budget lambda, instead of one search per budget. The exact
 * accuracy / parameter-count Pareto front of the toy space is computed by
 * enumeration, to judge the generator against it.
 */
(function (root) {
  'use strict';

  const space = root.NAG && root.NAG.space ? root.NAG.space : require('./space.js');
  const generator = root.NAG && root.NAG.generator ? root.NAG.generator : require('./generator.js');

  const MIN_BUDGET = 0.1;
  const MAX_BUDGET = 1.6;
  const TRAIN_BUDGETS = [0.2, 0.35, 0.5, 0.65, 0.8, 0.95, 1.1, 1.25, 1.4, 1.55];

  // Budget (millions of parameters) -> conditioning vector: Gaussian bumps
  // spread over the budget range, so the generator can change its behavior
  // sharply between small and large budgets.
  const CENTERS = [0, 0.25, 0.5, 0.75, 1];
  const WIDTH = 0.18;
  function condition(budget) {
    const u = (budget - MIN_BUDGET) / (MAX_BUDGET - MIN_BUDGET);
    return CENTERS.map(function (c) { return Math.exp(-Math.pow((u - c) / WIDTH, 2) / 2); });
  }

  // Every valid cell with its accuracy and size, for task descriptor d.
  function points(d) {
    const table = space.rewardTable(d);
    const out = [];
    for (let i = 0; i < space.SIZE; i++) {
      const ops = space.decode(i);
      if (space.isValid(ops)) out.push({ index: i, reward: table[i], params: space.params(ops) });
    }
    return out;
  }

  // Non-dominated points: no other cell is at least as small and more accurate.
  function front(pts) {
    const sorted = pts.slice().sort(function (a, b) { return a.params - b.params || b.reward - a.reward; });
    const out = [];
    let best = -Infinity;
    sorted.forEach(function (p) {
      if (p.reward > best) { out.push(p); best = p.reward; }
    });
    return out;
  }

  // Best accuracy reachable within a budget.
  function bestWithin(frontPts, budget) {
    let best = -Infinity;
    frontPts.forEach(function (p) { if (p.params <= budget && p.reward > best) best = p.reward; });
    return best;
  }

  /*
   * Training rows: for each training budget, the top cells that fit it,
   * weighted by exp(beta (R - R_best within budget)). Only these budgets are
   * seen in training; the slider can ask for any budget in between.
   */
  function trainingRows(pts, beta, perBudget) {
    const n = perBudget || 120;
    let rows = [];
    TRAIN_BUDGETS.forEach(function (budget) {
      const fit = pts.filter(function (p) { return p.params <= budget; })
        .sort(function (a, b) { return b.reward - a.reward; }).slice(0, n);
      rows = rows.concat(generator.weightedRows(condition(budget), fit, beta));
    });
    return rows;
  }

  const api = {
    MIN_BUDGET: MIN_BUDGET, MAX_BUDGET: MAX_BUDGET, TRAIN_BUDGETS: TRAIN_BUDGETS,
    CONDITION_SIZE: CENTERS.length, condition: condition, points: points, front: front, bestWithin: bestWithin, trainingRows: trainingRows,
  };
  root.NAG = root.NAG || {};
  root.NAG.pareto = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
