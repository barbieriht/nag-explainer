/*
 * A small conditional generator p_theta(A | c): one categorical distribution
 * per edge, whose logits are a quadratic function of a conditioning vector c
 * (a task descriptor, a parameter budget, ...). Edges are sampled
 * independently, so the model is cheap and transparent; it is also the
 * simplest estimation-of-distribution-style generator.
 *
 * Training is reward-weighted maximum likelihood: given evaluated pairs
 * (c_i, A_i) with weights w_i proportional to exp(beta R_i), maximize
 * sum_i w_i log p_theta(A_i | c_i). This fits p_theta to the target
 * p*(A | c) proportional to exp(beta R(A, c)) on the evaluated data.
 */
(function (root) {
  'use strict';

  const space = root.NAG && root.NAG.space ? root.NAG.space : require('./space.js');
  const E = space.N_EDGES;
  const K = space.N_OPS;

  // [1, c_1..c_n, c_i * c_j (i <= j)]
  function features(c) {
    const f = [1].concat(c);
    for (let i = 0; i < c.length; i++) for (let j = i; j < c.length; j++) f.push(c[i] * c[j]);
    return f;
  }

  function create(conditionSize) {
    const F = features(new Array(conditionSize).fill(0)).length;
    return { conditionSize: conditionSize, F: F, weights: new Float64Array(E * K * F) };
  }

  // Per-edge probabilities for condition c: probs[e][k].
  function edgeProbs(model, c, temperature) {
    const f = features(c);
    const tau = temperature || 1;
    const probs = [];
    for (let e = 0; e < E; e++) {
      const logits = new Array(K);
      let max = -Infinity;
      for (let k = 0; k < K; k++) {
        let z = 0;
        const base = (e * K + k) * model.F;
        for (let j = 0; j < model.F; j++) z += model.weights[base + j] * f[j];
        logits[k] = z / tau;
        if (logits[k] > max) max = logits[k];
      }
      let total = 0;
      const p = logits.map(function (z) { const v = Math.exp(z - max); total += v; return v; });
      probs.push(p.map(function (v) { return v / total; }));
    }
    return probs;
  }

  function sample(model, c, n, random, temperature) {
    const probs = edgeProbs(model, c, temperature);
    const out = [];
    for (let s = 0; s < n; s++) {
      out.push(space.encode(probs.map(function (p) { return space.sampleIndex(p, random); })));
    }
    return out;
  }

  // Exact distribution over all 15,625 cells (for divergences).
  function distribution(model, c, temperature) {
    const probs = edgeProbs(model, c, temperature);
    const p = new Float64Array(space.SIZE);
    for (let i = 0; i < space.SIZE; i++) {
      const ops = space.decode(i);
      let v = 1;
      for (let e = 0; e < E; e++) v *= probs[e][ops[e]];
      p[i] = v;
    }
    return p;
  }

  /*
   * data: [{ c, index, weight }]. Full-batch Adam on the weighted negative
   * log-likelihood plus a small L2 penalty. The trainer runs a few epochs per
   * step() call so a page can train without freezing; trainer.model is a new
   * model (the one passed in is not modified).
   */
  function trainer(model, data, options) {
    const opts = Object.assign({ lr: 0.05, l2: 1e-3 }, options);
    const w = Float64Array.from(model.weights);
    const m = new Float64Array(w.length);
    const v = new Float64Array(w.length);
    const trained = { conditionSize: model.conditionSize, F: model.F, weights: w };
    const rows = data.map(function (d) { return { f: features(d.c), ops: space.decode(d.index), weight: d.weight, c: d.c }; });
    const totalWeight = rows.reduce(function (s, r) { return s + r.weight; }, 0);
    const grad = new Float64Array(w.length);
    let epoch = 0;

    function epochStep() {
      epoch++;
      grad.fill(0);
      rows.forEach(function (row) {
        const probs = edgeProbs(trained, row.c);
        for (let e = 0; e < E; e++) {
          for (let k = 0; k < K; k++) {
            const g = row.weight / totalWeight * (probs[e][k] - (row.ops[e] === k ? 1 : 0));
            const base = (e * K + k) * trained.F;
            for (let j = 0; j < trained.F; j++) grad[base + j] += g * row.f[j];
          }
        }
      });
      for (let i = 0; i < w.length; i++) {
        const g = grad[i] + opts.l2 * w[i];
        m[i] = 0.9 * m[i] + 0.1 * g;
        v[i] = 0.999 * v[i] + 0.001 * g * g;
        const mHat = m[i] / (1 - Math.pow(0.9, epoch));
        const vHat = v[i] / (1 - Math.pow(0.999, epoch));
        w[i] -= opts.lr * mHat / (Math.sqrt(vHat) + 1e-8);
      }
    }

    return {
      model: trained,
      epochs: function () { return epoch; },
      step: function (n) { for (let i = 0; i < n; i++) epochStep(); },
    };
  }

  function fit(model, data, options) {
    const t = trainer(model, data, options);
    t.step((options && options.epochs) || 200);
    return t.model;
  }

  // Reward-weighted training rows from evaluated pairs of one condition:
  // weight = exp(beta (R - R_best)), so the best evaluated cell weighs 1.
  function weightedRows(c, evaluated, beta) {
    const best = evaluated.reduce(function (b, x) { return Math.max(b, x.reward); }, -Infinity);
    return evaluated.map(function (x) { return { c: c, index: x.index, weight: Math.exp(beta * (x.reward - best)) }; });
  }

  const api = {
    features: features, create: create, edgeProbs: edgeProbs, sample: sample,
    distribution: distribution, trainer: trainer, fit: fit, weightedRows: weightedRows,
  };
  root.NAG = root.NAG || {};
  root.NAG.generator = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
