/*
 * Minimal responsive D3 line chart and histogram used by the demos. Colours
 * come from CSS custom properties (.series-a / .series-b / .series-muted), so
 * charts follow light/dark mode.
 */
(function (root) {
  'use strict';

  // Chart coordinates follow the container width (within limits) so text keeps
  // a readable size on phones instead of being scaled down with the SVG.
  const MIN_WIDTH = 300;
  const MAX_WIDTH = 640;
  const MARGIN = { top: 12, right: 16, bottom: 40, left: 56 };

  /*
   * options: { height, xLabel, yLabel, ariaLabel, xDomain?, yDomain?, xTicks? }
   *   (xDomain / yDomain: [lo, hi], or a function returning one at each update;
   *    yLog: true for a logarithmic y axis, which needs a fixed yDomain)
   * update(series, markers):
   *   series:  [{ points: [[x, y], ...], className: 'series-a' | 'series-b', dashed? }]
   *   markers: [{ x, label, className? }] vertical reference lines
   */
  function createLineChart(container, options) {
    const d3 = root.d3;
    const WIDTH = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, container.clientWidth || MAX_WIDTH));
    const height = options.height || 260;
    const innerW = WIDTH - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top - MARGIN.bottom;

    const svg = d3.select(container).append('svg')
      .attr('viewBox', '0 0 ' + WIDTH + ' ' + height)
      .attr('class', 'chart')
      .attr('role', 'img')
      .attr('aria-label', options.ariaLabel || '');
    const plot = svg.append('g').attr('transform', 'translate(' + MARGIN.left + ',' + MARGIN.top + ')');
    const gridG = plot.append('g').attr('class', 'chart-grid');
    const xAxisG = plot.append('g').attr('class', 'chart-axis').attr('transform', 'translate(0,' + innerH + ')');
    const yAxisG = plot.append('g').attr('class', 'chart-axis');
    const markerG = plot.append('g');
    const linesG = plot.append('g');

    svg.append('text').attr('class', 'chart-label')
      .attr('x', MARGIN.left + innerW / 2).attr('y', height - 6)
      .attr('text-anchor', 'middle').text(options.xLabel);
    svg.append('text').attr('class', 'chart-label')
      .attr('transform', 'translate(14,' + (MARGIN.top + innerH / 2) + ') rotate(-90)')
      .attr('text-anchor', 'middle').text(options.yLabel);

    function extent(series, axis, fixed) {
      if (typeof fixed === 'function') return fixed();
      if (fixed) return fixed;
      const values = [];
      series.forEach(function (s) { s.points.forEach(function (p) { values.push(p[axis]); }); });
      if (values.length === 0) return [0, 1];
      const e = d3.extent(values);
      return e[0] === e[1] ? [e[0] - 1, e[1] + 1] : e;
    }

    function update(series, markers) {
      const x = d3.scaleLinear().domain(extent(series, 0, options.xDomain)).range([0, innerW]);
      const y = options.yLog
        ? d3.scaleLog().domain(options.yDomain).range([innerH, 0]).clamp(true)
        : d3.scaleLinear().domain(extent(series, 1, options.yDomain)).nice().range([innerH, 0]);
      const yTicks = options.yLog ? y.ticks().filter(function (v) { return Math.log10(v) % 1 === 0; }) : y.ticks(5);

      xAxisG.call(d3.axisBottom(x).ticks(options.xTicks || 6).tickSizeOuter(0));
      yAxisG.call(d3.axisLeft(y).tickValues(yTicks).tickSizeOuter(0).tickFormat(options.yFormat || null));
      gridG.selectAll('line').data(yTicks).join('line')
        .attr('x1', 0).attr('x2', innerW).attr('y1', y).attr('y2', y);

      const line = d3.line().x(function (p) { return x(p[0]); }).y(function (p) { return y(p[1]); });
      linesG.selectAll('path').data(series).join('path')
        .attr('class', function (s) { return 'chart-line ' + s.className + (s.dashed ? ' dashed' : ''); })
        .attr('d', function (s) { return line(s.points); });

      const m = markerG.selectAll('g').data(markers || []).join(function (enter) {
        const g = enter.append('g');
        g.append('line');
        g.append('text');
        return g;
      });
      m.attr('class', function (d) { return 'chart-marker ' + (d.className || ''); });
      m.select('line').attr('x1', function (d) { return x(d.x); }).attr('x2', function (d) { return x(d.x); })
        .attr('y1', 0).attr('y2', innerH);
      m.select('text').attr('x', function (d) { return x(d.x) + 4; }).attr('y', 12).text(function (d) { return d.label; });
    }

    update([], []);
    return { update: update };
  }

  /*
   * Histogram. options: { height, xLabel, yLabel, ariaLabel, xDomain, yDomain?, format? }
   * update(bins, markers):
   *   bins:    [{ x0, x1, value }] drawn as bars; each bar has a hover title
   *   markers: [{ x, label, className? }] vertical reference lines
   */
  function createHistogram(container, options) {
    const d3 = root.d3;
    const WIDTH = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, container.clientWidth || MAX_WIDTH));
    const height = options.height || 240;
    const innerW = WIDTH - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top - MARGIN.bottom;
    const format = options.format || function (v) { return String(v); };

    const svg = d3.select(container).append('svg')
      .attr('viewBox', '0 0 ' + WIDTH + ' ' + height)
      .attr('class', 'chart')
      .attr('role', 'img')
      .attr('aria-label', options.ariaLabel || '');
    const plot = svg.append('g').attr('transform', 'translate(' + MARGIN.left + ',' + MARGIN.top + ')');
    const gridG = plot.append('g').attr('class', 'chart-grid');
    const xAxisG = plot.append('g').attr('class', 'chart-axis').attr('transform', 'translate(0,' + innerH + ')');
    const yAxisG = plot.append('g').attr('class', 'chart-axis');
    const barsG = plot.append('g').attr('class', 'chart-bars');
    const markerG = plot.append('g');

    svg.append('text').attr('class', 'chart-label')
      .attr('x', MARGIN.left + innerW / 2).attr('y', height - 6)
      .attr('text-anchor', 'middle').text(options.xLabel);
    svg.append('text').attr('class', 'chart-label')
      .attr('transform', 'translate(14,' + (MARGIN.top + innerH / 2) + ') rotate(-90)')
      .attr('text-anchor', 'middle').text(options.yLabel);

    function update(bins, markers, className) {
      const x = d3.scaleLinear().domain(options.xDomain).range([0, innerW]);
      const top = d3.max(bins, function (b) { return b.value; }) || 1;
      const y = d3.scaleLinear().domain(options.yDomain || [0, top]).nice().range([innerH, 0]);

      xAxisG.call(d3.axisBottom(x).ticks(6).tickSizeOuter(0));
      yAxisG.call(d3.axisLeft(y).ticks(4).tickSizeOuter(0).tickFormat(options.yFormat || null));
      gridG.selectAll('line').data(y.ticks(4)).join('line')
        .attr('x1', 0).attr('x2', innerW).attr('y1', y).attr('y2', y);

      const bars = barsG.selectAll('rect').data(bins).join(function (enter) {
        const r = enter.append('rect');
        r.append('title');
        return r;
      });
      bars.attr('class', 'bar ' + (className || 'bar-a'))
        .attr('x', function (b) { return x(b.x0) + 1; })
        .attr('width', function (b) { return Math.max(0, x(b.x1) - x(b.x0) - 2); })
        .attr('y', function (b) { return y(Math.max(0, b.value)); })
        .attr('height', function (b) { return innerH - y(Math.max(0, b.value)); });
      bars.select('title').text(function (b) { return b.x0 + '–' + b.x1 + ': ' + format(b.value); });

      const m = markerG.selectAll('g').data(markers || []).join(function (enter) {
        const g = enter.append('g');
        g.append('line');
        g.append('text');
        return g;
      });
      m.attr('class', function (d) { return 'chart-marker ' + (d.className || ''); });
      m.select('line').attr('x1', function (d) { return x(d.x); }).attr('x2', function (d) { return x(d.x); })
        .attr('y1', 0).attr('y2', innerH);
      m.select('text')
        .attr('x', function (d) { return x(d.x) + (d.anchor === 'end' ? -4 : 4); })
        .attr('text-anchor', function (d) { return d.anchor || 'start'; })
        .attr('y', function (d, i) { return 12 + 14 * i; })
        .text(function (d) { return d.label; });
    }

    update([], []);
    return { update: update };
  }

  // Equal-width bins over [lo, hi) of `values`, each weighted by `weights`
  // (1 each if omitted).
  function binValues(values, weights, lo, hi, width) {
    const n = Math.round((hi - lo) / width);
    const bins = Array.from({ length: n }, function (_, i) {
      return { x0: +(lo + i * width).toFixed(4), x1: +(lo + (i + 1) * width).toFixed(4), value: 0 };
    });
    for (let i = 0; i < values.length; i++) {
      const k = Math.floor((values[i] - lo) / width);
      if (k >= 0 && k < n) bins[k].value += weights ? weights[i] : 1;
    }
    return bins;
  }

  root.NAG = root.NAG || {};
  root.NAG.charts = { createLineChart: createLineChart, createHistogram: createHistogram, binValues: binValues };
})(globalThis);
