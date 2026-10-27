#!/usr/bin/env node
/**
 * Writes src/lab/source/structures.source.json: every structure of the skeleton mapped to its source
 * meshes. The skeleton is BodyParts3D 4.0 (`bp3d`, its own frame), named from the source part names
 * by the rules below. The coccyx and the knee ligaments and menisci come from the HuBMAP HRA female
 * body (`united`), carried onto the BodyParts3D bones by the `knee-*` and `pelvis` correspondence fits
 * in tools/extract-skeleton.mjs; the HRA female pelvis (`female-*`) is kept for the comparison of the
 * sexes.
 *
 *   node tools/make-structures.mjs <human-atlas public/models dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [humanDir] = process.argv.slice(2);
if (!humanDir) { console.error('Usage: node tools/make-structures.mjs <human-atlas public/models dir>'); process.exit(2); }
const atlas = JSON.parse(fs.readFileSync(path.join(humanDir, 'atlas.json'), 'utf8'));

const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const ord = (w) => ORD.indexOf(w.toLowerCase()) + 1;
const kebab = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Rules from a BodyParts3D name to [id, layer, side]. Returning null skips the part (muscles and
 * fasciae filed under the skeletal system, the larynx's soft ligaments, the eye's check ligaments).
 */
function rule(name) {
  let side = 'midline';
  let n = name;
  const lr = /\b(left|right)\b/i.exec(n);
  if (lr) { side = lr[1].toLowerCase(); n = n.replace(/\s*\b(left|right)\b\s*/i, ' ').replace(/\s+/g, ' ').trim(); }
  const S = side === 'midline' ? '' : `-${side}`;
  let m;
  if (/fibularis|tibialis|iliotibial|subscapularis|levator scapulae|tensor fasciae|calcaneal tendon|intermediate tendon|linea alba|levator ani|raphe|check ligament|trochlea of|levator palpebrae|thyrohyoid|cricothyroid|conus elasticus|vocal ligament|epiglottic/i.test(name)) return null;
  if ((m = /^(\w+) (cervical|thoracic|lumbar) vertebra$/i.exec(n))) return [`${m[2][0].toLowerCase()}${ord(m[1])}`, 'spine', 'midline'];
  if (n === 'Atlas') return ['c1', 'spine', 'midline'];
  if (n === 'Axis') return ['c2', 'spine', 'midline'];
  if (n === 'Sacrum') return ['sacrum', 'spine', 'midline'];
  if ((m = /^Intervertebral disk of (\w+) (cervical|thoracic|lumbar) vertebra$/i.exec(n))) return [`disc-${m[2][0].toLowerCase()}${ord(m[1])}`, 'discs', 'midline'];
  if (n === 'Intervertebral disk of axis') return ['disc-c2', 'discs', 'midline'];
  if (n === 'Intervertebral disk') return ['disc-t12', 'discs', 'midline']; // checked below: the one between T12 and L1
  if ((m = /^(\w+) rib$/i.exec(n))) return [`rib-${ord(m[1])}${S}`, 'thorax', side];
  if ((m = /^(\w+) costal cartilage$/i.exec(n))) return [`costal-cartilage-${ord(m[1])}${S}`, 'thorax', side];
  if (/^(Manubrium|Body of sternum|Xiphoid process)$/.test(n)) return [{ Manubrium: 'manubrium', 'Body of sternum': 'sternal-body', 'Xiphoid process': 'xiphoid' }[n], 'thorax', 'midline'];
  if ((m = /^(\w+) metacarpal bone$/i.exec(n))) return [`metacarpal-${ord(m[1])}${S}`, 'hand', side];
  if ((m = /^(\w+) metatarsal bone$/i.exec(n))) return [`metatarsal-${ord(m[1])}${S}`, 'foot', side];
  if ((m = /^(Distal|Middle|Proximal) phalanx of (thumb|index finger|middle finger|ring finger|little finger)$/i.exec(n))) return [`${m[1].toLowerCase()}-phalanx-${{ thumb: 'thumb', 'index finger': 'index', 'middle finger': 'middle', 'ring finger': 'ring', 'little finger': 'little' }[m[2]]}${S}`, 'hand', side];
  if ((m = /^(Distal|Middle|Proximal) phalanx of (big toe|second toe|third toe|fourth toe|little toe)$/i.exec(n))) return [`${m[1].toLowerCase()}-phalanx-toe-${{ 'big toe': 1, 'second toe': 2, 'third toe': 3, 'fourth toe': 4, 'little toe': 5 }[m[2]]}${S}`, 'foot', side];
  if ((m = /^(upper|lower) (first|second)? ?secondary (molar|premolar|central incisor|lateral incisor|canine) tooth$/i.exec(n.replace(/^(upper|lower) (central|lateral) secondary incisor/i, '$1 secondary $2 incisor')))) {
    const kind = m[3].toLowerCase().replace(' ', '-');
    return [`tooth-${m[1].toLowerCase()}-${kind}${m[2] ? `-${ord(m[2])}` : ''}${S}`, 'teeth', side];
  }
  if ((m = /^Gingiva of (upper|lower) jaw$/i.exec(n))) return [`gingiva-${m[1].toLowerCase()}`, 'teeth', 'midline'];
  if ((m = /^Sesamoid bone of foot$/i.exec(n))) return [`sesamoids-foot${S}`, 'foot', side];
  if ((m = /^Navicular bone of foot$/i.exec(n))) return [`navicular${S}`, 'foot', side];
  if (/^(scaphoid|lunate|triquetral|pisiform|trapezium|trapezoid|capitate|hamate)$/i.test(n)) return [`${kebab(n)}${S}`, 'hand', side];
  if (/^(talus|calcaneus|cuboid bone|(medial|intermediate|lateral) cuneiform bone)$/i.test(n)) return [`${kebab(n.replace(/ bone$/, ''))}${S}`, 'foot', side];
  if (/^(clavicle|scapula|humerus|radius|ulna)$/i.test(n)) return [`${kebab(n)}${S}`, /clavicle|scapula/i.test(n) ? 'girdle' : 'arm', side];
  if (/^(hip bone)$/i.test(n)) return [`hip-bone${S}`, 'pelvis', side];
  if (/^(femur|patella|tibia|fibula)$/i.test(n)) return [`${kebab(n)}${S}`, 'leg', side];
  if (/^(frontal bone|occipital bone|sphenoid bone|ethmoid|vomer|mandible|parietal bone|temporal bone|zygomatic bone|maxilla|nasal bone|palatine bone|lacrimal bone)$/i.test(n)) return [`${kebab(n.replace(/ bone$/, ''))}${S}`, 'skull', side];
  if (n === 'Hyoid bone') return ['hyoid', 'skull', 'midline'];
  if (/^(Thyroid cartilage|Cricoid cartilage|arytenoid cartilage|corniculate cartilage|cuneiform cartilage|major alar cartilage)$/i.test(n)) return [`${kebab(n)}${S}`, 'cartilage', side];
  if ((m = /^Interosseous membrane of (leg|forearm)$/i.exec(n))) return [`interosseous-membrane-${m[1].toLowerCase()}${S}`, 'ligaments', side];
  if (/^long plantar ligament$/i.test(n)) return [`long-plantar-ligament${S}`, 'ligaments', side];
  if (/^stylohyoid ligament$/i.test(n)) return [`stylohyoid-ligament${S}`, 'ligaments', side];
  throw new Error(`no rule for "${name}"`);
}

const S = new Map();
const add = (id, entry) => {
  const prev = S.get(id);
  if (prev) {
    if (!prev.bp3d || !entry.bp3d) throw new Error(`duplicate ${id}`);
    prev.bp3d.push(...entry.bp3d);
    return;
  }
  S.set(id, { id, ...entry });
};
const seenNames = new Set();
for (const p of atlas.parts) {
  if (!['skeletal', 'connective'].includes(p.system) && !/lacrimal bone/i.test(p.name)) continue;
  const r = rule(p.name);
  if (!r) continue;
  const [id, layer, side] = r;
  // Some parts are filed twice under one name with identical geometry (the hyoid, the cricoid).
  const key = `${p.name}|${p.vertexCount}|${p.bounds.flat().map((x) => x.toFixed(4)).join(',')}`;
  if (seenNames.has(key)) continue;
  seenNames.add(key);
  add(id, { layer, side, bp3d: [p.id], ...(side === 'midline' ? { sideCheck: false } : {}) });
}

// The one unnamed disc: check it lies between T12 and L1.
{
  const yOf = (name) => { const p = atlas.parts.find((q) => q.name === name); return (p.bounds[0][1] + p.bounds[1][1]) / 2; };
  const disc = atlas.parts.find((q) => q.name === 'Intervertebral disk');
  const y = (disc.bounds[0][1] + disc.bounds[1][1]) / 2;
  if (!(y < yOf('Twelfth thoracic vertebra') && y > yOf('First lumbar vertebra'))) throw new Error('the unnamed disc is not T12–L1');
}

// From the HRA female body: the coccyx (carried by the pelvis fit) and the knee ligaments and menisci
// (carried by each knee's fit).
add('coccyx', { layer: 'spine', side: 'midline', sideCheck: false, united: ['VH_F_coccyx'], fit: 'pelvis' });
for (const [side, X] of [['left', 'L'], ['right', 'R']]) {
  add(`acl-${side}`, { layer: 'ligaments', side, united: [`VH_F_anterior_cruciate_ligament_of_knee_${X}`], fit: `knee-${side}` });
  add(`pcl-${side}`, { layer: 'ligaments', side, united: [`VH_F_posterior_cruciate_ligament_of_knee_${X}`], fit: `knee-${side}` });
  add(`menisci-${side}`, { layer: 'ligaments', side, united: [`VH_F_meniscus_${X}`], fit: `knee-${side}` });
  add(`anterolateral-ligament-${side}`, { layer: 'ligaments', side, united: [`VH_F_anterolateral_ligament_of_knee_${X}`], fit: `knee-${side}` });
}
// The HRA female pelvis (compact and spongy bone of each part), for the comparison of the sexes.
add('female-sacrum', { layer: 'female-pelvis', side: 'midline', sideCheck: false, united: ['VH_F_sacrum'], fit: 'pelvis-rigid', female: true });
add('female-coccyx', { layer: 'female-pelvis', side: 'midline', sideCheck: false, united: ['VH_F_coccyx'], fit: 'pelvis-rigid', female: true });
for (const [side, X] of [['left', 'L'], ['right', 'R']]) {
  add(`female-hip-bone-${side}`, { layer: 'female-pelvis', side, united: ['ilium', 'ischium', 'pubis'].map((b) => `VH_F_${b}_compact_bone_${X}`), fit: 'pelvis-rigid', female: true });
  add(`female-spongy-bone-${side}`, { layer: 'female-pelvis', side, united: ['ilium', 'ischium', 'pubis'].map((b) => `VH_F_${b}_spongy_bone_${X}`), fit: 'pelvis-rigid', female: true });
}

const structures = [...S.values()];
const spec = {
  note: 'Generated by tools/make-structures.mjs. bp3d: BodyParts3D part ids. united: HRA united-female part ids (Female Atlas), placed by the named fit.',
  unitedYShift: 0.794760942,
  registration: {
    fits: {
      // The pelvis fits map the Female Atlas frame onto BodyParts3D by the vertex-for-vertex
      // correspondence of the same BodyParts3D bones present in both (Horn's method).
      pelvis: { bones: ['FJ3393'], scale: true, near: 'sacral-apex', radius: 0.05, maxRmsMm: 2 },
      'pelvis-rigid': { bones: ['FJ3393', 'FJ3288', 'FJ3152'], scale: false, maxRmsMm: 8 },
      // The Female Atlas did not put its BodyParts3D legs under the HRA knee (her HRA knees lie 1–2 cm
      // further out), so the knee set is placed on the BodyParts3D tibial plateau instead: the menisci
      // centred on it, resting on it and scaled to its width.
      'knee-left': { method: 'plateau', tibia: 'FJ3282', menisci: 'VH_F_meniscus_L' },
      'knee-right': { method: 'plateau', tibia: 'FJ3387', menisci: 'VH_F_meniscus_R' },
    },
  },
  structures,
};
const out = path.join(root, 'src/lab/source/structures.source.json');
fs.writeFileSync(out, JSON.stringify(spec, null, 1) + '\n');
const byLayer = {};
for (const s of structures) byLayer[s.layer] = (byLayer[s.layer] ?? 0) + 1;
console.log(`${structures.length} structures`, byLayer);
