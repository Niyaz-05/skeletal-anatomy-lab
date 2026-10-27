/**
 * The skeleton through life: when each bone starts to ossify, when its growth plates close, when the
 * permanent teeth erupt, and how the bone count falls as centres fuse.
 *
 * Ossification and fusion: Scheuer & Black, The Juvenile Skeleton (2004); Gray's Anatomy (42nd ed.).
 * Eruption of the permanent teeth: American Dental Association eruption charts. Ages in years; girls
 * mature about 1–2 years before boys, so fusion ages are given for each sex.
 */
import skeletonJson from './generated/skeleton.json';
import type { Sex } from './bone';

export interface Physis { id: string; bone: string; end: string; centre: number[]; axis: number[]; radiusMm: number; fusesFemale: number[]; fusesMale: number[] }
export const PHYSES = (skeletonJson.structures as unknown as { $anchors: { physes: Physis[] } }).$anchors.physes;

/** The age at which a growth plate closes (middle of its range) for a sex. */
export const fusionAge = (p: Physis, sex: Sex) => { const r = sex === 'female' ? p.fusesFemale : p.fusesMale; return (r[0]! + r[1]!) / 2; };
/** How open a growth plate is at an age: 1 open, 0 fused, fading across its range. */
export function physisOpen(p: Physis, age: number, sex: Sex): number {
  const r = sex === 'female' ? p.fusesFemale : p.fusesMale;
  return Math.max(0, Math.min(1, (r[1]! - age) / Math.max(0.5, r[1]! - r[0]!)));
}

/**
 * When a bone's first ossification centre appears (negative: before birth, in years: −0.5 is about
 * 20 weeks' gestation) and when the bone is complete (its last centre fused). Female ages; boys add
 * `MALE_DELAY` to the postnatal ones.
 */
interface Timing { appears: number; complete: number; note: string }
const T = (appears: number, complete: number, note: string): Timing => ({ appears, complete, note });
const TIMING: [RegExp, Timing][] = [
  [/^clavicle/, T(-0.7, 25, 'The first bone to ossify (week 5–6 of gestation), in membrane; its medial end is the last growth plate in the body to close (about 22–30).')],
  [/^capitate/, T(0.2, 15, 'The first carpal bone to ossify (about 2 months).')],
  [/^hamate/, T(0.3, 15, 'Ossifies at about 3 months.')],
  [/^triquetral/, T(2.5, 15, 'Ossifies at about 2–3 years.')],
  [/^lunate/, T(4, 15, 'Ossifies at about 4 years.')],
  [/^(scaphoid|trapezium|trapezoid)/, T(5, 15, 'Ossifies at about 5 years.')],
  [/^pisiform/, T(9, 15, 'A sesamoid in the tendon of flexor carpi ulnaris; the last carpal bone to ossify (about 9–12 years).')],
  [/^(talus|calcaneus)/, T(-0.25, 16, 'Ossifies before birth (calcaneus at about 5–6 months of gestation, talus at 7); the calcaneal apophysis fuses at 14–16.')],
  [/^cuboid/, T(0, 16, 'Ossifies around birth.')],
  [/^lateral-cuneiform/, T(1, 16, 'Ossifies in the first year.')],
  [/^medial-cuneiform/, T(2, 16, 'Ossifies at about 2 years.')],
  [/^(intermediate-cuneiform|navicular)/, T(3, 16, 'Ossifies at about 3 years; the navicular is the last tarsal bone.')],
  [/^patella/, T(4, 16, 'A sesamoid in the quadriceps tendon; ossifies at 3–6 years from several centres.')],
  [/^sesamoids-foot/, T(10, 16, 'The sesamoids under the first metatarsal head ossify at about 10–12 years.')],
  [/^coccyx/, T(1, 25, 'Its first segment ossifies around birth, the others over childhood; the segments fuse during adult life.')],
  [/^(c|t|l)\d+$/, T(-0.6, 25, 'Three primary centres (body and two halves of the arch) from week 8–10; the arch closes at 1–3 years and joins the body at 3–6; ring apophyses fuse by about 25.')],
  [/^sacrum/, T(-0.6, 25, 'Five vertebrae and their costal elements fuse into one bone between about 16 and 30.')],
  [/^hip-bone/, T(-0.6, 21, 'Ilium, ischium and pubis meet in the triradiate cartilage of the acetabulum, which fuses at 11–15 (girls) or 14–17 (boys); the iliac crest fuses at 17–23.')],
  [/^(frontal|parietal|occipital|temporal|sphenoid|ethmoid|vomer|zygomatic|maxilla|nasal|palatine|lacrimal)/, T(-0.6, 16, 'Vault bones ossify in membrane, the base in cartilage; the fontanelles close by 2 years, the spheno-occipital synchondrosis at 13–17.')],
  [/^mandible/, T(-0.7, 1, 'Ossifies in membrane around Meckel’s cartilage (week 6); its two halves fuse at the symphysis in the first year.')],
  [/^hyoid/, T(-0.1, 1, 'Ossifies around birth; its greater horns may fuse to the body in middle age.')],
  [/^rib/, T(-0.6, 22, 'Ossifies early (week 8–9); the head and tubercle epiphyses fuse at 17–25.')],
  [/^(manubrium|sternal-body)/, T(-0.3, 25, 'Several centres from late gestation; the segments of the body fuse from below upwards between puberty and 25.')],
  [/^xiphoid/, T(3, 40, 'Cartilage in childhood; ossifies from about 3 years and often fuses with the body after 40.')],
  [/^(scapula)/, T(-0.6, 20, 'The body ossifies before birth; the coracoid at 1 year; the acromion and the inferior angle fuse at 18–20.')],
  [/^(humerus|radius|ulna|femur|tibia|fibula)/, T(-0.6, 19, 'The shaft ossifies from a primary centre at week 7–8; the ends grow from secondary centres separated by growth plates until puberty (see the plates shown).')],
  [/^(metacarpal|metatarsal|proximal-phalanx|middle-phalanx|distal-phalanx)/, T(-0.5, 16, 'Shafts ossify before birth; each has one growth plate, fused at 14–16 (girls) or 16–18 (boys).')],
];
export const MALE_DELAY = 1.5;

export function timingOf(id: string): Timing | null {
  return TIMING.find(([re]) => re.test(id))?.[1] ?? null;
}

export type BoneStage = 'cartilage' | 'growing' | 'adult';
/** A bone's stage at an age: still cartilage, ossified but growing, or complete. */
export function boneStage(id: string, age: number, sex: Sex): BoneStage {
  const t = timingOf(id);
  if (!t) return 'adult';
  const d = sex === 'male' ? MALE_DELAY : 0;
  const appears = t.appears > 0 ? t.appears + d * (t.appears > 2 ? 0.5 : 0) : t.appears;
  if (age < appears) return 'cartilage';
  return age < t.complete + d ? 'growing' : 'adult';
}

/** Eruption of the permanent teeth (years). The third molars, absent from this model, erupt at 17–21. */
const ERUPTION: [RegExp, number][] = [
  [/lower-central-incisor/, 6.5], [/upper-central-incisor/, 7.5], [/lower-lateral-incisor/, 7.5], [/upper-lateral-incisor/, 8.5],
  [/lower-canine/, 9.5], [/upper-canine/, 11.5], [/upper-premolar-1/, 10.5], [/lower-premolar-1/, 11], [/upper-premolar-2/, 11], [/lower-premolar-2/, 11.5],
  [/molar-1/, 6.5], [/lower-molar-2/, 12], [/upper-molar-2/, 12.5],
];
export const eruptionAge = (id: string) => ERUPTION.find(([re]) => re.test(id))?.[1] ?? null;
/** Whether a permanent tooth has erupted at an age. */
export const erupted = (id: string, age: number) => { const e = eruptionAge(id); return e === null || age >= e; };

/** Approximate number of separate bones at an age (about 270 at birth as centres appear, fusing to 206). */
export function boneCount(age: number): number {
  const pts: [number, number][] = [[0, 270], [2, 285], [6, 300], [12, 290], [16, 260], [20, 225], [25, 206], [100, 206]];
  for (let i = 1; i < pts.length; i++) {
    const [a0, c0] = pts[i - 1]!, [a1, c1] = pts[i]!;
    if (age <= a1) return Math.round(c0 + ((c1 - c0) * (age - a0)) / (a1 - a0));
  }
  return 206;
}

/** The sexes compared (textbook ranges; this model's measured values are added in the panel). */
export const SEX_TRAITS = {
  pelvis: [
    ['Pelvic inlet', 'Oval or round, wider transversely (gynaecoid)', 'Heart-shaped, narrower (android)'],
    ['Subpubic angle', 'About 80–90° or more', 'About 50–60°'],
    ['Greater sciatic notch', 'Wide (about 90°)', 'Narrow (about 50°)'],
    ['Sacrum', 'Short and wide, less curved', 'Long and narrow, more curved'],
    ['Obturator foramen', 'Triangular', 'Oval'],
    ['Acetabulum', 'Smaller, facing more forwards', 'Larger'],
  ],
  skull: [
    ['Brow ridges', 'Slight', 'Prominent'],
    ['Mastoid process', 'Small', 'Large'],
    ['Chin', 'Pointed', 'Square'],
    ['Nuchal crest', 'Smooth', 'Rugged'],
    ['Orbital margin', 'Sharp', 'Rounded'],
  ],
} as const;
