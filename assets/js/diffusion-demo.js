/*
 * Diffusion demo: denoise random cells into cells like those in an archive of
 * good architectures, with an exact (memorizing) or per-edge denoiser and
 * predictor guidance. Reports validity, uniqueness and novelty of a batch.
 */
(function () {
  'use strict';

  const root = window.NAG && window.NAG.sections && document.getElementById('diffusion-demo');
  if (!root) return;

  const ARCHIVE_SIZE = 300;
  const ARCHIVE_BETA = 0.3;  // archive drawn from p* at this temperature: good, not only the best
  const BATCH = 300;
  const STEP_MS = 180;

  window.NAG.sections.whenOpen(root, function mount() {
    const NAG = window.NAG;
    const space = NAG.space;
    const diffusion = NAG.diffusion;
    const metrics = NAG.metrics;
    const t = NAG.i18n.t;
    const num = NAG.i18n.num;

    const el = {
      denoiser: root.querySelector('[data-role="denoiser"]'),
      guidance: root.querySelector('[data-role="guidance"]'),
      gValue: root.querySelector('[data-role="g-value"]'),
      one: root.querySelector('[data-role="one"]'),
      batch: root.querySelector('[data-role="batch"]'),
      stepCaption: root.querySelector('[data-role="step-caption"]'),
      acc: root.querySelector('[data-fill="diff-acc"]'),
      valid: root.querySelector('[data-fill="diff-valid"]'),
      unique: root.querySelector('[data-fill="diff-unique"]'),
      novel: root.querySelector('[data-fill="diff-novel"]'),
    };
    const cell = NAG.cellView.create(root.querySelector('[data-role="cell"]'), t('common.cell'));

    const table = space.rewardTable(space.TASKS.medium.d);
    const opt = table[space.argmax(table)];
    const archiveRandom = space.rng(11);
    const target = metrics.boltzmann(table, ARCHIVE_BETA);
    const archive = Array.from({ length: ARCHIVE_SIZE }, function () {
      const i = space.sampleIndex(target, archiveRandom);
      return { index: i, reward: table[i] };
    });
    const archiveSet = new Set(archive.map(function (x) { return x.index; }));
    const archiveBest = archive.reduce(function (b, x) { return Math.max(b, x.reward); }, -Infinity);
    const surrogate = diffusion.fitSurrogate(archive, 1);
    const denoisers = { exact: diffusion.exactDenoiser(archive, surrogate), edge: diffusion.perEdgeDenoiser(archive, surrogate) };
    const random = space.rng(5);
    const chart = NAG.charts.createHistogram(root.querySelector('[data-role="chart"]'), {
      xLabel: t('common.accuracy'), yLabel: t('diff.count'), ariaLabel: t('diff.aria'), xDomain: [55, 85],
    });
    const markers = [
      { x: archiveBest, label: t('diff.archiveBest'), anchor: 'end' },
      { x: opt, label: t('diff.optimum'), className: 'marker-best', anchor: 'end' },
    ];
    const state = { timer: null };

    function g() {
      return Number(el.guidance.value) / 10;
    }

    function stop() {
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
    }

    function one() {
      stop();
      const trajectory = diffusion.sample(denoisers[el.denoiser.value], g(), random);
      let k = 0;
      function show() {
        const ops = trajectory[k];
        cell.update(ops);
        const last = k === trajectory.length - 1;
        el.stepCaption.textContent = t('diff.step', {
          t: diffusion.T - k, T: diffusion.T,
          state: k === 0 ? t('diff.noise') : last ? t('diff.clean', { acc: num(table[space.encode(ops)], 2) }) : '…',
        });
        k++;
        state.timer = last ? null : setTimeout(show, STEP_MS);
      }
      show();
    }

    function batch() {
      const den = denoisers[el.denoiser.value];
      const samples = Array.from({ length: BATCH }, function () {
        const trajectory = diffusion.sample(den, g(), random);
        return space.encode(trajectory[trajectory.length - 1]);
      });
      const rewards = samples.map(function (i) { return table[i]; });
      const mean = rewards.reduce(function (s, r) { return s + r; }, 0) / rewards.length;
      chart.update(NAG.charts.binValues(rewards, null, 55, 85, 0.5), markers, 'bar-b');
      el.acc.textContent = t('diff.accValue', { mean: num(mean, 1), best: num(Math.max.apply(null, rewards), 2) });
      el.valid.textContent = num(100 * metrics.validity(samples), 1) + '%';
      el.unique.textContent = num(100 * metrics.uniqueness(samples), 0) + '%';
      el.novel.textContent = num(100 * metrics.novelty(samples, archiveSet), 0) + '%';
    }

    function clearBatch() {
      ['acc', 'valid', 'unique', 'novel'].forEach(function (k) { el[k].textContent = '–'; });
      chart.update(NAG.charts.binValues(archive.map(function (x) { return x.reward; }), null, 55, 85, 0.5), markers, 'bar-muted');
    }

    el.guidance.addEventListener('input', function () {
      el.gValue.textContent = num(g(), 1);
      clearBatch();
    });
    el.denoiser.addEventListener('change', clearBatch);
    el.one.addEventListener('click', one);
    el.batch.addEventListener('click', batch);
    NAG.sections.onClose(root, stop);

    el.gValue.textContent = num(g(), 1);
    cell.update(space.decode(archive[0].index));
    clearBatch();
  });
})();
