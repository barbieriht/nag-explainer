/*
 * NAS loop versus amortized generator. On mount: one regularized-evolution
 * search (300 evaluations) on each of the 16 training tasks, then a
 * task-conditioned generator is fitted to those evaluations with
 * reward-weighted maximum likelihood. For a new task, NAS searches from
 * scratch while the generator just samples.
 */
(function () {
  'use strict';

  const root = window.NAG && window.NAG.sections && document.getElementById('amortization-demo');
  if (!root) return;

  const BUDGET = 300;          // evaluations per NAS run
  const NAG_SAMPLES = 20;      // samples drawn (and evaluated) per new task
  const BETA = 2;              // weight exp(BETA * (R - R_best)) in training
  const EPOCHS = 200;
  const EPOCHS_PER_FRAME = 4;
  const EVALS_PER_FRAME = 5;
  const MAX_TASKS = 24;
  const Y_RANGE = 12;          // accuracy points shown below the optimum

  window.NAG.sections.whenOpen(root, function mount() {
    const NAG = window.NAG;
    const space = NAG.space;
    const t = NAG.i18n.t;
    const num = NAG.i18n.num;

    const el = {
      d1: root.querySelector('[data-role="d1"]'),
      d2: root.querySelector('[data-role="d2"]'),
      d1Value: root.querySelector('[data-role="d1-value"]'),
      d2Value: root.querySelector('[data-role="d2-value"]'),
      runNas: root.querySelector('[data-role="run-nas"]'),
      runNag: root.querySelector('[data-role="run-nag"]'),
      status: root.querySelector('[data-role="status"]'),
      readout: root.querySelector('[data-role="readout"]'),
      nasCaption: root.querySelector('[data-role="nas-caption"]'),
      nagCaption: root.querySelector('[data-role="nag-caption"]'),
    };
    const nasCell = NAG.cellView.create(root.querySelector('[data-role="nas-cell"]'), 'NAS');
    const nagCell = NAG.cellView.create(root.querySelector('[data-role="nag-cell"]'), 'NAG');
    const progress = NAG.charts.createLineChart(root.querySelector('[data-role="progress-chart"]'), {
      xLabel: t('am.evaluations'), yLabel: t('common.accuracy'), ariaLabel: t('am.progressAria'), xDomain: [0, BUDGET],
      yDomain: function () { return [optimum() - Y_RANGE, optimum() + 1]; },
    });
    const cost = NAG.charts.createLineChart(root.querySelector('[data-role="cost-chart"]'), {
      xLabel: t('am.tasks'), yLabel: t('am.cumulative'), ariaLabel: t('am.costAria'), xDomain: [0, MAX_TASKS], xTicks: 6,
    });

    const state = { model: null, nas: null, nag: null, frame: null, random: space.rng(42) };
    const trainingEvaluations = space.TRAIN_TASKS.length * BUDGET;

    function task() {
      return [Number(el.d1.value) / 100, Number(el.d2.value) / 100];
    }

    function optimum() {
      const table = space.rewardTable(task());
      return table[space.argmax(table)];
    }

    function renderProgress() {
      const opt = optimum();
      const series = [{ points: [[0, opt], [BUDGET, opt]], className: 'series-muted', dashed: true }];
      if (state.nas) {
        let best = -Infinity;
        series.push({
          className: 'series-a',
          points: state.nas.history.map(function (x, i) {
            best = Math.max(best, x.reward);
            return [i + 1, Math.max(best, opt - Y_RANGE)];
          }),
        });
      }
      if (state.nag) series.push({ points: [[0, state.nag.best], [BUDGET, state.nag.best]], className: 'series-b', dashed: true });
      progress.update(series, []);
    }

    function renderCost() {
      const tasks = Array.from({ length: MAX_TASKS + 1 }, function (_, n) { return n; });
      const breakEven = trainingEvaluations / (BUDGET - NAG_SAMPLES);
      cost.update([
        { className: 'series-a', points: tasks.map(function (n) { return [n, BUDGET * n]; }) },
        { className: 'series-b', points: tasks.map(function (n) { return [n, trainingEvaluations + NAG_SAMPLES * n]; }) },
      ], [{ x: breakEven, label: '≈ ' + num(breakEven, 1) }]);
    }

    function renderTask() {
      el.d1Value.textContent = num(task()[0], 2);
      el.d2Value.textContent = num(task()[1], 2);
    }

    function stop() {
      if (state.frame) cancelAnimationFrame(state.frame);
      state.frame = null;
    }

    // ------------------------------------------------ training on mount

    function train() {
      let rows = [];
      space.TRAIN_TASKS.forEach(function (d, k) {
        const history = NAG.search.run(NAG.search.regularizedEvolution(d, space.rng(100 + k)), BUDGET);
        rows = rows.concat(NAG.generator.weightedRows(d, history, BETA));
      });
      const trainer = NAG.generator.trainer(NAG.generator.create(2), rows);
      function frame() {
        trainer.step(EPOCHS_PER_FRAME);
        el.status.textContent = t('am.training', { n: space.TRAIN_TASKS.length, epoch: trainer.epochs(), total: EPOCHS });
        if (trainer.epochs() < EPOCHS) {
          setTimeout(frame, 0); // timers keep training in background tabs, unlike animation frames
          return;
        }
        state.model = trainer.model;
        el.runNag.disabled = false;
        if (!state.frame) el.status.textContent = t('am.ready', { evals: num(trainingEvaluations) });
      }
      setTimeout(frame, 0);
    }

    // ------------------------------------------------------------ runs

    function runNas() {
      stop();
      const d = task();
      state.nas = NAG.search.regularizedEvolution(d, state.random);
      function frame() {
        for (let i = 0; i < EVALS_PER_FRAME && state.nas.history.length < BUDGET; i++) state.nas.step();
        const best = NAG.search.best(state.nas.history);
        nasCell.update(space.decode(best.index));
        el.nasCaption.textContent = t('am.nasCaption', { acc: num(best.reward, 2) });
        renderProgress();
        if (state.nas.history.length < BUDGET) {
          el.status.textContent = t('am.nasRunning', { i: state.nas.history.length, n: BUDGET });
          state.frame = requestAnimationFrame(frame);
          return;
        }
        state.frame = null;
        el.status.textContent = t('am.nasDone', { acc: num(best.reward, 2), n: BUDGET, opt: num(optimum(), 2) });
      }
      state.frame = requestAnimationFrame(frame);
    }

    function runNag() {
      const d = task();
      const table = space.rewardTable(d);
      const samples = NAG.generator.sample(state.model, d, NAG_SAMPLES, state.random);
      let best = samples[0];
      let mean = 0;
      samples.forEach(function (i) {
        mean += table[i] / samples.length;
        if (table[i] > table[best]) best = i;
      });
      state.nag = { best: table[best], mean: mean };
      nagCell.update(space.decode(best));
      el.nagCaption.textContent = t('am.nagCaption', { n: NAG_SAMPLES, acc: num(table[best], 2) });
      el.readout.textContent = t('am.nagDone', { n: NAG_SAMPLES, acc: num(table[best], 2), mean: num(mean, 2), opt: num(optimum(), 2) });
      renderProgress();
    }

    function onTaskChange() {
      stop();
      state.nas = null;
      state.nag = null;
      renderTask();
      renderProgress();
      el.readout.textContent = t('am.taskChanged', { d1: num(task()[0], 2), d2: num(task()[1], 2) });
    }

    el.d1.addEventListener('input', onTaskChange);
    el.d2.addEventListener('input', onTaskChange);
    el.runNas.addEventListener('click', runNas);
    el.runNag.addEventListener('click', runNag);
    NAG.sections.onClose(root, stop);

    renderTask();
    renderProgress();
    renderCost();
    setTimeout(train, 30);
  });
})();
