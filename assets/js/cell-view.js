/*
 * SVG diagram of one cell: nodes 0..3 left to right, one edge per pair.
 * Operation identity is carried by an edge label as well as by color
 * (--op-conv3x3, --op-conv1x1, --op-avgpool; skip is neutral, none dashed),
 * so it never depends on color alone.
 */
(function (root) {
  'use strict';

  const space = root.NAG.space;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const W = 320;
  const H = 150;
  const Y = 84;
  const NODE_X = [24, 114, 206, 296];
  const LABEL = { none: '', skip: 'skip', conv1x1: '1×1', conv3x3: '3×3', avgpool: 'pool' };

  // Straight edges between neighbors; arcs for longer jumps (0-2 and 0-3 above, 1-3 below).
  function edgeGeometry(from, to) {
    const x1 = NODE_X[from];
    const x2 = NODE_X[to];
    const span = to - from;
    if (span === 1) return { d: 'M' + x1 + ' ' + Y + ' L' + x2 + ' ' + Y, lx: (x1 + x2) / 2, ly: Y };
    const lift = span === 3 ? -120 : from === 1 ? 110 : -52;
    const cy = Y + lift;
    // The label sits on the curve's apex, which a quadratic Bezier reaches at half the lift.
    return { d: 'M' + x1 + ' ' + Y + ' Q' + (x1 + x2) / 2 + ' ' + cy + ' ' + x2 + ' ' + Y, lx: (x1 + x2) / 2, ly: Y + lift / 2 };
  }

  function el(name, attrs, parent) {
    const node = document.createElementNS(SVG_NS, name);
    Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(node);
    return node;
  }

  function create(container, ariaLabel) {
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'cell-view', role: 'img' }, null);
    const title = el('title', {}, svg);
    const edgesG = el('g', {}, svg);
    const labelsG = el('g', {}, svg);
    const nodesG = el('g', {}, svg);
    container.appendChild(svg);

    const edges = space.EDGES.map(function (edge) {
      const g = edgeGeometry(edge[0], edge[1]);
      const path = el('path', { d: g.d, class: 'cell-edge' }, edgesG);
      const text = el('text', { x: g.lx, y: g.ly + 4, 'text-anchor': 'middle', class: 'cell-label' }, labelsG);
      return { path: path, text: text };
    });
    NODE_X.forEach(function (x, i) {
      el('circle', { cx: x, cy: Y, r: 11, class: 'cell-node' }, nodesG);
      const t = el('text', { x: x, y: Y + 4, 'text-anchor': 'middle', class: 'cell-node-label' }, nodesG);
      t.textContent = i === 0 ? 'in' : i === 3 ? 'out' : String(i);
    });

    function update(ops) {
      ops.forEach(function (op, e) {
        const name = space.OPS[op];
        edges[e].path.setAttribute('class', 'cell-edge op-' + name);
        edges[e].text.textContent = LABEL[name];
      });
      const valid = space.isValid(ops);
      svg.classList.toggle('invalid', !valid);
      title.textContent = (ariaLabel ? ariaLabel + ': ' : '') + space.toString(ops) + (valid ? '' : ' (no path from input to output)');
    }

    return { update: update, svg: svg };
  }

  root.NAG.cellView = { create: create, LABEL: LABEL };
})(globalThis);
