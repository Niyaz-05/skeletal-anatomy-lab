import type { Mode } from '../contract/schema';

/** Every layer of the skeleton itself (the female pelvis is shown only for comparison). */
export const SKELETON = ['skull', 'teeth', 'cartilage', 'spine', 'discs', 'thorax', 'girdle', 'arm', 'hand', 'pelvis', 'leg', 'foot', 'ligaments'];

/** Which layers each mode shows (the learner's layer toggles apply in Anatomy mode). */
export const MODE_LAYERS: Partial<Record<Mode, readonly string[]>> = {
  joints: SKELETON,
  tissue: [...SKELETON, 'female-pelvis'],
  fractures: SKELETON,
  life: SKELETON,
};
/** The camera each mode starts with. */
export const MODE_CAMERA: Partial<Record<Mode, string>> = {
  explore: 'anterior', joints: 'oblique', tissue: 'anterior', fractures: 'anterior', life: 'anterior',
};
/** See-through structures per mode (by id or layer). */
export const MODE_OPACITY: Partial<Record<Mode, Record<string, number>>> = {
  tissue: { 'female-hip-bone-left': 0.3, 'female-hip-bone-right': 0.3 },
};
/** Where the female pelvis sits: well clear of the skeleton, or beside the male pelvis when comparing. */
export const FEMALE_PELVIS_OFFSET = { beside: [0.62, 0, 0], compare: [0.3, 0, 0] } as const;
