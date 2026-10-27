import type { AnatomicalStructure, Mode } from '../contract/schema';
import type { ColourBy } from '../app/state';
import { MODE_OPACITY } from '../app/modes';
import type { TissueLook } from './tissue';

/**
 * Real looks as in a cleaned, dried specimen with its cartilage kept: ivory bone with a faint
 * yellow cast, glossy blue-white hyaline cartilage, grey-white fibrocartilage discs and menisci,
 * silvery ligaments, white enamel, pink gums; the female pelvis's spongy bone red with marrow.
 */
const REAL: Record<string, TissueLook> = {
  bone: { color: '#e8dcc0', roughness: 0.72, clearcoat: 0.08, sheen: 0.15, sheenColor: '#fff6e0', rim: 0.05, ao: 1, mottle: 0.35, mottleTint: '#bfae88' },
  skullBone: { color: '#e4d6b6', roughness: 0.7, clearcoat: 0.1, sheen: 0.15, sheenColor: '#fff6e0', rim: 0.05, ao: 1, mottle: 0.4, mottleTint: '#b8a47c' },
  enamel: { color: '#f4f0e4', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.2, rim: 0.12, rimColor: '#ffffff', ao: 0.7, mottle: 0.08, mottleTint: '#e0d4b8' },
  gum: { color: '#d88a8c', roughness: 0.35, clearcoat: 0.8, sheen: 0.4, sheenColor: '#ffd0d8', rim: 0.2, rimColor: '#ff9aa8', ao: 0.6, mottle: 0.2, mottleTint: '#a85a60' },
  cartilage: { color: '#d4e0e2', roughness: 0.22, clearcoat: 0.9, clearcoatRoughness: 0.1, sheen: 0.45, sheenColor: '#f0fbff', rim: 0.25, rimColor: '#c8e8ff', ao: 0.6, mottle: 0.12, mottleTint: '#a8bcc4' },
  disc: { color: '#d8d6c8', roughness: 0.35, clearcoat: 0.6, sheen: 0.35, sheenColor: '#ffffff', rim: 0.15, ao: 0.75, mottle: 0.25, mottleTint: '#b0aa94' },
  ligament: { color: '#ece8de', roughness: 0.25, clearcoat: 0.85, clearcoatRoughness: 0.12, sheen: 0.5, sheenColor: '#ffffff', rim: 0.2, rimColor: '#f0f4ff', ao: 0.6, mottle: 0.18, mottleTint: '#c8c0b0' },
  meniscus: { color: '#e2e2d8', roughness: 0.3, clearcoat: 0.75, sheen: 0.45, sheenColor: '#ffffff', rim: 0.15, ao: 0.7, mottle: 0.2, mottleTint: '#b8b8a8' },
  spongy: { color: '#b86a58', roughness: 0.6, clearcoat: 0.2, sheen: 0.2, rim: 0.1, ao: 0.9, mottle: 0.6, mottleTint: '#7a3428' },
};

function kindOf(s: AnatomicalStructure): string {
  if (s.layer === 'teeth') return s.id.startsWith('gingiva') ? 'gum' : 'enamel';
  if (s.layer === 'cartilage' || s.id.startsWith('costal-cartilage')) return 'cartilage';
  if (s.layer === 'discs') return 'disc';
  if (s.id.startsWith('menisci')) return 'meniscus';
  if (s.layer === 'ligaments') return 'ligament';
  if (s.id.startsWith('female-spongy')) return 'spongy';
  if (s.layer === 'skull') return 'skullBone';
  return 'bone';
}
export function realLook(s: AnatomicalStructure): TissueLook {
  return REAL[kindOf(s)] ?? REAL.bone!;
}
/** Bone-tissue parts that use the pitted lobule shader (spongy bone). */
export function lobules(s: AnatomicalStructure): { scale: number; depth: number } | null {
  if (s.id.startsWith('female-spongy')) return { scale: 900, depth: 0.35 };
  return null;
}

/** How see-through each structure is in its real look (1 = opaque), in a mode. */
export function realOpacity(s: AnatomicalStructure, mode: Mode): number {
  const m = MODE_OPACITY[mode];
  const byMode = m?.[s.id] ?? m?.[s.layer];
  if (byMode !== undefined) return byMode;
  if (s.layer === 'cartilage' || s.id.startsWith('costal-cartilage')) return 0.92;
  return 1;
}

/** One hue per region (Colour: Regions). */
export const LAYER_COLOUR: Record<string, string> = {
  skull: '#e0b050', teeth: '#f4f0e4', cartilage: '#80c8e0', spine: '#e07050', discs: '#a0a0a0', thorax: '#d06090', girdle: '#9a70d8', arm: '#6a8ae0',
  hand: '#40b8c0', pelvis: '#e09040', leg: '#60b060', foot: '#a0c040', ligaments: '#c0c0d0', 'female-pelvis': '#d880c0',
};

/** Cartilage that has not yet ossified (Through life): pale blue and see-through. */
export const CARTILAGE_STAGE = '#9cc4dc';

export function baseColour(s: AnatomicalStructure, colourBy: ColourBy): string {
  if (colourBy === 'region' || s.kind === 'group') return LAYER_COLOUR[s.layer] ?? realLook(s).color;
  return realLook(s).color;
}

export const HIGHLIGHT = '#ffc94d';
export const HOVER = '#ffe7a8';
/** The glow of a part in focus of a simulation (the bones of the chosen joint, the fractured bone). */
export const GLOW = '#ffd27a';
export const XRAY = '#cfe6ff';

/** Cut-surface colours: compact bone ivory with a hint of marrow, cartilage glassy. */
const CUT: Record<string, string> = {
  bone: '#dccdaa', skullBone: '#d8c8a4', enamel: '#f0ead8', gum: '#d89090', cartilage: '#c8dadc', disc: '#d4d0be', ligament: '#e6e0d4', meniscus: '#dcdcd0', spongy: '#a85a48',
};
export function cutColour(s: AnatomicalStructure): string {
  return CUT[kindOf(s)] ?? '#dccdaa';
}
