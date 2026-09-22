/*
 * Classical NAS search strategies over the toy space, one evaluation per
 * step so the demos can animate them: random search and regularized
 * evolution (Real et al., 2019). Every step "trains" one architecture, i.e.
 * looks up its reward, and costs one evaluation.
 */
(function (root) {
  'use strict';

  const space = root.NAG && root.NAG.space ? root.NAG.space : require('./space.js');

  function randomSearch(d, random) {
    const history = [];
    return {
      history: history,
      step: function () {
        const index = space.encode(space.randomCell(random));
        const item = { index: index, reward: space.reward(space.decode(index), d) };
        history.push(item);
        return item;
      },
    };
  }

  // Keep a population; each step, pick the best of a random sample, mutate
  // one edge, evaluate the child, and retire the oldest member.
  function regularizedEvolution(d, random, options) {
    const opts = Object.assign({ population: 20, sample: 5 }, options);
    const history = [];
    const population = [];

    function evaluate(ops) {
      const index = space.encode(ops);
      const item = { index: index, reward: space.reward(ops, d) };
      history.push(item);
      return item;
    }

    function mutate(ops) {
      const child = ops.slice();
      const e = Math.floor(random() * space.N_EDGES);
      let op = child[e];
      while (op === child[e]) op = Math.floor(random() * space.N_OPS);
      child[e] = op;
      return child;
    }

    return {
      history: history,
      step: function () {
        let item;
        if (population.length < opts.population) {
          item = evaluate(space.randomCell(random));
        } else {
          let parent = null;
          for (let s = 0; s < opts.sample; s++) {
            const candidate = population[Math.floor(random() * population.length)];
            if (!parent || candidate.reward > parent.reward) parent = candidate;
          }
          item = evaluate(mutate(space.decode(parent.index)));
          population.shift();
        }
        population.push(item);
        return item;
      },
    };
  }

  function best(history) {
    return history.reduce(function (b, x) { return !b || x.reward > b.reward ? x : b; }, null);
  }

  // Run a strategy for `budget` evaluations and return its history.
  function run(strategy, budget) {
    for (let i = 0; i < budget; i++) strategy.step();
    return strategy.history;
  }

  const api = { randomSearch: randomSearch, regularizedEvolution: regularizedEvolution, best: best, run: run };
  root.NAG = root.NAG || {};
  root.NAG.search = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
