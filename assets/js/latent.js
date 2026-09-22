/*
 * A 2-D "latent space" for the toy cells, to illustrate continuous latent
 * optimization (encode, climb a predictor, decode).
 *
 * The encoder is linear in the one-hot operations: z = sum_e W_e[op_e].
 * Its two axes are fitted, not hand-drawn: axis 1 by a ridge regression of
 * accuracy on a small evaluated training set (so the space is shaped by a
 * performance predictor), axis 2 by a regression of parameter count.
 * The decoder maps a point back to the nearest encoded cell, which makes the
 * mapping many-to-one, and some regions decode to degenerate cells.
 * The predictor used for climbing is a quadratic surface in z, fitted on
 * the same training set.
 */
(function (root) {
  'use strict';

  const space = root.NAG && root.NAG.space ? root.NAG.space : require('./space.js');
  const diffusion = root.NAG && root.NAG.diffusion ? root.NAG.diffusion : require('./diffusion.js');
  const E = space.N_EDGES;
  const K = space.N_OPS;
  const GRID = 64; // spatial index resolution for decoding

  // Least squares for small dense systems (Gaussian elimination, partial pivoting).
  function solve(A, b) {
    const n = b.length;
    const M = A.map(function (row, i) { return Array.from(row).concat([b[i]]); });
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      const tmp = M[c]; M[c] = M[p]; M[p] = tmp;
      for (let r = c + 1; r < n; r++) {
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
      let s = M[r][n];
      for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
      x[r] = s / M[r][r];
    }
    return x;
  }

  function quadFeatures(z) {
    return [1, z[0], z[1], z[0] * z[0], z[0] * z[1], z[1] * z[1]];
  }

  /*
   * Build the space for task d from `training`, a list of evaluated cells
   * { index, reward }. Returns coordinates (normalized to [0, 1]^2) for every
   * cell, a decoder, and the predictor with its gradient.
   */
  function build(d, training) {
    const accuracyAxis = diffusion.fitSurrogate(training, 1).weights;
    const sizeAxis = new Float64Array(E * K);
    for (let e = 0; e < E; e++) {
      sizeAxis[e * K + space.OP.conv3x3] = 0.243;
      sizeAxis[e * K + space.OP.conv1x1] = 0.027;
    }
    const raw = new Float64Array(space.SIZE * 2);
    for (let i = 0; i < space.SIZE; i++) {
      const ops = space.decode(i);
      let a = 0;
      let s = 0;
      for (let e = 0; e < E; e++) { a += accuracyAxis[e * K + ops[e]]; s += sizeAxis[e * K + ops[e]]; }
      raw[2 * i] = a;
      raw[2 * i + 1] = s;
    }
    const lo = [Infinity, Infinity];
    const hi = [-Infinity, -Infinity];
    for (let i = 0; i < space.SIZE; i++) {
      for (let k = 0; k < 2; k++) {
        lo[k] = Math.min(lo[k], raw[2 * i + k]);
        hi[k] = Math.max(hi[k], raw[2 * i + k]);
      }
    }
    const coords = new Float64Array(space.SIZE * 2);
    for (let i = 0; i < space.SIZE; i++) {
      for (let k = 0; k < 2; k++) coords[2 * i + k] = (raw[2 * i + k] - lo[k]) / (hi[k] - lo[k]);
    }

    // Spatial index: cells bucketed on a GRID x GRID lattice.
    const buckets = Array.from({ length: GRID * GRID }, function () { return []; });
    function cellOf(v) { return Math.min(GRID - 1, Math.max(0, Math.floor(v * GRID))); }
    for (let i = 0; i < space.SIZE; i++) {
      buckets[cellOf(coords[2 * i + 1]) * GRID + cellOf(coords[2 * i])].push(i);
    }

    // Nearest encoded cell to point z (searching outward ring by ring).
    function decode(z) {
      const cx = cellOf(z[0]);
      const cy = cellOf(z[1]);
      let best = -1;
      let bestD = Infinity;
      for (let ring = 0; ring < GRID; ring++) {
        for (let gy = cy - ring; gy <= cy + ring; gy++) {
          for (let gx = cx - ring; gx <= cx + ring; gx++) {
            if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) continue;
            if (Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) !== ring) continue;
            buckets[gy * GRID + gx].forEach(function (i) {
              const dx = coords[2 * i] - z[0];
              const dy = coords[2 * i + 1] - z[1];
              const dist = dx * dx + dy * dy;
              if (dist < bestD) { bestD = dist; best = i; }
            });
          }
        }
        // Anything in a further ring is at least `ring / GRID` away.
        if (best >= 0 && Math.sqrt(bestD) <= ring / GRID) break;
      }
      return best;
    }

    // Quadratic predictor of accuracy over z, fitted on the training cells.
    const X = training.map(function (x) { return quadFeatures([coords[2 * x.index], coords[2 * x.index + 1]]); });
    const XtX = Array.from({ length: 6 }, function (_, a) {
      return Array.from({ length: 6 }, function (_, b) {
        return X.reduce(function (s, row) { return s + row[a] * row[b]; }, a === b ? 1e-6 : 0);
      });
    });
    const Xty = Array.from({ length: 6 }, function (_, a) {
      return X.reduce(function (s, row, r) { return s + row[a] * training[r].reward; }, 0);
    });
    const q = solve(XtX, Xty);
    function predict(z) {
      return quadFeatures(z).reduce(function (s, f, k) { return s + f * q[k]; }, 0);
    }
    function gradient(z) {
      return [q[1] + 2 * q[3] * z[0] + q[4] * z[1], q[2] + q[4] * z[0] + 2 * q[5] * z[1]];
    }

    // Gradient ascent on the predictor from z0, clipped to the unit square.
    function climb(z0, steps, rate) {
      const path = [z0.slice()];
      let z = z0.slice();
      for (let s = 0; s < steps; s++) {
        const g = gradient(z);
        const norm = Math.hypot(g[0], g[1]) || 1;
        z = [Math.min(1, Math.max(0, z[0] + rate * g[0] / norm)), Math.min(1, Math.max(0, z[1] + rate * g[1] / norm))];
        path.push(z.slice());
      }
      return path;
    }

    return { coords: coords, decode: decode, predict: predict, gradient: gradient, climb: climb };
  }

  const api = { build: build, solve: solve };
  root.NAG = root.NAG || {};
  root.NAG.latent = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
