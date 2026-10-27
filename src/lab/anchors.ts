/**
 * Geometry facts written by the extractor: structure bounds and centroids, the joints, measurements
 * and anchors (fracture sites, growth plates, the pelvises). Every function takes the definition, so
 * the shape matches the other labs.
 */
import skeletonJson from './generated/skeleton.json';
import type { CloseUp, Mode, SimulationDefinition } from '../contract/schema';
import { MODE_LAYERS } from '../app/modes';

export type Vec3 = [number, number, number];
export interface G { centroid: number[]; bounds: number[][]; surfaceAnchor?: number[]; axes?: number[][]; extentsMm?: number[]; side: string; layer: string }
interface Data { geometry: Record<string, G>; joints: Record<string, Record<string, unknown>>; measures: Record<string, unknown>; anchors: Record<string, unknown> }

const raw = skeletonJson.structures as unknown as Record<string, unknown>;
const DATA: Data = {
  geometry: Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('$'))) as Record<string, G>,
  joints: raw.$joints as Data['joints'], measures: raw.$measures as Data['measures'], anchors: raw.$anchors as Data['anchors'],
};
export const geometryOf = (_def?: SimulationDefinition) => DATA.geometry;
export const measures = () => DATA.measures as {
  statureMm: number; boneLengthsMm: Record<string, number>; femoralHeadMm: number; humeralHeadMm: number;
  pelvis: Record<'male' | 'female', { inletConjugateMm: number; subpubicAngleDeg: number; biiliacWidthMm: number; heightMm: number }>;
};
export interface FractureAnchor { bone: string; at: number[]; axis: number[] }
export const fractureAnchors = () => DATA.anchors.fractures as Record<string, FractureAnchor>;
export const pelvisCentres = () => ({ male: DATA.anchors.pelvisCentre as number[], female: DATA.anchors.femalePelvisCentre as number[] });
export const jointData = () => DATA.joints;

export const vec = (p: readonly number[]): Vec3 => [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];

/** A point to hang a label on: on the structure's surface, or the middle of a group. */
export function anchorOf(def: SimulationDefinition, id: string): Vec3 | null {
  const g = DATA.geometry[id];
  if (g) return vec(g.surfaceAnchor ?? g.centroid);
  const s = def.structures.find((x) => x.id === id);
  if (s?.kind === 'group' && s.members) {
    const pts = s.members.map((m) => anchorOf(def, m)).filter((p): p is Vec3 => p !== null);
    if (!pts.length) return null;
    return [0, 1, 2].map((a) => pts.reduce((n, p) => n + p[a]!, 0) / pts.length) as Vec3;
  }
  return null;
}
/** The centroid of a mesh structure (or the middle of a group's members). */
export function centroidOf(def: SimulationDefinition, id: string): Vec3 {
  const g = DATA.geometry[id];
  if (g) return vec(g.centroid);
  const b = boundsOfIds(def, [id]);
  return b ? [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2] : [0, 0, 0];
}

/** Axis-aligned bounds of a set of structures (groups expand to their members). */
export function boundsOfIds(def: SimulationDefinition, ids: readonly string[]): [Vec3, Vec3] | null {
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  const visit = (id: string) => {
    const g = DATA.geometry[id];
    if (g) {
      for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a]!, g.bounds[0]![a]!); hi[a] = Math.max(hi[a]!, g.bounds[1]![a]!); }
      return;
    }
    def.structures.find((x) => x.id === id)?.members?.forEach(visit);
  };
  ids.forEach(visit);
  return Number.isFinite(lo[0]) ? [lo, hi] : null;
}

/** The whole skeleton (the female pelvis is drawn beside it only in some views). */
const isSkeleton = (id: string) => !id.startsWith('female-');
/** Bounds of the default view for a mode: the whole skeleton. */
export function homeBounds(def: SimulationDefinition, _mode: Mode = 'explore'): [Vec3, Vec3] {
  return boundsOfIds(def, def.structures.filter((s) => s.kind === 'mesh' && isSkeleton(s.id)).map((s) => s.id)) ?? [[-0.35, -0.87, -0.15], [0.35, 0.87, 0.15]];
}
/** Bounds of everything shown in a mode (used to place the cut). */
export function modeBounds(def: SimulationDefinition, mode: Mode): [Vec3, Vec3] {
  const layers = mode === 'explore' || mode === 'tour' ? null : MODE_LAYERS[mode] ?? null;
  const ids = def.structures.filter((s) => s.kind === 'mesh' && isSkeleton(s.id) && (!layers || layers.includes(s.layer))).map((s) => s.id);
  return boundsOfIds(def, ids) ?? homeBounds(def, mode);
}
/** Slice position (−1 … 1 across `bounds` on an axis) for a world coordinate. */
export function sliceAt(bounds: [Vec3, Vec3], axis: 0 | 1 | 2, world: number): number {
  const mid = (bounds[0][axis] + bounds[1][axis]) / 2, half = (bounds[1][axis] - bounds[0][axis]) / 2;
  return half > 0 ? Math.max(-1, Math.min(1, (world - mid) / half)) : 0;
}
/** The world coordinate of a slice position. */
export function sliceWorld(bounds: [Vec3, Vec3], axis: 0 | 1 | 2, at: number): number {
  const mid = (bounds[0][axis] + bounds[1][axis]) / 2, half = (bounds[1][axis] - bounds[0][axis]) / 2;
  return mid + at * half;
}

/**
 * Where each magnified close-up sits and how large it is (radius, metres): drawn where its tissue is
 * while the body is hidden.
 */
export function closeUpFrame(def: SimulationDefinition, id: CloseUp): { centre: Vec3; radius: number; magnified: number } {
  const c = (sid: string) => centroidOf(def, sid);
  const j = (k: string) => vec((DATA.joints[k]?.pivot as number[]) ?? [0, 0, 0]);
  switch (id) {
    case 'osteon': return { centre: c('femur-left'), radius: 0.016, magnified: 200 };
    case 'spongy': return { centre: j('hip-left'), radius: 0.016, magnified: 25 };
    case 'growth-plate': return { centre: c('tibia-left'), radius: 0.016, magnified: 60 };
    case 'remodelling': return { centre: c('femur-left'), radius: 0.016, magnified: 300 };
    case 'synovial': return { centre: j('knee-left'), radius: 0.03, magnified: 2 };
    case 'callus': return { centre: c('tibia-left'), radius: 0.02, magnified: 3 };
  }
}
