/*
 * GFlowNet versus reinforcement learning: the same tabular construction
 * policy trained with trajectory balance (reward exp(beta * accuracy)) and with
 * REINFORCE (maximize expected accuracy). Plots the probability each policy
 * gives to the 40 most accurate cells, against the reward-proportional target.
 */
(function () {
  'use strict';

  const root = window.NAG && window.NAG.sections && document.getElementById('flow-demo');
  if (!root) return;

  const BETA = 1;
  const EPISODES = 200000;
  const EPISODES_PER_FRAME = 4000;
  const LR = 0.05;
  const EXPLORE = 0.3;
  const TOP = 40;
  const SAMPLES = 1000;
  const P_FLOOR = 1e-5;   // bottom of the log axis

  window.NAG.sections.whenOpen(root, function mount() {
    const NAG = window.NAG;
    const space = NAG.space;
    const flow = NAG.flow;
    const metrics = NAG.metrics;
    const t = NAG.i18n.t;
    const num = NAG.i18n.num;

    const el = {
      train: root.querySelector('[data-role="train"]'),
      reset: root.querySelector('[data-role="reset"]'),
      status: root.querySelector('[data-role="status"]'),
      fills: {},
    };
    ['gfn-acc', 'rl-acc', 'gfn-eff', 'rl-eff', 'gfn-top', 'rl-top'].forEach(function (k) {
      el.fills[k] = root.querySelector('[data-fill="' + k + '"]');
    });

    const table = space.rewardTable(space.TASKS.medium.d);
    const best = table[space.argmax(table)];
    const target = metrics.boltzmann(table, BETA);
    const ranked = Array.from(table.keys()).sort(function (a, b) { return table[b] - table[a]; });
    const topSet = new Set(ranked.slice(0, Math.round(space.SIZE / 100)));
    const chart = NAG.charts.createLineChart(root.querySelector('[data-role="chart"]'), {
      xLabel: t('flow.rank'), yLabel: t('common.probability'), ariaLabel: t('flow.aria'), xDomain: [1, TOP],
      yDomain: [P_FLOOR, 1], yLog: true, yFormat: function (v) { return num(100 * v, Math.max(0, -Math.floor(Math.log10(100 * v) + 1e-9))) + '%'; },
    });

    const state = {};

    function reset() {
      stop();
      state.gfn = flow.createPolicy();
      state.rl = flow.createPolicy();
      state.rlState = {};
      state.episodes = 0;
      state.random = [space.rng(1), space.rng(2)];
      el.train.textContent = t('flow.train');
      el.train.setAttribute('aria-pressed', 'false');
      el.status.textContent = t('flow.idle');
      Object.keys(el.fills).forEach(function (k) { el.fills[k].textContent = '–'; });
      render(false);
    }

    function curve(p) {
      return ranked.slice(0, TOP).map(function (i, k) { return [k + 1, Math.max(p[i], P_FLOOR)]; });
    }

    function summarize(p, prefix, random) {
      let expected = 0;
      for (let i = 0; i < p.length; i++) expected += p[i] * table[i];
      const found = new Set();
      for (let s = 0; s < SAMPLES; s++) {
        const i = flow.rollout(prefix === 'gfn' ? state.gfn : state.rl, random).index;
        if (topSet.has(i)) found.add(i);
      }
      el.fills[prefix + '-acc'].textContent = num(expected, 2) + '%';
      const eff = metrics.effectiveCount(p);
      el.fills[prefix + '-eff'].textContent = num(eff, eff < 10 ? 1 : 0);
      el.fills[prefix + '-top'].textContent = num(found.size) + ' / ' + num(topSet.size);
    }

    function render(withStats) {
      const pg = flow.distribution(state.gfn);
      const pr = flow.distribution(state.rl);
      chart.update([
        { points: curve(target), className: 'series-muted', dashed: true },
        { points: curve(pg), className: 'series-a' },
        { points: curve(pr), className: 'series-b' },
      ], []);
      if (withStats) {
        const random = space.rng(99);
        summarize(pg, 'gfn', random);
        summarize(pr, 'rl', random);
      }
    }

    function stop() {
      if (state.frame) cancelAnimationFrame(state.frame);
      state.frame = null;
    }

    function frame() {
      const logReward = function (i) { return BETA * (table[i] - best); };
      const reward = function (i) { return table[i] / 10; };
      for (let k = 0; k < EPISODES_PER_FRAME && state.episodes < EPISODES; k++) {
        flow.tbStep(state.gfn, logReward, state.random[0], LR, EXPLORE);
        flow.reinforceStep(state.rl, reward, state.random[1], LR, state.rlState);
        state.episodes++;
      }
      const done = state.episodes >= EPISODES;
      render(done);
      if (done) {
        state.frame = null;
        el.train.textContent = t('flow.train');
        el.train.setAttribute('aria-pressed', 'false');
        el.train.disabled = true;
        el.status.textContent = t('flow.done', { n: num(EPISODES) });
        return;
      }
      el.status.textContent = t('flow.training', { i: num(state.episodes), n: num(EPISODES) });
      state.frame = requestAnimationFrame(frame);
    }

    function pause() {
      stop();
      el.train.textContent = t('flow.resume');
      el.train.setAttribute('aria-pressed', 'false');
      el.status.textContent = t('flow.paused', { i: num(state.episodes), n: num(EPISODES) });
      render(true);
    }

    el.train.addEventListener('click', function () {
      if (state.frame) { pause(); return; }
      el.train.textContent = t('flow.pause');
      el.train.setAttribute('aria-pressed', 'true');
      state.frame = requestAnimationFrame(frame);
    });
    el.reset.addEventListener('click', function () {
      el.train.disabled = false;
      reset();
    });
    NAG.sections.onClose(root, function () { if (state.frame) pause(); });
    reset();
  });
})();
