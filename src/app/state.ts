/**
 * UI and simulation state as a pure reducer, so every learner action is unit-testable without
 * rendering. The 3D scene only reads this state; it never owns selection, visibility or the pose.
 */
import type { CloseUp, Mode, SimulationDefinition, SliceAxis, TourStep } from '../contract/schema';
import { MODE_CAMERA, MODE_LAYERS } from './modes';
import { boundsOfIds, centroidOf, modeBounds, sliceAt } from '../lab/anchors';
import { clampPose, JOINTS, poseById, type Pose, type Side } from '../lab/joints';
import { DEFAULT_FACTORS, type BoneFactors, type Sex } from '../lab/bone';
import { DEFAULT_HEALING, patternById, siteById, type HealingFactors } from '../lab/fractures';
import { fractureAnchors, pelvisCentres } from '../lab/anchors';
import { FEMALE_PELVIS_OFFSET } from './modes';

export type { Mode } from '../contract/schema';
export type ColourBy = 'real' | 'region' | 'xray';

export interface Slice {
  axis: SliceAxis;
  /** Position across what the mode shows, -1 … 1. */
  at: number;
  /** Keep the other side of the cut. */
  flip: boolean;
}
export interface JointSettings { joint: string; side: Side | 'both'; pose: Pose; preset: string | null }
export interface TissueSettings { age: number; sex: Sex; factors: BoneFactors; day: number }
export interface FractureSettings { site: string; pattern: string; weeks: number; healing: HealingFactors }
export interface LifeSettings { age: number; sex: Sex; compare: boolean }

export interface LabState {
  mode: Mode;
  selected: string | null;
  hovered: string | null;
  visibleLayers: ReadonlySet<string>;
  isolate: boolean;
  labels: boolean;
  colourBy: ColourBy;
  slice: Slice;
  /** Animations (close-ups, the remodelling cycle) running. */
  playing: boolean;
  closeUp: CloseUp | null;
  joints: JointSettings;
  tissue: TissueSettings;
  fracture: FractureSettings;
  life: LifeSettings;
  tourIndex: number;
  /** A camera move the scene should perform; the nonce makes repeat requests distinct. */
  camera: { preset: string; focus: readonly string[]; nonce: number; around?: readonly number[] };
}

export type LabAction =
  | { type: 'select'; id: string | null }
  | { type: 'hover'; id: string | null }
  | { type: 'toggle-layer'; layer: string }
  | { type: 'set-isolate'; value: boolean }
  | { type: 'set-labels'; value: boolean }
  | { type: 'set-colour-by'; value: ColourBy }
  | { type: 'set-slice'; axis?: SliceAxis; at?: number; flip?: boolean }
  | { type: 'set-mode'; mode: Mode }
  | { type: 'set-playing'; value: boolean }
  | { type: 'set-close-up'; value: CloseUp | null }
  | { type: 'set-joint'; joint?: string; side?: Side | 'both' }
  | { type: 'set-movement'; key: string; value: number }
  | { type: 'set-pose'; preset: string }
  | { type: 'set-tissue'; value: Partial<Omit<TissueSettings, 'factors'>>; factors?: Partial<BoneFactors> }
  | { type: 'set-fracture'; value: Partial<Omit<FractureSettings, 'healing'>>; healing?: Partial<HealingFactors> }
  | { type: 'set-life'; value: Partial<LifeSettings> }
  | { type: 'tour-go'; index: number }
  | { type: 'camera'; preset: string; focus?: readonly string[] }
  | { type: 'reset' };

const NO_SLICE: Slice = { axis: 'off', at: 0, flip: false };
export const DEFAULT_JOINTS: JointSettings = { joint: 'shoulder', side: 'left', pose: {}, preset: 'anatomical' };
export const DEFAULT_TISSUE: TissueSettings = { age: 30, sex: 'female', factors: DEFAULT_FACTORS, day: 20 };
export const DEFAULT_FRACTURE: FractureSettings = { site: 'distal-radius', pattern: 'transverse', weeks: 0, healing: DEFAULT_HEALING };
export const DEFAULT_LIFE: LifeSettings = { age: 8, sex: 'female', compare: false };

export function initialState(def: SimulationDefinition): LabState {
  return {
    mode: 'explore',
    selected: null,
    hovered: null,
    visibleLayers: new Set(def.layers.filter((l) => l.visibleByDefault).map((l) => l.id)),
    isolate: false,
    labels: false,
    colourBy: 'real',
    slice: NO_SLICE,
    playing: true,
    closeUp: null,
    joints: DEFAULT_JOINTS,
    tissue: DEFAULT_TISSUE,
    fracture: DEFAULT_FRACTURE,
    life: DEFAULT_LIFE,
    tourIndex: 0,
    camera: { preset: def.defaultCamera, focus: [], nonce: 1 },
  };
}

/** Ids that a selection or tour step highlights: a group stands for its members. */
export function highlightedIds(def: SimulationDefinition, ids: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    const s = def.structures.find((x) => x.id === id);
    if (!s) continue;
    if (s.kind === 'group') s.members?.forEach((m) => out.add(m));
    else out.add(id);
  }
  return out;
}

export const currentStep = (def: SimulationDefinition, state: LabState): TourStep | undefined => (state.mode === 'tour' ? def.tour[state.tourIndex] : undefined);

/** The mode in effect: in a tour, the step's (Anatomy if it names none). */
export function effectiveMode(def: SimulationDefinition, state: LabState): Exclude<Mode, 'tour'> {
  if (state.mode === 'tour') return currentStep(def, state)?.mode ?? 'explore';
  return state.mode;
}
/** The pose in effect: a tour step's named pose, or the learner's (only in the joints view). */
export function effectivePose(def: SimulationDefinition, state: LabState): Pose {
  const s = currentStep(def, state);
  if (s) return s.pose ? poseById(s.pose)?.pose ?? {} : {};
  return state.mode === 'joints' ? state.joints.pose : {};
}
export function effectiveTissue(def: SimulationDefinition, state: LabState): TissueSettings {
  const s = currentStep(def, state);
  return s ? { ...DEFAULT_TISSUE, age: s.age ?? DEFAULT_TISSUE.age } : state.tissue;
}
export function effectiveFracture(def: SimulationDefinition, state: LabState): FractureSettings {
  const s = currentStep(def, state);
  if (!s) return state.fracture;
  const site = s.fracture ?? DEFAULT_FRACTURE.site;
  return { ...DEFAULT_FRACTURE, site, pattern: s.pattern ?? siteById(site)?.defaultPattern ?? 'transverse', weeks: s.weeks ?? 0 };
}
export function effectiveLife(def: SimulationDefinition, state: LabState): LifeSettings {
  const s = currentStep(def, state);
  return s ? { ...DEFAULT_LIFE, age: s.lifeAge ?? 25, compare: !!s.compare } : state.life;
}

/** The structures currently in focus: the selection, the joint's or fracture's bones, or the tour step's. */
export function focusIds(def: SimulationDefinition, state: LabState): string[] {
  if (state.mode === 'tour') return [...(currentStep(def, state)?.focus ?? [])];
  if (state.selected) return [state.selected];
  return [];
}

export function effectiveCloseUp(def: SimulationDefinition, state: LabState): CloseUp | null {
  if (state.mode === 'tour') return currentStep(def, state)?.closeUp ?? null;
  return state.closeUp;
}
/** Whether highlighted structures are tinted: a tour step can turn it off (cut views). */
export function effectiveTint(def: SimulationDefinition, state: LabState): boolean {
  return state.mode === 'tour' ? currentStep(def, state)?.tint !== false : true;
}
export function effectiveColourBy(def: SimulationDefinition, state: LabState): ColourBy {
  if (state.mode === 'tour') return currentStep(def, state)?.colourBy ?? 'real';
  return state.colourBy;
}
const AXES: Record<Exclude<SliceAxis, 'off'>, 0 | 1 | 2> = { sagittal: 0, axial: 1, coronal: 2 };
/** The cut in effect: a tour step's (through the middle of a structure, if it names one); otherwise the learner's. */
export function effectiveSlice(def: SimulationDefinition, state: LabState): Slice {
  if (state.mode === 'tour') {
    const s = currentStep(def, state);
    if (!s?.slice || s.slice.axis === 'off') return NO_SLICE;
    const ax = AXES[s.slice.axis];
    const through = s.slice.through ? (boundsOfIds(def, [s.slice.through]) ? centroidOf(def, s.slice.through)[ax] : null) : null;
    const at = through !== null ? sliceAt(modeBounds(def, s.mode ?? 'explore'), ax, through) : s.slice.at ?? 0;
    return { axis: s.slice.axis, at, flip: false };
  }
  return state.slice;
}

/**
 * Whether a mesh structure is drawn. In Anatomy mode the learner's layers decide; the other modes
 * show their own layers. A highlighted structure is always shown; with isolate on, only those. A
 * magnified close-up hides the body. Comparing the pelvises shows only the two pelvises.
 */
export function isVisible(def: SimulationDefinition, state: LabState, id: string): boolean {
  const s = def.structures.find((x) => x.id === id);
  if (!s) return false;
  if (effectiveCloseUp(def, state)) return false;
  const mode = effectiveMode(def, state);
  if (mode === 'life' && effectiveLife(def, state).compare) return /^(hip-bone|female-)/.test(id) || id === 'sacrum' || id === 'coccyx';
  const lit = highlightedIds(def, focusIds(def, state));
  if (lit.has(id)) return true;
  const isolate = state.mode === 'tour' ? !!currentStep(def, state)?.isolate : state.isolate;
  if (isolate && lit.size > 0) return false;
  if (mode === 'explore') return state.visibleLayers.has(s.layer);
  return (MODE_LAYERS[mode] ?? []).includes(s.layer);
}

/**
 * The camera preset that looks at the cut face. The cut keeps the side below the plane on its axis
 * (x: the patient's right, z: the back, y: the lower part), or the side above it when flipped, so
 * the camera looks from the removed side.
 */
export function facingPreset(slice: Slice): string | null {
  switch (slice.axis) {
    case 'sagittal': return slice.flip ? 'right' : 'left';
    case 'coronal': return slice.flip ? 'posterior' : 'anterior';
    case 'axial': return slice.flip ? 'inferior' : 'superior';
    default: return null;
  }
}
/** What the cut leaves in view, for the panel's hint (+x is the patient's left). */
export function keptHalf(slice: Slice): string | null {
  switch (slice.axis) {
    case 'sagittal': return slice.flip ? 'the left side of the body' : 'the right side of the body';
    case 'coronal': return slice.flip ? 'the front half' : 'the back half';
    case 'axial': return slice.flip ? 'the upper part' : 'the lower part';
    default: return null;
  }
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const finite = (o: Record<string, unknown>) => Object.values(o).every((v) => typeof v !== 'number' || Number.isFinite(v));

/** The bones a joint involves, on a side (the catalogue lists the left side). */
export const jointBones = (jointId: string, side: Side | 'both') => {
  const j = JOINTS.find((x) => x.id === jointId);
  if (!j) return [];
  const sides: Side[] = side === 'both' ? ['left', 'right'] : [side];
  return [...new Set(j.bones.flatMap((b) => (/-left$/.test(b) ? sides.map((s) => b.replace(/-left$/, `-${s}`)) : [b])))];
};

export function makeReducer(def: SimulationDefinition) {
  const known = new Set(def.structures.map((s) => s.id));
  const layers = new Set(def.layers.map((l) => l.id));
  const presets = new Set(def.cameraPresets.map((c) => c.id));
  const cam = (state: LabState, preset: string | undefined, focus: readonly string[] = []) =>
    preset && presets.has(preset) ? { preset, focus, nonce: state.camera.nonce + 1 } : state.camera;
  /** The camera on a fracture: a sphere about 6 cm round the break (a whole long bone would be too far away). */
  const fractureCamera = (state: LabState, site: string) => {
    const a = fractureAnchors()[site];
    return a && presets.has('anterior') ? { preset: 'anterior', focus: [], nonce: state.camera.nonce + 1, around: [...a.at, 0.06] } : state.camera;
  };
  /** Comparing the pelvises: a sphere round both, with the female one where it is drawn. */
  const compareCamera = (state: LabState) => {
    const c = pelvisCentres(), o = FEMALE_PELVIS_OFFSET.compare;
    const mid = [0, 1, 2].map((a) => (c.male[a]! + c.female[a]! + o[a]!) / 2);
    return { preset: 'anterior', focus: [], nonce: state.camera.nonce + 1, around: [...mid, 0.3] };
  };
  const stepCamera = (state: LabState, index: number): LabState['camera'] => {
    const s = def.tour[index];
    if (!s) return state.camera;
    if (s.mode === 'fractures' && !s.closeUp) return fractureCamera(state, s.fracture ?? DEFAULT_FRACTURE.site);
    if (s.mode === 'life' && s.compare) return compareCamera(state);
    return cam(state, s.camera ?? MODE_CAMERA[s.mode ?? 'explore'], s.frame === 'mode' || s.closeUp ? [] : s.focus);
  };

  return function reduce(state: LabState, action: LabAction): LabState {
    switch (action.type) {
      case 'select': {
        if (action.id !== null && !known.has(action.id)) return state;
        const selected = action.id === state.selected ? null : action.id;
        return { ...state, selected, isolate: selected ? state.isolate : false, closeUp: selected ? null : state.closeUp };
      }
      case 'hover':
        return action.id === state.hovered || (action.id !== null && !known.has(action.id)) ? state : { ...state, hovered: action.id };
      case 'toggle-layer': {
        if (!layers.has(action.layer)) return state;
        const next = new Set(state.visibleLayers);
        if (next.has(action.layer)) next.delete(action.layer); else next.add(action.layer);
        return { ...state, visibleLayers: next };
      }
      case 'set-isolate':
        return { ...state, isolate: action.value };
      case 'set-labels':
        return { ...state, labels: action.value };
      case 'set-colour-by':
        return action.value === state.colourBy ? state : { ...state, colourBy: action.value };
      case 'set-slice': {
        const at = action.at === undefined || !Number.isFinite(action.at) ? state.slice.at : clamp(action.at, -1, 1);
        const axis = action.axis ?? state.slice.axis;
        const fresh = action.axis !== undefined && action.axis !== state.slice.axis && action.at === undefined;
        const slice = { axis, at: fresh ? 0 : at, flip: action.flip ?? state.slice.flip };
        const turned = axis !== 'off' && (axis !== state.slice.axis || slice.flip !== state.slice.flip);
        return turned ? { ...state, slice, camera: cam(state, facingPreset(slice) ?? undefined) } : { ...state, slice };
      }
      case 'set-mode': {
        if (action.mode === state.mode) return state;
        if (action.mode === 'tour') return { ...state, mode: 'tour', tourIndex: 0, selected: null, isolate: false, playing: true, closeUp: null, camera: stepCamera(state, 0) };
        const camera = action.mode === 'fractures' ? fractureCamera(state, state.fracture.site) : action.mode === 'life' && state.life.compare ? compareCamera(state) : cam(state, MODE_CAMERA[action.mode]);
        return { ...state, mode: action.mode, playing: true, selected: null, closeUp: null, slice: state.mode === 'tour' ? NO_SLICE : state.slice, camera };
      }
      case 'set-playing':
        return { ...state, playing: action.value };
      case 'set-close-up':
        return { ...state, closeUp: action.value, selected: action.value ? null : state.selected, camera: { ...state.camera, focus: [], nonce: state.camera.nonce + 1 } };
      case 'set-joint': {
        const joint = action.joint && JOINTS.some((j) => j.id === action.joint) ? action.joint : state.joints.joint;
        const side = action.side ?? state.joints.side;
        const focus = jointBones(joint, side).filter((id) => known.has(id));
        return { ...state, joints: { ...state.joints, joint, side }, selected: null, camera: action.joint ? cam(state, 'anterior', focus) : state.camera };
      }
      case 'set-movement': {
        if (!Number.isFinite(action.value)) return state;
        const keys = /-(left|right|both)$/.test(action.key) && action.key.endsWith('-both') ? [action.key.replace(/-both$/, '-left'), action.key.replace(/-both$/, '-right')] : [action.key];
        const pose = clampPose({ ...state.joints.pose, ...Object.fromEntries(keys.map((k) => [k, action.value])) });
        if (!keys.every((k) => k in pose)) return state;
        return { ...state, joints: { ...state.joints, pose, preset: null } };
      }
      case 'set-pose': {
        const p = poseById(action.preset);
        return p ? { ...state, joints: { ...state.joints, pose: clampPose(p.pose), preset: p.id } } : state;
      }
      case 'set-tissue': {
        const v = { ...state.tissue, ...action.value, factors: { ...state.tissue.factors, ...action.factors } };
        if (!finite(v) || !finite(v.factors as unknown as Record<string, unknown>)) return state;
        const f = v.factors;
        const factors = { ...f, menopause: clamp(Math.round(f.menopause), 40, 58), steroidsFrom: f.steroidsFrom === null ? null : clamp(Math.round(f.steroidsFrom), 18, 90) };
        return { ...state, tissue: { sex: v.sex, age: clamp(Math.round(v.age), 5, 90), day: clamp(v.day, 0, 160), factors } };
      }
      case 'set-fracture': {
        const v = { ...state.fracture, ...action.value, healing: { ...state.fracture.healing, ...action.healing } };
        const site = siteById(v.site);
        if (!site || !finite(v) || !finite(v.healing as unknown as Record<string, unknown>)) return state;
        // A pattern that does not occur at the site gives way to the site's typical one.
        const pattern = patternById(v.pattern) && site.patterns.includes(v.pattern) ? v.pattern : site.defaultPattern;
        const changedSite = v.site !== state.fracture.site;
        return {
          ...state,
          fracture: { site: v.site, pattern, weeks: clamp(v.weeks, 0, 52), healing: { ...v.healing, age: clamp(Math.round(v.healing.age), 2, 95) } },
          selected: null,
          camera: changedSite ? fractureCamera(state, v.site) : state.camera,
        };
      }
      case 'set-life': {
        const v = { ...state.life, ...action.value };
        if (!finite(v)) return state;
        const toggled = v.compare !== state.life.compare;
        return {
          ...state,
          life: { age: clamp(v.age, 0, 30), sex: v.sex, compare: v.compare },
          camera: toggled ? (v.compare ? compareCamera(state) : cam(state, 'anterior')) : state.camera,
        };
      }
      case 'tour-go': {
        const index = clamp(action.index, 0, def.tour.length - 1);
        if (!def.tour[index]) return state;
        return { ...state, mode: 'tour', tourIndex: index, closeUp: null, camera: stepCamera(state, index) };
      }
      case 'camera':
        if (!presets.has(action.preset)) return state;
        return { ...state, camera: { preset: action.preset, focus: action.focus ?? [], nonce: state.camera.nonce + 1 } };
      case 'reset': {
        const fresh = initialState(def);
        return { ...fresh, camera: { ...fresh.camera, nonce: state.camera.nonce + 1 } };
      }
    }
  };
}
