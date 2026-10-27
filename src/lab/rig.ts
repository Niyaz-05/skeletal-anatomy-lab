/**
 * The posing rig: a pose (movement angles) to a world matrix for every part of the model. Each part
 * hangs from a parent and turns about a measured joint (centres and axes from the extractor):
 *
 *   pelvis (root) → L5 → … → T1 → C7 → … → C1 → skull → mandible
 *   T7 carries the thorax (ribs, cartilages, sternum), which carries each shoulder girdle
 *   girdle → humerus → ulna → radius → carpus → fingers;  pelvis → femur → tibia → talus → foot → toes
 *
 * Discs, the cruciate ligaments and the interosseous membranes lie between two bones and take the
 * average of both. Angle signs follow the clinical names (flexion, abduction, medial rotation,
 * pronation, plantarflexion, inversion, extension of the toes: positive). The shoulder adds
 * scapulohumeral rhythm: the girdle rises with elevation while the humerus keeps the asked orientation.
 */
import * as THREE from 'three';
import skeletonJson from './generated/skeleton.json';
import { SPINE_SHARE, type Pose, type Side } from './joints';

type JointData = { pivot: number[] } & Record<string, unknown>;
const JOINTS = (skeletonJson.structures as unknown as { $joints: Record<string, JointData> }).$joints;
const v3 = (a: unknown) => new THREE.Vector3(...((a as number[]) ?? [0, 0, 0]));
const pivotOf = (j: string) => { const d = JOINTS[j]; if (!d) throw new Error(`rig: no joint ${j}`); return v3(d.pivot); };
const axisOf = (j: string, k: string) => { const d = JOINTS[j]; if (!d || !d[k]) throw new Error(`rig: no axis ${k} on ${j}`); return v3(d[k]).normalize(); };

const SIDES: Side[] = ['left', 'right'];
const sg = (s: Side) => (s === 'left' ? 1 : -1);
const rad = THREE.MathUtils.degToRad;

const SPINE = ['l5', 'l4', 'l3', 'l2', 'l1', 't12', 't11', 't10', 't9', 't8', 't7', 't6', 't5', 't4', 't3', 't2', 't1', 'c7', 'c6', 'c5', 'c4', 'c3', 'c2', 'c1'];
const BELOW: Record<string, string> = Object.fromEntries(SPINE.map((v, i) => [v, i === 0 ? 'sacrum' : SPINE[i - 1]!]));
const SKULL = ['frontal', 'occipital', 'sphenoid', 'ethmoid', 'vomer', 'parietal', 'temporal', 'zygomatic', 'maxilla', 'nasal', 'palatine', 'lacrimal'];
const CARPUS = ['scaphoid', 'lunate', 'triquetral', 'pisiform', 'trapezium', 'trapezoid', 'capitate', 'hamate', 'metacarpal-2', 'metacarpal-3', 'metacarpal-4', 'metacarpal-5'];
const FOOT = ['calcaneus', 'navicular', 'cuboid', 'medial-cuneiform', 'intermediate-cuneiform', 'lateral-cuneiform', 'metatarsal-1', 'metatarsal-2', 'metatarsal-3', 'metatarsal-4', 'metatarsal-5', 'sesamoids-foot', 'long-plantar-ligament'];
const FINGERS = ['index', 'middle', 'ring', 'little'];

/** A node's place in the rig: a rigid child of a parent frame, or the average of two frames. */
type Node = { parent: string } | { blend: [string, string] };

/** Frames that are not structures: the root, the skull, the thorax. */
const FRAMES = new Set(['root', 'skull', 'thorax']);

/** The parent of each structure id (ids absent from the model are simply never asked for). */
export function rigNode(id: string): Node {
  const side = /-(left|right)$/.exec(id)?.[1] as Side | undefined;
  const base = side ? id.slice(0, -side.length - 1) : id;
  const S = (b: string) => `${b}-${side}`;
  if (/^(hip-bone|female-)/.test(id) || id === 'sacrum' || id === 'coccyx') return { parent: 'root' };
  if (SPINE.includes(id)) return { parent: BELOW[id] === 'sacrum' ? 'root' : BELOW[id]! };
  if (id.startsWith('disc-')) { const v = id.slice(5); return { blend: [v, BELOW[v] === 'sacrum' ? 'root' : BELOW[v]!] }; }
  if (SKULL.includes(base) || /^tooth-upper|^gingiva-upper|^major-alar/.test(id)) return { parent: 'skull' };
  if (id === 'mandible') return { parent: 'skull' };
  if (/^tooth-lower|^gingiva-lower/.test(id)) return { parent: 'mandible' };
  if (id === 'hyoid' || /cartilage$|cartilage-(left|right)$/.test(id) && !id.startsWith('costal') && !id.startsWith('major-alar')) return { parent: 'c4' };
  if (base === 'stylohyoid-ligament') return { blend: ['skull', 'hyoid'] };
  if (/^(rib|costal-cartilage)-/.test(id) || ['manubrium', 'sternal-body', 'xiphoid'].includes(id)) return { parent: 'thorax' };
  if (!side) return { parent: 'root' };
  switch (base) {
    case 'clavicle': return { parent: 'thorax' };
    case 'scapula': return { parent: S('clavicle') };
    case 'humerus': return { parent: S('scapula') };
    case 'ulna': return { parent: S('humerus') };
    case 'radius': return { parent: S('ulna') };
    case 'interosseous-membrane-forearm': return { blend: [S('radius'), S('ulna')] };
    case 'femur': return { parent: 'root' };
    case 'tibia': case 'fibula': case 'patella': return { parent: S('femur') };
    case 'menisci': case 'interosseous-membrane-leg': return { parent: S('tibia') };
    case 'acl': case 'pcl': case 'anterolateral-ligament': return { blend: [S('femur'), S('tibia')] };
    case 'talus': return { parent: S('tibia') };
    default: break;
  }
  if (CARPUS.includes(base)) return { parent: S('radius') };
  if (base === 'metacarpal-1') return { parent: S('trapezium') };
  if (FOOT.includes(base)) return { parent: S('talus') };
  let m;
  if ((m = /^proximal-phalanx-toe-(\d)$/.exec(base))) return { parent: S(`metatarsal-${m[1]}`) };
  if ((m = /^(middle|distal)-phalanx-toe-(\d)$/.exec(base))) return { parent: S(`proximal-phalanx-toe-${m[2]}`) };
  if ((m = /^proximal-phalanx-(\w+)$/.exec(base))) return { parent: S(m[1] === 'thumb' ? 'metacarpal-1' : `metacarpal-${FINGERS.indexOf(m[1]!) + 2}`) };
  if ((m = /^middle-phalanx-(\w+)$/.exec(base))) return { parent: S(`proximal-phalanx-${m[1]}`) };
  if ((m = /^distal-phalanx-(\w+)$/.exec(base))) return { parent: S(m[1] === 'thumb' ? 'proximal-phalanx-thumb' : `middle-phalanx-${m[1]}`) };
  return { parent: 'root' };
}

/** Rotation by `deg` about `axis` through `pivot`. */
const turn = (pivot: THREE.Vector3, axis: THREE.Vector3, deg: number, out = new THREE.Matrix4()) => {
  if (!deg) return out.identity();
  const r = new THREE.Matrix4().makeRotationAxis(axis, rad(deg));
  return out.makeTranslation(pivot.x, pivot.y, pivot.z).multiply(r).multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
};
const about = (pivot: THREE.Vector3, rot: THREE.Matrix4) =>
  new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z).multiply(rot).multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
const rotAxis = (axis: THREE.Vector3, deg: number) => new THREE.Matrix4().makeRotationAxis(axis, rad(deg));

/** Grip: the share of each finger joint's full flexion (MCP 90°, PIP 100°, DIP 80°; thumb CMC 30°, MCP 50°, IP 70°). */
const GRIP: Record<string, number> = { proximal: 90, middle: 100, distal: 80, 'thumb-metacarpal': 30, 'thumb-proximal': 50, 'thumb-distal': 70 };

/**
 * The local motion of a node relative to its parent, as a matrix in model space (about the rest-pose
 * joint, which the parent's matrix then carries).
 */
function localMotion(id: string, pose: Pose): THREE.Matrix4 {
  const a = (k: string) => pose[k] ?? 0;
  const side = /-(left|right)$/.exec(id)?.[1] as Side | undefined;
  const base = side ? id.slice(0, -side.length - 1) : id;
  if (SPINE.includes(id) || id === 'skull') {
    const j = id === 'skull' ? 'atlanto-occipital' : `spine-${id}`;
    // The joint below each cervical vertebra (C7–T1 included) and the skull on the atlas belong to the neck.
    const pre = id === 'skull' || id.startsWith('c') ? 'neck' : 'trunk';
    const share = (m: string) => SPINE_SHARE[`${pre}-${m}`]?.[j] ?? 0;
    const p = pivotOf(j);
    const r = rotAxis(axisOf(j, 'flex'), a(`${pre}-flex`) * share('flex'))
      .multiply(rotAxis(axisOf(j, 'side'), a(`${pre}-side`) * share('side')))
      .multiply(rotAxis(axisOf(j, 'rot'), a(`${pre}-rot`) * share('rot')));
    return about(p, r);
  }
  if (id === 'mandible') {
    const mm = a('jaw-open');
    const m = turn(pivotOf('tmj'), axisOf('tmj', 'flex'), mm * 0.55);
    // Past about 20 mm the condyles glide forwards and down onto the articular eminence.
    const glide = Math.max(0, mm - 20) / 30;
    return new THREE.Matrix4().makeTranslation(0, -0.004 * glide, 0.009 * glide).multiply(m);
  }
  if (!side) return new THREE.Matrix4();
  const s = sg(side), A = (k: string) => a(`${k}-${side}`);
  const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
  switch (base) {
    case 'clavicle': {
      // The girdle's share of elevation (scapulohumeral rhythm), about the sternoclavicular joint.
      const elev = Math.min(30, (Math.max(0, A('shoulder-flex')) + A('shoulder-abd')) / 6);
      return turn(pivotOf(`sternoclavicular-${side}`), axisOf(`sternoclavicular-${side}`, 'ap'), s * elev);
    }
    case 'ulna': return turn(pivotOf(`elbow-${side}`), axisOf(`elbow-${side}`, 'flex'), -A('elbow-flex'));
    case 'radius': return turn(pivotOf(`radioulnar-${side}`), axisOf(`radioulnar-${side}`, 'pron'), s * A('forearm-pron'));
    case 'tibia': case 'fibula': return turn(pivotOf(`knee-${side}`), axisOf(`knee-${side}`, 'flex'), A('knee-flex'));
    case 'patella': return turn(pivotOf(`knee-${side}`), axisOf(`knee-${side}`, 'flex'), A('knee-flex') * 0.7);
    case 'talus': return turn(pivotOf(`ankle-${side}`), axisOf(`ankle-${side}`, 'flex'), A('ankle-flex'));
    case 'femur': {
      const r = rotAxis(X, -A('hip-flex')).multiply(rotAxis(Z, s * A('hip-abd'))).multiply(rotAxis(axisOf(`hip-${side}`, 'rot'), s * A('hip-rot')));
      return about(pivotOf(`hip-${side}`), r);
    }
    default: break;
  }
  if (CARPUS.includes(base) && base !== 'metacarpal-1') {
    const r = rotAxis(X, -A('wrist-flex')).multiply(rotAxis(Z, -s * A('wrist-dev')));
    return about(pivotOf(`wrist-${side}`), r);
  }
  if (FOOT.includes(base)) return turn(pivotOf(`subtalar-${side}`), axisOf(`subtalar-${side}`, 'inv'), -s * A('foot-inv'));
  let m;
  if ((m = /^proximal-phalanx-toe-\d$/.exec(base))) return turn(pivotOf(`${id}-joint`), X, -A('toes-ext'));
  const grip = A('grip') / 100;
  if (grip && (m = /^(proximal|middle|distal)-phalanx-(\w+)$|^metacarpal-1$/.exec(base))) {
    const thumb = base === 'metacarpal-1' || m[2] === 'thumb';
    if (/toe/.test(base)) return new THREE.Matrix4();
    const key = base === 'metacarpal-1' ? 'thumb-metacarpal' : thumb ? `thumb-${m[1]}` : m[1]!;
    const dir = axisOf(`${id}-joint`, 'dir');
    const across = thumb ? new THREE.Vector3(-s, 0, 0) : new THREE.Vector3(0, 0, 1);
    const axis = new THREE.Vector3().crossVectors(dir, across).normalize();
    return turn(pivotOf(`${id}-joint`), axis, (GRIP[key] ?? 0) * grip);
  }
  return new THREE.Matrix4();
}

/** The humerus keeps the asked orientation about its (girdle-carried) head, whatever the girdle did. */
function humerusWorld(side: Side, pose: Pose, girdle: THREE.Matrix4): THREE.Matrix4 {
  const A = (k: string) => pose[`${k}-${side}`] ?? 0, s = sg(side);
  const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
  const head = pivotOf(`shoulder-${side}`);
  const moved = head.clone().applyMatrix4(girdle);
  const r = rotAxis(X, -A('shoulder-flex')).multiply(rotAxis(Z, s * A('shoulder-abd'))).multiply(rotAxis(axisOf(`shoulder-${side}`, 'rot'), s * A('shoulder-rot')));
  return new THREE.Matrix4().makeTranslation(moved.x, moved.y, moved.z).multiply(r).multiply(new THREE.Matrix4().makeTranslation(-head.x, -head.y, -head.z));
}

const CENTROIDS = skeletonJson.structures as unknown as Record<string, { centroid?: number[] }>;
/**
 * A part lying between two bones: its centre goes to the midpoint of where each bone would carry it,
 * and it turns halfway between them (blending the matrices directly would mix their pivots).
 */
const blend = (id: string, a: THREE.Matrix4, b: THREE.Matrix4) => {
  const c = v3(CENTROIDS[id]?.centroid);
  const mid = c.clone().applyMatrix4(a).lerp(c.clone().applyMatrix4(b), 0.5);
  const qa = new THREE.Quaternion().setFromRotationMatrix(a), qb = new THREE.Quaternion().setFromRotationMatrix(b);
  return new THREE.Matrix4().makeTranslation(mid.x, mid.y, mid.z).multiply(new THREE.Matrix4().makeRotationFromQuaternion(qa.slerp(qb, 0.5))).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
};

/**
 * World matrices (relative to the rest pose) for the given structure ids. The rest pose (an empty
 * pose) gives identity for every part.
 */
export function poseMatrices(ids: readonly string[], pose: Pose): Map<string, THREE.Matrix4> {
  const cache = new Map<string, THREE.Matrix4>();
  const world = (id: string): THREE.Matrix4 => {
    const hit = cache.get(id);
    if (hit) return hit;
    let m: THREE.Matrix4;
    if (id === 'root') m = new THREE.Matrix4();
    else if (id === 'thorax') m = world('t7').clone();
    else if (id === 'skull') m = world('c1').clone().multiply(localMotion('skull', pose));
    else if (/^humerus-(left|right)$/.test(id)) {
      const side = id.endsWith('left') ? 'left' : 'right';
      m = humerusWorld(side, pose, world(`scapula-${side}`));
    } else {
      const node = rigNode(id);
      if ('blend' in node) m = blend(id, world(node.blend[0]), world(node.blend[1]));
      else m = world(node.parent).clone().multiply(localMotion(id, pose));
    }
    cache.set(id, m);
    return m;
  };
  const out = new Map<string, THREE.Matrix4>();
  for (const id of ids) if (!FRAMES.has(id)) out.set(id, world(id));
  return out;
}

/** Whether a pose moves anything. */
export const isRest = (pose: Pose) => Object.values(pose).every((v) => !v);
export { SIDES };
