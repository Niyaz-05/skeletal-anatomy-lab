#!/usr/bin/env node
/**
 * Checks public/models/skeleton.glb against its provenance and geometry records: file hash, node
 * set, finite positions, unit normals, in-range indices, sane bounds, the baked shading attribute, no
 * morph targets, and the attribution file. Exits non-zero on any failure so it
 * can gate builds.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const fail = (msg) => problems.push(msg);
const provenance = JSON.parse(fs.readFileSync(path.join(root, 'src/lab/generated/provenance.json'), 'utf8'));
/** The skeleton is centred on its bounds: about ±0.87 m tall, ±0.35 m wide; the female pelvis sits 0.62 m to the side in some views but not in the file. */
const RANGE = { skeleton: 0.9 };
const MORPHS = { skeleton: [] };
const summary = [];

for (const body of ['skeleton']) {
  const file = `${body}.glb`;
  const glb = fs.readFileSync(path.join(root, 'public/models', file));
  const geometry = JSON.parse(fs.readFileSync(path.join(root, `src/lab/generated/${body}.json`), 'utf8'));
  const out = provenance.outputs[body];
  const hash = crypto.createHash('sha256').update(glb).digest('hex');
  if (hash !== out.sha256) fail(`${file} sha256 ${hash} does not match provenance ${out.sha256}`);
  if (provenance.shadingBake?.bodies?.[body]?.bakedSha256 !== hash) fail(`${file} is not the baked model recorded in provenance (run tools/bake-shading.mjs)`);

  const doc = await new NodeIO().readBinary(new Uint8Array(glb));
  const nodes = doc.getRoot().listNodes();
  const names = nodes.map((n) => n.getName());
  const expected = Object.keys(geometry.structures).filter((k) => !k.startsWith('$'));
  for (const id of expected) if (!names.includes(id)) fail(`node "${id}" missing from ${file}`);
  for (const n of names) if (!expected.includes(n)) fail(`unexpected node "${n}" in ${file}`);
  if (new Set(names).size !== names.length) fail(`duplicate node names in ${file}`);

  let triangles = 0;
  for (const node of nodes) {
    const id = node.getName();
    const mesh = node.getMesh();
    if (!mesh) { fail(`${body}/${id}: node has no mesh`); continue; }
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')?.getArray();
      const nor = prim.getAttribute('NORMAL')?.getArray();
      const idx = prim.getIndices()?.getArray();
      if (!pos || !nor || !idx) { fail(`${body}/${id}: missing POSITION, NORMAL or indices`); continue; }
      if (pos.length !== nor.length) fail(`${body}/${id}: ${pos.length / 3} positions but ${nor.length / 3} normals`);
      for (let i = 0; i < pos.length; i++) {
        if (!Number.isFinite(pos[i])) { fail(`${body}/${id}: non-finite position at ${i}`); break; }
        if (Math.abs(pos[i]) > RANGE[body]) { fail(`${body}/${id}: position ${pos[i]} outside the expected ${RANGE[body]} m range`); break; }
      }
      for (let i = 0; i < nor.length; i += 3) {
        const len = Math.hypot(nor[i], nor[i + 1], nor[i + 2]);
        if (Math.abs(len - 1) > 1e-3) { fail(`${body}/${id}: normal ${i / 3} has length ${len}`); break; }
      }
      const vCount = pos.length / 3;
      for (const i of idx) if (i >= vCount) { fail(`${body}/${id}: index ${i} >= vertex count ${vCount}`); break; }
      if (idx.length % 3) fail(`${body}/${id}: index count ${idx.length} not divisible by 3`);
      const tissue = prim.getAttribute('_TISSUE');
      if (!tissue) fail(`${body}/${id}: no baked _TISSUE shading attribute (run tools/bake-shading.mjs)`);
      else if (tissue.getCount() !== vCount || tissue.getElementSize() !== 4 || !tissue.getNormalized()) fail(`${body}/${id}: _TISSUE must be normalised VEC4, one per vertex`);
      const targets = prim.listTargets();
      if (MORPHS[body].includes(id)) {
        const t = targets[0]?.getAttribute('POSITION');
        if (targets.length !== 1 || !t || t.getCount() !== vCount) fail(`${body}/${id}: expected one POSITION morph target`);
        else for (const v of t.getArray()) if (!Number.isFinite(v) || Math.abs(v) > 0.5) { fail(`${body}/${id}: morph displacement ${v} out of range`); break; }
      } else if (targets.length) fail(`${body}/${id}: unexpected morph target`);
      triangles += idx.length / 3;
      const recorded = geometry.structures[id];
      if (recorded && recorded.triangleCount !== idx.length / 3) fail(`${body}/${id}: ${idx.length / 3} triangles, ${body}.json says ${recorded.triangleCount}`);
    }
  }
  summary.push(`${body}: ${names.length} nodes, ${triangles} triangles, sha256 ${hash.slice(0, 12)}…`);
}

const attribution = path.join(root, 'public/ATTRIBUTION.md');
if (!fs.existsSync(attribution)) fail('public/ATTRIBUTION.md is missing');
else {
  const text = fs.readFileSync(attribution, 'utf8');
  for (const needle of ['HuBMAP', 'Kristen Browne', '10.48539/HBM352.BTSQ.586', 'BodyParts3D', 'Database Center for Life Science', 'CC BY 4.0', 'drawn in code', provenance.outputs.skeleton.sha256, provenance.sources.united.atlasJsonSha256, provenance.sources.bodyparts3d.atlasJsonSha256]) {
    if (!text.includes(needle)) fail(`public/ATTRIBUTION.md does not mention "${needle}"`);
  }
}

if (problems.length) {
  console.error(`Asset validation FAILED (${problems.length}):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`Asset validation passed: ${summary.join('; ')}`);
