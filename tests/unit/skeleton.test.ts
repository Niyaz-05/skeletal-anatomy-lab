import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { definition as def } from '../../src/lab/definition';
import { validateDefinition } from '../../src/contract/validate';
import { APPROVED_ASSETS } from '../../src/contract/assets';
import geometry from '../../src/lab/generated/skeleton.json';
import provenance from '../../src/lab/generated/provenance.json';
import { poseMatrices } from '../../src/lab/rig';
import { clampPose, JOINTS, MOVEMENTS, POSES, SPINE_SHARE } from '../../src/lab/joints';
import { bmdAt, category, DEFAULT_FACTORS, hipRiskRelative, tScore, YOUNG } from '../../src/lab/bone';
import { FRACTURE_SITES, FRACTURE_TYPES, healingAt, unionWeeks, DEFAULT_HEALING } from '../../src/lab/fractures';
import { boneCount, boneStage, erupted, fusionAge, PHYSES, physisOpen } from '../../src/lab/growth';
import { fractureAnchors } from '../../src/lab/anchors';
import { fractureView } from '../../src/viewer/fracture';
import { effectivePose, initialState, isVisible, makeReducer } from '../../src/app/state';
import { searchStructures } from '../../src/app/search';

const G = geometry.structures as unknown as Record<string, { centroid: number[]; bounds: number[][] }> & { $joints: Record<string, { pivot: number[]; headRadiusMm?: number; fitRmsMm?: number }> };
const meshIds = def.structures.filter((s) => s.kind === 'mesh').map((s) => s.id);
const V = (p: number[]) => new THREE.Vector3(...p);
/** Where a point of a structure goes under a pose. */
const moved = (id: string, pose: Record<string, number>, p: number[] = G[id]!.centroid) => V(p).applyMatrix4(poseMatrices([id], pose).get(id)!);

describe('definition and the validation gate', () => {
  it('passes with no errors or warnings', () => {
    const r = validateDefinition(def);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });
  it('rejects an unapproved asset and a missing left/right partner', () => {
    const bad = { ...def, assets: [{ id: 'nope', role: 'anatomy-model' as const }] };
    expect(validateDefinition(bad).ok).toBe(false);
    const unpaired = { ...def, structures: def.structures.filter((s) => s.id !== 'femur-right') };
    const r = validateDefinition(unpaired);
    expect(r.ok).toBe(false);
  });
  it('has one mesh structure per model node, and every node a structure', () => {
    expect([...meshIds].sort()).toEqual([...APPROVED_ASSETS['bp3d-skeleton-v1']!.nodes].sort());
    expect(meshIds.length).toBe(301);
  });
  it('puts every left/right part on its side', () => {
    for (const s of def.structures.filter((x) => x.kind === 'mesh' && x.side !== 'midline')) {
      expect(Math.sign(G[s.id]!.centroid[0]!), s.id).toBe(s.side === 'left' ? 1 : -1);
    }
  });
  it('cites https sources, and every HRA part says where it came from', () => {
    for (const src of def.sources) if (src.url) expect(src.url.startsWith('https://')).toBe(true);
    for (const s of def.structures.filter((x) => x.sources.includes('hra') && x.kind === 'mesh')) expect(s.modelNote, s.id).toBeTruthy();
  });
  it('checks every tour step and its focus', () => {
    expect(def.tour.length).toBeGreaterThanOrEqual(20);
    for (const t of def.tour) for (const f of t.focus) expect(def.structures.some((s) => s.id === f), `${t.id}: ${f}`).toBe(true);
  });
});

describe('the model: layout, fits and joints', () => {
  it('passes the extractor’s checks', () => {
    expect(Object.entries(provenance.checks).filter(([, ok]) => !ok)).toEqual([]);
  });
  it('is an adult skeleton of textbook proportions', () => {
    const m = provenance.measures as { statureMm: number; boneLengthsMm: Record<string, number> };
    expect(m.statureMm).toBeGreaterThan(1600);
    expect(m.statureMm).toBeLessThan(1850);
    // The femur is about a quarter of the stature; the tibia about four fifths of the femur.
    expect(m.boneLengthsMm.femur! / m.statureMm).toBeGreaterThan(0.24);
    expect(m.boneLengthsMm.femur! / m.statureMm).toBeLessThan(0.29);
    expect(m.boneLengthsMm.tibia! / m.boneLengthsMm.femur!).toBeGreaterThan(0.75);
    expect(m.boneLengthsMm.tibia! / m.boneLengthsMm.femur!).toBeLessThan(0.88);
  });
  it('fits the femoral and humeral heads as spheres of textbook size', () => {
    for (const j of ['hip-left', 'hip-right', 'shoulder-left', 'shoulder-right']) {
      const d = G.$joints[j]!;
      expect(d.headRadiusMm! * 2, j).toBeGreaterThan(38);
      expect(d.headRadiusMm! * 2, j).toBeLessThan(56);
      expect(d.fitRmsMm!, j).toBeLessThan(2);
    }
  });
  it('carries the coccyx and the female pelvis across with small residuals', () => {
    const fits = provenance.sources.registration.fits as Record<string, { rmsMm: number | null }>;
    expect(fits.pelvis!.rmsMm!).toBeLessThan(2);
    expect(fits['pelvis-rigid']!.rmsMm!).toBeLessThan(8);
    expect(G.coccyx!.centroid[1]!).toBeLessThan(G.sacrum!.centroid[1]!);
  });
  it('measures a wider pubic arch and a deeper inlet in the female pelvis', () => {
    const p = (provenance.measures as { pelvis: Record<'male' | 'female', { subpubicAngleDeg: number; inletConjugateMm: number }> }).pelvis;
    expect(p.female.subpubicAngleDeg).toBeGreaterThan(p.male.subpubicAngleDeg + 20);
    expect(p.male.subpubicAngleDeg).toBeGreaterThan(45);
    expect(p.male.subpubicAngleDeg).toBeLessThan(80);
    expect(p.female.inletConjugateMm).toBeGreaterThan(p.male.inletConjugateMm);
  });
  it('places every fracture site on its bone and every growth plate across its bone', () => {
    for (const [k, a] of Object.entries(fractureAnchors())) {
      const b = G[a.bone]!.bounds;
      for (let i = 0; i < 3; i++) { expect(a.at[i]!, k).toBeGreaterThan(b[0]![i]! - 0.005); expect(a.at[i]!, k).toBeLessThan(b[1]![i]! + 0.005); }
    }
    for (const p of PHYSES) {
      const b = G[p.bone]!.bounds;
      for (let i = 0; i < 3; i++) { expect(p.centre[i]!, p.id).toBeGreaterThan(b[0]![i]! - 0.005); expect(p.centre[i]!, p.id).toBeLessThan(b[1]![i]! + 0.005); }
    }
  });
});

describe('the posing rig', () => {
  it('leaves every part where it is in the anatomical position', () => {
    const m = poseMatrices(meshIds, {});
    for (const id of meshIds) expect(m.get(id)!.equals(new THREE.Matrix4()), id).toBe(true);
  });
  it('flexes the elbow forwards and up, and keeps the forearm on the elbow', () => {
    const wrist = moved('radius-left', { 'elbow-flex-left': 90 }, G.$joints['wrist-left']!.pivot);
    const rest = V(G.$joints['wrist-left']!.pivot);
    expect(wrist.z - rest.z).toBeGreaterThan(0.15);
    expect(wrist.y - rest.y).toBeGreaterThan(0.1);
    const elbow = V(G.$joints['elbow-left']!.pivot);
    expect(moved('ulna-left', { 'elbow-flex-left': 90 }, elbow.toArray()).distanceTo(elbow)).toBeLessThan(1e-6);
  });
  it('flexes the hip forwards, the knee backwards and abducts the arm outwards on each side', () => {
    const knee = (s: string) => V(G.$joints[`knee-${s}`]!.pivot);
    expect(moved('femur-left', { 'hip-flex-left': 90 }, knee('left').toArray()).z).toBeGreaterThan(knee('left').z + 0.3);
    const ankle = V(G.$joints['ankle-left']!.pivot);
    expect(moved('tibia-left', { 'knee-flex-left': 90 }, ankle.toArray()).z).toBeLessThan(ankle.z - 0.3);
    for (const s of ['left', 'right']) {
      const elbow = V(G.$joints[`elbow-${s}`]!.pivot);
      const e = moved(`humerus-${s}`, { [`shoulder-abd-${s}`]: 90 }, elbow.toArray());
      expect(Math.sign(e.x - elbow.x), s).toBe(s === 'left' ? 1 : -1);
      expect(e.y).toBeGreaterThan(elbow.y + 0.2);
    }
  });
  it('raises the shoulder girdle with the arm (scapulohumeral rhythm) but keeps the head in the glenoid', () => {
    const ac = V(G.$joints['acromioclavicular-left']!.pivot);
    expect(moved('clavicle-left', { 'shoulder-abd-left': 150 }, ac.toArray()).y).toBeGreaterThan(ac.y + 0.01);
    const head = V(G.$joints['shoulder-left']!.pivot);
    const humeral = moved('humerus-left', { 'shoulder-abd-left': 150 }, head.toArray());
    const glenoid = moved('scapula-left', { 'shoulder-abd-left': 150 }, head.toArray());
    expect(humeral.distanceTo(glenoid)).toBeLessThan(1e-4);
  });
  it('turns the face to the left and bends the trunk forwards', () => {
    const nose = G.vomer!.centroid;
    expect(moved('vomer', { 'neck-rot': 60 }, nose).x).toBeGreaterThan(nose[0]! + 0.03);
    const skull = G.frontal!.centroid;
    const bent = moved('frontal', { 'trunk-flex': 60 }, skull);
    expect(bent.z).toBeGreaterThan(skull[2]! + 0.2);
    expect(bent.y).toBeLessThan(skull[1]! - 0.05);
  });
  it('curls the fingers towards the palm and keeps the knee ligaments in the knee', () => {
    const tip = G['distal-phalanx-index-left']!.centroid;
    // Part-way, the fingertip swings forwards towards the palm side; a full fist folds it back onto the palm.
    expect(moved('distal-phalanx-index-left', { 'grip-left': 40 }, tip).z).toBeGreaterThan(tip[2]! + 0.015);
    const fist = moved('distal-phalanx-index-left', { 'grip-left': 100 }, tip);
    expect(fist.distanceTo(V(G['metacarpal-3-left']!.centroid))).toBeLessThan(0.06);
    const knee = V(G.$joints['knee-left']!.pivot);
    const pose = { 'hip-flex-left': 110, 'knee-flex-left': 130 };
    const kneeNow = moved('femur-left', pose, knee.toArray());
    for (const id of ['acl-left', 'pcl-left', 'menisci-left']) expect(moved(id, pose).distanceTo(kneeNow), id).toBeLessThan(0.05);
  });
  it('keeps every pose within the normal ranges and shares spinal movement fully', () => {
    for (const p of POSES) expect(clampPose(p.pose), p.id).toEqual(p.pose);
    expect(clampPose({ 'elbow-flex-left': 400, 'nonsense-left': 3, 'neck-rot-left': 5 })).toEqual({ 'elbow-flex-left': 150 });
    for (const [k, w] of Object.entries(SPINE_SHARE)) expect(Object.values(w).reduce((a, b) => a + b, 0), k).toBeCloseTo(1, 6);
    for (const m of MOVEMENTS) expect(m.min).toBeLessThan(m.max);
    expect(JOINTS.length).toBeGreaterThanOrEqual(15);
  });
});

describe('bone mass', () => {
  it('peaks at the young-adult reference and falls with age, faster in women', () => {
    expect(bmdAt(30, 'female')).toBeCloseTo(YOUNG.female.mean, 3);
    expect(bmdAt(30, 'male')).toBeCloseTo(YOUNG.male.mean, 3);
    expect(bmdAt(12, 'female')).toBeLessThan(bmdAt(20, 'female'));
    // NHANES III: women in their 70s average a femoral-neck T-score near −2; men stay higher.
    const f75 = tScore(bmdAt(75, 'female')), m75 = tScore(bmdAt(75, 'male'));
    expect(f75).toBeGreaterThan(-2.4);
    expect(f75).toBeLessThan(-1.5);
    expect(m75).toBeGreaterThan(f75);
    expect(category(tScore(bmdAt(75, 'female', { ...DEFAULT_FACTORS, menopause: 45, smoker: true, steroidsFrom: 60 })))).toBe('osteoporosis');
  });
  it('responds to its factors in the right direction', () => {
    const base = bmdAt(70, 'female');
    expect(bmdAt(70, 'female', { ...DEFAULT_FACTORS, hrt: true })).toBeGreaterThan(base);
    expect(bmdAt(70, 'female', { ...DEFAULT_FACTORS, smoker: true })).toBeLessThan(base);
    expect(bmdAt(70, 'female', { ...DEFAULT_FACTORS, steroidsFrom: 50 })).toBeLessThan(base);
    expect(bmdAt(70, 'female', { ...DEFAULT_FACTORS, activeYouth: true })).toBeGreaterThan(base);
    expect(bmdAt(70, 'female', { ...DEFAULT_FACTORS, menopause: 45 })).toBeLessThan(base);
  });
  it('uses the WHO thresholds and 2.6-fold hip risk per SD', () => {
    expect(category(-0.99)).toBe('normal');
    expect(category(-1.01)).toBe('osteopenia');
    expect(category(-2.5)).toBe('osteoporosis');
    expect(hipRiskRelative(-1)).toBeCloseTo(2.6, 6);
    expect(hipRiskRelative(-2)).toBeCloseTo(6.76, 6);
  });
});

describe('fractures', () => {
  it('puts every site on a real bone with patterns that exist', () => {
    for (const s of FRACTURE_SITES) {
      expect(meshIds, s.id).toContain(s.bone);
      expect(fractureAnchors()[s.id]?.bone, s.id).toBe(s.bone);
      expect(s.patterns).toContain(s.defaultPattern);
      for (const p of s.patterns) expect(FRACTURE_TYPES.some((t) => t.id === p), p).toBe(true);
    }
  });
  it('heals slower with smoking, diabetes and age, faster in children', () => {
    const base = unionWeeks('tibial-shaft', 'transverse', DEFAULT_HEALING);
    expect(base).toBeGreaterThanOrEqual(16);
    expect(base).toBeLessThanOrEqual(20);
    expect(unionWeeks('tibial-shaft', 'transverse', { ...DEFAULT_HEALING, smoker: true })).toBeGreaterThan(base);
    expect(unionWeeks('tibial-shaft', 'transverse', { ...DEFAULT_HEALING, diabetes: true })).toBeGreaterThan(base);
    expect(unionWeeks('tibial-shaft', 'transverse', { ...DEFAULT_HEALING, age: 80 })).toBeGreaterThan(base);
    expect(unionWeeks('tibial-shaft', 'transverse', { ...DEFAULT_HEALING, age: 8 })).toBeLessThan(base);
  });
  it('passes through the healing stages in order', () => {
    const order = [0, 1, 4, 10, 30].map((w) => healingAt(w, 8).stage);
    expect(order).toEqual(['haematoma', 'soft-callus', 'soft-callus', 'remodelling', 'remodelling'].map((s, i) => (i === 2 ? healingAt(4, 8).stage : s)));
    expect(healingAt(0, 8).stage).toBe('haematoma');
    expect(healingAt(5, 8).stage).toBe('hard-callus');
    expect(healingAt(12, 8).stage).toBe('remodelling');
    expect(healingAt(12, 8).bridged).toBe(1);
  });
  it('splits the bone into fragments on either side of the break, or crushes a vertebra', () => {
    const v = fractureView('distal-radius', 'transverse', 0, DEFAULT_HEALING)!;
    expect(v.fragments).toHaveLength(2);
    const above = v.centre.clone().addScaledVector(v.axis, 0.01), below = v.centre.clone().addScaledVector(v.axis, -0.01);
    expect(v.fragments[0]!.planes[0]!.distanceToPoint(above)).toBeGreaterThan(0);
    expect(v.fragments[1]!.planes[0]!.distanceToPoint(below)).toBeGreaterThan(0);
    expect(fractureView('tibial-shaft', 'comminuted', 0, DEFAULT_HEALING)!.fragments).toHaveLength(3);
    const c = fractureView('vertebral-compression', 'compression', 0, DEFAULT_HEALING)!;
    expect(c.fragments).toHaveLength(0);
    expect(c.crush).not.toBeNull();
  });
});

describe('growth', () => {
  it('ossifies the carpal bones in their order and completes the skeleton by the mid-20s', () => {
    expect(boneStage('capitate-left', 0.1, 'female')).toBe('cartilage');
    expect(boneStage('capitate-left', 1, 'female')).toBe('growing');
    expect(boneStage('scaphoid-left', 3, 'female')).toBe('cartilage');
    expect(boneStage('pisiform-left', 8, 'female')).toBe('cartilage');
    expect(boneStage('pisiform-left', 13, 'female')).toBe('growing');
    expect(boneStage('femur-left', 30, 'male')).toBe('adult');
  });
  it('closes growth plates earlier in girls, the clavicle’s last', () => {
    for (const p of PHYSES) expect(fusionAge(p, 'female'), p.id).toBeLessThanOrEqual(fusionAge(p, 'male'));
    expect(PHYSES.filter((p) => physisOpen(p, 21, 'female') > 0).every((p) => p.bone.startsWith('clavicle'))).toBe(true);
    expect(PHYSES.every((p) => physisOpen(p, 10, 'male') === 1)).toBe(true);
  });
  it('erupts the first molars and incisors first and counts the bones down to 206', () => {
    expect(erupted('tooth-lower-molar-1-left', 6.6)).toBe(true);
    expect(erupted('tooth-upper-canine-left', 9)).toBe(false);
    expect(boneCount(0)).toBe(270);
    expect(boneCount(25)).toBe(206);
  });
});

describe('the reducer and views', () => {
  const reduce = makeReducer(def);
  const s0 = initialState(def);
  it('moves a joint within its range, on one side or both', () => {
    let s = reduce(reduce(s0, { type: 'set-mode', mode: 'joints' }), { type: 'set-movement', key: 'knee-flex-left', value: 200 });
    expect(s.joints.pose['knee-flex-left']).toBe(135);
    s = reduce(s, { type: 'set-movement', key: 'elbow-flex-both', value: 45 });
    expect(s.joints.pose['elbow-flex-left']).toBe(45);
    expect(s.joints.pose['elbow-flex-right']).toBe(45);
    expect(effectivePose(def, s)['knee-flex-left']).toBe(135);
    expect(effectivePose(def, reduce(s, { type: 'set-mode', mode: 'explore' }))).toEqual({});
    s = reduce(s, { type: 'set-pose', preset: 'squat' });
    expect(s.joints.preset).toBe('squat');
  });
  it('frames a fracture site and keeps only patterns that occur there', () => {
    let s = reduce(s0, { type: 'set-mode', mode: 'fractures' });
    expect(s.camera.around).toHaveLength(4);
    s = reduce(s, { type: 'set-fracture', value: { site: 'vertebral-compression', pattern: 'spiral' } });
    expect(s.fracture.pattern).toBe('compression');
  });
  it('shows only the two pelvises when comparing them', () => {
    const s = reduce(reduce(s0, { type: 'set-mode', mode: 'life' }), { type: 'set-life', value: { compare: true } });
    expect(isVisible(def, s, 'female-hip-bone-left')).toBe(true);
    expect(isVisible(def, s, 'hip-bone-right')).toBe(true);
    expect(isVisible(def, s, 'femur-left')).toBe(false);
    expect(s.camera.around).toHaveLength(4);
  });
  it('applies the tour’s poses, fractures and comparisons', () => {
    const idx = (id: string) => def.tour.findIndex((t) => t.id === id);
    const walk = reduce(s0, { type: 'tour-go', index: idx('walk') });
    expect(effectivePose(def, walk)['hip-flex-left']).toBe(25);
    expect(reduce(s0, { type: 'tour-go', index: idx('colles') }).camera.around).toHaveLength(4);
    const sexes = reduce(s0, { type: 'tour-go', index: idx('sexes') });
    expect(isVisible(def, sexes, 'femur-left')).toBe(false);
  });
  it('finds bones by everyday names and abbreviations', () => {
    const top = (q: string) => searchStructures(def.structures, q)[0]?.structure.id;
    expect(top('collarbone')).toMatch(/^clavicle/);
    expect(top('kneecap')).toMatch(/^patella/);
    expect(top('ACL')).toMatch(/^acl/);
    expect(top('C7')).toBe('c7');
    expect(top('breastbone')).toBe('sternum');
  });
});
