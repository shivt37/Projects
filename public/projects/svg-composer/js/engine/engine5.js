/* Engine 5.0 — perceptual weight matching across arbitrary SVG wordmarks.
 * Depends on ThicknessEngine (thickness-engine.js) + ClipperLib.
 * Node and browser compatible. No application files are modified by this module.
 */
(function (root) {
  'use strict';
  const E = root.ThicknessEngine;
  if (!E) throw new Error('ThicknessEngine required');

  const medianSorted = a => {
    if (!a.length) return 0;
    const s = a.toSorted((x, y) => x - y), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const BINS = 12, BIN_DEG = 180 / BINS;

  // ---------------------------------------------------------------- signature
  function signature(poly, spacing) {
    spacing = spacing || 0.06;
    const samples = E.raySamples(poly, spacing);
    if (samples.length < 12) return null;
    const ws = samples.map(s => s.w).sort((a, b) => a - b);
    const med = medianSorted(ws);
    const dev = ws.map(w => Math.abs(w - med)).sort((a, b) => a - b);
    const mad = Math.max(1e-4, medianSorted(dev) * 1.4826);
    const core = samples.filter(s => Math.abs(s.w - med) <= 2.5 * mad);
    if (core.length < 8) return null;
    const w0 = medianSorted(core.map(s => s.w));

    const binW = Array.from({ length: BINS }, () => []);
    const binSupport = new Array(BINS).fill(0);
    for (const s of core) {
      const b = Math.min(BINS - 1, Math.floor(s.angle / BIN_DEG));
      binW[b].push([s.w, s.weight]);
      binSupport[b] += s.weight;
    }
    const wTheta = binW.map(list => {
      if (!list.length) return null;
      const tot = list.reduce((a, x) => a + x[1], 0);
      const vals = list.map(x => [x[0], x[1]]).sort((a, b) => a[0] - b[0]);
      let acc = 0;
      for (const v of vals) { acc += v[1]; if (acc >= tot / 2) return v[0]; }
      return vals[vals.length - 1][0];
    });
    const totalSupport = binSupport.reduce((a, b) => a + b, 0) || 1;
    const support = binSupport.map(s => s / totalSupport);

    const bb = E.bounds(poly);
    const boxW = bb[2] - bb[0], boxH = bb[3] - bb[1];
    const outerArea = Math.abs(E.signedArea(poly.outer));
    const holeArea = poly.holes.reduce((a, h) => a + Math.abs(E.signedArea(h)), 0);
    return {
      w0, wTheta, support, coreCount: core.length, sampleCount: samples.length,
      coverage: outerArea > 0 ? (outerArea - holeArea) / Math.max(1e-9, boxW * boxH) : 0,
      counterRatio: outerArea > 0 ? holeArea / outerArea : 0,
      bbox: [boxW, boxH], area: outerArea - holeArea, holes: poly.holes.length,
    };
  }

  // ------------------------------------------------------------ role pairing
  function roleOf(sig) {
    let maxI = 0, second = 0;
    for (let i = 0; i < BINS; i++) {
      if (sig.support[i] > sig.support[maxI]) { second = maxI; maxI = i; }
      else if (sig.support[i] > sig.support[second]) second = i;
    }
    const a = maxI * BIN_DEG;
    const bb = sig.bbox || [0, 0];
    const sq = Math.min(bb[0], bb[1]) < 3.2 * sig.w0 &&
      Math.max(bb[0], bb[1]) < 3.6 * sig.w0 && sig.holes === 0;
    if (sq) return 'dot'; // filled round dot: a diameter, not a stroke width
    const strong = sig.support.filter(s => s > 0.02).length;
    const twoPerp = sig.support[maxI] > 0.25 && sig.support[second] > 0.25 &&
      Math.abs(maxI - second) === BINS / 2;
    if (twoPerp) return 'cross';
    if (strong >= 6 && sig.wTheta.filter(x => x != null).length >= 6) return 'round';
    if (a < 25 || a > 155) return 'vertical';
    if (a > 65 && a < 115) return 'horizontal';
    return 'diagonal';
  }

  function referenceByRole(polys, spacing) {
    const groups = {};
    for (const poly of polys) {
      const sig = signature(poly, spacing);
      if (!sig) continue;
      let r = roleOf(sig);
      // A reference 'round' without a counter is usually an open diagonal (s),
      // not a ring wall; keep the ring reference clean for matching rings.
      if (r === 'round' && sig.holes === 0) r = 'diagonal';
      (groups[r] || (groups[r] = [])).push(sig);
    }
    const out = {};
    for (const r of Object.keys(groups)) {
      const g = groups[r];
      out[r] = {
        role: r, count: g.length,
        w0: medianSorted(g.map(s => s.w0)),
        wTheta: Array.from({ length: BINS }, (_, b) => {
          const v = g.map(s => s.wTheta[b]).filter(x => x != null);
          return v.length ? medianSorted(v) : null;
        }),
        support: Array.from({ length: BINS }, (_, b) =>
          g.reduce((a, s) => a + s.support[b], 0) / g.length),
        coverage: medianSorted(g.map(s => s.coverage)),
        counterRatio: medianSorted(g.map(s => s.counterRatio)),
      };
    }
    // ONE global nominal stem: the reference's stroke-bearing roles, dots excluded.
    const strokeKeys = roleKeys(out).filter(k => k !== 'dot');
    const pooled = strokeKeys.flatMap(k => groups[k].map(s => s.w0));
    const globalW0 = pooled.length ? medianSorted(pooled) : 0;
    out.__reliable = {};
    for (const r of roleKeys(out)) {
      if (r === 'dot') { out.__reliable[r] = false; continue; }
      const w = out[r].w0, vals = out[r].wTheta.filter(x => x != null && x > 0);
      const spread = vals.length > 1 ? (Math.max(...vals) - Math.min(...vals)) / w : 1;
      out.__reliable[r] = out[r].count >= 2 && spread < 0.12 && globalW0 > 0 &&
        Math.abs(w - globalW0) / globalW0 > 0.03;
    }
    if (globalW0 > 0) {
      const norm = strokeKeys.map(k => {
        const o = out[k], f = globalW0 / o.w0;
        return { wTheta: o.wTheta.map(v => v == null ? null : v * f), support: o.support };
      });
      const medBin = b => {
        const v = norm.map(x => x.wTheta[b]).filter(x => x != null && x > 0.5 * globalW0 && x < 1.5 * globalW0);
        return v.length ? medianSorted(v) : globalW0;
      };
      out.__global = {
        role: 'global', count: strokeKeys.length, w0: globalW0,
        wTheta: Array.from({ length: BINS }, (_, b) => medBin(b)),
        support: norm.length ? Array.from({ length: BINS }, (_, b) =>
          norm.reduce((a, x) => a + x.support[b], 0) / norm.length) : Array.from({ length: BINS }, () => 1 / BINS),
        coverage: medianSorted(strokeKeys.map(k => out[k].coverage)),
        counterRatio: medianSorted(strokeKeys.map(k => out[k].counterRatio)),
      };
    }
    return out;
  }

  function roleKeys(ref) { return Object.keys(ref || {}).filter(k => !k.startsWith('__')); }

  function averageReference(ref) {
    const keys = roleKeys(ref).filter(k => k !== 'dot');
    if (!keys.length) return null;
    const src = keys.map(k => ref[k]);
    const med = arr => medianSorted(arr.filter(x => x != null));
    return {
      role: 'average', count: src.length,
      w0: med(src.map(r => r.w0)),
      wTheta: Array.from({ length: BINS }, (_, b) => med(src.map(r => r.wTheta[b]))),
      support: Array.from({ length: BINS }, (_, b) => src.reduce((a, r) => a + r.support[b], 0) / src.length),
      coverage: med(src.map(r => r.coverage)),
      counterRatio: med(src.map(r => r.counterRatio)),
    };
  }

  // ---------------------------------------------------------------- objective
  // `support` is used by role classification and to mask which orientation bins
  // are scored; it is NOT itself a fitted perceptual weight term (literature
  // supplies no validated JND for angular support divergence).
  const WEIGHTS = { stem: 0.65, angle: 0.25, counter: 0.06, coverage: 0.04 };
  const STEM_GATE = 0.008; // nominal stem must match within 0.8% (hard constraint)
  const JND = { stem: 0.09, angle: 0.05, counter: 0.05, coverage: 0.10 };

  function objective(sig, ref, baseline) {
    if (!sig || !ref) return { J: Infinity };
    const eStem = Math.abs(sig.w0 - ref.w0) / (JND.stem * ref.w0);
    let sa = 0, n = 0;
    for (let b = 0; b < BINS; b++) {
      if (sig.wTheta[b] == null || ref.wTheta[b] == null) continue;
      if (ref.support[b] < 0.01) continue;
      const d = (sig.wTheta[b] - ref.wTheta[b]) / (JND.angle * ref.wTheta[b]);
      sa += d * d; n++;
    }
    const eAngle = n ? Math.sqrt(sa / n) : 0;
    const eCounter = Math.abs(sig.counterRatio - ref.counterRatio) / JND.counter;
    const eCoverage = Math.abs(sig.coverage - ref.coverage) / JND.coverage;
    // Counter and coverage are letterform-intrinsic: they cannot be fixed by an
    // offset, so only their REGRESSION from the input may veto a candidate.
    const dCounter = baseline ? Math.max(0, eCounter - (baseline.eCounter || 0)) : 0;
    const dCoverage = baseline ? Math.max(0, eCoverage - (baseline.eCoverage || 0)) : 0;
    const Jaction = WEIGHTS.stem * eStem * eStem + WEIGHTS.angle * eAngle * eAngle;
    const Jcontext = WEIGHTS.counter * dCounter * dCounter + WEIGHTS.coverage * dCoverage * dCoverage;
    return { J: Jaction + Jcontext, Jaction, Jcontext, eStem, eAngle, eCounter, eCoverage, terms: n };
  }

  // ------------------------------------------------- geometry: anisotropic offset
  function heightRestore(poly, original) {
    const a = E.bounds(original), b = E.bounds(poly);
    const dh = b[3] - b[1];
    if (!(dh > 0)) return null;
    const s = (a[3] - a[1]) / dh;
    if (!Number.isFinite(s)) return null;
    const p = E.transformPoly(poly, (x, y) => [(x - (b[0] + b[2]) / 2) * s + (a[0] + a[2]) / 2,
                                               (y - (b[1] + b[3]) / 2) * s + (a[1] + a[3]) / 2]);
    return p;
  }

  function build(poly, d, kx, ky) {
    const scaled = E.transformPoly(poly, (x, y) => [x * kx, y * ky]);
    const off = E.offsetPoly(scaled, d * Math.max(kx, ky), false);
    if (!off) return null;
    let p = E.transformPoly(off, (x, y) => [x / kx, y / ky]);
    p = heightRestore(p, poly);
    if (!p || p.holes.length !== poly.holes.length || E.area(p) <= 0) return null;
    return p;
  }

  // ------------------------------------------------------------------ solver
  function solve5(poly, ref, opts) {
    opts = opts || {};
    const spacing = opts.spacing || 0.09;
    const sig0 = signature(poly, spacing);
    if (!sig0) return { ok: false, reason: 'no signature' };
    const penalty = p => 0.02 * (p[1] * p[1] + p[2] * p[2]);
    const start = objective(sig0, ref);
    const gate = sig => sig && Math.abs(sig.w0 - ref.w0) / ref.w0 <= STEM_GATE;
    // Fallback rung 1: the proven uniform solver. It is accepted whenever the
    // hard stem gate passes - irreducible counter/coverage differences no longer
    // veto a correct stem (this was the cause of the 'd' revert).
    const uni = E.solve(poly, ref.w0, spacing);
    const uniSig = uni && uni.poly ? signature(uni.poly, spacing) : null;
    const uniOK = gate(uniSig);
    let best = uniOK ? { poly: uni.poly, sig: uniSig, obj: objective(uniSig, ref, start) } : null;
    let params = uniOK ? [uni.delta, 0, 0] : [0, 0, 0];
    let curPoly = uniOK ? uni.poly : poly;
    let curSig = uniOK ? uniSig : sig0;
    let curJ = uniOK ? best.obj.J : start.J;
    let steps = [ Math.max(0.015, Math.abs(params[0]) * 0.4), 0.20, 0.20 ];
    let stagnant = 0, evals = 1;

    const evaluate = p => {
      const kx = Math.exp(p[1]), ky = Math.exp(p[2]);
      if (kx < 0.55 || kx > 1.8 || ky < 0.55 || ky > 1.8) return null;
      if (Math.abs(p[0]) > Math.max(0.6, sig0.w0 * 0.5)) return null;
      const geom = build(poly, p[0], kx, ky);
      if (!geom) return null;
      const sig = signature(geom, spacing);
      if (!sig) return null;
      // Hard perceptual gate (STEM_GATE = 0.8%): a candidate that misses
      // nominal stem is rejected regardless of how good its other cues look.
      if (!gate(sig)) return null;
      const obj = objective(sig, ref, start);
      if (!best || obj.Jaction < best.obj.Jaction - 1e-9)
        best = { poly: geom, sig, obj };
      return { geom, sig, obj };
    };

    let iters = 0;
    for (let it = 0; it < 60; it++) { iters++;
      let improved = false;
      for (let k = 0; k < 3; k++) {
        for (const dir of [1, -1]) {
          const trial = params.slice();
          trial[k] += dir * steps[k];
          const r = evaluate(trial);
          evals++;
          if (r && r.obj.J + penalty(trial) < curJ + penalty(params) - 1e-9) {
            params = trial; curPoly = r.geom; curSig = r.sig; curJ = r.obj.J;
            improved = true;
          }
        }
      }
      if (improved) stagnant = 0;
      else if (++stagnant >= 4) {
        steps = steps.map(s => s * 0.6);
        stagnant = 0;
        if (steps[0] < 0.002 && steps[1] < 0.01) break;
      }
    }

    // Fallback ladder: prefer the best gate-passing candidate, then the uniform
    // warm start, then the original. Every rung must pass the hard stem gate.
    let chosen = best;
    if (gate(curSig)) {
      const cObj = objective(curSig, ref, start);
      if (!best || cObj.Jaction <= best.obj.Jaction + 1e-9)
        chosen = { poly: curPoly, sig: curSig, obj: cObj };
    }
    const finalSig = chosen ? chosen.sig : sig0;
    const finalObj = chosen ? chosen.obj : start;
    if (!chosen || !gate(finalSig)) {
      return {
        ok: true, poly, params: { d: 0, kx: 1, ky: 1 },
        before: { w0: sig0.w0, J: start.J }, after: { w0: sig0.w0, J: start.J, ...start },
        iterations: iters, evaluations: evals, reverted: true, gateSatisfied: false,
      };
    }
    curPoly = chosen.poly;
    const unchanged = curPoly === poly;
    if (unchanged) params = [0, 0, 0];
    return {
      ok: true, poly: curPoly, params: { d: params[0], kx: Math.exp(params[1]), ky: Math.exp(params[2]) },
      before: { w0: sig0.w0, J: start.J }, after: { w0: finalSig.w0, J: finalObj.J, ...finalObj },
      iterations: iters, evaluations: evals, reverted: unchanged,
      gateSatisfied: Math.abs(finalSig.w0 - ref.w0) / ref.w0 <= STEM_GATE,
    };
  }

  // --------------------------------------------------------- whole-SVG matcher
  function matchSVG(svgText, opts) {
    opts = opts || {};
    const parts = E.parseSVG(svgText);
    if (!parts.length) return { ok: false, reason: 'no shapes' };
    const refIds = opts.referenceIndices || [];
    const refPolys = refIds.map(i => parts[i] && parts[i].poly).filter(Boolean);
    const ref = opts.reference || referenceByRole(refPolys, opts.spacing || 0.06);
    if (!Object.keys(ref).length) return { ok: false, reason: 'reference has no measurable roles' };

    const replacements = {}, report = [], solved = new Map();
    const targetIds = opts.targetIndices || null;
    const work = Object.assign({}, opts, { spacing: opts.spacing || 0.06 });
    parts.forEach((p, i) => {
      if (refIds.includes(i)) return;
      if (targetIds && !targetIds.includes(i)) return;
      const sig = signature(p.poly, work.spacing);
      if (!sig) { report.push({ part: i, elIndex: p.elIndex, tag: p.tag, role: 'unmeasurable', ok: false, reverted: true, reason: 'unmeasurable' }); return; }
      const role = roleOf(sig);
      const useRef = ref.__reliable && ref.__reliable[role] ? ref[role] :
        (ref.__global || ref[role] || averageReference(ref));
      if (!useRef) { report.push({ part: i, elIndex: p.elIndex, tag: p.tag, role, ok: false, reverted: true, reason: 'no usable reference role' }); return; }
      const r = solve5(p.poly, useRef, work);
      solved.set(i, r.ok && !r.reverted ? r.poly : p.poly);
      report.push({
        part: i, elIndex: p.elIndex, tag: p.tag, role,
        ok: r.ok, reverted: !!r.reverted, before: r.before, after: r.after, params: r.params,
      });
    });
    // Rebuild every element with at least one changed part, INCLUDING its
    // unchanged polygons - otherwise reverted subpaths would be lost.
    const changedEls = new Set(report.filter(r => r.ok && !r.reverted).map(r => r.elIndex));
    for (const ei of changedEls) {
      // Include every polygon of the element - including parts that were not
      // selected as targets - so subset matching never drops subpaths.
      const members = parts.map((p, i) => ({ p, i })).filter(x => x.p.elIndex === ei);
      replacements[ei] = members.map(x =>
        E.polyToD(solved.has(x.i) ? solved.get(x.i) : x.p.poly, E.matInv(x.p.mat))).join('');
    }
    return { ok: true, svg: E.rewriteSVG(svgText, replacements), report, reference: ref,
             roles: Object.keys(ref) };
  }

  const API = { signature, roleOf, referenceByRole, roleKeys, averageReference, objective, build, heightRestore, solve5, matchSVG, WEIGHTS, JND, BINS, BIN_DEG };
  root.Engine5 = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
