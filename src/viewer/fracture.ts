/**
 * The drawing of a fracture: the real bone split by planes into fragments, each fragment's
 * displacement, and the haematoma and callus around the break. At the injury (week 0) the fragments
 * lie displaced as the pattern usually leaves them; from then on they are shown reduced and held,
 * the gap closing as the callus bridges it.
 */
import * as THREE from 'three';
import { fractureAnchors } from '../lab/anchors';
import { healingAt, patternById, siteById, unionWeeks, type HealingFactors } from '../lab/fractures';

export interface Fragment {
  /** Clipping planes that keep this fragment (model space, before its matrix). */
  planes: THREE.Plane[];
  /** Its displacement, in model space. */
  matrix: THREE.Matrix4;
}
export interface FractureView {
  bone: string;
  fragments: Fragment[];
  /** A crushed vertebra instead of a split. */
  crush: THREE.Matrix4 | null;
  centre: THREE.Vector3;
  axis: THREE.Vector3;
  radius: number;
  haematoma: number;
  softCallus: number;
  hardCallus: number;
  stage: ReturnType<typeof healingAt>['stage'];
  union: number;
}

const rotateAbout = (pivot: THREE.Vector3, axis: THREE.Vector3, deg: number) =>
  new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(new THREE.Matrix4().makeRotationAxis(axis.clone().normalize(), THREE.MathUtils.degToRad(deg)))
    .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
const shift = (v: THREE.Vector3) => new THREE.Matrix4().makeTranslation(v.x, v.y, v.z);
/** Keep the side a plane's normal points to. */
const keep = (n: THREE.Vector3, at: THREE.Vector3) => new THREE.Plane(n.clone(), -n.dot(at));

export function fractureView(siteId: string, patternId: string, weeks: number, healing: HealingFactors): FractureView | null {
  const site = siteById(siteId), pattern = patternById(patternId), a = fractureAnchors()[siteId];
  if (!site || !pattern || !a) return null;
  const at = new THREE.Vector3(...a.at), axis = new THREE.Vector3(...a.axis).normalize();
  const radius = ((a as { radiusMm?: number }).radiusMm ?? 8) / 1000;
  const toEnd = ((a as { toEndMm?: number }).toEndMm ?? 30) / 1000;
  // The direction of displacement: backwards (dorsal, as in a Colles fracture) across the bone.
  const d = new THREE.Vector3(0, 0, -1).projectOnPlane(axis);
  if (d.lengthSq() < 1e-6) d.set(1, 0, 0).projectOnPlane(axis);
  d.normalize();
  const hinge = new THREE.Vector3().crossVectors(axis, d).normalize();
  const union = unionWeeks(siteId, patternId, healing);
  const h = healingAt(weeks, union);
  const injury = weeks < 0.25 ? 1 : 0;
  const gap = 0.0012 * (1 - h.bridged) * (1 - injury);
  const draw = pattern.draw;
  const base = { centre: at, axis, radius, haematoma: h.haematoma, softCallus: h.softCallus, hardCallus: h.hardCallus, stage: h.stage, union, bone: site.bone };

  if (draw.crush) {
    // Wedge compression: the vertebral body loses about a third of its front height.
    const s = 1 - 0.3 * (injury > 0 ? 1 : 0.85);
    const m = new THREE.Matrix4().makeTranslation(0, at.y - 0.012, 0).multiply(new THREE.Matrix4().makeScale(1, s, 1)).multiply(new THREE.Matrix4().makeTranslation(0, -(at.y - 0.012), 0));
    return { ...base, fragments: [], crush: m, haematoma: 0, softCallus: 0, hardCallus: 0 };
  }

  if (draw.avulsion) {
    // A small piece of the tip pulled off by its ligament.
    const tipAt = at.clone().addScaledVector(axis, -(toEnd - 0.007));
    const pull = injury ? 0.004 : gap;
    return {
      ...base, centre: tipAt, radius: radius * 0.8, crush: null,
      fragments: [
        { planes: [keep(axis, tipAt)], matrix: new THREE.Matrix4() },
        { planes: [keep(axis.clone().negate(), tipAt)], matrix: shift(axis.clone().multiplyScalar(-pull)) },
      ],
    };
  }

  // The fracture plane: square to the bone, tilted for oblique and spiral patterns.
  const n = axis.clone().applyAxisAngle(hinge, THREE.MathUtils.degToRad(draw.tilt));
  let far = new THREE.Matrix4();
  if (injury) {
    if (draw.bend) {
      // Greenstick (and a stress crack, which barely opens): hinged on the far cortex.
      far = rotateAbout(at.clone().addScaledVector(d, -radius), hinge, patternId === 'stress' ? 0.6 : -9);
    } else if (draw.impacted) {
      far = shift(axis.clone().multiplyScalar(0.004));
    } else {
      const shorten = draw.tilt >= 40 ? 0.005 : 0;
      far = shift(d.clone().multiplyScalar(0.003 + (draw.tilt >= 40 ? 0.002 : 0)).addScaledVector(axis, shorten))
        .multiply(rotateAbout(at, hinge, patternId === 'transverse' ? -8 : -4));
      if (draw.twist) far.multiply(rotateAbout(at, axis, draw.twist));
    }
  } else {
    far = shift(axis.clone().multiplyScalar(-gap));
  }
  if (draw.butterfly) {
    // A wedge-shaped third fragment between two planes, pushed out of line.
    const at2 = at.clone().addScaledVector(axis, -2.2 * radius);
    const n2 = axis.clone().applyAxisAngle(hinge, THREE.MathUtils.degToRad(-35));
    const out = injury ? shift(d.clone().multiplyScalar(-0.003)) : shift(axis.clone().multiplyScalar(-gap / 2));
    return {
      ...base, crush: null,
      fragments: [
        { planes: [keep(n, at)], matrix: new THREE.Matrix4() },
        { planes: [keep(n.clone().negate(), at), keep(n2, at2)], matrix: out },
        { planes: [keep(n2.clone().negate(), at2)], matrix: far },
      ],
    };
  }
  return {
    ...base, crush: null,
    fragments: [
      { planes: [keep(n, at)], matrix: new THREE.Matrix4() },
      { planes: [keep(n.clone().negate(), at)], matrix: far },
    ],
  };
}
