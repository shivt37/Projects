/* Thickness Engine 4.0 — exact, reproducible stroke-width matching.
 *
 * Design (see 02_reports/DESIGN.md):
 *   1. ONE estimator for reference and target (arc-length-uniform inward ray,
 *      length-weighted median of the MAD-clipped central cluster).
 *   2. TRUE Euclidean offset (Clipper) + uniform height-preserving rescale.
 *   3. SECANT inverse, re-measuring the final geometry.
 *   4. SAFETY gate: topology + |delta| <= 0.4 * current width.
 *
 * Works in Node and in the browser. ClipperLib must be a global.
 */
(function (root) {
  'use strict';
  const K = 1e5;

  // ------------------------------------------------------------------ utils
  const sq = x => x * x;
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const medianSorted = a => {
    if (!a.length) return 0;
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  const quantileSorted = (a, q) => {
    if (!a.length) return 0;
    const p = Math.max(0, Math.min(a.length - 1, (a.length - 1) * q));
    const lo = Math.floor(p), hi = Math.ceil(p);
    return a[lo] + (a[hi] - a[lo]) * (p - lo);
  };

  // ---------------------------------------------------------------- matrices
  function matParse(s) {
    if (!s) return [1, 0, 0, 1, 0, 0];
    const str = String(s).trim();
    if (!str) return [1, 0, 0, 1, 0, 0];
    const numRe = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
    const fnRe = /([A-Za-z]+)\s*\(([^)]*)\)/g;
    const fns = [];
    let m;
    while ((m = fnRe.exec(str))) fns.push({ name: m[1].toLowerCase(), text: m[2] });
    if (!fns.length) {
      const n = (str.match(numRe) || []).map(Number);
      if (n.length === 6) return [n[0], n[1], n[2], n[3], n[4], n[5]];
      if (n.length === 0) return [1, 0, 0, 1, 0, 0];
      throw new Error('unsupported transform: ' + s);
    }
    if (!/^[\s,]*$/.test(str.replace(fnRe, ''))) throw new Error('unsupported transform: ' + s);
    let out = [1, 0, 0, 1, 0, 0];
    for (const fn of fns) {
      const n = (fn.text.match(numRe) || []).map(Number);
      let part;
      if (fn.name === 'matrix' && n.length === 6) part = n.slice(0, 6);
      else if (fn.name === 'translate' && (n.length === 1 || n.length === 2)) part = [1, 0, 0, 1, n[0], n.length === 2 ? n[1] : 0];
      else if (fn.name === 'scale' && (n.length === 1 || n.length === 2)) part = [n[0], 0, 0, n.length === 2 ? n[1] : n[0], 0, 0];
      else if (fn.name === 'rotate' && (n.length === 1 || n.length === 3)) {
        const r = n[0] * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r);
        const rot = [c, sn, -sn, c, 0, 0];
        part = n.length === 3 ? matMul(matMul([1, 0, 0, 1, n[1], n[2]], rot), [1, 0, 0, 1, -n[1], -n[2]]) : rot;
      } else if (fn.name === 'skewx' && n.length === 1) part = [1, 0, Math.tan(n[0] * Math.PI / 180), 1, 0, 0];
      else if (fn.name === 'skewy' && n.length === 1) part = [1, Math.tan(n[0] * Math.PI / 180), 0, 1, 0, 0];
      else throw new Error('unsupported transform: ' + s);
      out = matMul(out, part);
    }
    return out;
  }
  function matMul(a, b) { // a after b
    return [
      a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
    ];
  }
  function matApply(m, x, y) {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }
  function matInv(m) {
    const d = m[0] * m[3] - m[1] * m[2];
    if (Math.abs(d) < 1e-15) throw new Error('singular transform');
    const a = m[0] / d, b = m[1] / d, c = m[2] / d, e = m[3] / d;
    return [e, -b, -c, a, c * m[5] - e * m[4], b * m[4] - a * m[5]];
  }

  // ------------------------------------------------------------ path parser
  const NUM = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/y;

  function parsePath(d, tol) {
    tol = tol || 0.004;
    let p = 0, x = 0, y = 0, sx = 0, sy = 0, cmd = '', lc = null, lq = null;
    const rings = [];
    let cur = null;
    const ws = () => { while (p < d.length && ' ,\n\t\r'.indexOf(d[p]) >= 0) p++; };
    const num = () => {
      ws(); NUM.lastIndex = p; const m = NUM.exec(d);
      if (!m) throw new Error('bad path number at ' + p);
      p = NUM.lastIndex; return parseFloat(m[0]);
    };
    const flag = () => { ws(); return d[p++] === '1' ? 1 : 0; };
    const push = (px, py) => cur.push([px, py]);

    function flattenC(x1, y1, x2, y2, x3, y3) {
      const x0 = x, y0 = y;
      const dd = Math.max(Math.hypot(x0 - 2 * x1 + x2, y0 - 2 * y1 + y2),
                          Math.hypot(x1 - 2 * x2 + x3, y1 - 2 * y2 + y3));
      const n = Math.max(1, Math.ceil(Math.sqrt(0.75 * dd / tol)));
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        if (i === n) push(x3, y3);
        else push(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
                  u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
      }
    }
    function flattenQ(x1, y1, x2, y2) {
      const x0 = x, y0 = y;
      const dd = Math.hypot(x0 - 2 * x1 + x2, y0 - 2 * y1 + y2);
      const n = Math.max(1, Math.ceil(Math.sqrt(dd / (4 * tol))));
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        if (i === n) push(x2, y2);
        else push(u * u * x0 + 2 * u * t * x1 + t * t * x2,
                  u * u * y0 + 2 * u * t * y1 + t * t * y2);
      }
    }
    function arc(rx, ry, ph, fa, fs, x2, y2) {
      const x1 = x, y1 = y;
      if (!rx || !ry || (x1 === x2 && y1 === y2)) { push(x2, y2); return; }
      rx = Math.abs(rx); ry = Math.abs(ry);
      const co = Math.cos(ph * Math.PI / 180), si = Math.sin(ph * Math.PI / 180);
      const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
      const xp = co * dx + si * dy, yp = -si * dx + co * dy;
      const lam = xp * xp / (rx * rx) + yp * yp / (ry * ry);
      if (lam > 1) { const q = Math.sqrt(lam); rx *= q; ry *= q; }
      const den = rx * rx * yp * yp + ry * ry * xp * xp;
      let k = Math.sqrt(Math.max(0, (rx * rx * ry * ry - den) / den));
      if (fa === fs) k = -k;
      const cxp = k * rx * yp / ry, cyp = -k * ry * xp / rx;
      const cx = co * cxp - si * cyp + (x1 + x2) / 2;
      const cy = si * cxp + co * cyp + (y1 + y2) / 2;
      const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      const ux = (xp - cxp) / rx, uy = (yp - cyp) / ry;
      const t1 = ang(1, 0, ux, uy);
      let dt = ang(ux, uy, (-xp - cxp) / rx, (-yp - cyp) / ry);
      if (!fs && dt > 0) dt -= 2 * Math.PI;
      if (fs && dt < 0) dt += 2 * Math.PI;
      const n = Math.max(2, Math.ceil(Math.abs(dt) /
        (2 * Math.acos(Math.max(0, 1 - tol / Math.max(rx, ry))))));
      for (let i = 1; i <= n; i++) {
        const t = t1 + dt * i / n, ex = rx * Math.cos(t), ey = ry * Math.sin(t);
        if (i === n) push(x2, y2);
        else push(co * ex - si * ey + cx, si * ex + co * ey + cy);
      }
    }

    for (;;) {
      ws(); if (p >= d.length) break;
      const c = d[p];
      if (/[a-zA-Z]/.test(c)) { cmd = c; p++; }
      else if (!cmd) throw new Error('no command');
      const rel = cmd >= 'a', C = cmd.toUpperCase();
      const ox = rel ? x : 0, oy = rel ? y : 0;
      if (C !== 'M' && C !== 'Z' && !cur) { cur = [[x, y]]; rings.push(cur); }
      switch (C) {
        case 'M': x = ox + num(); y = oy + num(); sx = x; sy = y;
          cur = [[x, y]]; rings.push(cur); cmd = rel ? 'l' : 'L'; lc = lq = null; break;
        case 'L': x = ox + num(); y = oy + num(); push(x, y); lc = lq = null; break;
        case 'H': x = ox + num(); push(x, y); lc = lq = null; break;
        case 'V': y = oy + num(); push(x, y); lc = lq = null; break;
        case 'C': {
          const a = [ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num()];
          flattenC(a[0], a[1], a[2], a[3], a[4], a[5]);
          lc = [a[2], a[3]]; lq = null; x = a[4]; y = a[5]; break;
        }
        case 'S': {
          const c1 = lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y];
          const a = [ox + num(), oy + num(), ox + num(), oy + num()];
          flattenC(c1[0], c1[1], a[0], a[1], a[2], a[3]);
          lc = [a[0], a[1]]; lq = null; x = a[2]; y = a[3]; break;
        }
        case 'Q': {
          const a = [ox + num(), oy + num(), ox + num(), oy + num()];
          flattenQ(a[0], a[1], a[2], a[3]);
          lq = [a[0], a[1]]; lc = null; x = a[2]; y = a[3]; break;
        }
        case 'T': {
          const q = lq ? [2 * x - lq[0], 2 * y - lq[1]] : [x, y];
          const a = [ox + num(), oy + num()];
          flattenQ(q[0], q[1], a[0], a[1]);
          lq = q; lc = null; x = a[0]; y = a[1]; break;
        }
        case 'A': {
          const rx = num(), ry = num(), ph = num(), fa = flag(), fs = flag();
          const ex = ox + num(), ey = oy + num();
          arc(rx, ry, ph, fa, fs, ex, ey);
          x = ex; y = ey; lc = lq = null; break;
        }
        case 'Z': x = sx; y = sy; cur = null; lc = lq = null; break;
        default: throw new Error('bad command ' + cmd);
      }
    }
    return rings.map(r => {
      const o = [];
      for (const q of r) if (!o.length || dist(o[o.length - 1], q) > 1e-9) o.push(q);
      while (o.length > 1 && dist(o[0], o[o.length - 1]) < 1e-9) o.pop();
      return o;
    }).filter(r => r.length > 2);
  }

  function shapePath(el) {
    const g = k => parseFloat(el[k] || 0) || 0;
    switch (el.tag) {
      case 'path': return el.d || '';
      case 'rect': {
        const x = g('x'), y = g('y'), w = g('width'), h = g('height');
        return `M${x} ${y}h${w}v${h}h${-w}z`;
      }
      case 'circle': case 'ellipse': {
        const cx = g('cx'), cy = g('cy');
        const rx = el.tag === 'circle' ? g('r') : g('rx');
        const ry = el.tag === 'circle' ? g('r') : g('ry');
        return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`;
      }
      case 'polygon': case 'polyline': {
        const n = (el.points || '').match(/[-+]?(?:\d*\.\d+|\d+\.?)/g) || [];
        if (n.length < 4) return '';
        let s = 'M';
        for (let i = 0; i + 1 < n.length; i += 2) s += (i ? 'L' : '') + n[i] + ' ' + n[i + 1];
        return s + 'z';
      }
      default: return '';
    }
  }

  // -------------------------------------------------------- rings -> polygon
  function signedArea(r) {
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
    return a / 2;
  }
  function pointInRing(pt, r) {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i], b = r[j];
      if ((a[1] > pt[1]) !== (b[1] > pt[1]) &&
          pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function ringsToPolys(rings) {
    const depth = rings.map((r, i) => {
      const pt = r[0];
      let d = 0;
      for (let j = 0; j < rings.length; j++)
        if (j !== i && pointInRing(pt, rings[j])) d++;
      return d;
    });
    const out = [];
    for (let i = 0; i < rings.length; i++) {
      if (depth[i] % 2) continue;
      const holes = [];
      for (let j = 0; j < rings.length; j++)
        if (depth[j] === depth[i] + 1 && pointInRing(rings[j][0], rings[i])) holes.push(rings[j]);
      if (Math.abs(signedArea(rings[i])) > 1e-9) out.push({ outer: rings[i], holes });
    }
    return out;
  }

  // --------------------------------------------------------------- geometry
  function bounds(poly) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of [poly.outer].concat(poly.holes))
      for (const p of r) {
        if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
        if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
      }
    return [x0, y0, x1, y1];
  }
  function area(poly) {
    let a = Math.abs(signedArea(poly.outer));
    for (const h of poly.holes) a -= Math.abs(signedArea(h));
    return a;
  }
  function pointInPoly(poly, pt) {
    if (!pointInRing(pt, poly.outer)) return false;
    for (const h of poly.holes) if (pointInRing(pt, h)) return false;
    return true;
  }
  function transformPoly(poly, fn) {
    return {
      outer: poly.outer.map(p => fn(p[0], p[1])),
      holes: poly.holes.map(r => r.map(p => fn(p[0], p[1]))),
    };
  }

  // ------------------------------------------------------------- measurement
  function buildEdges(poly) {
    const edges = [];
    let total = 0;
    for (const r of [poly.outer].concat(poly.holes)) {
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const L = Math.hypot(dx, dy);
        if (L < 1e-12) continue;
        edges.push({ ax: a[0], ay: a[1], dx, dy, L, cum: total });
        total += L;
      }
    }
    return { edges, total };
  }
  function pointAt(edgeSet, d) {
    const { edges, total } = edgeSet;
    d = Math.max(0, Math.min(total, d));
    let lo = 0, hi = edges.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (edges[m].cum <= d) lo = m; else hi = m - 1;
    }
    const e = edges[lo];
    const u = Math.max(0, Math.min(1, (d - e.cum) / e.L));
    return [e.ax + u * e.dx, e.ay + u * e.dy];
  }

  function measure(poly, spacing) {
    spacing = spacing || 0.05;
    const es = buildEdges(poly);
    const total = es.total;
    if (!(total > 0)) return { coreMedian: 0, median: 0, mad: 0, n: 0, mean: 0 };
    const n = Math.max(96, Math.ceil(total / spacing));
    const et = Math.max(1e-5, total / n * 0.12);
    const en = Math.max(1e-6, 1e-4 * Math.sqrt(Math.abs(area(poly))));
    const bb = bounds(poly);
    const rayLen = 2.2 * Math.max(bb[2] - bb[0], bb[3] - bb[1]) + 1;
    const widths = [];
    for (let i = 0; i < n; i++) {
      const d = (i + 0.5) * total / n;
      const p = pointAt(es, d);
      const p0 = pointAt(es, d - et), p1 = pointAt(es, d + et);
      const tx = p1[0] - p0[0], ty = p1[1] - p0[1];
      const tl = Math.hypot(tx, ty);
      if (tl < 1e-12) continue;
      let nx = -ty / tl, ny = tx / tl;
      if (!pointInPoly(poly, [p[0] + en * nx, p[1] + en * ny])) { nx = -nx; ny = -ny; }
      const sx = p[0] + en * nx, sy = p[1] + en * ny;
      const dx = nx, dy = ny; // unit direction, so t is in pixels
      let best = Infinity;
      for (const e of es.edges) {
        const den = dx * e.dy - dy * e.dx;
        if (Math.abs(den) < 1e-12) continue;
        const wx = e.ax - sx, wy = e.ay - sy;
        const t = (wx * e.dy - wy * e.dx) / den;
        if (t > 1e-9 && t < best) {
          const u = (wx * dy - wy * dx) / den;
          if (u >= 0 && u <= 1) best = t;
        }
      }
      if (best < Infinity) widths.push(best + en);
    }
    widths.sort((a, b) => a - b);
    const med = medianSorted(widths);
    const dev = widths.map(w => Math.abs(w - med)).sort((a, b) => a - b);
    const mad = Math.max(1e-4, quantileSorted(dev, 0.5) * 1.4826);
    const core = widths.filter(w => Math.abs(w - med) <= 2.5 * mad);
    return {
      coreMedian: medianSorted(core.length ? core : widths),
      median: med, mad, n: widths.length,
      mean: widths.reduce((a, b) => a + b, 0) / (widths.length || 1),
      coreN: core.length,
    };
  }

  // ------------------------------------------------- angle-aware ray samples
  function raySamples(poly, spacing) {
    spacing = spacing || 0.05;
    const es = buildEdges(poly), total = es.total;
    if (!(total > 0)) return [];
    const n = Math.max(96, Math.ceil(total / spacing));
    const et = Math.max(1e-5, total / n * 0.12);
    const en = Math.max(1e-6, 1e-4 * Math.sqrt(Math.abs(area(poly))));
    const bb = bounds(poly);
    const rayLen = 2.2 * Math.max(bb[2] - bb[0], bb[3] - bb[1]) + 1;
    const out = [];
    for (let i = 0; i < n; i++) {
      const d = (i + 0.5) * total / n;
      const p = pointAt(es, d);
      const p0 = pointAt(es, d - et), p1 = pointAt(es, d + et);
      const tx = p1[0] - p0[0], ty = p1[1] - p0[1], tl = Math.hypot(tx, ty);
      if (tl < 1e-12) continue;
      let nx = -ty / tl, ny = tx / tl;
      if (!pointInPoly(poly, [p[0] + en * nx, p[1] + en * ny])) { nx = -nx; ny = -ny; }
      const sx = p[0] + en * nx, sy = p[1] + en * ny;
      let best = Infinity;
      for (const e of es.edges) {
        const den = nx * e.dy - ny * e.dx;
        if (Math.abs(den) < 1e-12) continue;
        const wx = e.ax - sx, wy = e.ay - sy;
        const t = (wx * e.dy - wy * e.dx) / den;
        if (t > 1e-9 && t < best) {
          const u = (wx * ny - wy * nx) / den;
          if (u >= 0 && u <= 1) best = t;
        }
      }
      if (best < Infinity) {
        const angle = (Math.atan2(ny, nx) * 180 / Math.PI % 180 + 180) % 180;
        out.push({ w: best + en, angle, weight: total / n });
      }
    }
    return out;
  }

  // ------------------------------------------------------------- offset (Clipper)
  function offsetPoly(poly, delta, keepHeight) {
    if (!root.ClipperLib) throw new Error('ClipperLib not loaded');
    const CL = root.ClipperLib;
    if (Math.abs(delta) < 1e-9) return poly;
    const paths = [poly.outer, ...poly.holes].map(r =>
      r.map(p => ({ X: Math.round(p[0] * K), Y: Math.round(p[1] * K) })));
    const co = new CL.ClipperOffset(2, Math.max(2, 0.01 * K));
    co.AddPaths(paths, CL.JoinType.jtMiter, CL.EndType.etClosedPolygon);
    const tree = new CL.PolyTree();
    co.Execute(tree, delta * K);
    const outs = [], holes = [];
    for (const path of CL.Clipper.PolyTreeToPaths(tree)) {
      if (path.length < 3) continue;
      const ring = path.map(q => [q.X / K, q.Y / K]);
      const a = signedArea(ring);
      if (a > 1e-9) outs.push({ outer: ring, holes: [] });
      else if (a < -1e-9) holes.push(ring);
    }
    if (!outs.length) return null;
    for (const h of holes) {
      let best = null, bestArea = Infinity;
      for (const o of outs) {
        if (pointInRing(h[0], o.outer) && Math.abs(signedArea(o.outer)) < bestArea) {
          best = o; bestArea = Math.abs(signedArea(o.outer));
        }
      }
      if (best) best.holes.push(h);
    }
    outs.sort((a, b) => area(b) - area(a));
    let p = outs[0];
    if (keepHeight !== false) {
      const a = bounds(poly), b = bounds(p);
      const s = (a[3] - a[1]) / (b[3] - b[1]);
      p = transformPoly(p, (x, y) => [(x - (b[0] + b[2]) / 2) * s + (a[0] + a[2]) / 2,
                                      (y - (b[1] + b[3]) / 2) * s + (a[1] + a[3]) / 2]);
    }
    return p;
  }

  // ------------------------------------------------------------------ solver
  function solve(poly, target, spacing) {
    spacing = spacing || 0.06;
    const TOL = 0.0015;
    const current = measure(poly, spacing).coreMedian;
    const f = d => {
      const p = offsetPoly(poly, d, true);
      return p ? measure(p, spacing).coreMedian - target : NaN;
    };
    if (Math.abs(current - target) <= TOL) return { delta: 0, poly, error: current - target, iterations: 0 };
    let d0 = 0, w0 = current - target;
    let d1 = (target - current) / 2, w1 = f(d1);
    let it = 1;
    for (; it < 9; it++) {
      if (Math.abs(w1) < TOL) break;
      const den = w1 - w0;
      if (!isFinite(den) || Math.abs(den) < 1e-9) break;
      let d2 = d1 - w1 * (d1 - d0) / den;
      const lim = Math.max(0.6, current * 0.5);
      d2 = Math.max(-lim, Math.min(lim, d2));
      d0 = d1; w0 = w1; d1 = d2; w1 = f(d1);
    }
    if (Math.abs(d1) > 0.4 * current)
      return { delta: d1, poly: null, error: NaN, iterations: it, unsafe: true };
    const result = offsetPoly(poly, d1, true);
    if (!result || result.holes.length !== poly.holes.length)
      return { delta: d1, poly: null, error: NaN, iterations: it, unsafe: true };
    return { delta: d1, poly: result, error: measure(result, spacing).coreMedian - target, iterations: it };
  }

  // ------------------------------------------------------------- SVG parsing
  function parseAttrs(s) {
    const out = {};
    const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(s))) out[m[1]] = m[2] !== undefined ? m[2] : m[3];
    return out;
  }
  const SHAPES = { path: 1, circle: 1, ellipse: 1, rect: 1, polygon: 1, polyline: 1 };
  function parseSVG(text, tol) {
    tol = tol || 0.004;
    const token = /<(\/?)([\w:-]+)([^>]*?)(\/?)>/g;
    const stack = [];
    const parts = [];
    let elIndex = 0;
    let m;
    while ((m = token.exec(text))) {
      const closing = m[1] === '/', tag = m[2].replace(/^svg:/, ''), self = m[4] === '/';
      if (closing) { stack.pop(); continue; }
      const attrs = parseAttrs(m[3]);
      const parent = stack.length ? stack[stack.length - 1].m : [1, 0, 0, 1, 0, 0];
      const mat = matMul(parent, matParse(attrs.transform));
      if (SHAPES[tag]) {
        const tagObj = { tag, ...attrs };
        const d = shapePath(tagObj);
        if (d) {
          const ei = elIndex++;
          const rings = parsePath(d, tol).map(r => r.map(p => matApply(mat, p[0], p[1])));
          for (const poly of ringsToPolys(rings))
            parts.push({ index: parts.length, elIndex: ei, tag, attrs, mat, poly });
        }
      }
      if (!self) stack.push({ tag, m: mat });
    }
    return parts;
  }
  function polyToD(poly, inverse) {
    const fmt = p => {
      const q = inverse ? matApply(inverse, p[0], p[1]) : p;
      return q[0].toFixed(5) + ' ' + q[1].toFixed(5);
    };
    const ser = r => 'M' + r.slice(0, r.length).map(fmt).join('L') + 'Z';
    let d = ser(poly.outer);
    for (const h of poly.holes) d += ser(h);
    return d;
  }
  // Replace the d attribute of the shape elements at the given indices.
  function rewriteSVG(text, replacements) {
    const token = /<(\/?)([\w:-]+)([^>]*?)(\/?)>/g;
    const stack = [];
    let idx = 0, out = '', last = 0;
    let m;
    while ((m = token.exec(text))) {
      const closing = m[1] === '/', tag = m[2].replace(/^svg:/, ''), self = m[4] === '/';
      if (closing) { stack.pop(); continue; }
      const attrs = parseAttrs(m[3]);
      const parent = stack.length ? stack[stack.length - 1].m : [1, 0, 0, 1, 0, 0];
      const mat = matMul(parent, matParse(attrs.transform));
      const isShape = !!SHAPES[tag];
      let full = m[0];
      if (isShape && shapePath({ tag, ...attrs })) {
        const i = idx++;
        if (Object.prototype.hasOwnProperty.call(replacements, i)) {
          const nd = replacements[i];
          if (/\sd="[^"]*"/.test(full)) full = full.replace(/\sd="[^"]*"/, ' d="' + nd + '"');
          else full = full.replace(new RegExp('<' + tag), '<' + tag + ' d="' + nd + '"');
          full = full.replace(/\sfill-rule="[^"]*"/, '');
          full = full.replace(new RegExp('<' + tag), '<' + tag + ' fill-rule="evenodd"');
        }
      }
      out += text.slice(last, m.index) + full;
      last = m.index + m[0].length;
      if (!self) stack.push({ tag, m: mat });
    }
    return out + text.slice(last);
  }

  const API = {
    parsePath, shapePath, ringsToPolys, bounds, area, pointInPoly,
    measure, offsetPoly, solve, parseSVG, rewriteSVG, polyToD, raySamples, transformPoly,
    matParse, matMul, matApply, matInv, signedArea,
  };
  root.ThicknessEngine = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
