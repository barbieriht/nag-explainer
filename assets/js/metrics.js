/*
 * Metrics for judging a generator by its samples rather than by its single
 * best architecture: validity, uniqueness, novelty, and divergences between
 * the sampled distribution and a target one. Samples are cell indices.
 */
(function (root) {
  'use strict';

  const space = root.NAG ? root.NAG.space : require('./space.js');

  // Share of samples that are structurally valid.
  function validity(samples) {
    if (samples.length === 0) return 0;
    return samples.filter(function (i) { return space.isValid(space.decode(i)); }).length / samples.length;
  }

  // Distinct valid samples / valid samples.
  function uniqueness(samples) {
    const valid = samples.filter(function (i) { return space.isValid(space.decode(i)); });
    if (valid.length === 0) return 0;
    return new Set(valid).size / valid.length;
  }

  // Share of distinct valid samples that do not appear in the training set.
  function novelty(samples, trainingSet) {
    const seen = trainingSet instanceof Set ? trainingSet : new Set(trainingSet);
    const distinct = Array.from(new Set(samples)).filter(function (i) { return space.isValid(space.decode(i)); });
    if (distinct.length === 0) return 0;
    return distinct.filter(function (i) { return !seen.has(i); }).length / distinct.length;
  }

  // Empirical distribution over the whole space, with additive smoothing so
  // divergences stay finite.
  function histogram(samples, size, smoothing) {
    const eps = smoothing === undefined ? 1e-6 : smoothing;
    const h = new Float64Array(size).fill(eps);
    samples.forEach(function (i) { h[i] += 1; });
    const total = samples.length + eps * size;
    for (let i = 0; i < size; i++) h[i] /= total;
    return h;
  }

  // KL(p || q) = sum p log(p / q), in nats.
  function kl(p, q) {
    let sum = 0;
    for (let i = 0; i < p.length; i++) if (p[i] > 0) sum += p[i] * Math.log(p[i] / q[i]);
    return sum;
  }

  // Shannon entropy in nats, and its exponential: the "effective number" of
  // equally likely architectures the distribution spreads over.
  function entropy(p) {
    let h = 0;
    for (let i = 0; i < p.length; i++) if (p[i] > 0) h -= p[i] * Math.log(p[i]);
    return h;
  }

  function effectiveCount(p) {
    return Math.exp(entropy(p));
  }

  // Target distribution of the NAG formulation over the whole space:
  // p*(A) proportional to exp(beta * R(A)). beta = 0 is uniform; a large beta
  // concentrates all mass on the argmax, which is the NAS answer.
  function boltzmann(rewards, beta) {
    let max = -Infinity;
    for (let i = 0; i < rewards.length; i++) if (rewards[i] > max) max = rewards[i];
    const p = new Float64Array(rewards.length);
    let total = 0;
    for (let i = 0; i < rewards.length; i++) {
      p[i] = Math.exp(beta * (rewards[i] - max));
      total += p[i];
    }
    for (let i = 0; i < rewards.length; i++) p[i] /= total;
    return p;
  }

  const api = {
    boltzmann: boltzmann,
    validity: validity, uniqueness: uniqueness, novelty: novelty,
    histogram: histogram, kl: kl, entropy: entropy, effectiveCount: effectiveCount,
  };
  root.NAG = root.NAG || {};
  root.NAG.metrics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
