(function () {
  'use strict';
  function thicknessBuildMask(pixels, width, height) {
    const pixelCount = width * height;
    let maxAlpha = 0;
    for (let i = 0; i < pixelCount; i++) if (pixels[i * 4 + 3] > maxAlpha) maxAlpha = pixels[i * 4 + 3];
    if (!maxAlpha) throw Error('No visible non-transparent artwork was found.');
    const threshold = Math.max(1, Math.min(88, Math.round(maxAlpha * .35)));
    const mask = new Uint8Array(pixelCount);
    let minX = width, minY = height, maxX = -1, maxY = -1, count = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] >= threshold) {
        const i = y * width + x;
        mask[i] = 1; count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (!count || maxX < minX || maxY < minY) throw Error('No visible non-transparent artwork was found at a usable alpha threshold.');
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const paddedWidth = w + 2, paddedHeight = h + 2, crop = new Uint8Array(paddedWidth * paddedHeight);
    for (let y = 0; y < h; y++) crop.set(mask.subarray((minY + y) * width + minX, (minY + y) * width + minX + w), (y + 1) * paddedWidth + 1);
    return { mask: crop, width: paddedWidth, height: paddedHeight, offsetX: minX, offsetY: minY, coverage: count / pixelCount, alphaThreshold: threshold, maxAlpha };
  }
  const THICKNESS_ZS_DELETE_TABLES = (() => {
    const phaseA = new Uint8Array(256), phaseB = new Uint8Array(256);
    for (let bits = 0; bits < 256; bits++) {
      const p2 = bits & 1, p3 = (bits >>> 1) & 1, p4 = (bits >>> 2) & 1, p5 = (bits >>> 3) & 1;
      const p6 = (bits >>> 4) & 1, p7 = (bits >>> 5) & 1, p8 = (bits >>> 6) & 1, p9 = (bits >>> 7) & 1;
      const neighbours = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
      if (neighbours < 2 || neighbours > 6) continue;
      const ring = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
      let transitions = 0;
      for (let k = 0; k < 8; k++) if (ring[k] === 0 && ring[k + 1] === 1) transitions++;
      if (transitions !== 1) continue;
      if (p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0) phaseA[bits] = 1;
      if (p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0) phaseB[bits] = 1;
    }
    return { phaseA, phaseB };
  })();
  function thicknessSkeletonizeFrontier(mask, width, height, maxIterations = 512) {
    const out = mask.slice(), removeA = [], removeB = [], marks = new Uint32Array(out.length);
    let epoch = 0, iterations = 0;
    const limit = Math.max(1, Math.min(512, Math.floor(Number(maxIterations) || 512)));
    const all = [];
    for (let y = 1; y < height - 1; y++) {
      const row = y * width;
      for (let x = 1; x < width - 1; x++) {
        const i = row + x;
        if (out[i]) all.push(i);
      }
    }
    let candidatesA = all, candidatesB = all;
    const affected = (deletedA, deletedB = null, base = null) => {
      const list = [];
      epoch++;
      if (epoch === 0) { marks.fill(0); epoch = 1; }
      const add = i => { if (out[i] && marks[i] !== epoch) { marks[i] = epoch; list.push(i); } };
      if (base) for (let k = 0; k < base.length; k++) add(base[k]);
      const addAround = src => {
        if (!src) return;
        for (let k = 0; k < src.length; k++) {
          const i = src[k], x = i % width, y = (i / width) | 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const xx = x + dx, yy = y + dy;
            if (xx > 0 && yy > 0 && xx < width - 1 && yy < height - 1) add(yy * width + xx);
          }
        }
      };
      addAround(deletedA);
      addAround(deletedB);
      return list;
    };
    let changed = true;
    while (changed && iterations < limit) {
      changed = false;
      removeA.length = 0;
      const tableA = THICKNESS_ZS_DELETE_TABLES.phaseA;
      for (let j = 0; j < candidatesA.length; j++) {
        const i = candidatesA[j];
        if (!out[i]) continue;
        const p2 = out[i - width], p3 = out[i - width + 1], p4 = out[i + 1], p5 = out[i + width + 1];
        const p6 = out[i + width], p7 = out[i + width - 1], p8 = out[i - 1], p9 = out[i - width - 1];
        const bits = p2 | (p3 << 1) | (p4 << 2) | (p5 << 3) | (p6 << 4) | (p7 << 5) | (p8 << 6) | (p9 << 7);
        if (tableA[bits]) removeA.push(i);
      }
      if (removeA.length) { changed = true; for (let j = 0; j < removeA.length; j++) out[removeA[j]] = 0; }
      const candidatesBCurrent = affected(removeA, null, candidatesB);
      removeB.length = 0;
      const tableB = THICKNESS_ZS_DELETE_TABLES.phaseB;
      for (let j = 0; j < candidatesBCurrent.length; j++) {
        const i = candidatesBCurrent[j];
        if (!out[i]) continue;
        const p2 = out[i - width], p3 = out[i - width + 1], p4 = out[i + 1], p5 = out[i + width + 1];
        const p6 = out[i + width], p7 = out[i + width - 1], p8 = out[i - 1], p9 = out[i - width - 1];
        const bits = p2 | (p3 << 1) | (p4 << 2) | (p5 << 3) | (p6 << 4) | (p7 << 5) | (p8 << 6) | (p9 << 7);
        if (tableB[bits]) removeB.push(i);
      }
      if (removeB.length) { changed = true; for (let j = 0; j < removeB.length; j++) out[removeB[j]] = 0; }
      if (!changed) { iterations++; break; }
      candidatesA = affected(removeA, removeB);
      candidatesB = affected(removeB);
      iterations++;
    }
    out.iterations = iterations;
    out.converged = !changed;
    return out;
  }
  function thicknessEDT1D(source, n, destination, sites, breakpoints) {
    let k = 0;
    sites[0] = 0;
    breakpoints[0] = -Infinity;
    breakpoints[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let site = sites[k], intersection = ((source[q] + q * q) - (source[site] + site * site)) / (2 * q - 2 * site);
      while (intersection <= breakpoints[k] && k > 0) {
        k--;
        site = sites[k];
        intersection = ((source[q] + q * q) - (source[site] + site * site)) / (2 * q - 2 * site);
      }
      if (intersection <= breakpoints[k]) {
        k = 0;
        sites[0] = q;
        breakpoints[0] = -Infinity;
        breakpoints[1] = Infinity;
      } else {
        k++;
        sites[k] = q;
        breakpoints[k] = intersection;
        breakpoints[k + 1] = Infinity;
      }
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (breakpoints[k + 1] < q) k++;
      const dx = q - sites[k];
      destination[q] = dx * dx + source[sites[k]];
    }
  }
  function thicknessDistanceMap(mask, width, height) {
    const size = width * height, INF = 1e20, temp = new Float64Array(size), dist = new Float32Array(size);
    const maxDim = Math.max(width, height), source = new Float64Array(maxDim), destination = new Float64Array(maxDim), sites = new Int32Array(maxDim), breakpoints = new Float64Array(maxDim + 1);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) source[x] = mask[row + x] ? INF : 0;
      thicknessEDT1D(source, width, destination, sites, breakpoints);
      for (let x = 0; x < width; x++) temp[row + x] = destination[x];
    }
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) source[y] = temp[y * width + x];
      thicknessEDT1D(source, height, destination, sites, breakpoints);
      for (let y = 0; y < height; y++) dist[y * width + x] = Math.sqrt(destination[y]);
    }
    return dist;
  }
  function thicknessTopology(mask, width, height) {
    const n = mask.length, visited = new Uint8Array(n), queue = new Int32Array(n);
    const count = wantForeground => {
      visited.fill(0);
      let components = 0, holes = 0;
      for (let start = 0; start < n; start++) {
        if (visited[start] || ((mask[start] === 1) !== wantForeground)) continue;
        let head = 0, tail = 0, border = false, area = 0;
        queue[tail++] = start;
        visited[start] = 1;
        while (head < tail) {
          const i = queue[head++], x = i % width, y = (i / width) | 0;
          area++;
          if (x === 0 || y === 0 || x === width - 1 || y === height - 1) border = true;
          const offsets = wantForeground ? [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1] : [-width, -1, 1, width];
          for (const off of offsets) {
            const j = i + off;
            if (j < 0 || j >= n || visited[j] || ((mask[j] === 1) !== wantForeground)) continue;
            if ((off === -1 || off === 1) && Math.abs((j % width) - x) !== 1) continue;
            visited[j] = 1;
            queue[tail++] = j;
          }
        }
        if (area >= 3) { components++; if (!wantForeground && !border) holes++; }
      }
      return wantForeground ? components : holes;
    };
    return { components: count(true), holes: count(false) };
  }
  self.onmessage = event => {
    const { id, pixels, width, height } = event.data || {};
    try {
      const built = thicknessBuildMask(pixels, width, height);
      const topology = thicknessTopology(built.mask, built.width, built.height);
      const dist = thicknessDistanceMap(built.mask, built.width, built.height);
      let maxRadiusPx = 0;
      for (let i = 0; i < dist.length; i++) if (built.mask[i] && Number.isFinite(dist[i]) && dist[i] > maxRadiusPx) maxRadiusPx = dist[i];
      const thinningLimit = Math.max(64, Math.min(512, Math.ceil(maxRadiusPx * 1.55 + 16)));
      const skeleton = thicknessSkeletonizeFrontier(built.mask, built.width, built.height, thinningLimit);
      const result = { built, topology, dist, skeleton, skeletonIterations: skeleton.iterations, skeletonConverged: skeleton.converged };
      self.postMessage({ id, ok: true, result }, [built.mask.buffer, dist.buffer, skeleton.buffer]);
    } catch (err) {
      self.postMessage({ id, ok: false, error: String(err?.message || err) });
    }
  };
})();
