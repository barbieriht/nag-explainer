/*
 * Sequential construction policies over the toy space: a cell is built one
 * edge at a time, in a fixed order, and the policy chooses the operation of
 * the next edge given the edges chosen so far. The policy is a table of
 * logits, one row per partial cell (5^0 + ... + 5^5 = 3,906 rows), so the
 * comparison below is about the training objective, not the network:
 *
 *  - REINFORCE maximizes expected reward, E[R(A)], and ends up concentrated
 *    on one architecture;
 *  - a GFlowNet trained with trajectory balance (Malkin et al.'s objective,
 *    in the framework of Bengio et al.) samples A with probability
 *    proportional to its reward, keeping every good mode.
 *
 * Because construction follows a tree (each partial cell has one parent),
 * the backward policy is trivial and trajectory balance reads
 *   (log Z + sum_t log pi(a_t | s_t) - log R(A))^2.
 */
(function (root) {
  'use strict';

  const space = root.NAG && root.NAG.space ? root.NAG.space : require('./space.js');
  const E = space.N_EDGES;
  const K = space.N_OPS;

  // Row of a partial cell: offset of its depth plus its base-5 prefix code.
  const DEPTH_OFFSET = [];
  let rows = 0;
  for (let depth = 0; depth < E; depth++) {
    DEPTH_OFFSET.push(rows);
    rows += Math.pow(K, depth);
  }
  const ROWS = rows;

  function createPolicy() {
    return { logits: new Float64Array(ROWS * K), logZ: 0 };
  }

  function rowProbs(policy, row) {
    const base = row * K;
    let max = -Infinity;
    for (let k = 0; k < K; k++) if (policy.logits[base + k] > max) max = policy.logits[base + k];
    const p = new Array(K);
    let total = 0;
    for (let k = 0; k < K; k++) { p[k] = Math.exp(policy.logits[base + k] - max); total += p[k]; }
    for (let k = 0; k < K; k++) p[k] /= total;
    return p;
  }

  // Sample one trajectory: the rows visited, the actions, and the final cell.
  // With explore > 0, each action is uniform with that probability (an
  // off-policy behavior policy; probs stay those of the policy itself).
  function rollout(policy, random, explore) {
    const ops = [];
    const visited = [];
    let prefix = 0;
    for (let depth = 0; depth < E; depth++) {
      const row = DEPTH_OFFSET[depth] + prefix;
      const p = rowProbs(policy, row);
      const a = explore && random() < explore ? Math.floor(random() * K) : space.sampleIndex(p, random);
      visited.push({ row: row, action: a, probs: p });
      ops.push(a);
      prefix += a * Math.pow(K, depth);
    }
    return { ops: ops, index: space.encode(ops), visited: visited };
  }

  // Exact distribution of cells under the policy (product along the path).
  function distribution(policy) {
    const p = new Float64Array(space.SIZE);
    const probsByRow = new Array(ROWS);
    for (let i = 0; i < space.SIZE; i++) {
      const ops = space.decode(i);
      let v = 1;
      let prefix = 0;
      for (let depth = 0; depth < E; depth++) {
        const row = DEPTH_OFFSET[depth] + prefix;
        if (!probsByRow[row]) probsByRow[row] = rowProbs(policy, row);
        v *= probsByRow[row][ops[depth]];
        prefix += ops[depth] * Math.pow(K, depth);
      }
      p[i] = v;
    }
    return p;
  }

  /*
   * One trajectory-balance update. logReward(index) is log R(A). Plain SGD;
   * log Z gets a larger step, as is common, so it tracks the partition
   * function quickly. Trajectory balance is valid off-policy, so exploration
   * (explore > 0) lets rarely sampled branches still be corrected.
   */
  function tbStep(policy, logReward, random, lr, explore) {
    const t = rollout(policy, random, explore);
    let logPF = 0;
    t.visited.forEach(function (v) { logPF += Math.log(v.probs[v.action]); });
    const delta = policy.logZ + logPF - logReward(t.index);
    policy.logZ -= lr * 10 * delta;
    t.visited.forEach(function (v) {
      const base = v.row * K;
      for (let k = 0; k < K; k++) policy.logits[base + k] -= lr * delta * ((k === v.action ? 1 : 0) - v.probs[k]);
    });
    return t.index;
  }

  /*
   * One REINFORCE update with a moving-average baseline: move the policy
   * toward actions whose reward beat the baseline.
   */
  function reinforceStep(policy, reward, random, lr, state) {
    const t = rollout(policy, random);
    const r = reward(t.index);
    const advantage = r - (state.baseline === undefined ? r : state.baseline);
    state.baseline = state.baseline === undefined ? r : 0.95 * state.baseline + 0.05 * r;
    t.visited.forEach(function (v) {
      const base = v.row * K;
      for (let k = 0; k < K; k++) policy.logits[base + k] += lr * advantage * ((k === v.action ? 1 : 0) - v.probs[k]);
    });
    return t.index;
  }

  const api = {
    ROWS: ROWS, createPolicy: createPolicy, rowProbs: rowProbs, rollout: rollout, distribution: distribution,
    tbStep: tbStep, reinforceStep: reinforceStep,
  };
  root.NAG = root.NAG || {};
  root.NAG.flow = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
