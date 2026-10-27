/**
 * Mesh helpers shared by the extraction tools (from the endocrine lab's extractor): welding,
 * simplification, smoothing, inside tests, principal axes, similarity fits, tubes and centre lines.
 * Positions are Float32Arrays in metres; indices Uint32Arrays.
 */
import { MeshoptSimplifier } from 'meshoptimizer';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

await MeshoptSimplifier.ready;
export { THREE };
export const r6 = (v) => Math.round(v * 1e6) / 1e6;
export const V = (a) => new THREE.Vector3(...a);
export const arr = (pts) => pts.map((p) => p.toArray().map(r6));

export function weld(positions, indices) {
  const map = new Map(), remap = new Uint32Array(positions.length / 3), out = [];
  for (let i = 0; i < positions.length / 3; i++) {
    const key = `${Math.round(positions[i * 3] * 1e6)},${Math.round(positions[i * 3 + 1] * 1e6)},${Math.round(positions[i * 3 + 2] * 1e6)}`;
    let k = map.get(key);
    if (k === undefined) { k = out.length / 3; map.set(key, k); out.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]); }
    remap[i] = k;
  }
  const idx = [];
  for (let t = 0; t < indices.length; t += 3) {
    const a = remap[indices[t]], b = remap[indices[t + 1]], c = remap[indices[t + 2]];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  return { positions: Float32Array.from(out), indices: Uint32Array.from(idx) };
}
export function smoothNormals(positions, indices) {
  const n = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3];
    const e1 = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
    const e2 = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
    const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of [a, b, c]) { n[v] += f[0]; n[v + 1] += f[1]; n[v + 2] += f[2]; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const len = Math.hypot(n[i], n[i + 1], n[i + 2]);
    if (len > 0) { n[i] /= len; n[i + 1] /= len; n[i + 2] /= len; } else { n[i + 1] = 1; }
  }
  return n;
}
export function simplify(positions, indices, ratio = 0.5, maxErr = 0.004) {
  const tris = indices.length / 3;
  if (tris <= 6000 && ratio >= 0.5) return { positions, indices, error: 0 };
  const target = Math.floor((indices.length * ratio) / 3) * 3;
  const [simplified, error] = MeshoptSimplifier.simplify(indices, positions, 3, target, maxErr);
  const used = new Map(), pos = [];
  const idx = new Uint32Array(simplified.length);
  for (let i = 0; i < simplified.length; i++) {
    const v = simplified[i];
    let k = used.get(v);
    if (k === undefined) { k = pos.length / 3; used.set(v, k); pos.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]); }
    idx[i] = k;
  }
  return { positions: Float32Array.from(pos), indices: idx, error };
}
export function mergePieces(pieces) {
  const vCount = pieces.reduce((n, p) => n + p.positions.length / 3, 0);
  const positions = new Float32Array(vCount * 3), indices = new Uint32Array(pieces.reduce((n, p) => n + p.indices.length, 0));
  let vo = 0, io = 0;
  for (const p of pieces) {
    positions.set(p.positions, vo * 3);
    for (let k = 0; k < p.indices.length; k++) indices[io + k] = p.indices[k] + vo;
    vo += p.positions.length / 3; io += p.indices.length;
  }
  return { positions, indices };
}
/** Midpoint subdivision: every triangle becomes four. */
export function subdivide(positions, indices) {
  const pos = Array.from(positions), idx = [];
  const mids = new Map();
  const mid = (a, b) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    let m = mids.get(key);
    if (m === undefined) {
      m = pos.length / 3;
      pos.push((pos[a * 3] + pos[b * 3]) / 2, (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2, (pos[a * 3 + 2] + pos[b * 3 + 2]) / 2);
      mids.set(key, m);
    }
    return m;
  };
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    idx.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) };
}
/** Taubin smoothing (shrink-free): alternating Laplacian steps. Vertices in `pinned` stay. */
export function taubin(positions, indices, iterations, pinned = null) {
  const n = positions.length / 3, nb = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b);
  }
  for (let it = 0; it < iterations * 2; it++) {
    const f = it % 2 === 0 ? 0.5 : -0.53;
    const next = Float32Array.from(positions);
    for (let v = 0; v < n; v++) {
      if (!nb[v].size || pinned?.has(v)) continue;
      for (let a = 0; a < 3; a++) {
        let avg = 0;
        for (const u of nb[v]) avg += positions[u * 3 + a];
        avg /= nb[v].size;
        next[v * 3 + a] = positions[v * 3 + a] + f * (avg - positions[v * 3 + a]);
      }
    }
    positions.set(next);
  }
}
/** Small meshes: subdivided and smoothed so they do not look faceted. */
export function smoothSmall(w, below = 600) {
  if (w.positions.length / 3 >= below) return w;
  const sub = subdivide(w.positions, w.indices);
  taubin(sub.positions, sub.indices, 3);
  return sub;
}
export const bboxOf = (pos) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], pos[i + a]); hi[a] = Math.max(hi[a], pos[i + a]); }
  return [lo, hi];
};
export function centroid(pos) {
  const c = [0, 0, 0], n = pos.length / 3;
  for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) c[a] += pos[i + a] / n;
  return c;
}
export const ray = new THREE.Ray();
export function bvhOf(m) {
  if (!m.bvh) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    g.setIndex(new THREE.BufferAttribute(m.indices, 1));
    m.bvh = new MeshBVH(g);
  }
  return m.bvh;
}
const DIRS = [new THREE.Vector3(1, 0.0013, 0.0007).normalize(), new THREE.Vector3(0.0011, 1, 0.0017).normalize(), new THREE.Vector3(0.0009, 0.0015, 1).normalize()];
export function insideMesh(bvh, p) {
  let odd = 0;
  for (const d of DIRS) {
    ray.origin.set(p[0], p[1], p[2]); ray.direction.copy(d);
    if (bvh.raycast(ray, THREE.DoubleSide).length % 2 === 1) odd++;
  }
  return odd >= 2;
}
export const insidePct = (m, bvh) => { let inside = 0, n = 0; for (let i = 0; i < m.positions.length; i += 9) { n++; if (insideMesh(bvh, [m.positions[i], m.positions[i + 1], m.positions[i + 2]])) inside++; } return r6((100 * inside) / n); };
/** Principal axes (unit vectors, largest spread first) and extents of a point set. */
export function pca(pos) {
  const c = centroid(pos), n = pos.length / 3;
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < pos.length; i += 3) {
    const d = [pos[i] - c[0], pos[i + 1] - c[1], pos[i + 2] - c[2]];
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) cov[r][k] += (d[r] * d[k]) / n;
  }
  const axes = [];
  for (let e = 0; e < 3; e++) {
    let v = [1, 0.7, 0.4];
    for (let it = 0; it < 300; it++) {
      let w = [0, 1, 2].map((r) => cov[r][0] * v[0] + cov[r][1] * v[1] + cov[r][2] * v[2]);
      for (const a of axes) { const d = w[0] * a[0] + w[1] * a[1] + w[2] * a[2]; w = w.map((x, q) => x - d * a[q]); }
      const len = Math.hypot(...w) || 1; v = w.map((x) => x / len);
    }
    axes.push(v);
  }
  const extents = axes.map((a) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < pos.length; i += 3) { const t = (pos[i] - c[0]) * a[0] + (pos[i + 1] - c[1]) * a[1] + (pos[i + 2] - c[2]) * a[2]; lo = Math.min(lo, t); hi = Math.max(hi, t); }
    return hi - lo;
  });
  return { centre: c, axes, extents };
}

// ── Similarity fits ─────────────────────────────────────────────────────────
function topEigen4(N) {
  let v = [1, 0.3, 0.2, 0.1];
  const shift = Math.abs(N.flat().reduce((a, b) => a + Math.abs(b), 0));
  for (let it = 0; it < 2000; it++) {
    const w = [0, 1, 2, 3].map((r) => N[r].reduce((s, x, c) => s + x * v[c], 0) + shift * v[r]);
    const len = Math.hypot(...w);
    v = w.map((x) => x / len);
  }
  return v;
}
/** Weighted similarity (Horn's quaternion method, then the least-squares scale). */
export function horn(src, dst, w, fixedScale = null) {
  const W = w.reduce((a, b) => a + b, 0);
  const ms = [0, 1, 2].map((a) => src.reduce((s, p, i) => s + w[i] * p[a], 0) / W);
  const md = [0, 1, 2].map((a) => dst.reduce((s, p, i) => s + w[i] * p[a], 0) / W);
  const S = [0, 1, 2].map((r) => [0, 1, 2].map((c) => src.reduce((s, p, i) => s + w[i] * (p[r] - ms[r]) * (dst[i][c] - md[c]), 0)));
  const [[Sxx, Sxy, Sxz], [Syx, Syy, Syz], [Szx, Szy, Szz]] = S;
  const N = [
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
  ];
  const [qw, qx, qy, qz] = topEigen4(N);
  const quat = new THREE.Quaternion(qx, qy, qz, qw).normalize();
  const rotM = new THREE.Matrix4().makeRotationFromQuaternion(quat);
  const v = new THREE.Vector3();
  let num = 0, den = 0;
  src.forEach((p, i) => {
    v.set(p[0] - ms[0], p[1] - ms[1], p[2] - ms[2]);
    den += w[i] * v.lengthSq();
    v.applyMatrix4(rotM);
    num += w[i] * (v.x * (dst[i][0] - md[0]) + v.y * (dst[i][1] - md[1]) + v.z * (dst[i][2] - md[2]));
  });
  const scale = fixedScale ?? num / den;
  const place = (x, y, z) => {
    v.set(x - ms[0], y - ms[1], z - ms[2]).applyMatrix4(rotM).multiplyScalar(scale);
    return [v.x + md[0], v.y + md[1], v.z + md[2]];
  };
  return { place, scale, quat };
}

/** Boundary loops of an open mesh, closed by fans from each loop's centroid. */
export function closeLoops(positions, indices) {
  const edges = new Map();
  for (let t = 0; t < indices.length; t += 3) for (const [a, b] of [[indices[t], indices[t + 1]], [indices[t + 1], indices[t + 2]], [indices[t + 2], indices[t]]]) {
    const k = a < b ? `${a}_${b}` : `${b}_${a}`;
    const e = edges.get(k);
    if (e) e.n++; else edges.set(k, { a, b, n: 1 });
  }
  const next = new Map();
  for (const e of edges.values()) if (e.n === 1) next.set(e.b, e.a);
  const pos = Array.from(positions), idx = Array.from(indices);
  const seen = new Set();
  let loops = 0;
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let v = start;
    while (v !== undefined && !seen.has(v)) { seen.add(v); loop.push(v); v = next.get(v); }
    if (loop.length < 3) continue;
    const c = [0, 0, 0];
    for (const q of loop) for (let a = 0; a < 3; a++) c[a] += positions[q * 3 + a] / loop.length;
    const ci = pos.length / 3; pos.push(...c);
    for (let i = 0; i < loop.length; i++) idx.push(loop[i], loop[(i + 1) % loop.length], ci);
    loops++;
  }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx), loops };
}
/** Keep the triangles whose centroid passes `keep`, re-indexed and closed. */
export function cutMesh(m, keep) {
  const w = weld(m.positions, m.indices), tri = [];
  for (let t = 0; t < w.indices.length; t += 3) {
    const c = [0, 1, 2].map((a) => (w.positions[w.indices[t] * 3 + a] + w.positions[w.indices[t + 1] * 3 + a] + w.positions[w.indices[t + 2] * 3 + a]) / 3);
    if (keep(c)) tri.push(w.indices[t], w.indices[t + 1], w.indices[t + 2]);
  }
  const closed = closeLoops(w.positions, Uint32Array.from(tri));
  const remap = new Map(), pos = [];
  const out = Array.from(closed.indices, (v) => { if (!remap.has(v)) { remap.set(v, pos.length / 3); pos.push(closed.positions[v * 3], closed.positions[v * 3 + 1], closed.positions[v * 3 + 2]); } return remap.get(v); });
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(out), loops: closed.loops };
}
/** Push the vertices of `m` that lie inside `bvh` out to its surface plus a gap, smoothing between passes. */
export function pushOut(m, bvh, gap, passes = 6, smooth = true) {
  const res = {}, v = new THREE.Vector3();
  for (let pass = 0; pass < passes; pass++) {
    let moved = 0;
    for (let i = 0; i < m.positions.length; i += 3) {
      v.set(m.positions[i], m.positions[i + 1], m.positions[i + 2]);
      const inside = insideMesh(bvh, [v.x, v.y, v.z]);
      bvh.closestPointToPoint(v, res);
      if (!inside && res.distance >= gap) continue;
      const out = inside ? res.point.clone().sub(v).normalize() : v.clone().sub(res.point).normalize();
      v.copy(res.point).addScaledVector(out, gap);
      m.positions.set([v.x, v.y, v.z], i);
      moved++;
    }
    if (!moved) break;
    if (smooth && pass < passes - 1) taubin(m.positions, m.indices, 1);
  }
}

// ── Points and curves ───────────────────────────────────────────────────────
export function nearestVertex(m, p) {
  const q = m.positions; let b = 0, bd = Infinity;
  for (let i = 0; i < q.length; i += 3) { const d = (q[i] - p.x) ** 2 + (q[i + 1] - p.y) ** 2 + (q[i + 2] - p.z) ** 2; if (d < bd) { bd = d; b = i; } }
  return V([q[b], q[b + 1], q[b + 2]]);
}
/** The vertex furthest along a direction. */
export function extreme(m, dir) {
  const q = m.positions; let b = 0, bd = -Infinity;
  for (let i = 0; i < q.length; i += 3) { const d = q[i] * dir.x + q[i + 1] * dir.y + q[i + 2] * dir.z; if (d > bd) { bd = d; b = i; } }
  return V([q[b], q[b + 1], q[b + 2]]);
}
export const polyLength = (pts) => pts.slice(1).reduce((s, p, i) => s + p.distanceTo(pts[i]), 0);
export function chaikin(pts, iterations = 2) {
  let out = pts;
  for (let it = 0; it < iterations; it++) {
    const next = [out[0]];
    for (let i = 0; i < out.length - 1; i++) next.push(out[i].clone().lerp(out[i + 1], 0.25), out[i].clone().lerp(out[i + 1], 0.75));
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}
export function resample(pts, step) {
  const out = [pts[0].clone()];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = a.distanceTo(b);
    if (len === 0) continue;
    let t = step - carry;
    while (t <= len) { out.push(a.clone().lerp(b, t / len)); t += step; }
    carry = len - (t - step);
  }
  if (out[out.length - 1].distanceTo(pts[pts.length - 1]) > step * 0.2) out.push(pts[pts.length - 1].clone());
  return out;
}
/** Slab centroids of a mesh between two of its points: a straight vessel's centre line. */
export function lineAlong(m, from, to, n = 10) {
  const pos = m.positions, ax = to.clone().sub(from), L = ax.length(); ax.normalize();
  const pts = [from];
  for (let k = 1; k < n; k++) {
    const t0 = (L * (k - 0.5)) / n, t1 = (L * (k + 0.5)) / n, acc = new THREE.Vector3(); let c = 0;
    for (let i = 0; i < pos.length; i += 3) { const p = V([pos[i], pos[i + 1], pos[i + 2]]); const t = p.clone().sub(from).dot(ax); if (t >= t0 && t < t1) { acc.add(p); c++; } }
    if (c) pts.push(acc.divideScalar(c));
  }
  pts.push(to);
  return pts;
}
/** The two ends of an elongated mesh (its extreme vertices along the main axis), the one nearer `hint` first. */
export function endsOf(m, hint) {
  const p = pca(m.positions), ax = V(p.axes[0]), c = V(p.centre);
  let lo = null, hi = null, tl = Infinity, th = -Infinity;
  for (let i = 0; i < m.positions.length; i += 3) { const q = V([m.positions[i], m.positions[i + 1], m.positions[i + 2]]); const t = q.clone().sub(c).dot(ax); if (t < tl) { tl = t; lo = q; } if (t > th) { th = t; hi = q; } }
  return hint && hi.distanceTo(hint) < lo.distanceTo(hint) ? [hi, lo] : [lo, hi];
}
/**
 * Centre line of a curved tube mesh: from `start`, step along the local direction, re-centring on the
 * cross-section (vertices in a thin slab ahead, within `radius` of the line). Stops when the tube ends.
 */
export function trace(m, start, dir, { step = 0.002, radius = 0.006, max = 600, stopAt = null } = {}) {
  const pos = m.positions, pts = [start.clone()];
  let p = start.clone(), d = dir.clone().normalize();
  const q = new THREE.Vector3();
  for (let k = 0; k < max; k++) {
    const ahead = p.clone().addScaledVector(d, step);
    const acc = new THREE.Vector3(); let c = 0;
    for (let i = 0; i < pos.length; i += 3) {
      q.set(pos[i], pos[i + 1], pos[i + 2]).sub(ahead);
      const along = q.dot(d);
      if (Math.abs(along) > step * 0.75) continue;
      if (q.addScaledVector(d, -along).length() > radius) continue;
      acc.x += pos[i]; acc.y += pos[i + 1]; acc.z += pos[i + 2]; c++;
    }
    if (c < 3) break;
    const next = acc.divideScalar(c);
    const nd = next.clone().sub(p);
    if (nd.length() < step * 0.2) break;
    d = d.multiplyScalar(0.4).add(nd.normalize().multiplyScalar(0.6)).normalize();
    p = next;
    pts.push(p.clone());
    if (stopAt && p.distanceTo(stopAt) < step * 1.5) break;
  }
  return pts;
}
/**
 * Centre line of a long, thin, looping tube between two points on it: the shortest path along the
 * mesh's edges (Dijkstra) from the vertex nearest `a` to the vertex nearest `b`, then each point moved
 * to the centroid of the vertices within `radius` (the cross-section) and smoothed.
 */
export function geodesic(m, a, b, radius = 0.003) {
  const w = weld(m.positions, m.indices), n = w.positions.length / 3, P = w.positions;
  const nb = Array.from({ length: n }, () => new Map());
  const len = (i, j) => Math.hypot(P[i * 3] - P[j * 3], P[i * 3 + 1] - P[j * 3 + 1], P[i * 3 + 2] - P[j * 3 + 2]);
  for (let t = 0; t < w.indices.length; t += 3) for (const [x, y] of [[0, 1], [1, 2], [2, 0]]) { const i = w.indices[t + x], j = w.indices[t + y]; const l = len(i, j); nb[i].set(j, l); nb[j].set(i, l); }
  const near = (p) => { let k = 0, bd = Infinity; for (let i = 0; i < n; i++) { const d = (P[i * 3] - p.x) ** 2 + (P[i * 3 + 1] - p.y) ** 2 + (P[i * 3 + 2] - p.z) ** 2; if (d < bd) { bd = d; k = i; } } return k; };
  const s = near(a), e = near(b);
  const dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  dist[s] = 0;
  // Binary heap of [distance, vertex].
  const heap = [[0, s]];
  const push = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m2 = i; if (l < heap.length && heap[l][0] < heap[m2][0]) m2 = l; if (r < heap.length && heap[r][0] < heap[m2][0]) m2 = r; if (m2 === i) break; [heap[m2], heap[i]] = [heap[i], heap[m2]]; i = m2; } } return top; };
  while (heap.length) {
    const [d, i] = pop();
    if (done[i]) continue; done[i] = 1;
    if (i === e) break;
    for (const [j, l] of nb[i]) if (d + l < dist[j]) { dist[j] = d + l; prev[j] = i; push([dist[j], j]); }
  }
  if (!Number.isFinite(dist[e])) return null;
  const path = []; for (let i = e; i !== -1; i = prev[i]) path.push(V([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]));
  path.reverse();
  const centred = resample(path, radius * 0.8).map((p) => {
    const acc = new THREE.Vector3(); let c = 0;
    for (let i = 0; i < n; i++) { const dx = P[i * 3] - p.x, dy = P[i * 3 + 1] - p.y, dz = P[i * 3 + 2] - p.z; if (dx * dx + dy * dy + dz * dz < radius * radius) { acc.x += P[i * 3]; acc.y += P[i * 3 + 1]; acc.z += P[i * 3 + 2]; c++; } }
    return c ? acc.divideScalar(c) : p;
  });
  return chaikin(centred, 2);
}
export const truncateNear =(pts, p) => { let k = 0, bd = Infinity; pts.forEach((q, i) => { const d = q.distanceTo(p); if (d < bd) { bd = d; k = i; } }); return pts.slice(0, k + 1); };
export const nearestOn = (pts, p) => { let k = 0, bd = Infinity; pts.forEach((q, i) => { const d = q.distanceTo(p); if (d < bd) { bd = d; k = i; } }); return pts[k]; };
export const lowest = (m) => extreme(m, V([0, -1, 0]));
export const highest = (m) => extreme(m, V([0, 1, 0]));
/** A closed ellipsoid about centre `c` on three axes. */
export const ellipsoid = (c, ax, radii, segs = 20, rings = 14) => {
  const pos = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const th = (i / rings) * Math.PI;
    for (let j = 0; j < segs; j++) {
      const ph = (j / segs) * Math.PI * 2;
      const p = c.clone().addScaledVector(ax[0], radii[0] * Math.sin(th) * Math.cos(ph)).addScaledVector(ax[1], radii[1] * Math.sin(th) * Math.sin(ph)).addScaledVector(ax[2], radii[2] * Math.cos(th));
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = i * segs + j, b = i * segs + ((j + 1) % segs), d = (i + 1) * segs + j, e = (i + 1) * segs + ((j + 1) % segs);
    idx.push(a, d, b, b, d, e);
  }
  return weld(Float32Array.from(pos), Uint32Array.from(idx));
};
/** A closed tube along a curve, radius r(t) (t = 0 … 1), rings every `spacing` m; `flat` (≥ 1) squashes it along the binormal. */
export function tube(pts, r, rad = 14, flat = 1, spacing = 0.0008) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const N = Math.max(8, Math.round(curve.getLength() / spacing));
  const frames = curve.computeFrenetFrames(N, false);
  const pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, c = curve.getPointAt(t), R = r(t);
    for (let j = 0; j < rad; j++) { const a = (j / rad) * Math.PI * 2; const p = c.clone().addScaledVector(frames.normals[i], Math.cos(a) * R).addScaledVector(frames.binormals[i], (Math.sin(a) * R) / flat); pos.push(p.x, p.y, p.z); }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < rad; j++) { const a = i * rad + j, b = i * rad + ((j + 1) % rad), c = (i + 1) * rad + j, d = (i + 1) * rad + ((j + 1) % rad); idx.push(a, c, b, b, c, d); }
  const closed = closeLoops(Float32Array.from(pos), Uint32Array.from(idx));
  return weld(closed.positions, closed.indices);
}
/** An icosphere of radius 1 about the origin (`level` subdivisions). */
export function icosphere(level = 4) {
  const t = (1 + Math.sqrt(5)) / 2;
  let pos = [-1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1];
  let idx = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  let m = { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) };
  for (let l = 0; l < level; l++) m = subdivide(m.positions, m.indices);
  m = weld(m.positions, m.indices);
  for (let i = 0; i < m.positions.length; i += 3) { const len = Math.hypot(m.positions[i], m.positions[i + 1], m.positions[i + 2]); for (let a = 0; a < 3; a++) m.positions[i + a] /= len; }
  return m;
}
export function signedVolume(m) {
  let v = 0; const p = m.positions, ix = m.indices;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return v;
}
/** Volume by sampling a grid inside the meshes (works for open meshes too), in mL. */
export function sampledVolumeMl(ms, step = 0.0005) {
  const m = mergePieces(ms), bvh = bvhOf(m), [lo, hi] = bboxOf(m.positions);
  let n = 0;
  for (let x = lo[0]; x <= hi[0]; x += step) for (let y = lo[1]; y <= hi[1]; y += step) for (let z = lo[2]; z <= hi[2]; z += step) if (insideMesh(bvh, [x, y, z])) n++;
  return r6(n * step ** 3 * 1e6);
}
