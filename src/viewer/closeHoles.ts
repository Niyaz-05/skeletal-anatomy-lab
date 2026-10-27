import * as THREE from 'three';

/** Vertices closer than this (metres) count as the same point when looking for holes. */
const WELD = 1e-5;

/**
 * A closed copy of a mesh for the stencil cut caps. Stencil capping counts the surfaces behind
 * the cut, so it only fills the cut face of a closed mesh; several source parts are open where
 * they were split from a neighbour or where vessels enter. Each hole (a connected rim of edges used
 * by one triangle only) is filled with triangles to its centre, wound like the rest of the mesh. The visible tissue
 * keeps the original geometry. Returns the input unchanged when it has no holes.
 */
export function closeHoles(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  // Where two holes share a vertex, one pass can leave a short loop open; a second pass closes it.
  let out = geometry;
  for (let pass = 0; pass < 3; pass++) {
    const next = fillOnce(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

function fillOnce(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const tri = index ? Array.from(index.array as ArrayLike<number>) : Array.from({ length: pos.count }, (_, i) => i);

  // Weld by position, so seams with split normals do not look like holes.
  const weld = new Map<string, number>();
  const id = new Uint32Array(pos.count);
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const key = `${Math.round(x / WELD)},${Math.round(y / WELD)},${Math.round(z / WELD)}`;
    let v = weld.get(key);
    if (v === undefined) { v = points.length; weld.set(key, v); points.push(new THREE.Vector3(x, y, z)); }
    id[i] = v;
  }

  // A boundary edge is used by one triangle only (a fold, used twice the same way round, is not a hole).
  const directed = new Map<string, number>(), undirected = new Map<string, number>();
  const edgeKey = (a: number, b: number) => `${a}_${b}`;
  for (let t = 0; t + 2 < tri.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = id[tri[t + e]!]!, b = id[tri[t + ((e + 1) % 3)]!]!;
      if (a === b) continue;
      directed.set(edgeKey(a, b), (directed.get(edgeKey(a, b)) ?? 0) + 1);
      const u = a < b ? edgeKey(a, b) : edgeKey(b, a);
      undirected.set(u, (undirected.get(u) ?? 0) + 1);
    }
  }
  const rim: [number, number][] = [];
  for (const k of directed.keys()) {
    const [a, b] = k.split('_').map(Number) as [number, number];
    if (undirected.get(a < b ? k : edgeKey(b, a)) === 1) rim.push([a, b]);
  }
  if (rim.length === 0) return geometry;

  // Group the rim edges into holes (connected rims, by union-find over their vertices). Each rim
  // edge then gets one triangle to its hole's centre; no ordering of the loop is needed, so holes
  // that touch at a vertex close as well.
  const parent = new Map<number, number>();
  const find = (v: number): number => {
    let r = v;
    while (parent.get(r) !== r) r = parent.get(r)!;
    for (let x = v; parent.get(x) !== r; ) { const nx = parent.get(x)!; parent.set(x, r); x = nx; }
    return r;
  };
  for (const [a, b] of rim) {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(Math.max(ra, rb), Math.min(ra, rb));
  }
  const holes = new Map<number, { sum: THREE.Vector3; count: number; index: number }>();
  for (const v of [...parent.keys()].sort((p, q) => p - q)) {
    const r = find(v);
    let h = holes.get(r);
    if (!h) { h = { sum: new THREE.Vector3(), count: 0, index: points.length + holes.size }; holes.set(r, h); }
    h.sum.add(points[v]!); h.count++;
  }

  // Positions: the welded points plus one centre per hole; triangles: the original plus the patches.
  const out = new Float32Array((points.length + holes.size) * 3);
  points.forEach((p, i) => p.toArray(out, i * 3));
  for (const h of holes.values()) h.sum.divideScalar(h.count).toArray(out, h.index * 3);
  const faces: number[] = [];
  for (let t = 0; t + 2 < tri.length; t += 3) {
    const a = id[tri[t]!]!, b = id[tri[t + 1]!]!, c = id[tri[t + 2]!]!;
    if (a !== b && b !== c && c !== a) faces.push(a, b, c);
  }
  // The mesh holds a→b on the rim, so the patch takes b→a: (b, a, centre).
  for (const [a, b] of rim) faces.push(b, a, holes.get(find(a))!.index);

  const closed = new THREE.BufferGeometry();
  closed.setAttribute('position', new THREE.BufferAttribute(out, 3));
  closed.setIndex(faces);
  closed.computeBoundingBox();
  closed.computeBoundingSphere();
  return closed;
}
