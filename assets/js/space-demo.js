/*
 * The toy search space: one cell diagram, a histogram of the accuracy of
 * every cell on the chosen task, and random / best cell buttons.
 */
(function () {
  'use strict';

  const root = window.NAG && window.NAG.sections && document.getElementById('space-demo');
  if (!root) return;

  window.NAG.sections.whenOpen(root, function mount() {
    const NAG = window.NAG;
    const space = NAG.space;
    const t = NAG.i18n.t;
    const num = NAG.i18n.num;
    const random = space.rng(2026);

    const el = {
      task: root.querySelector('[data-role="task"]'),
      randomBtn: root.querySelector('[data-role="random"]'),
      bestBtn: root.querySelector('[data-role="best"]'),
      readout: root.querySelector('[data-role="readout"]'),
    };
    const cell = NAG.cellView.create(root.querySelector('[data-role="cell"]'), t('common.cell'));
    const chart = NAG.charts.createHistogram(root.querySelector('[data-role="histogram"]'), {
      xLabel: t('common.accuracy'), yLabel: t('space.cells'), ariaLabel: t('space.histAria'), xDomain: [30, 95],
      format: function (v) { return num(v); },
    });
    const state = { index: space.encode([3, 3, 3, 1, 3, 3]) };

    function render() {
      const d = space.TASKS[el.task.value].d;
      const table = space.rewardTable(d);
      const valid = [];
      for (let i = 0; i < space.SIZE; i++) if (table[i] > space.CHANCE_ACCURACY) valid.push(table[i]);
      const acc = table[state.index];
      chart.update(NAG.charts.binValues(valid, null, 30, 95, 1), acc > space.CHANCE_ACCURACY ? [{ x: acc, label: num(acc, 1) + '%' }] : []);
      const ops = space.decode(state.index);
      cell.update(ops);
      if (!space.isValid(ops)) {
        el.readout.textContent = t('space.readoutBad', { acc: num(acc) });
        return;
      }
      const below = valid.filter(function (v) { return v < acc; }).length;
      el.readout.textContent = t('space.readout', {
        acc: num(acc, 1), task: t('task.' + el.task.value), pct: num(Math.floor(1000 * below / valid.length) / 10, 1),
      });
    }

    el.task.addEventListener('change', render);
    el.randomBtn.addEventListener('click', function () {
      state.index = space.encode(space.randomCell(random));
      render();
    });
    el.bestBtn.addEventListener('click', function () {
      state.index = space.argmax(space.rewardTable(space.TASKS[el.task.value].d));
      render();
    });
    render();
  });
})();
