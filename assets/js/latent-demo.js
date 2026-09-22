/*
 * Latent optimization demo: a 2-D map where each pixel shows the true
 * accuracy of the cell it decodes to. The reader picks a start, and the
 * point climbs the gradient of a smooth predictor; the decoded cell and the
 * gap between predicted and true accuracy are shown along the way.
 */
(function () {
  'use strict';

  const root = window.NAG && window.NAG.sections && document.getElementById('latent-demo');
  if (!root) return;

  const RES = 96;             // map pixels per side
  const TRAINING_CELLS = 120; // evaluated cells the encoder and predictor see
  const STEPS = 40;
  const STEP_SIZE = 0.025;
  // Sequential ramp (light = low accuracy, dark = high). Must match .legend-bar.seq.
  const RAMP = [[205, 226, 251], [109, 167, 236], [42, 120, 214], [28, 92, 171], [13, 54, 107]];
  const DEGENERATE = [150, 150, 150];

  function rampColor(u) {
    const x = Math.min(1, Math.max(0, u)) * (RAMP.length - 1);
    const i = Math.min(RAMP.length - 2, Math.floor(x));
    const f = x - i;
    return RAMP[i].map(function (c, k) { return Math.round(c + f * (RAMP[i + 1][k] - c)); });
  }

  window.NAG.sections.whenOpen(root, function mount() {
    const NAG = window.NAG;
    const space = NAG.space;
    const t = NAG.i18n.t;
    const num = NAG.i18n.num;

    const el = {
      canvas: root.querySelector('[data-role="map"]'),
      climb: root.querySelector('[data-role="climb"]'),
      reset: root.querySelector('[data-role="reset"]'),
      readout: root.querySelector('[data-role="readout"]'),
      caption: root.querySelector('[data-role="cell-caption"]'),
    };
    root.querySelector('[data-fill="latent-low"]').textContent = t('latent.low');
    root.querySelector('[data-fill="latent-high"]').textContent = t('latent.high');
    const cell = NAG.cellView.create(root.querySelector('[data-role="cell"]'), t('common.cell'));

    const d = space.TASKS.medium.d;
    const table = space.rewardTable(d);
    const random = space.rng(4);
    const training = Array.from({ length: TRAINING_CELLS }, function () {
      const i = space.encode(space.randomCell(random));
      return { index: i, reward: table[i] };
    });
    const latent = NAG.latent.build(d, training);
    const best = space.argmax(table);
    const opt = table[best];
    const floor = opt - 40;

    // Decode every pixel once. Row 0 of the canvas is the top (high z2).
    const image = new ImageData(RES, RES);
    for (let y = 0; y < RES; y++) {
      for (let x = 0; x < RES; x++) {
        const i = latent.decode([(x + 0.5) / RES, 1 - (y + 0.5) / RES]);
        const color = space.isValid(space.decode(i)) ? rampColor((table[i] - floor) / (opt - floor)) : DEGENERATE;
        const o = 4 * (y * RES + x);
        image.data[o] = color[0]; image.data[o + 1] = color[1]; image.data[o + 2] = color[2]; image.data[o + 3] = 255;
      }
    }
    const base = document.createElement('canvas');
    base.width = RES; base.height = RES;
    base.getContext('2d').putImageData(image, 0, 0);

    const SIZE = 480;
    el.canvas.width = SIZE; el.canvas.height = SIZE;
    const ctx = el.canvas.getContext('2d');
    const state = { start: [0.45, 0.2], path: null, frame: null, shown: 0 };

    function toPx(z) { return [z[0] * SIZE, (1 - z[1]) * SIZE]; }

    function cssColor(name) {
      return getComputedStyle(root).getPropertyValue(name).trim() || '#000';
    }

    function draw() {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(base, 0, 0, SIZE, SIZE);
      const bestPx = toPx([latent.coords[2 * best], latent.coords[2 * best + 1]]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(bestPx[0], bestPx[1], 11, 0, 2 * Math.PI); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#1c1f24';
      ctx.beginPath(); ctx.arc(bestPx[0], bestPx[1], 11, 0, 2 * Math.PI); ctx.stroke();

      const points = state.path ? state.path.slice(0, state.shown + 1) : [state.start];
      ctx.strokeStyle = cssColor('--series-b');
      ctx.lineWidth = 3;
      ctx.beginPath();
      points.forEach(function (z, k) {
        const p = toPx(z);
        if (k === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      });
      ctx.stroke();
      const head = toPx(points[points.length - 1]);
      ctx.fillStyle = cssColor('--series-b');
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(head[0], head[1], 7, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    }

    function showCell(z) {
      const i = latent.decode(z);
      const ops = space.decode(i);
      cell.update(ops);
      el.caption.textContent = t('latent.caption', { acc: num(table[i], 2), pred: num(latent.predict(z), 2) }) +
        (space.isValid(ops) ? '' : ' (' + t('common.degenerate') + ')');
      return i;
    }

    function stop() {
      if (state.frame) cancelAnimationFrame(state.frame);
      state.frame = null;
    }

    function reset() {
      stop();
      state.path = null;
      state.shown = 0;
      const i = showCell(state.start);
      el.readout.textContent = t('latent.start', { acc: num(table[i], 2) });
      draw();
    }

    function climb() {
      stop();
      state.path = latent.climb(state.start, STEPS, STEP_SIZE);
      state.shown = 0;
      let last = 0;
      function frame(now) {
        if (now - last > 40) {
          last = now;
          state.shown++;
          const z = state.path[state.shown];
          showCell(z);
          el.readout.textContent = t('latent.climbing', { i: state.shown });
          draw();
        }
        if (state.shown < STEPS) {
          state.frame = requestAnimationFrame(frame);
          return;
        }
        state.frame = null;
        const end = state.path[STEPS];
        const i = latent.decode(end);
        const distinct = new Set(state.path.map(latent.decode)).size;
        el.readout.textContent = t('latent.done', {
          pred: num(latent.predict(end), 2), acc: num(table[i], 2), opt: num(opt, 2), distinct: distinct,
        });
      }
      state.frame = requestAnimationFrame(frame);
    }

    el.canvas.addEventListener('click', function (event) {
      const rect = el.canvas.getBoundingClientRect();
      state.start = [(event.clientX - rect.left) / rect.width, 1 - (event.clientY - rect.top) / rect.height];
      reset();
    });
    el.climb.addEventListener('click', climb);
    el.reset.addEventListener('click', reset);
    document.addEventListener('nag:themechange', draw);
    NAG.sections.onClose(root, stop);
    reset();
  });
})();
