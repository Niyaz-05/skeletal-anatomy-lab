#!/usr/bin/env node
/**
 * Build public/models/skeleton.glb.
 *
 *   node tools/extract-skeleton.mjs <Female Atlas models dir> <Human Atlas models dir>
 *
 *   The skeleton is BodyParts3D 4.0 (repo4-human-atlas/public/models; metres, y up, +x = patient's
 *   left) in its own frame: 198 bones, the costal and laryngeal cartilages, the intervertebral discs,
 *   the teeth and gums and a few ligaments. From the HuBMAP HRA female body (repo3-female-atlas) come
 *   the coccyx and the knee's cruciate ligaments and menisci, which BodyParts3D lacks, and a female
 *   pelvis (compact and spongy bone) for comparing the sexes. The Female Atlas holds the same
 *   BodyParts3D bones, resized to her body, beside the HRA parts, so each HRA part is carried across by
 *   the vertex-for-vertex correspondence of those bones (Horn's method): no landmark guesswork.
 *
 * Also measures the joints (centres and axes for posing), the pelvises and the bones' lengths, and
 * writes src/lab/generated/skeleton.json and provenance.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { THREE, V, r6, weld, smoothNormals, simplify, mergePieces, subdivide, taubin, bboxOf, centroid, pca, horn, extreme } from './mesh-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [femaleDir, humanDir] = process.argv.slice(2);
if (!femaleDir || !humanDir) {
  console.error('Usage: node tools/extract-skeleton.mjs <female-atlas public/models dir> <human-atlas public/models dir>');
  process.exit(2);
}
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const spec = JSON.parse(fs.readFileSync(path.join(root, 'src/lab/source/structures.source.json'), 'utf8'));
/** Meshes with fewer triangles than this are subdivided and smoothed (the source simplified them hard). */
const SMOOTH_BELOW = 400;
/** The long bones and patellae are subdivided too: coarse in the source and prominent in every view. */
const SMOOTH_ALSO = /^(femur|tibia|fibula|humerus|radius|ulna|clavicle|patella)-/;
const MAX_ERROR = 0.004;

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
  const byId = new Map(atlas.parts.map((p) => [p.id, p]));
  const get = (id) => { const p = byId.get(id); if (!p) throw new Error(`${dir}: part "${id}" missing`); return { ...read(p), part: p }; };
  return { bytes, atlas, get, hashes };
}
const female = atlasReader(femaleDir);
const human = atlasReader(humanDir);

// ── Correspondence fits: Female Atlas frame → BodyParts3D frame ────────────
const pts = (pos, keep = () => true) => { const out = []; for (let i = 0; i < pos.length; i += 3) { const p = [pos[i], pos[i + 1], pos[i + 2]]; if (keep(p, i / 3)) out.push(p); } return out; };
/** The knee set on the BodyParts3D tibial plateau: the menisci centred on it, resting on it, scaled to its width. */
function fitPlateau(name, f) {
  const tib = human.get(f.tibia).positions, men = female.get(f.menisci).positions;
  const top = Math.max(...pts(tib).map((p) => p[1]));
  const plateau = pts(tib, (p) => p[1] > top - 0.012);
  const [plo, phi] = bboxOf(new Float32Array(plateau.flat())), [mlo, mhi] = bboxOf(men);
  const scale = (phi[0] - plo[0]) / (mhi[0] - mlo[0]);
  const mc = [(mlo[0] + mhi[0]) / 2, mlo[1], (mlo[2] + mhi[2]) / 2];
  const pc = [(plo[0] + phi[0]) / 2, top - 0.006, (plo[2] + phi[2]) / 2];
  const place = (x, y, z) => [pc[0] + (x - mc[0]) * scale, pc[1] + (y - mc[1]) * scale, pc[2] + (z - mc[2]) * scale];
  if (!(scale > 0.8 && scale < 1.3)) throw new Error(`fit ${name}: plateau scale ${scale}`);
  return { place, scale: r6(scale), rotationDeg: 0, rmsMm: null, vertices: null, plateauWidthMm: r6((phi[0] - plo[0]) * 1000), menisciWidthMm: r6((mhi[0] - mlo[0]) * 1000) };
}
function fitCorrespondence(name, f) {
  if (f.method === 'plateau') return fitPlateau(name, f);
  const src = [], dst = [];
  // Near the knee only the ends of the femur and tibia count: the Female Atlas resized her limbs, so
  // the whole bones need not agree with one similarity.
  let near = null;
  if (f.near === 'knee') {
    const fem = human.get(f.bones[0]).positions, tib = human.get(f.bones[1]).positions;
    near = V(centroid(new Float32Array([...extreme({ positions: fem }, V([0, -1, 0])).toArray(), ...extreme({ positions: tib }, V([0, 1, 0])).toArray()])));
  }
  // The coccyx hangs from the sacral apex: only the lower sacrum counts.
  if (f.near === 'sacral-apex') near = extreme({ positions: human.get(f.bones[0]).positions }, V([0, -1, 0]));
  for (const id of f.bones) {
    const a = female.get(`BP3D_${id}`).positions, b = human.get(id).positions;
    if (a.length !== b.length) throw new Error(`fit ${name}: ${id} has ${a.length / 3} vertices in the Female Atlas but ${b.length / 3} in BodyParts3D`);
    for (let i = 0; i < a.length; i += 3) {
      if (near && Math.hypot(b[i] - near.x, b[i + 1] - near.y, b[i + 2] - near.z) > (f.radius ?? 0.07)) continue;
      src.push([a[i], a[i + 1], a[i + 2]]); dst.push([b[i], b[i + 1], b[i + 2]]);
    }
  }
  const fit = horn(src, dst, src.map(() => 1), f.scale ? null : 1);
  const rms = Math.sqrt(src.reduce((s, p, i) => s + fit.place(...p).reduce((q, v, a) => q + (v - dst[i][a]) ** 2, 0), 0) / src.length) * 1000;
  if (rms > f.maxRmsMm) throw new Error(`fit ${name}: ${rms.toFixed(2)} mm RMS (limit ${f.maxRmsMm})`);
  return { place: fit.place, scale: r6(fit.scale), rotationDeg: r6((2 * Math.acos(Math.min(1, Math.abs(fit.quat.w))) * 180) / Math.PI), rmsMm: r6(rms), vertices: src.length };
}
const fits = Object.fromEntries(Object.entries(spec.registration.fits).map(([k, f]) => [k, fitCorrespondence(k, f)]));

// ── Meshes ─────────────────────────────────────────────────────────────────
const all = mergePieces(spec.structures.filter((s) => s.bp3d).flatMap((s) => s.bp3d.map((id) => human.get(id))));
const [lo0, hi0] = bboxOf(all.positions);
const CENTRE = [0, (lo0[1] + hi0[1]) / 2, (lo0[2] + hi0[2]) / 2];
const centred = (p) => { const q = Float32Array.from(p); for (let i = 0; i < q.length; i += 3) for (let a = 0; a < 3; a++) q[i + a] -= CENTRE[a]; return q; };

let sourceTriangles = 0, maxError = 0;
const bp3dParts = {};
const meshes = [], byId = new Map();
for (const s of spec.structures) {
  const pieces = [];
  for (const id of s.bp3d ?? []) {
    const raw = human.get(id);
    bp3dParts[s.id] = [...(bp3dParts[s.id] ?? []), `${id} ${raw.part.name}`];
    sourceTriangles += raw.indices.length / 3;
    pieces.push(weld(centred(raw.positions), raw.indices));
  }
  for (const id of s.united ?? []) {
    const raw = female.get(id);
    sourceTriangles += raw.indices.length / 3;
    const pos = new Float32Array(raw.positions.length);
    for (let i = 0; i < pos.length; i += 3) pos.set(fits[s.fit].place(raw.positions[i], raw.positions[i + 1], raw.positions[i + 2]), i);
    let w = weld(centred(pos), raw.indices);
    if (w.indices.length / 3 > 3000) { const sm = simplify(w.positions, w.indices, 0.35, MAX_ERROR); maxError = Math.max(maxError, sm.error); w = sm; }
    pieces.push(w);
  }
  let m = mergePieces(pieces);
  if (m.indices.length / 3 < SMOOTH_BELOW || SMOOTH_ALSO.test(s.id)) { m = subdivide(m.positions, m.indices); taubin(m.positions, m.indices, 2); }
  const mesh = { structure: s, ...m };
  meshes.push(mesh); byId.set(s.id, mesh);
}
const get = (id) => { const m = byId.get(id); if (!m) throw new Error(`no structure ${id}`); return m; };
const cen = (id) => V(centroid(get(id).positions));
const vertsOf = (id) => pts(get(id).positions).map((p) => V(p));
const sideSign = (side) => (side === 'left' ? 1 : -1);

// ── Joint centres and axes ─────────────────────────────────────────────────
/** Least-squares sphere through points (algebraic fit). */
function fitSphere(points) {
  // Solve [2x 2y 2z 1]·[a b c d] = x²+y²+z² in the least-squares sense.
  const A = new Array(16).fill(0), B = [0, 0, 0, 0];
  for (const p of points) {
    const r = [2 * p.x, 2 * p.y, 2 * p.z, 1], y = p.lengthSq();
    for (let i = 0; i < 4; i++) { B[i] += r[i] * y; for (let j = 0; j < 4; j++) A[i * 4 + j] += r[i] * r[j]; }
  }
  const M = new THREE.Matrix4().fromArray(A).transpose().invert();
  const e = M.elements; // column-major
  const sol = [0, 1, 2, 3].map((i) => e[i] * B[0] + e[4 + i] * B[1] + e[8 + i] * B[2] + e[12 + i] * B[3]);
  const c = V([sol[0], sol[1], sol[2]]);
  const radius = Math.sqrt(sol[3] + c.lengthSq());
  const rms = Math.sqrt(points.reduce((s, p) => s + (p.distanceTo(c) - radius) ** 2, 0) / points.length);
  return { centre: c, radius, rms };
}
/** The cap of a bone's head: vertices within `r` of its extreme point in direction `dir`, sphere-fitted. */
function headSphere(id, dir, r, expect) {
  const v = vertsOf(id), d = dir.clone().normalize();
  let top = v[0]; for (const p of v) if (p.dot(d) > top.dot(d)) top = p;
  const s = fitSphere(v.filter((p) => p.distanceTo(top) < r));
  const mm = s.radius * 1000;
  if (!(mm > expect[0] && mm < expect[1])) throw new Error(`${id}: head radius ${mm.toFixed(1)} mm outside ${expect}`);
  return s;
}
const endCentre = (id, dir, depth) => {
  const v = vertsOf(id), d = dir.clone().normalize();
  const top = Math.max(...v.map((p) => p.dot(d)));
  const sel = v.filter((p) => p.dot(d) > top - depth);
  return sel.reduce((a, p) => a.add(p), V([0, 0, 0])).divideScalar(sel.length);
};
const lowestOf = (id) => extreme(get(id), V([0, -1, 0]));
const highestOf = (id) => extreme(get(id), V([0, 1, 0]));
const toA = (v) => v.toArray().map(r6);

const joints = {};
const J = (id, pivot, axes, extra = {}) => { joints[id] = { pivot: toA(pivot), ...Object.fromEntries(Object.entries(axes).map(([k, a]) => [k, toA(a.clone().normalize())])), ...extra }; };
const checks = {};

for (const side of ['left', 'right']) {
  const sg = sideSign(side);
  // Shoulder girdle: the sternoclavicular and acromioclavicular joints are the clavicle's ends.
  const sc = extreme(get(`clavicle-${side}`), V([-sg, 0, 0.3])), ac = extreme(get(`clavicle-${side}`), V([sg, 0, -0.2]));
  J(`sternoclavicular-${side}`, sc, { ap: V([0, 0, 1]), up: V([0, 1, 0]), flex: V([1, 0, 0]) });
  J(`acromioclavicular-${side}`, ac, { ap: V([0, 0, 1]) });
  // Glenohumeral: the humeral head faces medially, upwards and backwards.
  const hh = headSphere(`humerus-${side}`, V([-sg * 0.55, 0.75, -0.35]), 0.03, [17, 32]);
  const elbowC = endCentre(`humerus-${side}`, V([0, -1, 0]), 0.02);
  const shaft = elbowC.clone().sub(hh.centre).normalize();
  J(`shoulder-${side}`, hh.centre, { flex: V([1, 0, 0]), abd: V([0, 0, 1]), rot: shaft }, { headRadiusMm: r6(hh.radius * 1000), fitRmsMm: r6(hh.rms * 1000) });
  // Elbow: the axis through the epicondyles (extremes across the distal humerus).
  const dist = vertsOf(`humerus-${side}`).filter((p) => p.y < elbowC.y + 0.04);
  const med = dist.reduce((a, p) => (p.x * sg < a.x * sg ? p : a)), latE = dist.reduce((a, p) => (p.x * sg > a.x * sg ? p : a));
  J(`elbow-${side}`, elbowC, { flex: latE.clone().sub(med).multiplyScalar(sg) }, { epicondylarWidthMm: r6(med.distanceTo(latE) * 1000) });
  // Forearm rotation: the radial head to the ulnar head.
  const rh = endCentre(`radius-${side}`, V([0, 1, 0]), 0.012), uh = endCentre(`ulna-${side}`, V([0, -1, 0]), 0.012);
  J(`radioulnar-${side}`, rh, { pron: uh.clone().sub(rh) });
  // Wrist: between the distal radius and the capitate.
  const wr = endCentre(`radius-${side}`, V([0, -1, 0]), 0.01).lerp(cen(`capitate-${side}`), 0.5);
  J(`wrist-${side}`, wr, { flex: V([1, 0, 0]), dev: V([0, 0, 1]) });
  // Fingers: each joint lies where a bone's proximal end meets its parent.
  const digit = (names) => names.forEach(([child, parent], k) => {
    const pc = cen(parent), cc = cen(child);
    const end = endCentre(child, pc.clone().sub(cc), 0.003);
    const dir = cc.clone().sub(pc).normalize();
    J(`${child}-joint`, end, { dir });
    void k;
  });
  for (const f of ['index', 'middle', 'ring', 'little']) {
    const mc = { index: 2, middle: 3, ring: 4, little: 5 }[f];
    digit([[`proximal-phalanx-${f}-${side}`, `metacarpal-${mc}-${side}`], [`middle-phalanx-${f}-${side}`, `proximal-phalanx-${f}-${side}`], [`distal-phalanx-${f}-${side}`, `middle-phalanx-${f}-${side}`]]);
  }
  digit([[`metacarpal-1-${side}`, `trapezium-${side}`], [`proximal-phalanx-thumb-${side}`, `metacarpal-1-${side}`], [`distal-phalanx-thumb-${side}`, `proximal-phalanx-thumb-${side}`]]);
  for (let t = 1; t <= 5; t++) digit([[`proximal-phalanx-toe-${t}-${side}`, `metatarsal-${t}-${side}`]]);

  // Hip: the femoral head faces medially and upwards.
  const fh = headSphere(`femur-${side}`, V([-sg * 0.6, 0.8, 0.1]), 0.032, [18, 32]);
  const kneeC = endCentre(`femur-${side}`, V([0, -1, 0]), 0.025);
  J(`hip-${side}`, fh.centre, { flex: V([1, 0, 0]), abd: V([0, 0, 1]), rot: kneeC.clone().sub(fh.centre) }, { headRadiusMm: r6(fh.radius * 1000), fitRmsMm: r6(fh.rms * 1000) });
  // Knee: across the femoral condyles (their medial and lateral extremes near the joint).
  const condyles = vertsOf(`femur-${side}`).filter((p) => p.y < kneeC.y + 0.035);
  const mc = condyles.reduce((a, p) => (p.x * sg < a.x * sg ? p : a)), lc = condyles.reduce((a, p) => (p.x * sg > a.x * sg ? p : a));
  J(`knee-${side}`, kneeC, { flex: lc.clone().sub(mc).multiplyScalar(sg) }, { condylarWidthMm: r6(mc.distanceTo(lc) * 1000) });
  // Ankle: the talocrural axis runs through the tips of the malleoli.
  const mm = lowestOf(`tibia-${side}`), lm = lowestOf(`fibula-${side}`);
  J(`ankle-${side}`, mm.clone().lerp(lm, 0.5), { flex: lm.clone().sub(mm).multiplyScalar(sg) });
  // Subtalar: about 42° up from the sole and 23° medial of the foot's long axis (Inman 1976).
  const foot = cen(`metatarsal-2-${side}`).sub(cen(`calcaneus-${side}`)).setY(0).normalize();
  const sub = foot.clone().applyAxisAngle(V([0, 1, 0]), -sg * (23 * Math.PI) / 180).multiplyScalar(Math.cos((42 * Math.PI) / 180)).add(V([0, Math.sin((42 * Math.PI) / 180), 0]));
  J(`subtalar-${side}`, cen(`talus-${side}`).lerp(cen(`calcaneus-${side}`), 0.5), { inv: sub });

  checks[`${side}HipBelowShoulder`] = fh.centre.y < hh.centre.y;
  checks[`${side}KneeBelowHip`] = kneeC.y < fh.centre.y - 0.3;
  checks[`${side}AnkleBelowKnee`] = mm.y < kneeC.y - 0.3;
  checks[`${side}LimbsOnTheirSide`] = hh.centre.x * sg > 0 && fh.centre.x * sg > 0;
}
// Spine: each vertebra turns about the middle of the disc below it.
const SPINE = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', ...Array.from({ length: 12 }, (_, i) => `t${i + 1}`), 'l1', 'l2', 'l3', 'l4', 'l5'];
for (let i = 1; i < SPINE.length; i++) {
  const v = SPINE[i];
  const below = i < SPINE.length - 1 ? SPINE[i + 1] : 'sacrum';
  const disc = byId.get(`disc-${v}`);
  const pivot = disc ? cen(`disc-${v}`) : endCentre(v, V([0, -1, 0]), 0.004).lerp(endCentre(below, V([0, 1, 0]), 0.004), 0.5);
  J(`spine-${v}`, pivot, { flex: V([1, 0, 0]), side: V([0, 0, 1]), rot: V([0, 1, 0]) }, { below });
}
// The atlas turns on the dens of the axis; the skull nods on the atlas.
J('spine-c1', endCentre('c2', V([0, 1, 0]), 0.01), { flex: V([1, 0, 0]), side: V([0, 0, 1]), rot: V([0, 1, 0]) }, { below: 'c2' });
J('atlanto-occipital', endCentre('c1', V([0, 1, 0]), 0.004), { flex: V([1, 0, 0]), side: V([0, 0, 1]), rot: V([0, 1, 0]) });
// Jaw: the axis through both mandibular condyles (the highest, most posterior points of the mandible).
{
  const mand = vertsOf('mandible');
  const condyle = (sg) => mand.filter((p) => p.x * sg > 0.02).reduce((a, p) => (p.y - p.z * 0.5 > a.y - a.z * 0.5 ? p : a));
  const l = condyle(1), r = condyle(-1);
  J('tmj', l.clone().lerp(r, 0.5), { flex: l.clone().sub(r) }, { intercondylarMm: r6(l.distanceTo(r) * 1000) });
  checks.jawBelowSkull = l.y < cen('parietal-left').y;
}
// The pelvis rests on the hips; the thorax rides on T7.
J('pelvis', cen('sacrum').lerp(cen('hip-bone-left').lerp(cen('hip-bone-right'), 0.5), 0.5), { flex: V([1, 0, 0]) });

// ── Measures ───────────────────────────────────────────────────────────────
const lengthAlong = (id) => { const p = pca(get(id).positions); return r6(p.extents[0] * 1000); };
const measures = {
  statureMm: r6((hi0[1] - lo0[1]) * 1000),
  boneLengthsMm: Object.fromEntries(['femur', 'tibia', 'fibula', 'humerus', 'radius', 'ulna', 'clavicle'].map((b) => [b, lengthAlong(`${b}-left`)])),
  femoralHeadMm: joints['hip-left'].headRadiusMm * 2,
  humeralHeadMm: joints['shoulder-left'].headRadiusMm * 2,
};
/**
 * Pelvis: the true conjugate of the inlet (sacral promontory to the top of the symphysis), the pubic
 * arch (the 3D angle between the lower edges of the inferior pubic rami), the width across the iliac
 * crests and the height. The inlet's transverse diameter is not measured: the brim is not planar, and
 * no automatic ring through it proved reliable on both pelvises.
 */
function pelvis(hips, sacrum) {
  const hv = hips.flatMap(vertsOf), sv = vertsOf(sacrum);
  const front = hv.filter((p) => Math.abs(p.x) < 0.012);
  const symTop = front.reduce((a, p) => (p.y > a.y ? p : a)), symBottom = front.reduce((a, p) => (p.y < a.y ? p : a));
  // The promontory: the front edge of the sacral base, the most anterior-superior midline point of the upper sacrum.
  const sMid = sv.reduce((s, p) => s + p.y, 0) / sv.length;
  const promontory = sv.filter((p) => p.y > sMid && Math.abs(p.x) < 0.008).reduce((a, p) => (p.y + p.z > a.y + a.z ? p : a));
  // Inlet plane: through the promontory and the symphysis top, perpendicular to the midline plane.
  // Pubic arch, seen from the front: the lower edge of each inferior pubic ramus, 0.8–3.5 cm from the
  // midline, in front of the ischial tuberosities; each side's angle from the vertical.
  const edge = (sg) => {
    const out = [];
    for (let x = 0.008; x <= 0.035; x += 0.003) {
      const col = hv.filter((p) => Math.abs(p.x * sg - x) < 0.0015 && p.z > symBottom.z - 0.035 && p.y < symBottom.y + 0.005);
      if (col.length) out.push(col.reduce((a, p) => (p.y < a.y ? p : a)));
    }
    return out;
  };
  // Each ramus's direction: the principal axis of its edge points, pointing away from the symphysis.
  const ramus = (sg) => { const e = edge(sg); const ax = V(pca(new Float32Array(e.flatMap((p) => p.toArray()))).axes[0]); return ax.x * sg < 0 ? ax.negate() : ax; };
  const subpubic = (ramus(1).angleTo(ramus(-1)) * 180) / Math.PI;
  const width = Math.max(...hv.map((p) => p.x)) - Math.min(...hv.map((p) => p.x));
  return {
    inletConjugateMm: r6(promontory.distanceTo(symTop) * 1000),
    subpubicAngleDeg: r6(subpubic), biiliacWidthMm: r6(width * 1000),
    heightMm: r6((Math.max(...hv.map((p) => p.y)) - Math.min(...hv.map((p) => p.y))) * 1000),
    symphysisTop: toA(symTop), promontory: toA(promontory),
  };
}
measures.pelvis = { male: pelvis(['hip-bone-left', 'hip-bone-right'], 'sacrum'), female: pelvis(['female-hip-bone-left', 'female-hip-bone-right'], 'female-sacrum') };
const mp = measures.pelvis.male, fp = measures.pelvis.female;
checks.femaleInletDeeper = fp.inletConjugateMm > mp.inletConjugateMm;
checks.femaleArchWider = fp.subpubicAngleDeg > mp.subpubicAngleDeg;
checks.pelvisMeasuresPlausible = [mp, fp].every((q) => q.inletConjugateMm > 85 && q.inletConjugateMm < 140) && mp.subpubicAngleDeg > 45 && mp.subpubicAngleDeg < 80 && fp.subpubicAngleDeg > 80 && fp.subpubicAngleDeg < 120;
checks.coccyxBelowSacrum = cen('coccyx').y < cen('sacrum').y;
checks.cruciatesInKnees = ['left', 'right'].every((s) => cen(`acl-${s}`).distanceTo(V(joints[`knee-${s}`].pivot)) < 0.04 && cen(`menisci-${s}`).distanceTo(V(joints[`knee-${s}`].pivot)) < 0.04);
checks.statureAdult = measures.statureMm > 1550 && measures.statureMm < 1900;
checks.femoralHeadsTextbook = ['left', 'right'].every((s) => joints[`hip-${s}`].headRadiusMm > 20 && joints[`hip-${s}`].headRadiusMm < 28);

// The female pelvis sits beside the male one for comparison (shown in that view only).
const anchors = {
  femalePelvisOffset: [r6(0.32), 0, 0],
  pelvisCentre: toA(cen('sacrum').lerp(cen('hip-bone-left').lerp(cen('hip-bone-right'), 0.5), 0.5)),
  femalePelvisCentre: toA(cen('female-sacrum').lerp(cen('female-hip-bone-left').lerp(cen('female-hip-bone-right'), 0.5), 0.5)),
};
// Fracture sites: a point on the bone and its long axis there.
const longAxis = (id) => V(pca(get(id).positions).axes[0]);
const along = (id, t) => { const ax = longAxis(id); const v = vertsOf(id); const d = v.map((p) => p.dot(ax)); const lo = Math.min(...d), hi = Math.max(...d); const c = cen(id); return c.addScaledVector(ax, lo + (hi - lo) * t - c.dot(ax)); };
const orient = (id, up) => { const ax = longAxis(id); return ax.dot(up) < 0 ? ax.negate() : ax; };
anchors.fractures = {
  'distal-radius': { bone: 'radius-left', at: toA(along('radius-left', 0.06)), axis: toA(orient('radius-left', V([0, 1, 0]))) },
  scaphoid: { bone: 'scaphoid-left', at: toA(cen('scaphoid-left')), axis: toA(orient('scaphoid-left', V([0, 1, 0]))) },
  clavicle: { bone: 'clavicle-left', at: toA(along('clavicle-left', 0.45)), axis: toA(orient('clavicle-left', V([1, 0, 0]))) },
  'humeral-neck': { bone: 'humerus-left', at: toA(along('humerus-left', 0.87)), axis: toA(orient('humerus-left', V([0, 1, 0]))) },
  'femoral-neck': { bone: 'femur-left', at: toA(V(joints['hip-left'].pivot).lerp(along('femur-left', 0.92), 0.55)), axis: toA(V(joints['hip-left'].pivot).sub(along('femur-left', 0.9)).normalize()) },
  'tibial-shaft': { bone: 'tibia-left', at: toA(along('tibia-left', 0.35)), axis: toA(orient('tibia-left', V([0, 1, 0]))) },
  ankle: { bone: 'fibula-left', at: toA(along('fibula-left', 0.1)), axis: toA(orient('fibula-left', V([0, 1, 0]))) },
  'vertebral-compression': { bone: 'l1', at: toA(cen('l1')), axis: [0, 1, 0] },
  metatarsal: { bone: 'metatarsal-2-left', at: toA(cen('metatarsal-2-left')), axis: toA(orient('metatarsal-2-left', V([0, 0, 1]))) },
  rib: { bone: 'rib-7-left', at: toA(extreme(get('rib-7-left'), V([1, 0, 0.3]))), axis: [0, 0, 1] },
};

// Each fracture site: the bone's radius there (mean distance of the surface from the axis in a 4 mm
// slab) and the distance to the bone's far end along the axis (for avulsions of a tip).
for (const f of Object.values(anchors.fractures)) {
  let at = V(f.at);
  const ax = V(f.axis).normalize(), v = vertsOf(f.bone);
  const slab = v.filter((p) => Math.abs(p.clone().sub(at).dot(ax)) < 0.002);
  // Centre the site on the bone's cross-section there (a curved bone leaves its overall axis).
  if (slab.length >= 8 && f.bone !== 'l1' && !f.bone.startsWith('rib')) {
    const c = slab.reduce((a, p) => a.add(p), V([0, 0, 0])).divideScalar(slab.length);
    at = at.clone().add(c.sub(at).projectOnPlane(ax));
    f.at = toA(at);
  }
  f.radiusMm = r6((slab.length ? slab.reduce((s, p) => s + p.clone().sub(at).projectOnPlane(ax).length(), 0) / slab.length : 0.006) * 1000);
  f.toEndMm = r6(Math.max(...v.map((p) => at.clone().sub(p).dot(ax))) * 1000);
}
checks.fractureRadiiPlausible = Object.values(anchors.fractures).every((f) => f.radiusMm > 2 && f.radiusMm < 35);

// Growth plates (physes) of the long bones: a disc across the bone at the epiphyseal line, found as the
// cross-section a set depth from the bone's end along its long axis (the femoral head's lies across the
// neck, from the head's fitted centre). Fusion ages: Scheuer & Black, The Juvenile Skeleton (2004).
const PHYSES = [
  ['humerus', 'proximal', 22, [14, 17], [16, 20]], ['humerus', 'distal', 14, [11, 14], [12, 17]],
  ['radius', 'proximal', 9, [11, 13], [14, 17]], ['radius', 'distal', 14, [14, 17], [16, 20]],
  ['ulna', 'proximal', 18, [12, 14], [13, 16]], ['ulna', 'distal', 10, [15, 17], [17, 20]],
  ['femur', 'distal', 20, [14, 18], [16, 20]],
  ['tibia', 'proximal', 18, [13, 17], [15, 19]], ['tibia', 'distal', 12, [14, 16], [15, 18]],
  ['fibula', 'proximal', 14, [12, 17], [15, 20]], ['fibula', 'distal', 18, [12, 15], [15, 18]],
  ['clavicle', 'medial', 6, [21, 28], [22, 30]],
];
const physes = [];
for (const side of ['left', 'right']) {
  const sg = sideSign(side);
  for (const [bone, end, depthMm, female, male] of PHYSES) {
    const id = `${bone}-${side}`;
    const v = vertsOf(id);
    let ax = longAxis(id);
    const want = end === 'proximal' ? V([0, 1, 0]) : end === 'distal' ? V([0, -1, 0]) : V([-sg, 0, 0]);
    if (ax.dot(want) < 0) ax.negate();
    const top = Math.max(...v.map((p) => p.dot(ax)));
    const level = top - depthMm / 1000;
    const slab = v.filter((p) => Math.abs(p.dot(ax) - level) < 0.002);
    if (slab.length < 6) throw new Error(`physis ${id} ${end}: only ${slab.length} vertices at the level`);
    const c = slab.reduce((a, p) => a.add(p), V([0, 0, 0])).divideScalar(slab.length);
    const radius = slab.reduce((s, p) => s + p.clone().sub(c).projectOnPlane(ax).length(), 0) / slab.length;
    physes.push({ id: `${id}-${end}`, bone: id, end, centre: toA(c), axis: toA(ax), radiusMm: r6(radius * 1000), fusesFemale: female, fusesMale: male });
  }
  // The femoral head's physis: across the neck, a little outside the head's centre.
  const hip = joints[`hip-${side}`], hc = V(hip.pivot), neck = along(`femur-${side}`, 0.9).sub(hc).normalize();
  physes.push({ id: `femur-${side}-proximal`, bone: `femur-${side}`, end: 'proximal', centre: toA(hc.clone().addScaledVector(neck, (hip.headRadiusMm * 0.55) / 1000)), axis: toA(neck.clone().negate()), radiusMm: r6(hip.headRadiusMm * 0.85), fusesFemale: [14, 17], fusesMale: [16, 18] });
}
anchors.physes = physes;
checks.physesInsideBones = physes.every((p) => p.radiusMm > 3 && p.radiusMm < 40);

// ── Facts, checks and output ────────────────────────────────────────────────
for (const m of meshes) m.normals = smoothNormals(m.positions, m.indices);
const geometry = {}, sideErrors = [];
for (const m of meshes) {
  const s = m.structure, [lo, hi] = bboxOf(m.positions), c = centroid(m.positions);
  if (s.sideCheck !== false && !s.female) {
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
    vertexCount: m.positions.length / 3, triangleCount: m.indices.length / 3,
  };
}
if (sideErrors.length) throw new Error(`side checks failed:\n${sideErrors.join('\n')}`);
const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
if (failed.length) throw new Error(`layout checks failed: ${failed.join(', ')}\n${JSON.stringify(measures, null, 1)}`);
geometry.$joints = joints;
geometry.$measures = measures;
geometry.$anchors = anchors;

const doc = new Document(), buffer = doc.createBuffer(), scene = doc.createScene('skeleton');
for (const m of meshes) {
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(m.positions).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(m.normals).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(m.positions.length / 3 < 65536 ? Uint16Array.from(m.indices) : m.indices).setBuffer(buffer));
  const s = m.structure;
  scene.addChild(doc.createNode(s.id).setMesh(doc.createMesh(s.id).addPrimitive(prim)).setExtras({ layer: s.layer, source: s.bp3d ? 'bodyparts3d' : 'hra-united-female', nodes: [...(s.united ?? []), ...(s.bp3d ?? [])] }));
}
doc.getRoot().getAsset().generator = 'skeletal-anatomy-lab tools/extract-skeleton.mjs';
doc.getRoot().getAsset().copyright = 'BodyParts3D (DBCLS), CC BY 4.0; coccyx, knee ligaments and menisci and the female pelvis from the HuBMAP HRA 3D reference organs (Browne, Schlehlein et al.), CC BY 4.0';
const glb = await new NodeIO().writeBinary(doc);
const out = path.join(root, 'public/models/skeleton.glb');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, glb);
const gen = path.join(root, 'src/lab/generated');
fs.mkdirSync(gen, { recursive: true });
fs.writeFileSync(path.join(gen, 'skeleton.json'), JSON.stringify({ units: 'metres', axes: { x: "patient's left", y: 'superior', z: 'anterior' }, structures: geometry }, null, 1) + '\n');
const output = { file: 'public/models/skeleton.glb', bytes: glb.byteLength, sha256: sha256(glb), triangles: meshes.reduce((n, m) => n + m.indices.length / 3, 0), sourceTriangles, maxErrorPct: r6(maxError * 100) };

const commit = (dir) => { try { return execFileSync('git', ['-C', path.resolve(dir, '../..'), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return null; } };
fs.writeFileSync(path.join(gen, 'provenance.json'), JSON.stringify({
  outputs: { skeleton: output },
  sources: {
    bodyparts3d: {
      name: 'BodyParts3D 4.0 (Database Center for Life Science), via the Human Atlas build', license: 'CC-BY-4.0',
      intermediate: 'github.com/Niyaz-05/human-atlas, commit ' + commit(humanDir),
      atlasJsonSha256: sha256(human.bytes), chunkSha256: human.hashes, parts: bp3dParts,
    },
    united: {
      name: '3D Reference Organ Set for Female v1.5 (HuBMAP HRA united female), as converted by Female Atlas',
      creators: 'Kristen Browne, Heidi Schlehlein', doi: 'https://doi.org/10.48539/HBM352.BTSQ.586', license: 'CC-BY-4.0',
      intermediate: 'github.com/Niyaz-05/female-atlas, commit ' + commit(femaleDir),
      atlasJsonSha256: sha256(female.bytes), chunkSha256: female.hashes,
      parts: Object.fromEntries(spec.structures.filter((s) => s.united).map((s) => [s.id, s.united])),
    },
    registration: {
      method: "Pelvis: Horn's quaternion method on the vertex-for-vertex correspondence of the BodyParts3D bones present in both the Female Atlas and BodyParts3D (for the coccyx, the sacrum within 5 cm of its apex). Knees: the HRA menisci centred on the BodyParts3D tibial plateau (its top 12 mm), resting on it and scaled to its width; the cruciate and anterolateral ligaments move with them",
      fits: Object.fromEntries(Object.entries(fits).map(([k, f]) => [k, { ...spec.registration.fits[k], usedFor: spec.structures.filter((x) => x.fit === k).map((x) => x.id), scale: f.scale, rotationDeg: f.rotationDeg, rmsMm: f.rmsMm, vertices: f.vertices, ...(f.plateauWidthMm ? { plateauWidthMm: f.plateauWidthMm, menisciWidthMm: f.menisciWidthMm } : {}) }])),
    },
  },
  changesHere: `Selected and merged the source meshes in src/lab/source/structures.source.json; welded coincident vertices; subdivided and smoothed the meshes under ${SMOOTH_BELOW} triangles; simplified the large HRA meshes with meshoptimizer within ${MAX_ERROR * 100} % relative error; recomputed smooth normals; carried the HRA coccyx, knee ligaments, menisci and female pelvis onto BodyParts3D by correspondence fits; measured the joints, bones and pelvises; translated so the middle of the skeleton's bounds is the origin.`,
  centreOffsetMetres: CENTRE.map(r6),
  measures, checks,
  structures: spec.structures.map((s) => ({ id: s.id, bp3d: s.bp3d, united: s.united, fit: s.fit })),
}, null, 1) + '\n');

console.log(JSON.stringify({ output, fits: Object.fromEntries(Object.entries(fits).map(([k, f]) => [k, { scale: f.scale, rotationDeg: f.rotationDeg, rmsMm: f.rmsMm, vertices: f.vertices }])), measures, checks }, null, 1));
