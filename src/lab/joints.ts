/**
 * Joints and movement. The catalogue of joints (classification, bones, movements), the movements a
 * learner can drive with their normal ranges, how spinal movement is shared between the levels, and
 * named poses. Angles are degrees; a pose maps movement keys to angles. Limb movements carry the side
 * in their key (`elbow-flex-left`); spine, neck and jaw movements have none.
 *
 * Ranges: American Academy of Orthopaedic Surgeons, Joint Motion: Method of Measuring and Recording
 * (1965), as tabulated in Norkin & White, Measurement of Joint Motion (5th ed., 2016). Spinal levels:
 * White & Panjabi, Clinical Biomechanics of the Spine (2nd ed., 1990), representative values.
 */

export type Side = 'left' | 'right';
export type JointClass =
  | 'hinge' | 'pivot' | 'ball-and-socket' | 'condyloid' | 'saddle' | 'plane' | 'bicondylar'
  | 'suture' | 'syndesmosis' | 'gomphosis' | 'symphysis' | 'synchondrosis';

export const CLASS_TEXT: Record<JointClass, { family: 'synovial' | 'fibrous' | 'cartilaginous'; label: string; text: string }> = {
  hinge: { family: 'synovial', label: 'Hinge', text: 'Movement about one transverse axis: flexion and extension.' },
  pivot: { family: 'synovial', label: 'Pivot', text: 'Rotation about one long axis: a bony peg in a ring of bone and ligament.' },
  'ball-and-socket': { family: 'synovial', label: 'Ball and socket', text: 'A spherical head in a cup: flexion and extension, abduction and adduction, rotation and circumduction about three axes.' },
  condyloid: { family: 'synovial', label: 'Condyloid (ellipsoid)', text: 'An oval surface in an oval socket: two axes (flexion and extension, abduction and adduction) but no active rotation.' },
  saddle: { family: 'synovial', label: 'Saddle', text: 'Two saddle-shaped surfaces at right angles: two axes, with some conjunct rotation (opposition of the thumb).' },
  plane: { family: 'synovial', label: 'Plane (gliding)', text: 'Flat surfaces that glide on each other, held by ligaments.' },
  bicondylar: { family: 'synovial', label: 'Modified hinge (bicondylar)', text: 'Two condyles on two plateaus: mostly flexion and extension, with rolling, gliding and a little rotation.' },
  suture: { family: 'fibrous', label: 'Suture', text: 'Bones of the skull vault bound by a thin layer of dense fibrous tissue; immovable in the adult, fusing late in life.' },
  syndesmosis: { family: 'fibrous', label: 'Syndesmosis', text: 'Bones joined by a ligament or interosseous membrane; slight movement.' },
  gomphosis: { family: 'fibrous', label: 'Gomphosis', text: 'A peg in a socket: a tooth held in its alveolus by the periodontal ligament.' },
  symphysis: { family: 'cartilaginous', label: 'Symphysis', text: 'Secondary cartilaginous joint: hyaline-covered bone ends joined by fibrocartilage, in the midline; slight movement.' },
  synchondrosis: { family: 'cartilaginous', label: 'Synchondrosis', text: 'Primary cartilaginous joint: bones joined by hyaline cartilage, often temporary (growth plates).' },
};

export interface Movement {
  /** Key prefix; limb movements add the side. */
  id: string;
  label: string;
  /** Negative end of the slider, then the positive end, with their names. */
  min: number;
  max: number;
  minName: string;
  maxName: string;
  limb: boolean;
}

export interface Joint {
  id: string;
  name: string;
  cls: JointClass;
  /** Structure ids (left side for limbs: the panel swaps to the right). */
  bones: string[];
  movements: Movement[];
  text: string;
}

const mv = (id: string, label: string, min: number, max: number, minName: string, maxName: string, limb = true): Movement => ({ id, label, min, max, minName, maxName, limb });

export const JOINTS: Joint[] = [
  { id: 'shoulder', name: 'Shoulder (glenohumeral)', cls: 'ball-and-socket', bones: ['humerus-left', 'scapula-left', 'clavicle-left'],
    movements: [mv('shoulder-flex', 'Flexion / extension', -60, 180, 'extension 60°', 'flexion 180°'), mv('shoulder-abd', 'Abduction', 0, 180, 'arm at side', 'abduction 180°'), mv('shoulder-rot', 'Rotation', -90, 70, 'lateral 90°', 'medial 70°')],
    text: 'The most mobile joint of the body: a large humeral head on a shallow glenoid, deepened by the labrum and held mainly by the rotator cuff rather than by bone. Beyond about 30° of elevation the scapula rotates upwards too, about 1° for every 2° at the glenohumeral joint (scapulohumeral rhythm), so the arm reaches 180°. The price of mobility is instability: it is the most often dislocated large joint, nearly always forwards.' },
  { id: 'elbow', name: 'Elbow', cls: 'hinge', bones: ['humerus-left', 'ulna-left', 'radius-left'],
    movements: [mv('elbow-flex', 'Flexion', 0, 150, 'straight', 'flexion 150°')],
    text: 'The trochlea of the humerus turns in the trochlear notch of the ulna, a stable hinge; the capitulum carries the radial head. With the elbow straight the forearm angles outwards (the carrying angle, about 10–15°, larger in women).' },
  { id: 'forearm', name: 'Radioulnar joints', cls: 'pivot', bones: ['radius-left', 'ulna-left', 'interosseous-membrane-forearm-left'],
    movements: [mv('forearm-pron', 'Pronation / supination', -80, 80, 'supination 80°', 'pronation 80°')],
    text: 'The radial head spins in the annular ligament at the proximal joint while the radius swings round the ulnar head at the distal joint: the radius crosses the ulna in pronation and the palm turns back. The interosseous membrane binds the two bones (a syndesmosis) and passes load from the radius to the ulna.' },
  { id: 'wrist', name: 'Wrist (radiocarpal)', cls: 'condyloid', bones: ['radius-left', 'scaphoid-left', 'lunate-left', 'triquetral-left'],
    movements: [mv('wrist-flex', 'Flexion / extension', -70, 80, 'extension 70°', 'flexion 80°'), mv('wrist-dev', 'Radial / ulnar deviation', -20, 30, 'radial 20°', 'ulnar 30°')],
    text: 'The distal radius and the articular disc over the ulna receive the scaphoid, lunate and triquetrum. Much of wrist movement also happens at the midcarpal joint between the two rows of carpal bones.' },
  { id: 'fingers', name: 'Finger joints', cls: 'condyloid', bones: ['metacarpal-2-left', 'proximal-phalanx-index-left', 'middle-phalanx-index-left', 'distal-phalanx-index-left'],
    movements: [mv('grip', 'Grip', 0, 100, 'open hand', 'full fist (%)')],
    text: 'The metacarpophalangeal joints are condyloid (flexion about 90°, with spreading); the interphalangeal joints are hinges (proximal about 100°, distal about 90°). The thumb’s carpometacarpal joint is a saddle, which gives it opposition.' },
  { id: 'hip', name: 'Hip', cls: 'ball-and-socket', bones: ['femur-left', 'hip-bone-left'],
    movements: [mv('hip-flex', 'Flexion / extension', -30, 120, 'extension 30°', 'flexion 120°'), mv('hip-abd', 'Abduction / adduction', -30, 45, 'adduction 30°', 'abduction 45°'), mv('hip-rot', 'Rotation', -45, 45, 'lateral 45°', 'medial 45°')],
    text: 'A deep socket: the acetabulum and its labrum cover more than half the femoral head, and three spiral ligaments (iliofemoral, the strongest in the body, pubofemoral and ischiofemoral) tighten in extension. Stable, weight-bearing and less mobile than the shoulder.' },
  { id: 'knee', name: 'Knee (tibiofemoral)', cls: 'bicondylar', bones: ['femur-left', 'tibia-left', 'patella-left', 'menisci-left', 'acl-left', 'pcl-left'],
    movements: [mv('knee-flex', 'Flexion', 0, 135, 'straight', 'flexion 135°')],
    text: 'The largest joint: two femoral condyles roll and glide on the tibial plateaus, deepened by the menisci. The cruciate ligaments cross in the notch (the anterior stops the tibia sliding forwards, the posterior backwards); the collaterals guard the sides. In the last degrees of extension the femur rotates medially on the tibia and the knee locks (the screw-home mechanism); the patella glides in the femoral groove.' },
  { id: 'ankle', name: 'Ankle (talocrural)', cls: 'hinge', bones: ['tibia-left', 'fibula-left', 'talus-left'],
    movements: [mv('ankle-flex', 'Dorsiflexion / plantarflexion', -20, 50, 'dorsiflexion 20°', 'plantarflexion 50°')],
    text: 'The talus sits in the mortise of the tibia and fibula. Its body is wider in front, so the joint is most stable in dorsiflexion and least in plantarflexion, when most sprains happen.' },
  { id: 'subtalar', name: 'Subtalar and midtarsal joints', cls: 'plane', bones: ['talus-left', 'calcaneus-left', 'navicular-left', 'cuboid-left'],
    movements: [mv('foot-inv', 'Inversion / eversion', -15, 35, 'eversion 15°', 'inversion 35°')],
    text: 'The calcaneus turns under the talus about an oblique axis (about 42° up and 23° in from the foot’s long axis), so inversion also adducts and plantarflexes the foot. Together with the midtarsal joints it lets the foot adapt to uneven ground.' },
  { id: 'toes', name: 'Toe joints', cls: 'condyloid', bones: ['metatarsal-1-left', 'proximal-phalanx-toe-1-left'],
    movements: [mv('toes-ext', 'Toe extension / flexion', -40, 70, 'flexion 40°', 'extension 70°')],
    text: 'At push-off in walking the toes extend at the metatarsophalangeal joints, winding the plantar fascia round the metatarsal heads and raising the arch (the windlass mechanism).' },
  { id: 'neck', name: 'Neck (cervical spine)', cls: 'plane', bones: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'occipital'],
    movements: [mv('neck-flex', 'Flexion / extension', -45, 45, 'extension 45°', 'flexion 45°', false), mv('neck-side', 'Side bending', -45, 45, 'to the left 45°', 'to the right 45°', false), mv('neck-rot', 'Rotation', -60, 60, 'to the right 60°', 'to the left 60°', false)],
    text: 'Nodding happens mostly between the skull and the atlas (atlanto-occipital joints, condyloid); about half of all turning of the head happens between the atlas and the dens of the axis (a pivot). Below C2 each level adds a little through its disc (a symphysis) and its paired facet joints (plane synovial joints).' },
  { id: 'trunk', name: 'Trunk (thoracic and lumbar spine)', cls: 'symphysis', bones: ['t6', 't12', 'l1', 'l3', 'l5', 'disc-l4', 'disc-l5'],
    movements: [mv('trunk-flex', 'Flexion / extension', -25, 80, 'extension 25°', 'flexion 80°', false), mv('trunk-side', 'Side bending', -35, 35, 'to the left 35°', 'to the right 35°', false), mv('trunk-rot', 'Rotation', -45, 45, 'to the right 45°', 'to the left 45°', false)],
    text: 'Each vertebral body sits on an intervertebral disc (a symphysis), and the facet joints behind guide the movement: thoracic facets, in a frontal plane and braced by the ribs, allow rotation but little flexion; lumbar facets, in a sagittal plane, allow flexion and extension but little rotation. The lowest lumbar levels carry the most flexion.' },
  { id: 'jaw', name: 'Jaw (temporomandibular)', cls: 'condyloid', bones: ['mandible', 'temporal-left'],
    movements: [mv('jaw-open', 'Mouth opening', 0, 50, 'closed', 'open 50 mm', false)],
    text: 'Each joint has an articular disc dividing it in two: the condyle first rotates in the lower compartment (about 20–25 mm of opening), then glides forwards onto the articular eminence in the upper compartment for a full opening of about 40–50 mm between the incisors.' },
  { id: 'pubic-symphysis', name: 'Pubic symphysis', cls: 'symphysis', bones: ['hip-bone-left', 'hip-bone-right'], movements: [],
    text: 'The two pubic bones meet in the midline across a fibrocartilaginous disc; it moves only a millimetre or two, and loosens in late pregnancy under relaxin.' },
  { id: 'sacroiliac', name: 'Sacroiliac joint', cls: 'plane', bones: ['sacrum', 'hip-bone-left'], movements: [],
    text: 'Synovial in front and fibrous behind, its interlocking surfaces and strong ligaments allow only a few degrees of nutation: it transfers the weight of the trunk to the pelvis.' },
  { id: 'sutures', name: 'Sutures of the skull', cls: 'suture', bones: ['frontal', 'parietal-left', 'parietal-right', 'occipital', 'temporal-left'], movements: [],
    text: 'The coronal, sagittal, lambdoid and squamous sutures let the skull mould at birth and grow with the brain; the fontanelles close by about 2 years (the posterior by 2 months), and the sutures fuse from the third decade on.' },
  { id: 'teeth', name: 'Tooth sockets', cls: 'gomphosis', bones: ['tooth-upper-molar-1-left', 'maxilla-left', 'mandible'], movements: [],
    text: 'Each root is slung in its alveolus by the periodontal ligament, which cushions chewing and senses pressure.' },
  { id: 'tibiofibular', name: 'Distal tibiofibular joint', cls: 'syndesmosis', bones: ['tibia-left', 'fibula-left', 'interosseous-membrane-leg-left'], movements: [],
    text: 'The fibula is bound to the tibia by the interosseous membrane and ligaments; a "high ankle sprain" tears them and widens the mortise.' },
];

/** The movement keys of a joint for a side (midline movements have no side). */
export const keyOf = (m: Movement, side: Side) => (m.limb ? `${m.id}-${side}` : m.id);
export const MOVEMENTS = JOINTS.flatMap((j) => j.movements);
export const movementById = (id: string) => MOVEMENTS.find((m) => m.id === id);

export type Pose = Readonly<Record<string, number>>;

/** Clamp a pose to the normal ranges; unknown keys are dropped. */
export function clampPose(pose: Pose): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(pose)) {
    const base = k.replace(/-(left|right)$/, '');
    const m = movementById(base);
    if (!m || !Number.isFinite(v)) continue;
    if (m.limb !== /-(left|right)$/.test(k)) continue;
    out[k] = Math.max(m.min, Math.min(m.max, v));
  }
  return out;
}

const both = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).flatMap(([k, v]) => [[`${k}-left`, v], [`${k}-right`, v]]));
export interface PoseDef { id: string; label: string; pose: Pose; text: string }
export const POSES: PoseDef[] = [
  { id: 'anatomical', label: 'Anatomical position', pose: {}, text: 'Standing upright, facing forwards, arms at the sides with the palms forwards: the reference for every anatomical term and every joint angle.' },
  { id: 'walking', label: 'Walking stride', pose: { 'hip-flex-left': 25, 'knee-flex-left': 5, 'ankle-flex-left': -5, 'hip-flex-right': -15, 'knee-flex-right': 20, 'ankle-flex-right': 15, 'toes-ext-right': 40, 'shoulder-flex-left': -20, 'elbow-flex-left': 20, 'shoulder-flex-right': 20, 'elbow-flex-right': 30, 'trunk-rot': 5 },
    text: 'Late in stance on the right: the right hip extends and the toes extend at push-off, while the left leg reaches forwards with the heel about to strike. The arms swing opposite to the legs.' },
  { id: 'sitting', label: 'Sitting', pose: { ...both({ 'hip-flex': 90, 'knee-flex': 90, 'elbow-flex': 80, 'shoulder-flex': 15, 'forearm-pron': 70 }), 'trunk-flex': 5 },
    text: 'Hips and knees at about 90°. On a chair the pelvis tilts back and the lumbar curve flattens unless the back is supported.' },
  { id: 'squat', label: 'Deep squat', pose: { ...both({ 'hip-flex': 115, 'knee-flex': 130, 'ankle-flex': -20, 'shoulder-flex': 80, 'elbow-flex': 10 }), 'trunk-flex': 30 },
    text: 'Needs full knee flexion, hip flexion and ankle dorsiflexion: a stiff ankle makes the heels lift or the trunk fall forwards.' },
  { id: 'reach', label: 'Reaching overhead', pose: { ...both({ 'shoulder-flex': 170, 'elbow-flex': 10, 'wrist-flex': -20 }), 'trunk-flex': -10, 'neck-flex': -20 },
    text: 'Full elevation of the arms: about two thirds at the glenohumeral joint and one third from the scapula rotating upwards on the chest wall, with a little extension of the spine.' },
  { id: 'throwing', label: 'Throwing (cocking)', pose: { 'shoulder-abd-right': 90, 'shoulder-rot-right': -90, 'elbow-flex-right': 90, 'shoulder-abd-left': 70, 'shoulder-flex-left': 30, 'elbow-flex-left': 60, 'trunk-rot': -30, 'hip-flex-left': 20, 'knee-flex-left': 15, 'knee-flex-right': 10 },
    text: 'The late cocking phase: the throwing shoulder abducted 90° and fully laterally rotated, the trunk turned away. The anterior capsule and the labrum take great strain here.' },
  { id: 'kneeling', label: 'Kneeling', pose: { ...both({ 'hip-flex': 5, 'knee-flex': 90, 'ankle-flex': 45, 'elbow-flex': 15 }) },
    text: 'The weight rests on the patellae and tibial tuberosities; the ankles plantarflex.' },
  { id: 'fist', label: 'Fists and open mouth', pose: { ...both({ grip: 100, 'elbow-flex': 100, 'forearm-pron': 0, 'shoulder-flex': 20 }), 'jaw-open': 45, 'neck-flex': -15 },
    text: 'Full flexion of every finger joint and a wide mouth: the condyles of the mandible glide forwards onto the articular eminences.' },
];
export const poseById = (id: string) => POSES.find((p) => p.id === id);

/**
 * How each spinal movement is shared between the levels: a weight per joint (`spine-<vertebra>` is
 * the joint below that vertebra; `atlanto-occipital` is the skull on the atlas), from White & Panjabi's
 * representative ranges. The weights of each movement sum to 1.
 */
const normalise = (w: Record<string, number>) => { const t = Object.values(w).reduce((a, b) => a + b, 0); return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / t])); };
const T = (vals: number[]) => Object.fromEntries(vals.map((v, i) => [`spine-t${i + 1}`, v]));
export const SPINE_SHARE: Record<string, Record<string, number>> = {
  'neck-flex': normalise({ 'atlanto-occipital': 25, 'spine-c1': 20, 'spine-c2': 10, 'spine-c3': 15, 'spine-c4': 20, 'spine-c5': 20, 'spine-c6': 17, 'spine-c7': 9 }),
  'neck-side': normalise({ 'atlanto-occipital': 5, 'spine-c1': 5, 'spine-c2': 10, 'spine-c3': 11, 'spine-c4': 11, 'spine-c5': 8, 'spine-c6': 7, 'spine-c7': 4 }),
  'neck-rot': normalise({ 'atlanto-occipital': 5, 'spine-c1': 40, 'spine-c2': 3, 'spine-c3': 7, 'spine-c4': 7, 'spine-c5': 7, 'spine-c6': 6, 'spine-c7': 2 }),
  'trunk-flex': normalise({ ...T([4, 4, 4, 4, 4, 5, 6, 6, 6, 9, 12, 12]), 'spine-l1': 12, 'spine-l2': 14, 'spine-l3': 15, 'spine-l4': 16, 'spine-l5': 17 }),
  'trunk-side': normalise({ ...T([5, 6, 6, 6, 6, 6, 6, 6, 6, 7, 9, 8]), 'spine-l1': 6, 'spine-l2': 6, 'spine-l3': 8, 'spine-l4': 6, 'spine-l5': 3 }),
  'trunk-rot': normalise({ ...T([9, 8, 8, 8, 8, 8, 8, 7, 4, 2, 2, 2]), 'spine-l1': 2, 'spine-l2': 2, 'spine-l3': 2, 'spine-l4': 2, 'spine-l5': 1 }),
};
