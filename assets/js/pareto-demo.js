/*
 * Budget-conditioned generation: every valid cell as a point (parameters,
 * accuracy), the exact Pareto front, and 50 samples from a generator
 * p(A | budget) trained on ten budgets. Moving the budget re-samples
 * instantly; samples over budget are shown but do not count.
 */
(function () {
  'use strict';

  const root = window.NAG && window.NAG.sections && document.getElementById('pareto-demo');
  if (!root) return;

  const BETA = 2;
  const EPOCHS = 300;
  const EPOCHS_PER_FRAME = 10;
  const SAMPLES = 50;
  const W = 640;
  const H = 360;
  const PAD = { left: 56, right: 16, top: 12, bottom: 44 };
  const X_MAX = 1.6;
  const JITTER = 0.012; // horizontal display jitter: sizes take only a few distinct values

  window.NAG.sections.whenOpen(root, function mount() {
    const NAG = window.NAG;
    const space = NAG.space;
    const pareto = NAG.pareto;
    const t = NAG.i18n.t;
    const num = NAG.i18n.num;

    const el = {
      canvas: root.querySelector('[data-role="plot"]'),
      budget: root.querySelector('[data-role="budget"]'),
      budgetValue: root.querySelector('[data-role="budget-value"]'),
      readout: root.querySelector('[data-role="readout"]'),
    };
    const d = space.TASKS.medium.d;
    const points = pareto.points(d);
    const front = pareto.front(points);
    const opt = front[front.length - 1].reward;
    const Y_MIN = opt - 36;
    const Y_MAX = opt + 2;
    const jitterRandom = space.rng(3);
    const jitter = points.map(function () { return (jitterRandom() - 0.5) * 2 * JITTER; });

    const dpr = window.devicePixelRatio || 1;
    el.canvas.width = W * dpr;
    el.canvas.height = H * dpr;
    const ctx = el.canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const state = { model: null, samples: [] };

    function sx(v) { return PAD.left + (v / X_MAX) * (W - PAD.left - PAD.right); }
    function sy(v) { return H - PAD.bottom - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * (H - PAD.top - PAD.bottom); }
    function css(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }
    function budget() { return Number(el.budget.value) / 100; }

    function drawAxes() {
      ctx.strokeStyle = css('--chart-grid');
      ctx.fillStyle = css('--text-muted');
      ctx.lineWidth = 1;
      ctx.font = '12px ' + css('--font-body');
      ctx.textAlign = 'right';
      for (let v = Math.ceil(Y_MIN / 10) * 10; v <= Y_MAX; v += 10) {
        ctx.beginPath(); ctx.moveTo(PAD.left, sy(v)); ctx.lineTo(W - PAD.right, sy(v)); ctx.stroke();
        ctx.fillText(num(v), PAD.left - 6, sy(v) + 4);
      }
      ctx.textAlign = 'center';
      for (let v = 0; v <= X_MAX + 1e-9; v += 0.4) ctx.fillText(num(v, 1), sx(v), H - PAD.bottom + 16);
      ctx.font = '13px ' + css('--font-body');
      ctx.fillText(t('pareto.params'), PAD.left + (W - PAD.left - PAD.right) / 2, H - 6);
      ctx.save();
      ctx.translate(14, PAD.top + (H - PAD.top - PAD.bottom) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(t('common.accuracy'), 0, 0);
      ctx.restore();
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      drawAxes();
      ctx.fillStyle = css('--series-muted');
      ctx.globalAlpha = 0.25;
      points.forEach(function (p, k) {
        if (p.reward < Y_MIN) return;
        ctx.fillRect(sx(p.params + jitter[k]) - 1, sy(p.reward) - 1, 2, 2);
      });
      ctx.globalAlpha = 1;

      // Pareto front as a staircase.
      ctx.strokeStyle = css('--text');
      ctx.lineWidth = 2;
      ctx.beginPath();
      front.forEach(function (p, k) {
        const y = sy(Math.max(p.reward, Y_MIN));
        if (k === 0) ctx.moveTo(sx(p.params), y);
        else { ctx.lineTo(sx(p.params), sy(Math.max(front[k - 1].reward, Y_MIN))); ctx.lineTo(sx(p.params), y); }
      });
      ctx.lineTo(sx(X_MAX), sy(opt));
      ctx.stroke();

      // Budget line.
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = css('--text-muted');
      ctx.beginPath(); ctx.moveTo(sx(budget()), PAD.top); ctx.lineTo(sx(budget()), H - PAD.bottom); ctx.stroke();
      ctx.setLineDash([]);

      // Samples: ringed dots, blue within budget, orange over.
      state.samples.forEach(function (s, k) {
        const ops = space.decode(s);
        const within = space.params(ops) <= budget() + 1e-9;
        const acc = space.reward(ops, d);
        if (acc < Y_MIN) return;
        ctx.beginPath();
        ctx.arc(sx(space.params(ops) + (k % 7 - 3) * 0.004), sy(acc), 5, 0, 2 * Math.PI);
        ctx.fillStyle = within ? css('--series-a') : css('--series-b');
        ctx.fill();
        ctx.strokeStyle = css('--bg');
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }

    function resample() {
      el.budgetValue.textContent = num(budget(), 2);
      if (!state.model) { draw(); return; }
      state.samples = NAG.generator.sample(state.model, pareto.condition(budget()), SAMPLES, space.rng(Number(el.budget.value)));
      const within = state.samples.filter(function (s) { return space.params(space.decode(s)) <= budget() + 1e-9; });
      const best = pareto.bestWithin(front, budget());
      if (within.length === 0) {
        el.readout.textContent = t('pareto.none');
      } else {
        const acc = Math.max.apply(null, within.map(function (s) { return space.reward(space.decode(s), d); }));
        el.readout.textContent = t('pareto.readout', { within: within.length, acc: num(acc, 2), best: num(best, 2) });
      }
      draw();
    }

    function train() {
      const trainer = NAG.generator.trainer(NAG.generator.create(pareto.CONDITION_SIZE), pareto.trainingRows(points, BETA));
      function frame() {
        trainer.step(EPOCHS_PER_FRAME);
        if (trainer.epochs() < EPOCHS) {
          setTimeout(frame, 0); // timers keep training in background tabs, unlike animation frames
          return;
        }
        state.model = trainer.model;
        resample();
      }
      setTimeout(frame, 0);
    }

    el.budget.addEventListener('input', resample);
    document.addEventListener('nag:themechange', draw);
    el.readout.textContent = t('pareto.training');
    resample();
    setTimeout(train, 30);
  });
})();
