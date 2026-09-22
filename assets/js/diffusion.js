/*
 * Discrete diffusion over cells (in the spirit of D3PM-style categorical
 * diffusion, as used for architectures by graph-diffusion NAG methods).
 *
 * Forward: every edge keeps its operation with probability abar_t and is
 * otherwise redrawn uniformly, so at t = T a cell is pure noise.
 * Reverse: p(x_{t-1} | x_t) = sum_{x0} q(x_{t-1} | x_t, x0) p(x0 | x_t),
 * where the "denoiser" p(x0 | x_t) is one of two idealized models:
 *
 *  - exact: the true posterior over the training archive. It is the best a
 *    denoiser can do on the training data, and it can only reproduce
 *    training cells (it memorizes);
 *  - per-edge: each edge's posterior on its own, ignoring the other edges,
 *    like a denoiser with limited capacity. It recombines edges, so it can
 *    produce new cells, good or invalid.
 *
 * Guidance multiplies p(x0 | x_t) by exp(g * f(x0)), where f is a linear
 * surrogate predictor of accuracy fitted on the archive (predictor guidance).
 */
(function (root) {
  'use strict';

  const space = root.NAG && root.NAG.space ? root.NAG.space : require('./space.js');
  const E = space.N_EDGES;
  const K = space.N_OPS;
  const T = 12;

  // Cosine schedule: abar_0 = 1, abar_T = 0.
  const ABAR = Array.from({ length: T + 1 }, function (_, t) {
    return Math.pow(Math.cos((t / T) * Math.PI / 2), 2);
  });

  // q(x_t = j | x_0 = i)
  function qMarginal(t, i, j) {
    return ABAR[t] * (i === j ? 1 : 0) + (1 - ABAR[t]) / K;
  }

  // q(x_t = j | x_{t-1} = i)
  function qStep(t, i, j) {
    const a = ABAR[t - 1] > 0 ? ABAR[t] / ABAR[t - 1] : 0;
    return a * (i === j ? 1 : 0) + (1 - a) / K;
  }

  // q(x_{t-1} = k | x_t = j, x_0 = i), for k = 0..K-1.
  function posteriorStep(t, j, i) {
    const p = new Array(K);
    let total = 0;
    for (let k = 0; k < K; k++) { p[k] = qStep(t, k, j) * qMarginal(t - 1, i, k); total += p[k]; }
    return p.map(function (v) { return v / total; });
  }

  // ------------------------------------------------------- surrogate

  // Ridge regression of reward on one-hot edge operations: f(A) = b + sum_e v[e][A_e].
  function fitSurrogate(archive, lambda) {
    const reg = lambda === undefined ? 1 : lambda;
    const n = E * K;
    const mean = archive.reduce(function (s, x) { return s + x.reward; }, 0) / archive.length;
    // Normal equations (X^T X + reg I) v = X^T (y - mean), solved by Gauss-Seidel.
    const xtx = Array.from({ length: n }, function () { return new Float64Array(n); });
    const xty = new Float64Array(n);
    archive.forEach(function (x) {
      const ops = space.decode(x.index);
      const cols = ops.map(function (op, e) { return e * K + op; });
      cols.forEach(function (a) {
        xty[a] += x.reward - mean;
        cols.forEach(function (b) { xtx[a][b] += 1; });
      });
    });
    const v = new Float64Array(n);
    for (let sweep = 0; sweep < 200; sweep++) {
      for (let a = 0; a < n; a++) {
        let s = xty[a];
        for (let b = 0; b < n; b++) if (b !== a) s -= xtx[a][b] * v[b];
        v[a] = s / (xtx[a][a] + reg);
      }
    }
    return {
      bias: mean,
      weights: v,
      predict: function (index) {
        const ops = space.decode(index);
        return ops.reduce(function (s, op, e) { return s + v[e * K + op]; }, mean);
      },
    };
  }

  // ------------------------------------------------------- denoisers

  function exactDenoiser(archive, surrogate) {
    const cells = archive.map(function (x) { return space.decode(x.index); });
    const scores = archive.map(function (x) { return surrogate.predict(x.index); });
    const top = Math.max.apply(null, scores);
    // Returns the index (into archive) of a sampled x0.
    return function (xt, t, g, random) {
      const w = cells.map(function (c, j) {
        let v = Math.exp(g * (scores[j] - top));
        for (let e = 0; e < E; e++) v *= qMarginal(t, c[e], xt[e]);
        return v;
      });
      const total = w.reduce(function (s, v) { return s + v; }, 0);
      return cells[space.sampleIndex(w.map(function (v) { return v / total; }), random)];
    };
  }

  function perEdgeDenoiser(archive, surrogate) {
    // Frequency of each operation on each edge in the archive (smoothed).
    const freq = Array.from({ length: E }, function () { return new Array(K).fill(0.5); });
    archive.forEach(function (x) { space.decode(x.index).forEach(function (op, e) { freq[e][op] += 1; }); });
    return function (xt, t, g, random) {
      return xt.map(function (j, e) {
        const w = freq[e].map(function (f, k) {
          return f * qMarginal(t, k, j) * Math.exp(g * surrogate.weights[e * K + k]);
        });
        const total = w.reduce(function (s, v) { return s + v; }, 0);
        return space.sampleIndex(w.map(function (v) { return v / total; }), random);
      });
    };
  }

  /*
   * Sample one cell. Returns the trajectory [x_T, ..., x_0] of cells. At each
   * step the denoiser proposes a clean cell x0, and x_{t-1} is drawn from the
   * forward posterior q(x_{t-1} | x_t, x0), edge by edge.
   */
  function sample(denoiser, g, random) {
    let x = space.randomCell(random);
    const trajectory = [x];
    for (let t = T; t >= 1; t--) {
      const x0 = denoiser(x, t, g, random);
      const current = x;
      x = current.map(function (j, e) { return space.sampleIndex(posteriorStep(t, j, x0[e]), random); });
      trajectory.push(x);
    }
    return trajectory;
  }

  const api = {
    T: T, ABAR: ABAR, qMarginal: qMarginal, posteriorStep: posteriorStep, fitSurrogate: fitSurrogate,
    exactDenoiser: exactDenoiser, perEdgeDenoiser: perEdgeDenoiser, sample: sample,
  };
  root.NAG = root.NAG || {};
  root.NAG.diffusion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
