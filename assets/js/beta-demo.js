/*
 * Temperature demo: the exact target p*(A) proportional to exp(beta R(A)) over all
 * 15,625 cells, as a histogram of probability mass by accuracy, with its
 * summary statistics. The slider is logarithmic in beta (0 at the left end).
 */
(function () {
  'use strict';

  const root = window.NAG && window.NAG.sections && document.getElementById('beta-demo');
  if (!root) return;

  const BETA_MAX = 20;
  const BETA_MIN = 0.01;

  // Slider 0..100 -> beta: 0 at 0, then log-spaced from BETA_MIN to BETA_MAX.
  function betaOf(position) {
    if (position <= 0) return 0;
    return BETA_MIN * Math.pow(BETA_MAX / BETA_MIN, (position - 1) / 99);
  }

  window.NAG.sections.whenOpen(root, function mount() {
    const NAG = window.NAG;
    const space = NAG.space;
    const metrics = NAG.metrics;
    const t = NAG.i18n.t;
    const num = NAG.i18n.num;
    const random = space.rng(7);

    const el = {
      beta: root.querySelector('[data-role="beta"]'),
      betaValue: root.querySelector('[data-role="beta-value"]'),
      task: root.querySelector('[data-role="task"]'),
      sample: root.querySelector('[data-role="sample"]'),
      caption: root.querySelector('[data-role="cell-caption"]'),
      expected: root.querySelector('[data-fill="expected"]'),
      pBest: root.querySelector('[data-fill="p-best"]'),
      effective: root.querySelector('[data-fill="effective"]'),
    };
    const cell = NAG.cellView.create(root.querySelector('[data-role="cell"]'), t('common.cell'));
    const chart = NAG.charts.createHistogram(root.querySelector('[data-role="chart"]'), {
      xLabel: t('common.accuracy'), yLabel: t('beta.mass'), ariaLabel: t('beta.aria'), xDomain: [30, 95],
      format: function (v) { return num(v, 4); },
    });
    let current = null;

    function formatBeta(beta) {
      return beta === 0 ? '0' : num(beta, beta < 0.1 ? 3 : beta < 1 ? 2 : 1);
    }

    function formatProbability(p) {
      if (p >= 0.01) return num(100 * p, 1) + '%';
      return p.toExponential(1).replace('.', NAG.i18n.lang === 'pt' ? ',' : '.');
    }

    function render() {
      const beta = betaOf(Number(el.beta.value));
      const table = space.rewardTable(space.TASKS[el.task.value].d);
      const p = metrics.boltzmann(table, beta);
      const best = space.argmax(table);
      let expected = 0;
      for (let i = 0; i < p.length; i++) expected += p[i] * table[i];
      current = { table: table, p: p };

      el.betaValue.textContent = formatBeta(beta);
      chart.update(NAG.charts.binValues(table, p, 30, 95, 0.5), [{ x: table[best], label: t('beta.best'), className: 'marker-best', anchor: 'end' }]);
      el.expected.textContent = num(expected, 2) + '%';
      el.pBest.textContent = formatProbability(p[best]);
      el.effective.textContent = num(metrics.effectiveCount(p), metrics.effectiveCount(p) < 10 ? 1 : 0);
      cell.update(space.decode(best));
      el.caption.textContent = t('beta.argmax', { acc: num(table[best], 2) });
    }

    el.beta.addEventListener('input', render);
    el.task.addEventListener('change', render);
    el.sample.addEventListener('click', function () {
      const i = space.sampleIndex(current.p, random);
      cell.update(space.decode(i));
      el.caption.textContent = space.isValid(space.decode(i))
        ? t('beta.sample', { acc: num(current.table[i], 2) })
        : t('beta.sample', { acc: num(current.table[i], 0) }) + ' (' + t('common.degenerate') + ')';
    });
    render();
  });
})();
