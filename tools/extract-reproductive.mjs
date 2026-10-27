#!/usr/bin/env node
/**
 * Build public/models/female.glb and public/models/male.glb.
 *
 *   node tools/extract-reproductive.mjs <Female Atlas models dir> <Human Atlas models dir>
 *
 *   Female: the HRA united-female body (repo3-female-atlas/public/models, +0.794760942 m in y, reversed
 *   here): uterus regions and walls, cervix, tubes, ovaries, ligaments, vagina, breasts, the full-term
 *   placenta set, bladder, rectum, pelvis and vessels; BodyParts3D pelvic floor, iliac arteries, ribs
 *   and sternum placed on it by similarity fits.
 *   Male: BodyParts3D 4.0 (repo4-human-atlas/public/models; metres, y up, +x = patient's left) in its
 *   own frame: testes, epididymides, deferent ducts, seminal vesicles, prostate, penis, pelvis, vessels.
 *   Modelled (no open scanned model has them): endometrium, gravid uterus (a morph target), vulva,
 *   female urethra, ovarian vessels; scrotum, urethra segments, ejaculatory ducts, bulbourethral
 *   glands, the corpora cavernosa split at the septum, the deep arteries of the penis.
 *
 * Writes the two GLBs, src/repro/generated/female.json, male.json and provenance.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import {
  THREE, V, r6, arr, weld, smoothNormals, simplify, mergePieces, taubin, smoothSmall, bboxOf, centroid, bvhOf, insideMesh,
  insidePct, pca, horn, closeLoops, cutMesh, pushOut, nearestVertex, extreme, polyLength, chaikin, resample, lineAlong, endsOf,
  trace, geodesic, truncateNear, nearestOn, lowest, highest, ellipsoid, tube, icosphere, sampledVolumeMl, ray,
} from './mesh-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [femaleDir, humanDir] = process.argv.slice(2);
if (!femaleDir || !humanDir) {
  console.error('Usage: node tools/extract-reproductive.mjs <female-atlas public/models dir> <human-atlas public/models dir>');
  process.exit(2);
}
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const spec = JSON.parse(fs.readFileSync(path.join(root, 'src/repro/source/structures.source.json'), 'utf8'));
const SHIFT = spec.unitedYShift;
const MAX_ERROR = 0.004;
const X = V([1, 0, 0]), Y = V([0, 1, 0]), Z = V([0, 0, 1]);

// ── Sources ────────────────────────────────────────────────────────────────
function atlasReader(dir) {
  const bytes = fs.readFileSync(path.join(dir, 'atlas.json'));
  const atlas = JSON.parse(bytes.toString('utf8'));
  const cache = new Map(), hashes = {};
  const chunk = (i) => {
    if (!cache.has(i)) {
      const file = path.join(dir, atlas.chunks[i].url.split('/').pop());
      const buf = fs.readFileSync(file);
      cache.set(i, buf);
      hashes[path.basename(file)] = sha256(buf);
    }
    return cache.get(i);
  };
  const read = (part) => {
    const b = chunk(part.chunk);
    return {
      positions: new Float32Array(b.buffer.slice(b.byteOffset + part.positions, b.byteOffset + part.positions + part.vertexCount * 12)),
      indices: new Uint32Array(b.buffer.slice(b.byteOffset + part.indices, b.byteOffset + part.indices + part.indexCount * 4)),
    };
  };
  return { bytes, atlas, byId: new Map(atlas.parts.map((p) => [p.id, p])), read, hashes };
}
const female = atlasReader(femaleDir);
const human = atlasReader(humanDir);
function readUnited(id) {
  const part = female.byId.get(id);
  if (!part) throw new Error(`united body: part "${id}" missing`);
  const raw = female.read(part);
  for (let i = 1; i < raw.positions.length; i += 3) raw.positions[i] -= SHIFT;
  return raw;
}
/** BodyParts3D parts by id, or every part with a given name ("name:…"). */
function bp3dIds(ref) {
  if (!ref.startsWith('name:')) return [ref];
  const ids = human.atlas.parts.filter((p) => p.name === ref.slice(5)).map((p) => p.id);
  if (!ids.length) throw new Error(`BodyParts3D: no part named "${ref.slice(5)}"`);
  return ids;
}
function readBp3d(id) {
  const part = human.byId.get(id);
  if (!part) throw new Error(`BodyParts3D: part "${id}" missing`);
  return { ...human.read(part), part };
}

// ── Similarity fits (female): BodyParts3D onto the HRA body ───────────────
const unitedRef = (refs) => mergePieces(refs.map(readUnited));
function fitSimilarity(name, f) {
  const reg = f.pairs.map(([bp, refs]) => ({ bp, name: human.byId.get(bp).name, src: centroid(readBp3d(bp).positions), dst: centroid(unitedRef(refs).positions) }));
  for (const r of reg) if (Math.abs(r.src[0]) > 0.01 && Math.sign(r.src[0]) !== Math.sign(r.dst[0])) throw new Error(`registration ${name}: ${r.bp} lies on opposite sides`);
  let fit = horn(reg.map((r) => r.src), reg.map((r) => r.dst), reg.map(() => 1));
  let surfaceRmsMm = null;
  if (f.icp) {
    // Iterative closest point from the landmark fit, with its scale kept (free-scale ICP shrinks).
    const src = mergePieces(f.icp.bp3d.map((id) => readBp3d(id))).positions;
    const target = unitedRef(f.icp.united), tb = bvhOf(target);
    const pts = []; for (let i = 0; i < src.length; i += 6) pts.push([src[i], src[i + 1], src[i + 2]]);
    const hit = {}, q = new THREE.Vector3(), scale = fit.scale;
    for (let it = 0; it < 30; it++) {
      const pairs = pts.map((p) => { q.set(...fit.place(...p)); tb.closestPointToPoint(q, hit); return { p, d: hit.point.toArray(), dist: hit.distance }; });
      const sorted = pairs.map((x) => x.dist).sort((x, y) => x - y);
      const cut = sorted[Math.floor(sorted.length / 2)] * 3 + 1e-4;
      const kept = pairs.filter((x) => x.dist <= cut);
      fit = horn(kept.map((x) => x.p), kept.map((x) => x.d), kept.map(() => 1), scale);
    }
    let s2 = 0; for (const p of pts) { q.set(...fit.place(...p)); tb.closestPointToPoint(q, hit); s2 += hit.distance ** 2; }
    f.rigidSurfaceRmsMm = r6(Math.sqrt(s2 / pts.length) * 1000);
    if (f.icp.warp) {
      // A male pelvis does not fit a female one rigidly (hers is wider and shallower), so a smooth
      // warp follows: displacements from the placed BodyParts3D bone surface to the nearest HRA bone
      // surface, smoothed between neighbours and spread by a Gaussian kernel (σ = warp mm).
      const sim = fit.place, sigma = f.icp.warp / 1000;
      const samples = [];
      for (let k = 0; k < pts.length; k += Math.max(1, Math.floor(pts.length / 900))) { q.set(...sim(...pts[k])); tb.closestPointToPoint(q, hit); samples.push({ q: q.clone(), d: hit.point.clone().sub(q) }); }
      const smooth = samples.map((s) => { const acc = new THREE.Vector3(); let ws = 0; for (const t of samples) { const w = Math.exp(-s.q.distanceToSquared(t.q) / (2 * 0.012 ** 2)); acc.addScaledVector(t.d, w); ws += w; } return { q: s.q, d: acc.divideScalar(ws) }; });
      const p3 = new THREE.Vector3(), acc = new THREE.Vector3();
      const warp = (x, y, z) => {
        const [a, b, c] = sim(x, y, z); p3.set(a, b, c); acc.set(0, 0, 0); let ws = 0;
        for (const s of smooth) { const w = Math.exp(-p3.distanceToSquared(s.q) / (2 * sigma * sigma)); acc.addScaledVector(s.d, w); ws += w; }
        return [a + acc.x / Math.max(ws, 1), b + acc.y / Math.max(ws, 1), c + acc.z / Math.max(ws, 1)];
      };
      fit = { ...fit, place: warp };
      let w2 = 0; for (const p of pts) { q.set(...warp(...p)); tb.closestPointToPoint(q, hit); w2 += hit.distance ** 2; }
      f.warpSamples = smooth.length;
      s2 = w2;
    }
    surfaceRmsMm = r6(Math.sqrt(s2 / pts.length) * 1000);
  }
  const residuals = reg.map((r) => ({ landmark: `${r.bp} ${r.name}`, mm: r6(Math.hypot(...fit.place(...r.src).map((q, a) => q - r.dst[a])) * 1000) }));
  const rms = Math.sqrt(residuals.reduce((q, r) => q + r.mm ** 2, 0) / residuals.length);
  const rotationDeg = r6((2 * Math.acos(Math.min(1, Math.abs(fit.quat.w))) * 180) / Math.PI);
  return { place: fit.place, scale: r6(fit.scale), rotationDeg, rmsResidualMm: r6(rms), surfaceRmsMm, rigidSurfaceRmsMm: f.rigidSurfaceRmsMm ?? null, warpSamples: f.warpSamples ?? null, residuals };
}
const fits = Object.fromEntries(Object.entries(spec.registration.fits).map(([name, f]) => [name, fitSimilarity(name, f)]));
for (const [name, f] of Object.entries(fits)) {
  const value = f.surfaceRmsMm ?? f.rmsResidualMm;
  if (value > spec.registration.fits[name].maxRmsMm) throw new Error(`Registration "${name}" too poor: ${value} mm\n${JSON.stringify(f.residuals)}`);
}

// ── A body: its scanned meshes, centred ────────────────────────────────────
function makeBody(body) {
  const specs = spec.structures.filter((s) => s.body === body);
  const ctx = { body, specs, meshes: [], byId: new Map(), used: new Set(), sourceTriangles: 0, maxError: 0, bp3dParts: {}, overlap: { before: {}, after: {} }, generatedNotes: {} };
  // The origin: the middle of the pelvic organs (x on the midline).
  const centreIds = body === 'female' ? ['VH_F_anterior_wall_of_uterus', 'VH_F_posterior_wall_of_uterus', 'VH_F_vagina', 'VH_F_left_ovary', 'VH_F_right_ovary'] : ['FJ3149', 'FJ3139', 'FJ3138', 'FJ3142'];
  const raw0 = body === 'female' ? unitedRef(centreIds) : mergePieces(centreIds.map((id) => readBp3d(id)));
  const [lo, hi] = bboxOf(raw0.positions);
  ctx.centre = [0, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const centred = (p) => { const q = Float32Array.from(p); for (let i = 0; i < q.length; i += 3) for (let a = 0; a < 3; a++) q[i + a] -= ctx.centre[a]; return q; };
  const placeBp3d = (id, fit) => {
    const raw = readBp3d(id);
    let pos = raw.positions;
    if (fit) { pos = new Float32Array(raw.positions.length); for (let i = 0; i < pos.length; i += 3) pos.set(fits[fit].place(raw.positions[i], raw.positions[i + 1], raw.positions[i + 2]), i); }
    return { ...weld(centred(pos), raw.indices), raw };
  };
  for (const s of specs) {
    if (s.generated) continue;
    let pieces;
    if (s.bp3d) {
      pieces = s.bp3d.flatMap(bp3dIds).map((id) => {
        const w = placeBp3d(id, s.fit);
        ctx.bp3dParts[s.id] = [...(ctx.bp3dParts[s.id] ?? []), `${id} ${w.raw.part.name}`];
        ctx.sourceTriangles += w.raw.indices.length / 3;
        const hard = s.layer === 'bone' || s.layer === 'skeleton';
        const piece = hard ? { positions: w.positions, indices: w.indices } : smoothSmall(w, 400);
        if (!s.simplify) return piece;
        const sm = simplify(piece.positions, piece.indices, s.simplify, s.maxError ?? 0.01);
        ctx.maxError = Math.max(ctx.maxError, sm.error);
        return sm;
      });
    } else {
      pieces = s.united.map((id) => {
        if (ctx.used.has(id)) throw new Error(`${id} used twice`);
        ctx.used.add(id);
        const raw = readUnited(id);
        for (const v of raw.positions) if (!Number.isFinite(v)) throw new Error('non-finite position');
        for (const i of raw.indices) if (i >= raw.positions.length / 3) throw new Error('index out of range');
        ctx.sourceTriangles += raw.indices.length / 3;
        const w = weld(centred(raw.positions), raw.indices);
        if (s.smooth) return smoothSmall(w);
        const sm = simplify(w.positions, w.indices, s.simplify ?? 0.5, s.maxError ?? MAX_ERROR);
        ctx.maxError = Math.max(ctx.maxError, sm.error);
        return sm;
      });
    }
    const m = { structure: s, ...mergePieces(pieces) };
    ctx.meshes.push(m); ctx.byId.set(s.id, m);
  }
  // Placed BodyParts3D soft parts are pushed out of the HRA organs they overlap.
  for (const m of ctx.meshes) {
    const targets = m.structure.mould;
    if (!targets) continue;
    const bvh = bvhOf(mergePieces(targets.map((id) => ctx.byId.get(id))));
    ctx.overlap.before[m.structure.id] = insidePct(m, bvh);
    if (ctx.overlap.before[m.structure.id] > 0) pushOut(m, bvh, 0.0008);
    ctx.overlap.after[m.structure.id] = insidePct(m, bvh);
  }
  ctx.get = (id) => { const m = ctx.byId.get(id); if (!m) throw new Error(`${body}: no structure ${id}`); return m; };
  ctx.cen = (id) => V(centroid(ctx.get(id).positions));
  ctx.add = (id, m, morph = null) => {
    const s = specs.find((x) => x.id === id);
    if (!s) throw new Error(`${body}: generated ${id} not in the spec`);
    const mesh = { structure: s, positions: m.positions, indices: m.indices, morph };
    ctx.meshes.push(mesh); ctx.byId.set(id, mesh);
    return mesh;
  };
  ctx.seg = {}; ctx.offModel = {}; ctx.measures = {}; ctx.anchors = {};
  return ctx;
}

const ensureAnterior = (w, ref = Z) => (w.dot(ref) < 0 ? w.negate() : w);
const frame = (u, hint) => { const v = hint.clone().addScaledVector(u, -hint.dot(u)).normalize(); const w = new THREE.Vector3().crossVectors(u, v).normalize(); return { u, v, w }; };
/** Vessels and ducts: rings every 2.5 mm (finer for short ones). */
const tubeOf = (pts, r0, r1 = r0, rad = 12) => tube(pts, (t) => r0 + (r1 - r0) * t, rad, 1, polyLength(pts) > 0.06 ? 0.0025 : 0.0012);

// ═══ Female ══════════════════════════════════════════════════════════════
const F = makeBody('female');
{
  const { get, cen, add, seg, offModel, anchors } = F;
  // ── Uterine frame: internal os → fundus (u), right → left cornu (v), back → front (w) ──
  const io = cen('internal-os');
  const cornua = get('uterine-cornua');
  const ostL = extreme(cornua, X), ostR = extreme(cornua, X.clone().negate());
  const fundusTop = cen('uterine-fundus');
  const u = fundusTop.clone().sub(io).normalize();
  const { v, w } = frame(u, ostL.clone().sub(ostR));
  ensureAnterior(w);
  const walls = mergePieces([get('uterine-wall-anterior'), get('uterine-wall-posterior')]);
  const fundusHigh = extreme(mergePieces([walls, get('uterine-fundus')]), u);
  const lengthToTop = fundusHigh.clone().sub(io).dot(u);
  // The cavity lies where the two walls meet: its plane offset along w from their contact zone.
  const pb = bvhOf(get('uterine-wall-posterior')), hit = {};
  const contact = [];
  { const a = get('uterine-wall-anterior').positions, q = new THREE.Vector3(); for (let i = 0; i < a.length; i += 3) { q.set(a[i], a[i + 1], a[i + 2]); pb.closestPointToPoint(q, hit); if (hit.distance < 0.0012) contact.push(q.clone()); } }
  const rel = (p) => p.clone().sub(io);
  const w0 = contact.length > 20 ? contact.reduce((s, p) => s + rel(p).dot(w), 0) / contact.length : 0;
  const t0 = (rel(ostL).dot(v) + rel(ostR).dot(v)) / 2;
  const cavityTop = lengthToTop - 0.009; // the fundal myometrium is about 9 mm thick
  const halfTop = Math.min(0.016, Math.abs(rel(ostL).dot(v) - rel(ostR).dot(v)) * 0.32);
  anchors.uterus = { io: arr([io])[0], u: arr([u])[0], v: arr([v])[0], w: arr([w])[0], ostiumLeft: arr([ostL])[0], ostiumRight: arr([ostR])[0], cavityPlaneMm: r6(w0 * 1000), contactPoints: contact.length, cavityLengthMm: r6(cavityTop * 1000), cavityHalfWidthMm: r6(halfTop * 1000) };
  const cav = (s, t, d) => io.clone().addScaledVector(u, s).addScaledVector(v, t0 + t).addScaledVector(w, w0 + d);
  // ── Endometrium (modelled): a lens in the cavity plane, an inverted triangle; thickness by morph ──
  {
    const NS = 30, NT = 24, base = [], target = [];
    const T0 = 0.0005, T1 = 0.007; // half thickness: about 1 mm at menses, 14 mm late in the luteal phase
    for (let i = 0; i <= NS; i++) {
      const s = i / NS, len = cavityTop * (0.2 + 0.8 * s); // the lowest few mm (the isthmus) narrow into the cervical canal
      const round = s > 0.9 ? Math.sqrt(Math.max(0.05, 1 - ((s - 0.9) / 0.1) ** 2)) : 1;
      const h = halfTop * (0.1 + 0.9 * s ** 0.85) * round;
      const taper = (0.35 + 0.65 * Math.sin((Math.PI / 2) * Math.min(1, s * 1.25))) * round;
      for (let j = 0; j < NT; j++) {
        const th = (j / NT) * Math.PI * 2, sn = Math.sin(th);
        const b = cav(len, h * Math.cos(th), T0 * sn * taper);
        const t = cav(len, h * Math.cos(th), T1 * sn * taper);
        base.push(b.x, b.y, b.z); target.push(t.x - b.x, t.y - b.y, t.z - b.z);
      }
    }
    const idx = [];
    for (let i = 0; i < NS; i++) for (let j = 0; j < NT; j++) { const a = i * NT + j, b = i * NT + ((j + 1) % NT), c = (i + 1) * NT + j, d = (i + 1) * NT + ((j + 1) % NT); idx.push(a, c, b, b, c, d); }
    const closed = closeLoops(Float32Array.from(base), Uint32Array.from(idx));
    const nAdded = closed.positions.length - base.length;
    const delta = Float32Array.from([...target, ...new Array(nAdded).fill(0)]);
    add('endometrium', closed, { name: 'luteal', delta });
  }
  // ── Gravid uterus (modelled): the real uterus wrapped, with a morph target to its term size ──
  const wrap = mergePieces([walls, get('uterine-fundus'), get('uterine-body'), get('lower-uterine-segment')]);
  const wb = bvhOf(wrap);
  const C0 = V(centroid(walls.positions));
  const sph = icosphere(4), n = sph.positions.length / 3;
  const base = new Float32Array(sph.positions.length), missing = new Set();
  for (let k = 0; k < n; k++) {
    const d = V([sph.positions[k * 3], sph.positions[k * 3 + 1], sph.positions[k * 3 + 2]]);
    ray.origin.copy(C0); ray.direction.copy(d);
    const hits = wb.raycast(ray, THREE.DoubleSide);
    const far = hits.reduce((m, h) => Math.max(m, h.distance), 0);
    if (!far || far > 0.06) missing.add(k);
    const p = C0.clone().addScaledVector(d, far || 0.015);
    base.set([p.x, p.y, p.z], k * 3);
  }
  { // fill rays that missed (through the os) from their neighbours
    const nb = Array.from({ length: n }, () => new Set());
    for (let t = 0; t < sph.indices.length; t += 3) { const [a, b, c] = [sph.indices[t], sph.indices[t + 1], sph.indices[t + 2]]; nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
    for (let pass = 0; pass < 12; pass++) for (const k of missing) {
      const good = [...nb[k]].filter((q) => !missing.has(q)); if (!good.length) continue;
      const r = good.reduce((s, q) => s + V([base[q * 3], base[q * 3 + 1], base[q * 3 + 2]]).distanceTo(C0), 0) / good.length;
      const d = V([sph.positions[k * 3], sph.positions[k * 3 + 1], sph.positions[k * 3 + 2]]);
      base.set(C0.clone().addScaledVector(d, r).toArray(), k * 3);
    }
  }
  const baseMesh = { positions: base, indices: sph.indices };
  taubin(baseMesh.positions, baseMesh.indices, 4);
  // Term: lower pole at the internal os, fundus just below the xiphoid (it drops from about 36
  // weeks), the back on the spine, about 33 × 25 × 22 cm (Williams Obstetrics).
  const xiphoid = lowest(get('sternum'));
  const spine = get('lumbar-spine');
  const l3y = cen('lumbar-spine').y;
  let spineFront = -Infinity; for (let i = 0; i < spine.positions.length; i += 3) if (Math.abs(spine.positions[i + 1] - l3y) < 0.02 && Math.abs(spine.positions[i]) < 0.02) spineFront = Math.max(spineFront, spine.positions[i + 2]);
  const AP = 0.11, TR = 0.125;
  // Fundal height at 40 weeks about 33 cm above the symphysis (it drops from the xiphoid after 36 weeks).
  const hipB = mergePieces([get('hip-bone-left'), get('hip-bone-right')]);
  let symY = -Infinity; for (let i = 0; i < hipB.positions.length; i += 3) if (Math.abs(hipB.positions[i]) < 0.008) symY = Math.max(symY, hipB.positions[i + 1]);
  const P1 = V([0, Math.min(xiphoid.y - 0.03, symY + 0.33), spineFront + 0.035 + AP * 1.15]);
  const ut = P1.clone().sub(io).normalize();
  const ft = frame(ut, X); ensureAnterior(ft.w);
  const halfLen = P1.distanceTo(io) / 2, Ct = io.clone().lerp(P1, 0.5);
  const termOf = (d) => {
    const du = d.dot(u), dv = d.dot(v), dw = d.dot(w);
    const lat = (1 + 0.08 * du) * (du < -0.6 ? 0.75 + 0.25 * Math.cos(((du + 0.6) / 0.4) * (Math.PI / 2)) : 1);
    return Ct.clone().addScaledVector(ut, halfLen * du).addScaledVector(ft.v, TR * dv * lat).addScaledVector(ft.w, AP * dw * lat);
  };
  const delta = new Float32Array(base.length);
  for (let k = 0; k < n; k++) {
    const d = V([sph.positions[k * 3], sph.positions[k * 3 + 1], sph.positions[k * 3 + 2]]);
    const t = termOf(d);
    delta.set([t.x - base[k * 3], t.y - base[k * 3 + 1], t.z - base[k * 3 + 2]], k * 3);
  }
  add('gravid-uterus', baseMesh, { name: 'term', delta });
  const nearestK = (p) => { let b = 0, bd = Infinity; for (let k = 0; k < n; k++) { const d = (base[k * 3] - p.x) ** 2 + (base[k * 3 + 1] - p.y) ** 2 + (base[k * 3 + 2] - p.z) ** 2; if (d < bd) { bd = d; b = k; } } return b; };
  const shiftAt = (p) => { const k = nearestK(p); return V([delta[k * 3], delta[k * 3 + 1], delta[k * 3 + 2]]); };
  // The placenta set (HRA, full term) on the inner posterior wall of the term uterus, fetal side facing in.
  // The site: the term surface point straight behind and a little above the term centre (in body
  // axes: the posterior wall, its commonest site), the disc facing forward into the cavity.
  const site = Z.clone().multiplyScalar(-0.95).addScaledVector(Y, 0.3).normalize();
  let kSite = 0, best = -Infinity;
  for (let k = 0; k < n; k++) { const t = V([base[k * 3] + delta[k * 3], base[k * 3 + 1] + delta[k * 3 + 1], base[k * 3 + 2] + delta[k * 3 + 2]]); const a = t.sub(Ct).normalize().dot(site); if (a > best) { best = a; kSite = k; } }
  const Pw = V([base[kSite * 3] + delta[kSite * 3], base[kSite * 3 + 1] + delta[kSite * 3 + 1], base[kSite * 3 + 2] + delta[kSite * 3 + 2]]), nIn = site.clone().negate();
  const plIds = F.specs.filter((s) => s.placenta).map((s) => s.id);
  const Cb = cen('placenta-basal-plate'), nf = cen('placenta-chorionic-plate').sub(Cb).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(nf, nIn);
  const tmp = new THREE.Vector3();
  for (const id of plIds) { const m = get(id); for (let i = 0; i < m.positions.length; i += 3) { tmp.set(m.positions[i] - Cb.x, m.positions[i + 1] - Cb.y, m.positions[i + 2] - Cb.z).applyQuaternion(q).multiplyScalar(0.9).add(Pw).addScaledVector(nIn, 0.03); m.positions.set([tmp.x, tmp.y, tmp.z], i); } }
  const kPl = kSite;
  const cordFree = extreme(mergePieces([get('umbilical-cord')]), nIn);
  anchors.pregnancy = {
    termAnchor: arr([Pw])[0], baseAnchor: arr([V([base[kPl * 3], base[kPl * 3 + 1], base[kPl * 3 + 2]])])[0], inward: arr([nIn])[0],
    cordFreeEnd: arr([cordFree])[0], termCentre: arr([Ct])[0], termAxis: arr([ut])[0], termLateral: arr([ft.v])[0], termAnterior: arr([ft.w])[0],
    termHalfLengthMm: r6(halfLen * 1000), termRadiiMm: [r6(TR * 1000), r6(AP * 1000)], baseCentre: arr([C0])[0],
    cornuShiftLeft: arr([shiftAt(ostL)])[0], cornuShiftRight: arr([shiftAt(ostR)])[0], fundusTerm: arr([P1])[0], xiphoid: arr([xiphoid])[0],
  };
  // ── Pelvic landmarks: symphysis, sacral promontory, introitus ──
  const hipBones = mergePieces([get('hip-bone-left'), get('hip-bone-right')]);
  const sym = []; for (let i = 0; i < hipBones.positions.length; i += 3) if (Math.abs(hipBones.positions[i]) < 0.008) sym.push(V([hipBones.positions[i], hipBones.positions[i + 1], hipBones.positions[i + 2]]));
  const symTop = sym.reduce((b, p) => (p.y > b.y ? p : b)), symBottom = sym.reduce((b, p) => (p.y < b.y ? p : b));
  const sac = get('sacrum');
  // The promontory: the front edge of the top of the sacrum (the most anterior midline point in its top 15 mm).
  const sacTop = highest(sac).y;
  const promontory = (() => { let b = null; for (let i = 0; i < sac.positions.length; i += 3) { const p = V([sac.positions[i], sac.positions[i + 1], sac.positions[i + 2]]); if (Math.abs(p.x) > 0.01 || p.y < sacTop - 0.015) continue; if (!b || p.z > b.z) b = p; } return b; })();
  const vag = get('vagina'), vagLow = lowest(vag);
  const intro = (() => { const a = []; for (let i = 0; i < vag.positions.length; i += 3) if (vag.positions[i + 1] < vagLow.y + 0.005) a.push(V([vag.positions[i], vag.positions[i + 1], vag.positions[i + 2]])); return a.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(a.length); })();
  const aHat = symBottom.clone().sub(intro).normalize(); // from the vaginal opening towards the symphysis
  let nOut = new THREE.Vector3().crossVectors(X, aHat).normalize(); if (nOut.dot(intro.clone().sub(io)) < 0) nOut.negate();
  anchors.pelvis = { symphysisTop: arr([symTop])[0], symphysisBottom: arr([symBottom])[0], promontory: arr([promontory])[0], introitus: arr([intro])[0] };
  // ── Vulva (modelled) on the vaginal opening and the pubic arch ──
  const at = (a, n, x) => intro.clone().addScaledVector(aHat, a).addScaledVector(nOut, n).addScaledVector(X, x);
  const glans = at(0.04, 0.004, 0);
  const root = symBottom.clone().addScaledVector(nOut, 0.001).addScaledVector(aHat, -0.006);
  add('clitoral-glans', ellipsoid(glans, [aHat, nOut, X], [0.0035, 0.003, 0.0032], 18, 12));
  add('clitoral-body', tubeOf(chaikin([glans, glans.clone().lerp(root, 0.5).addScaledVector(nOut, -0.003), root], 2), 0.0028, 0.0034));
  for (const [side, sx] of [['left', 1], ['right', -1]]) {
    const cand = []; const hb = get(`hip-bone-${side}`);
    const want = root.clone().addScaledVector(X, sx * 0.03).addScaledVector(aHat, -0.045);
    const end = nearestVertex(hb, want).addScaledVector(X, -sx * 0.004).addScaledVector(nOut, 0.002);
    add(`clitoral-crus-${side}`, tubeOf(chaikin([root, root.clone().lerp(end, 0.45).addScaledVector(X, sx * 0.004), end], 2), 0.0035, 0.0018));
    add(`vestibular-bulb-${side}`, ellipsoid(at(0.006, -0.006, sx * 0.012), [aHat, nOut, X], [0.016, 0.006, 0.0045], 22, 14));
    add(`vestibular-gland-${side}`, ellipsoid(at(-0.012, -0.006, sx * 0.011), [aHat, nOut, X], [0.005, 0.004, 0.003], 16, 10));
    add(`labium-minus-${side}`, ellipsoid(at(0.008, 0.004, sx * 0.0075), [aHat, nOut, X], [0.021, 0.006, 0.0016], 24, 14));
    add(`labium-majus-${side}`, ellipsoid(at(0.014, 0.001, sx * 0.019), [aHat, nOut, X], [0.035, 0.01, 0.0075], 26, 16));
    cand.length = 0;
  }
  F.generatedNotes.vulva = 'Modelled to textbook sizes on the HRA vaginal opening and pubic arch: clitoris (glans, body and crura along the ischiopubic rami), vestibular bulbs, greater vestibular glands, labia minora and majora.';
  // ── Female urethra (modelled): bladder neck to the external urethral orifice, about 4 cm ──
  const neck = lowest(get('bladder-neck'));
  const meatus = at(0.022, 0.001, 0);
  const urethraPts = chaikin([neck, neck.clone().lerp(meatus, 0.5).addScaledVector(Z, 0.003), meatus], 2);
  add('urethra', tubeOf(urethraPts, 0.003, 0.0025));
  // ── Ovarian vessels (modelled): aorta below the renal arteries → suspensory ligament → ovary ──
  const aorta = get('abdominal-aorta'), [aoTop, aoBottom] = endsOf(aorta, V([0, 1, 0]).add(cen('abdominal-aorta')));
  const aoLine = lineAlong(aorta, aoTop, aoBottom, 20);
  const ivc = get('inferior-vena-cava'), [ivcTop, ivcBottom] = endsOf(ivc, V([0, 1, 0]).add(cen('inferior-vena-cava')));
  const ivcLine = lineAlong(ivc, ivcBottom, ivcTop, 24);
  const ovPaths = {};
  for (const [side, sx] of [['left', 1], ['right', -1]]) {
    const ov = get(`ovary-${side}`), hilum = nearestVertex(ov, cen(`mesovarium-${side}`));
    const lig = cen(`suspensory-ligament-${side}`);
    const origin = nearestOn(aoLine, V([0, cen('renal-artery-left').y - 0.03, 0]));
    const brim = V([sx * 0.05, lig.y + 0.045, lig.z + 0.012]);
    const art = chaikin([origin, origin.clone().add(V([sx * 0.02, -0.03, 0.002])), brim, lig, hilum], 2);
    add(`ovarian-artery-${side}`, tubeOf(art, 0.0014));
    const back = art.slice().reverse().map((p) => p.clone().add(V([sx * 0.005, 0, 0.004])));
    let end;
    if (side === 'left') { const lrv = get('renal-vein-left'); end = nearestVertex(lrv, V([0.035, cen('renal-vein-left').y, cen('renal-vein-left').z])); }
    else end = nearestOn(ivcLine, back[back.length - 1].clone().add(V([0, 0.03, 0])));
    const vein = chaikin([...back.slice(0, -3), end], 1);
    add(`ovarian-vein-${side}`, tubeOf(vein, 0.0022));
    ovPaths[side] = { art, vein };
  }
  F.generatedNotes['ovarian-vessels'] = 'Modelled: neither body has the ovarian artery and vein; they run from the aorta (the left vein to the left renal vein, the right to the vena cava) down the back wall and through the suspensory ligament to the ovary.';
  // ── Routes ──
  const resampleLine = (pts) => resample(chaikin(pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 1e-5), 1), 0.0015);
  const eo = cen('external-os');
  const vagLine = trace(vag, intro, eo.clone().sub(intro), { radius: 0.014, step: 0.003, stopAt: eo });
  const canal = [eo, eo.clone().lerp(io, 0.5), io];
  for (const [side, sx] of [['left', 1], ['right', -1]]) {
    const ost = side === 'left' ? ostL : ostR;
    const isth = get(`tube-isthmus-${side}`), amp = get(`tube-ampulla-${side}`), inf = get(`tube-infundibulum-${side}`), fim = get(`tube-fimbriae-${side}`);
    const iStart = nearestVertex(isth, ost);
    const iLine = trace(isth, iStart, cen(`tube-isthmus-${side}`).sub(iStart), { radius: 0.004, step: 0.0015 });
    const aStart = nearestVertex(amp, iLine[iLine.length - 1]);
    const aLine = trace(amp, aStart, cen(`tube-ampulla-${side}`).sub(aStart), { radius: 0.008, step: 0.002 });
    const ampMid = aLine[Math.floor(aLine.length * 0.6)] ?? cen(`tube-ampulla-${side}`);
    const cavity = [io, cav(cavityTop * 0.55, 0, 0), cav(cavityTop * 0.85, sx * halfTop * 0.7, 0), ost];
    const toAmpulla = [...cavity, ...iLine, ...truncateNear(aLine, ampMid)];
    seg[`sperm-${side}`] = [...vagLine, ...canal.slice(1), ...toAmpulla.slice(1)];
    const ovary = get(`ovary-${side}`);
    const follicle = extreme(ovary, cen(`tube-fimbriae-${side}`).sub(cen(`ovary-${side}`)).normalize());
    anchors[`follicle-${side}`] = arr([follicle])[0];
    seg[`egg-${side}`] = [follicle, cen(`tube-fimbriae-${side}`), cen(`tube-infundibulum-${side}`), ...aLine.slice().reverse().filter((p, i, a) => i >= a.length - Math.ceil(a.length * 0.45))];
    const implant = cav(cavityTop * 0.72, -sx * halfTop * 0.15, -0.002);
    seg[`embryo-${side}`] = [...truncateNear(aLine, ampMid).reverse(), ...iLine.slice().reverse(), ost, implant];
    anchors.implantation = arr([implant])[0];
    seg[`ovarian-artery-${side}`] = [...truncateNear(aoLine, ovPaths[side].art[0]), ...ovPaths[side].art.slice(1)];
    seg[`ovarian-vein-${side}`] = [...ovPaths[side].vein, ...(side === 'right' ? ivcLine.slice(ivcLine.indexOf(nearestOn(ivcLine, ovPaths[side].vein[ovPaths[side].vein.length - 1]))) : ivcLine.slice(ivcLine.indexOf(nearestOn(ivcLine, cen('renal-vein-left')))))];
    // Uterine artery: aorta → common iliac → internal iliac → uterine artery → the side of the uterus.
    const cia = get(`common-iliac-artery-${side}`), iia = get(`internal-iliac-artery-${side}`), ua = get(`uterine-artery-${side}`);
    const [ciaTop, ciaBottom] = endsOf(cia, aoBottom);
    const [iiaTop, iiaBottom] = endsOf(iia, ciaBottom);
    const [uaOut, uaIn] = endsOf(ua, iiaBottom);
    seg[`uterine-artery-${side}`] = [...aoLine, ...lineAlong(cia, ciaTop, ciaBottom, 8), ...lineAlong(iia, iiaTop, iiaBottom, 6), ...lineAlong(ua, uaOut, uaIn, 8), io.clone().lerp(cen('uterine-body'), 0.5).addScaledVector(v, sx * 0.012)];
    offModel[`uterine-artery-${side}`] = 'The anterior division of the internal iliac artery between the BodyParts3D internal iliac and the HRA uterine artery is a short gap.';
  }
  seg.menses = [cav(cavityTop * 0.7, 0, 0), io, ...canal.slice().reverse().slice(1), ...vagLine.slice().reverse()];
  seg.urine = [neck, ...urethraPts.slice(1)];
  // Milk: from each breast's lobes along the ducts to the sinuses and the nipple.
  for (const [side] of [['left'], ['right']]) {
    const lobes = get(`mammary-lobes-${side}`), nip = get(`nipple-${side}`), sinus = cen(`lactiferous-sinuses-${side}`), ducts = get(`lactiferous-ducts-${side}`);
    const nipC = cen(`nipple-${side}`), out = nipC.clone().sub(cen(`mammary-lobes-${side}`)).normalize();
    const tip = extreme(nip, out);
    const p = pca(lobes.positions);
    for (let k = 0; k < 10; k++) {
      const ang = (k / 10) * Math.PI * 2;
      const dir = V(p.axes[0]).multiplyScalar(Math.cos(ang)).addScaledVector(V(p.axes[1]), Math.sin(ang));
      const lobe = extreme(lobes, dir).lerp(V(p.centre), 0.25);
      const mid = nearestVertex(ducts, lobe.clone().lerp(sinus, 0.5));
      seg[`milk-${side}-${k}`] = [lobe, mid, sinus, tip];
    }
  }
  // Birth: the fetal head's path down the pelvic axis (curve of Carus): inlet → mid-pelvis → outlet.
  {
    const inlet = promontory.clone().lerp(symTop, 0.5);
    const sacLow = (() => { let b = null; for (let i = 0; i < sac.positions.length; i += 3) { const p = V([sac.positions[i], sac.positions[i + 1], sac.positions[i + 2]]); if (Math.abs(p.x) > 0.012) continue; if (!b || p.y < b.y) b = p; } return b; })();
    const midPelvis = sacLow.clone().lerp(symBottom, 0.5);
    seg.birth = chaikin([io.clone().addScaledVector(u, 0.04), inlet, midPelvis, intro, intro.clone().addScaledVector(nOut, 0.05)], 2);
    anchors.pelvis.inlet = arr([inlet])[0]; anchors.pelvis.midPelvis = arr([midPelvis])[0];
  }
  for (const k of Object.keys(seg)) seg[k] = resampleLine(seg[k]);
  // ── Measurements ──
  const dims = (ids) => { const p = pca(mergePieces(ids.map(get)).positions); return p.extents.map((e) => r6(e * 1000)); };
  const fol = (side) => { const d = dims([`ovary-${side}`]); return { sizeMm: d, ellipsoidMl: r6((Math.PI / 6) * d[0] * d[1] * d[2] / 1000), sampledMl: sampledVolumeMl([get(`ovary-${side}`)], 0.0004) }; };
  const vertebra = (n) => V(centroid(readUnited(`VH_F_lumbar_vertebra_${n}`).positions)).y - F.centre[1];
  F.measures = {
    uterus: { sizeMm: dims(['uterine-wall-anterior', 'uterine-wall-posterior']), volumeMl: sampledVolumeMl([get('uterine-wall-anterior'), get('uterine-wall-posterior')], 0.0008), cavityLengthMm: r6(cavityTop * 1000), cavityWidthMm: r6(halfTop * 2000) },
    cervix: { lengthMm: r6(eo.distanceTo(io) * 1000), sizeMm: dims(['cervix']) },
    tubes: Object.fromEntries(['left', 'right'].map((s) => [s, { routeToAmpullaMm: r6(polyLength(seg[`sperm-${s}`]) * 1000 - polyLength(vagLine) * 1000), isthmusMm: dims([`tube-isthmus-${s}`])[0], ampullaMm: dims([`tube-ampulla-${s}`])[0] }])),
    ovary: { left: fol('left'), right: fol('right') },
    vagina: { lengthMm: r6(polyLength(vagLine) * 1000), sizeMm: dims(['vagina']) },
    pelvicInlet: { obstetricConjugateMm: r6(promontory.distanceTo(symTop) * 1000) },
    birthRouteMm: r6(polyLength(seg.birth) * 1000),
    termUterus: { lengthMm: r6(halfLen * 2000), widthMm: r6(TR * 2000), depthMm: r6(AP * 2000), fundusAboveSymphysisMm: r6((P1.y - symTop.y) * 1000) },
    placenta: { diameterMm: dims(['placenta-basal-plate'])[0] },
    urethraMm: r6(polyLength(urethraPts) * 1000),
    breast: { lobesSizeMm: dims(['mammary-lobes-left']) },
    levels: { umbilicusY: r6((vertebra(4) + vertebra(3)) / 2), symphysisTopY: r6(symTop.y), xiphoidY: r6(xiphoid.y) },
  };
  F.checks = {
    cervixBetweenBladderAndRectum: cen('urinary-bladder').z > cen('cervix').z && cen('rectum').z < cen('cervix').z,
    uterusAboveVagina: cen('uterine-body').y > cen('vagina').y,
    ovariesBesideUterus: cen('ovary-left').x > cen('uterine-body').x + 0.02 && cen('ovary-right').x < cen('uterine-body').x - 0.02,
    fimbriaeNearOvaries: ['left', 'right'].every((s) => cen(`tube-fimbriae-${s}`).distanceTo(cen(`ovary-${s}`)) < 0.035),
    breastsInFrontOfSpine: cen('mammary-lobes-left').z > cen('thoracic-spine').z + 0.08,
    vulvaBelowSymphysis: cen('clitoral-glans').y < symBottom.y && cen('labium-majus-left').y < symTop.y,
    vulvaSidesAboutTheOpening: ['labium-majus', 'labium-minus', 'clitoral-crus', 'vestibular-bulb', 'vestibular-gland'].every((k) => cen(`${k}-left`).x > intro.x && cen(`${k}-right`).x < intro.x),
    pelvicFloorBelowUterus: cen('levator-ani-left').y < cen('cervix').y,
    termFundusBelowXiphoid: P1.y < xiphoid.y,
    // The cavity is the gap where the walls meet, so the lining is checked against the uterus's outer envelope.
    endometriumInsideUterus: insidePct(get('endometrium'), bvhOf({ positions: Float32Array.from(get('gravid-uterus').positions), indices: get('gravid-uterus').indices })) > 90,
    routesContinuous: Object.values(seg).every((pts) => pts.every((p, i) => i === 0 || p.distanceTo(pts[i - 1]) < 0.012)),
  };
}

// ═══ Male ════════════════════════════════════════════════════════════════
const M = makeBody('male');
{
  const { get, cen, add, seg, offModel, anchors } = M;
  const prostate = get('prostate'), pb = bvhOf(prostate);
  const spongy = mergePieces([get('corpus-spongiosum'), get('glans-penis')]), sb = bvhOf(spongy);
  // ── Urethra (modelled on the BodyParts3D urethra's path): prostatic, membranous and spongy parts ──
  const ure = mergePieces(bp3dIds('FJ3148').map((id) => readBp3d(id))).positions;
  const ureC = { positions: Float32Array.from(ure), indices: readBp3d('FJ3148').indices };
  for (let i = 0; i < ureC.positions.length; i += 3) for (let a = 0; a < 3; a++) ureC.positions[i + a] -= M.centre[a];
  const bladderC = cen('urinary-bladder');
  const [uTop, uEnd] = endsOf(ureC, bladderC);
  let uLine = trace(ureC, uTop, cen('prostate').sub(uTop), { radius: 0.005, step: 0.002 });
  const glansTip = extreme(get('glans-penis'), cen('glans-penis').sub(cen('corpus-spongiosum')).normalize());
  if (uLine[uLine.length - 1].distanceTo(glansTip) > 0.015) uLine = [...uLine, ...chaikin([uLine[uLine.length - 1], uLine[uLine.length - 1].clone().lerp(glansTip, 0.5), glansTip], 1).slice(1)];
  uLine = resample(chaikin(uLine, 2), 0.0015);
  const part = uLine.map((p) => (insideMesh(pb, p.toArray()) ? 'prostatic' : insideMesh(sb, p.toArray()) ? 'spongy' : 'membranous'));
  // The membranous part is the run between the prostate and the bulb; anything before the prostate counts as prostatic.
  const firstP = part.indexOf('prostatic'), lastP = part.lastIndexOf('prostatic'), firstS = part.indexOf('spongy');
  const cut = (a, b) => uLine.slice(Math.max(0, a), Math.max(a + 2, b + 1));
  const runs = { prostatic: cut(0, lastP), membranous: cut(lastP, firstS), spongy: cut(firstS, uLine.length - 1) };
  add('prostatic-urethra', tubeOf(runs.prostatic, 0.0032, 0.003));
  add('membranous-urethra', tubeOf(runs.membranous, 0.002));
  add('spongy-urethra', tube(runs.spongy, (t) => (t > 0.9 ? 0.0028 + 0.0012 * Math.sin(((t - 0.9) / 0.1) * Math.PI) : t < 0.1 ? 0.0035 : 0.0026), 12));
  M.generatedNotes.urethra = 'Tubes on the path of the BodyParts3D urethra (too coarse to split), divided where it runs inside the prostate and the corpus spongiosum; widths after Gray’s Anatomy (prostatic about 6 mm, membranous 4 mm, spongy 5–6 mm with the navicular fossa).';
  // ── Ejaculatory ducts: deferent duct ampulla → seminal colliculus in the prostatic urethra ──
  const colliculus = runs.prostatic[Math.floor(runs.prostatic.length * 0.55)];
  anchors.colliculus = arr([colliculus])[0];
  const ducts = {};
  for (const [side, sx] of [['left', 1], ['right', -1]]) {
    const dd = get(`deferent-duct-${side}`), epi = get(`epididymis-${side}`);
    const epiTail = lowest(epi);
    // The duct loops from the tail of the epididymis up the spermatic cord, over the pelvic brim and down behind the bladder to the prostate.
    const ddLine = geodesic(dd, epiTail, cen('prostate'), 0.0025);
    if (!ddLine) throw new Error(`no path along deferent-duct-${side}`);
    const amp = ddLine[ddLine.length - 1];
    const ej = chaikin([amp, amp.clone().lerp(colliculus, 0.5).add(V([sx * 0.002, 0, -0.003])), colliculus], 2);
    add(`ejaculatory-duct-${side}`, tubeOf(ej, 0.0009, 0.0006));
    const head = highest(epi), testis = cen(`testis-${side}`);
    ducts[side] = { epi: [testis, head, cen(`epididymis-${side}`), epiTail], dd: ddLine, ej };
  }
  M.generatedNotes['ejaculatory-duct'] = 'Modelled tubes about 2 cm long from the end of each deferent duct, where the seminal vesicle duct joins it, through the prostate to the seminal colliculus.';
  // ── Bulbourethral glands: beside the membranous urethra ──
  const mm = runs.membranous[Math.floor(runs.membranous.length / 2)];
  for (const [side, sx] of [['left', 1], ['right', -1]]) add(`bulbourethral-gland-${side}`, ellipsoid(mm.clone().add(V([sx * 0.0055, -0.001, -0.004])), [X, Y, Z], [0.004, 0.0045, 0.004], 16, 10));
  // ── Corpora cavernosa: the BodyParts3D pair split at the septum ──
  const cc = mergePieces(bp3dIds('FJ3132').map((id) => readBp3d(id)));
  for (let i = 0; i < cc.positions.length; i += 3) for (let a = 0; a < 3; a++) cc.positions[i + a] -= M.centre[a];
  M.sourceTriangles += cc.indices.length / 3;
  M.bp3dParts['corpus-cavernosum-left/right'] = ['FJ3132 Corpus cavernosum of penis'];
  const mx = cen('corpus-spongiosum').x;
  for (const [side, sx] of [['left', 1], ['right', -1]]) {
    const half = cutMesh(cc, (c) => (c[0] - mx) * sx > 0);
    const m = add(`corpus-cavernosum-${side}`, smoothSmall(weld(half.positions, half.indices), 2000));
    // The deep artery runs along the middle of each corpus.
    const [distal, proximal] = endsOf(m, cen('glans-penis'));
    const line = trace(m, proximal, distal.clone().sub(proximal), { radius: 0.009, step: 0.003 });
    add(`deep-artery-of-penis-${side}`, tubeOf(line.length > 5 ? line : [proximal, distal], 0.0008, 0.0005));
    seg[`erection-${side}`] = line.length > 5 ? line : [proximal, distal];
  }
  M.generatedNotes.cavernosum = 'The BodyParts3D corpora cavernosa (one mesh) cut into left and right at the midline septum; each deep (cavernosal) artery modelled along the middle of its corpus.';
  // ── Scrotum (modelled): a sac about both testes and epididymides ──
  {
    const inside = mergePieces(['testis-left', 'testis-right', 'epididymis-left', 'epididymis-right'].map(get));
    const p = pca(inside.positions), [lo, hi] = bboxOf(inside.positions);
    const c = V(p.centre).add(V([0, -0.004, 0]));
    const s = ellipsoid(c, [X, Y, Z], [(hi[0] - lo[0]) / 2 + 0.01, (hi[1] - lo[1]) / 2 + 0.011, (hi[2] - lo[2]) / 2 + 0.009], 36, 24);
    for (let i = 0; i < s.positions.length; i += 3) { const dx = s.positions[i] - c.x; s.positions[i + 2] -= 0.003 * Math.exp(-((dx / 0.006) ** 2)) * Math.sign(s.positions[i + 2] - c.z); }
    add('scrotum', s);
    anchors.scrotum = { centre: arr([c])[0] };
  }
  // ── Routes ──
  const aorta = get('abdominal-aorta'), [aoTop, aoBottom] = endsOf(aorta, V([0, 1, 0]).add(cen('abdominal-aorta')));
  const aoLine = lineAlong(aorta, aoTop, aoBottom, 16);
  const ivc = get('inferior-vena-cava'), [ivcTop, ivcBottom] = endsOf(ivc, V([0, 1, 0]).add(cen('inferior-vena-cava')));
  const ivcLine = lineAlong(ivc, ivcBottom, ivcTop, 16);
  for (const [side, sx] of [['left', 1], ['right', -1]]) {
    const d = ducts[side];
    seg[`sperm-${side}`] = [...chaikin(d.epi, 2), ...d.dd, ...d.ej.slice(1), ...uLine.slice(uLine.indexOf(nearestOn(uLine, colliculus)) + 1)];
    seg[`seminal-${side}`] = [cen(`seminal-vesicle-${side}`), d.ej[0], ...d.ej.slice(1), ...uLine.slice(uLine.indexOf(nearestOn(uLine, colliculus)) + 1)];
    const ta = get(`testicular-artery-${side}`), taTop = highest(ta);
    const taLine = geodesic(ta, taTop, cen(`testis-${side}`), 0.0025);
    seg[`testicular-artery-${side}`] = [...truncateNear(aoLine, taTop), ...taLine, cen(`testis-${side}`)];
    offModel[`testicular-artery-${side}`] = 'The testicular artery leaves the aorta just below the renal arteries; the model starts at the top of the abdominal aorta in view.';
    const tv = get(`testicular-vein-${side}`);
    const up = geodesic(tv, cen(`testis-${side}`), highest(tv), 0.004);
    const end = up[up.length - 1];
    seg[`testicular-vein-${side}`] = [cen(`testis-${side}`), ...up, ...ivcLine.slice(ivcLine.indexOf(nearestOn(ivcLine, end)))];
    offModel[`testicular-vein-${side}`] = side === 'left' ? 'The left testicular vein drains into the left renal vein.' : 'The right testicular vein drains into the inferior vena cava.';
    // Blood to the penis: aorta → common iliac → internal iliac → (internal pudendal, not in the model) → deep artery.
    const cia = get(`common-iliac-artery-${side}`), iia = get(`internal-iliac-artery-${side}`);
    const [ciaTop, ciaBottom] = endsOf(cia, aoBottom), [iiaTop, iiaBottom] = endsOf(iia, ciaBottom);
    const crus = seg[`erection-${side}`][0];
    seg[`penile-artery-${side}`] = [...aoLine, ...lineAlong(cia, ciaTop, ciaBottom, 8), ...lineAlong(iia, iiaTop, iiaBottom, 6), ...chaikin([iiaBottom, iiaBottom.clone().lerp(crus, 0.5).add(V([sx * 0.02, -0.02, 0])), crus], 2).slice(1), ...seg[`erection-${side}`].slice(1)];
    offModel[`penile-artery-${side}`] = 'The internal pudendal artery (from the internal iliac, through the pudendal canal to the root of the penis) is not in the model.';
  }
  seg.urine = uLine;
  for (const k of Object.keys(seg)) seg[k] = resample(chaikin(seg[k].filter((p, i, a) => i === 0 || p.distanceTo(a[i - 1]) > 1e-5), 1), 0.0015);
  // ── Measurements ──
  const dims = (ids) => { const p = pca(mergePieces(ids.map(get)).positions); return p.extents.map((e) => r6(e * 1000)); };
  const testis = (s) => { const d = dims([`testis-${s}`]); return { sizeMm: d, lambertMl: r6((0.71 * d[0] * d[1] * d[2]) / 1000), sampledMl: sampledVolumeMl([get(`testis-${s}`)], 0.0005) }; };
  M.measures = {
    testis: { left: testis('left'), right: testis('right') },
    prostate: { sizeMm: dims(['prostate']), volumeMl: sampledVolumeMl([prostate], 0.0006) },
    seminalVesicle: { left: dims(['seminal-vesicle-left']), right: dims(['seminal-vesicle-right']) },
    urethraMm: { prostatic: r6(polyLength(runs.prostatic) * 1000), membranous: r6(polyLength(runs.membranous) * 1000), spongy: r6(polyLength(runs.spongy) * 1000) },
    spermRouteMm: { left: r6(polyLength(seg['sperm-left']) * 1000), right: r6(polyLength(seg['sperm-right']) * 1000) },
    deferentDuctMm: { left: r6(polyLength(ducts.left.dd) * 1000), right: r6(polyLength(ducts.right.dd) * 1000) },
    penis: { corporaMm: dims(['corpus-cavernosum-left', 'corpus-cavernosum-right']) },
    scrotumMm: dims(['scrotum']),
  };
  const hip = mergePieces([get('hip-bone-left'), get('hip-bone-right')]);
  let symBottom = Infinity; for (let i = 0; i < hip.positions.length; i += 3) if (Math.abs(hip.positions[i]) < 0.008) symBottom = Math.min(symBottom, hip.positions[i + 1]);
  M.checks = {
    prostateBelowBladder: cen('prostate').y < cen('urinary-bladder').y,
    seminalVesiclesBehindBladder: cen('seminal-vesicle-left').z < cen('urinary-bladder').z && cen('seminal-vesicle-right').z < cen('urinary-bladder').z,
    testesBelowSymphysis: cen('testis-left').y < symBottom && cen('testis-right').y < symBottom,
    testesInScrotum: (() => { const b = bvhOf(get('scrotum')); return insidePct(mergePieces([get('testis-left'), get('testis-right')]), b) > 95; })(),
    ductsReachVesicles: ['left', 'right'].every((s) => ducts[s].ej[0].distanceTo(cen(`seminal-vesicle-${s}`)) < 0.03),
    urethraThroughProstate: runs.prostatic.length > 8 && polyLength(runs.prostatic) > 0.012,
    routesContinuous: Object.values(seg).every((pts) => pts.every((p, i) => i === 0 || p.distanceTo(pts[i - 1]) < 0.012)),
  };
}

// ── Facts, checks and output ────────────────────────────────────────────────
function finish(ctx) {
  for (const m of ctx.meshes) m.normals = smoothNormals(m.positions, m.indices);
  const geometry = {}, sideErrors = [];
  for (const m of ctx.meshes) {
    const s = m.structure, [lo, hi] = bboxOf(m.positions), c = centroid(m.positions);
    if (s.sideCheck !== false) {
      if (s.side === 'right' && !(c[0] < 0)) sideErrors.push(`${s.id} claims right but x = ${c[0].toFixed(4)}`);
      if (s.side === 'left' && !(c[0] > 0)) sideErrors.push(`${s.id} claims left but x = ${c[0].toFixed(4)}`);
    }
    let nearest = 0, nd = Infinity;
    for (let i = 0; i < m.positions.length; i += 3) { const d = Math.hypot(m.positions[i] - c[0], m.positions[i + 1] - c[1], m.positions[i + 2] - c[2]); if (d < nd) { nd = d; nearest = i; } }
    const p = pca(m.positions);
    geometry[s.id] = {
      layer: s.layer, side: s.side, bounds: [lo.map(r6), hi.map(r6)], centroid: c.map(r6),
      surfaceAnchor: [m.positions[nearest], m.positions[nearest + 1], m.positions[nearest + 2]].map(r6),
      axes: p.axes.map((a) => a.map(r6)), extentsMm: p.extents.map((e) => r6(e * 1000)),
      vertexCount: m.positions.length / 3, triangleCount: m.indices.length / 3, ...(m.morph ? { morph: m.morph.name } : {}),
    };
  }
  if (sideErrors.length) throw new Error(`${ctx.body}: side checks failed:\n${sideErrors.join('\n')}`);
  const failed = Object.entries(ctx.checks).filter(([, ok]) => !ok).map(([k]) => k);
  if (failed.length) throw new Error(`${ctx.body}: layout checks failed: ${failed.join(', ')}\n${JSON.stringify(ctx.measures)}`);
  geometry.$routes = { segments: Object.fromEntries(Object.entries(ctx.seg).map(([k, pts]) => [k, arr(pts)])), offModel: ctx.offModel };
  geometry.$measures = ctx.measures;
  geometry.$anchors = ctx.anchors;
  return geometry;
}
async function write(ctx, geometry) {
  const doc = new Document(), buffer = doc.createBuffer(), scene = doc.createScene(ctx.body);
  for (const m of ctx.meshes) {
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(m.positions).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(m.normals).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(m.positions.length / 3 < 65536 ? Uint16Array.from(m.indices) : m.indices).setBuffer(buffer));
    const mesh = doc.createMesh(m.structure.id).addPrimitive(prim);
    if (m.morph) {
      prim.addTarget(doc.createPrimitiveTarget(m.morph.name).setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(m.morph.delta).setBuffer(buffer)));
      mesh.setWeights([0]).setExtras({ targetNames: [m.morph.name] });
    }
    const s = m.structure;
    scene.addChild(doc.createNode(s.id).setMesh(mesh).setExtras({ layer: s.layer, source: s.generated ? 'modelled' : s.bp3d ? 'bodyparts3d' : 'hra-united-female', nodes: [...(s.united ?? []), ...(s.bp3d ?? [])] }));
  }
  doc.getRoot().getAsset().generator = 'reproductive-anatomy-lab tools/extract-reproductive.mjs';
  doc.getRoot().getAsset().copyright = ctx.body === 'female'
    ? 'HuBMAP HRA 3D reference organs (Browne, Schlehlein et al.), CC BY 4.0; BodyParts3D (DBCLS), CC BY 4.0; endometrium, gravid uterus, vulva, urethra and ovarian vessels modelled'
    : 'BodyParts3D (DBCLS), CC BY 4.0; scrotum, urethra segments, ejaculatory ducts, bulbourethral glands and deep arteries modelled';
  const glb = await new NodeIO().writeBinary(doc);
  const out = path.join(root, `public/models/${ctx.body}.glb`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, glb);
  const gen = path.join(root, 'src/repro/generated');
  fs.mkdirSync(gen, { recursive: true });
  fs.writeFileSync(path.join(gen, `${ctx.body}.json`), JSON.stringify({ units: 'metres', axes: { x: "patient's left", y: 'superior', z: 'anterior' }, structures: geometry }, null, 1) + '\n');
  return { file: `public/models/${ctx.body}.glb`, bytes: glb.byteLength, sha256: sha256(glb), triangles: ctx.meshes.reduce((n, m) => n + m.indices.length / 3, 0), sourceTriangles: ctx.sourceTriangles, maxErrorPct: r6(ctx.maxError * 100) };
}
const outputs = {};
for (const ctx of [F, M]) outputs[ctx.body] = await write(ctx, finish(ctx));

const commit = (dir) => { try { return execFileSync('git', ['-C', path.resolve(dir, '../..'), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return null; } };
fs.writeFileSync(path.join(root, 'src/repro/generated/provenance.json'), JSON.stringify({
  outputs,
  sources: {
    united: {
      name: '3D Reference Organ Set for Female v1.5 (HuBMAP HRA united female), as converted by Female Atlas',
      creators: 'Kristen Browne, Heidi Schlehlein', doi: 'https://doi.org/10.48539/HBM352.BTSQ.586', license: 'CC-BY-4.0',
      intermediate: 'github.com/Niyaz-05/female-atlas, commit ' + commit(femaleDir),
      atlasJsonSha256: sha256(female.bytes), chunkSha256: female.hashes, transformReversed: `y - ${SHIFT} m`,
    },
    bodyparts3d: {
      name: 'BodyParts3D 4.0 (Database Center for Life Science), via the Human Atlas build', license: 'CC-BY-4.0',
      intermediate: 'github.com/Niyaz-05/human-atlas, commit ' + commit(humanDir),
      atlasJsonSha256: sha256(human.bytes), chunkSha256: human.hashes,
      parts: { female: F.bp3dParts, male: M.bp3dParts },
      registration: { method: "similarity (rotation, uniform scale, shift): Horn's quaternion method on landmark centroids; the pelvis fit refined by ICP of the BodyParts3D hip bones and sacrum onto the HRA ones, then a smooth Gaussian warp of the residual bone-surface displacements", fits: Object.fromEntries(Object.entries(fits).map(([k, f]) => [k, { usedFor: spec.structures.filter((x) => x.fit === k).map((x) => x.id), scale: f.scale, rotationDeg: f.rotationDeg, rmsResidualMm: f.rmsResidualMm, rigidSurfaceRmsMm: f.rigidSurfaceRmsMm, surfaceRmsMm: f.surfaceRmsMm, warpSamples: f.warpSamples, residuals: f.residuals }])) },
      verticesInsideTargetsPct: F.overlap,
    },
    modelled: { ...F.generatedNotes, ...M.generatedNotes, endometrium: 'Modelled lens in the plane where the HRA uterine walls meet: an inverted triangle about 3 cm wide at the fundus, from the internal os to about 9 mm below the fundus; thickness from about 1 mm (menses) to 14 mm (late luteal phase) as a morph target.', 'gravid-uterus': 'The HRA uterus wrapped by rays from its centre (an icosphere), with a morph target to a term uterus about 33 × 25 × 22 cm from the internal os to just below the xiphoid. The HRA full-term placenta set is placed on its inner posterior wall.' },
  },
  changesHere: 'Selected and merged the source meshes in src/repro/source/structures.source.json; welded coincident vertices; simplified the large meshes with meshoptimizer within the relative error bounds given there; subdivided and smoothed the small parts; recomputed smooth normals; placed the BodyParts3D pelvic floor, iliac arteries, ribs and sternum on the HRA body and pushed the pelvic floor out of the HRA organs; moved the HRA placenta set into the term uterus; generated the modelled parts; traced the routes; translated each body so the middle of its pelvic organs is the origin.',
  centreOffsetMetres: { female: F.centre.map(r6), male: M.centre.map(r6) },
  measures: { female: F.measures, male: M.measures },
  checks: { female: F.checks, male: M.checks },
  structures: spec.structures.map((s) => ({ id: s.id, body: s.body, united: s.united, bp3d: s.bp3d, generated: s.generated })),
}, null, 1) + '\n');

console.log(JSON.stringify({ outputs, registration: Object.fromEntries(Object.entries(fits).map(([k, f]) => [k, { scale: f.scale, rotationDeg: f.rotationDeg, rmsMm: f.rmsResidualMm, surfaceRmsMm: f.surfaceRmsMm }])), overlap: F.overlap, anchors: { uterus: F.anchors.uterus }, measures: { female: F.measures, male: M.measures }, checks: { female: F.checks, male: M.checks } }, null, 1));
