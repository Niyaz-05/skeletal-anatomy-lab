/**
 * Fractures: the patterns, the common sites (each on a real bone of the model, placed by the
 * extractor), and how a fracture heals over the weeks.
 *
 * Healing stages and times: Marsell & Einhorn, Injury 2011;42:551–555; McRae's Orthopaedic Trauma
 * (3rd ed.); union times are typical adult ranges. Smoking slows union and doubles the risk of
 * non-union (Scolaro et al., J Bone Joint Surg Am 2014;96:674–681); diabetes lengthens healing
 * (Loder, Clin Orthop 1988;232:210–216).
 */

export interface FracturePattern {
  id: string;
  label: string;
  text: string;
  /** How the break is drawn: tilt of the fracture plane from square-on (degrees), a twist of the far fragment, a butterfly fragment, a bend without a full break, a crush, a small piece pulled off, fragments driven together. */
  draw: { tilt: number; twist?: number; butterfly?: boolean; bend?: boolean; crush?: boolean; avulsion?: boolean; impacted?: boolean };
}

export const FRACTURE_TYPES: FracturePattern[] = [
  { id: 'transverse', label: 'Transverse', text: 'Straight across the bone, from a direct blow or bending; usually stable once reduced.', draw: { tilt: 0 } },
  { id: 'oblique', label: 'Oblique', text: 'At an angle to the shaft, from bending with compression; tends to slip and shorten.', draw: { tilt: 40 } },
  { id: 'spiral', label: 'Spiral', text: 'Winds round the shaft from a twisting injury (a foot planted while the body turns). In a child not yet walking, a spiral fracture raises concern about non-accidental injury.', draw: { tilt: 55, twist: 20 } },
  { id: 'comminuted', label: 'Comminuted', text: 'More than two fragments, from high energy (road traffic accidents, falls from height); often needs surgery.', draw: { tilt: 20, butterfly: true } },
  { id: 'greenstick', label: 'Greenstick', text: 'In children: soft, springy bone with a thick periosteum bends and breaks on one side only, like a green twig.', draw: { tilt: 0, bend: true } },
  { id: 'compression', label: 'Compression (wedge)', text: 'Cancellous bone is crushed, typically a vertebral body, most often from osteoporosis: the front collapses into a wedge, the back height is kept.', draw: { tilt: 0, crush: true } },
  { id: 'avulsion', label: 'Avulsion', text: 'A ligament or tendon pulls off the piece of bone it is attached to (the tip of the lateral malleolus in an ankle sprain, the base of the fifth metatarsal).', draw: { tilt: 0, avulsion: true } },
  { id: 'impacted', label: 'Impacted', text: 'The fragments are driven into each other; often stable, as in many fractures of the humeral neck in older people.', draw: { tilt: 10, impacted: true } },
  { id: 'stress', label: 'Stress (fatigue)', text: 'Repeated loading faster than remodelling can repair: a hairline crack, often in the second metatarsal (march fracture) or the tibia of runners and recruits.', draw: { tilt: 0, bend: true } },
];
export const patternById = (id: string) => FRACTURE_TYPES.find((p) => p.id === id);

export interface FractureSite {
  id: string;
  name: string;
  /** The structure the break is drawn on. */
  bone: string;
  patterns: string[];
  defaultPattern: string;
  who: string;
  mechanism: string;
  signs: string;
  complications: string;
  treatment: string;
  /** Typical adult union time, weeks. */
  unionWeeks: [number, number];
}

export const FRACTURE_SITES: FractureSite[] = [
  { id: 'distal-radius', name: 'Distal radius (Colles)', bone: 'radius-left', patterns: ['transverse', 'comminuted', 'impacted', 'greenstick'], defaultPattern: 'transverse',
    who: 'The commonest fracture in adults: older women with osteoporosis, and children (as a buckle or greenstick fracture).', mechanism: 'A fall on the outstretched hand.',
    signs: 'A "dinner fork" deformity: the distal fragment is displaced and tilted backwards (dorsally) and towards the radial side.',
    complications: 'Malunion, median nerve compression (carpal tunnel), complex regional pain syndrome, late rupture of extensor pollicis longus.', treatment: 'Reduction and a cast for about 6 weeks, or a plate when unstable.', unionWeeks: [6, 8] },
  { id: 'scaphoid', name: 'Scaphoid (waist)', bone: 'scaphoid-left', patterns: ['transverse'], defaultPattern: 'transverse',
    who: 'Young adults.', mechanism: 'A fall on the outstretched hand with the wrist extended.',
    signs: 'Tenderness in the anatomical snuffbox; the first X-rays can look normal.',
    complications: 'The blood supply enters at the distal end, so the proximal pole can die (avascular necrosis) and the fracture may not unite.', treatment: 'A cast for 6–12 weeks, or a screw.', unionWeeks: [10, 12] },
  { id: 'clavicle', name: 'Clavicle (midshaft)', bone: 'clavicle-left', patterns: ['transverse', 'oblique', 'comminuted', 'greenstick'], defaultPattern: 'oblique',
    who: 'Children and young adults; the commonest fracture at birth.', mechanism: 'A fall on the shoulder.',
    signs: 'The medial fragment is pulled up by sternocleidomastoid and the lateral one down by the weight of the arm.',
    complications: 'Rarely injury to the subclavian vessels or brachial plexus beneath; non-union if very displaced or shortened.', treatment: 'A sling for 2–3 weeks; surgery when badly displaced.', unionWeeks: [6, 12] },
  { id: 'humeral-neck', name: 'Surgical neck of the humerus', bone: 'humerus-left', patterns: ['impacted', 'transverse', 'comminuted'], defaultPattern: 'impacted',
    who: 'Older people with osteoporosis.', mechanism: 'A fall on the outstretched hand or on the side.',
    signs: 'Bruising down the arm.', complications: 'The axillary nerve (deltoid weakness, numb patch over the badge area) and the posterior circumflex humeral artery wind round the neck here.', treatment: 'A sling and early movement for most.', unionWeeks: [6, 8] },
  { id: 'femoral-neck', name: 'Neck of femur (hip fracture)', bone: 'femur-left', patterns: ['transverse', 'impacted'], defaultPattern: 'transverse',
    who: 'Older people, mostly women, with osteoporosis; about one in three women and one in five men who reach 90.', mechanism: 'A simple fall from standing.',
    signs: 'The leg is short and turned out (laterally rotated); the person cannot bear weight.',
    complications: 'Displaced intracapsular fractures tear the retinacular arteries that run up the neck to the head (from the medial circumflex femoral artery): the head can die (avascular necrosis). About one in four older people die within a year.',
    treatment: 'Surgery within 36 hours: screws or a hemiarthroplasty or total hip replacement for displaced intracapsular fractures, a sliding hip screw for extracapsular ones.', unionWeeks: [12, 24] },
  { id: 'tibial-shaft', name: 'Tibial shaft', bone: 'tibia-left', patterns: ['transverse', 'oblique', 'spiral', 'comminuted', 'stress'], defaultPattern: 'spiral',
    who: 'Young adults: sport and road traffic accidents.', mechanism: 'A twisting injury (spiral) or a direct blow (transverse, comminuted).',
    signs: 'The front of the tibia lies just under the skin, so many are open (compound).', complications: 'Compartment syndrome, infection, delayed union and non-union (a poor blood supply in the lower third).', treatment: 'An intramedullary nail for most.', unionWeeks: [16, 20] },
  { id: 'ankle', name: 'Ankle (lateral malleolus)', bone: 'fibula-left', patterns: ['oblique', 'transverse', 'avulsion'], defaultPattern: 'oblique',
    who: 'All ages.', mechanism: 'Twisting with the foot planted, usually rolling outwards (supination and external rotation).',
    signs: 'Swelling and tenderness over the malleolus.', complications: 'An unstable mortise (talar shift) if the medial side or the syndesmosis is also torn; post-traumatic arthritis.', treatment: 'A boot for a stable fracture; plate and screws when the mortise is unstable.', unionWeeks: [6, 8] },
  { id: 'vertebral-compression', name: 'Vertebral compression (L1)', bone: 'l1', patterns: ['compression'], defaultPattern: 'compression',
    who: 'Older people with osteoporosis: the commonest osteoporotic fracture, often with little or no injury.', mechanism: 'Lifting, bending or a minor fall; sometimes none.',
    signs: 'Sudden back pain, loss of height and, after several, a thoracic kyphosis.', complications: 'Each fracture raises the risk of the next about fivefold.', treatment: 'Pain relief and treatment of the osteoporosis.', unionWeeks: [8, 12] },
  { id: 'metatarsal', name: 'Second metatarsal (march fracture)', bone: 'metatarsal-2-left', patterns: ['stress', 'transverse'], defaultPattern: 'stress',
    who: 'Runners, dancers and military recruits.', mechanism: 'Repetitive loading.', signs: 'Pain on walking; early X-rays often normal, then callus shows at 2–3 weeks.',
    complications: 'Recurrence if training resumes too soon; a low-energy fracture in a woman athlete prompts a look for low energy availability (RED-S).', treatment: 'Rest and a stiff-soled shoe.', unionWeeks: [6, 8] },
  { id: 'rib', name: 'Rib', bone: 'rib-7-left', patterns: ['transverse', 'comminuted'], defaultPattern: 'transverse',
    who: 'All ages; older people from minor falls.', mechanism: 'A direct blow or fall onto the chest.', signs: 'Pain on breathing and coughing.',
    complications: 'Pneumothorax, haemothorax, pneumonia from shallow breathing; several ribs broken in two places make a flail segment.', treatment: 'Pain relief and breathing exercises.', unionWeeks: [6, 8] },
];
export const siteById = (id: string) => FRACTURE_SITES.find((s) => s.id === id);

export interface HealingFactors { age: number; smoker: boolean; diabetes: boolean; displaced: boolean }
export const DEFAULT_HEALING: HealingFactors = { age: 35, smoker: false, diabetes: false, displaced: false };

/** Expected union time (weeks): the site's typical adult time, adjusted for the person and the break. */
export function unionWeeks(siteId: string, patternId: string, f: HealingFactors): number {
  const s = siteById(siteId);
  if (!s) return 8;
  let w = (s.unionWeeks[0] + s.unionWeeks[1]) / 2;
  if (f.age < 12) w *= 0.55; else if (f.age < 18) w *= 0.75; else if (f.age >= 65) w *= 1.2;
  if (f.smoker) w *= 1.4;
  if (f.diabetes) w *= 1.6;
  if (f.displaced) w *= 1.2;
  if (patternId === 'comminuted') w *= 1.3;
  if (patternId === 'greenstick') w *= 0.7;
  return Math.round(w * 2) / 2;
}

export type HealingStage = 'haematoma' | 'soft-callus' | 'hard-callus' | 'remodelling';
export const STAGE_TEXT: Record<HealingStage, { label: string; text: string }> = {
  haematoma: { label: 'Haematoma and inflammation', text: 'Torn vessels bleed into the gap; the clot and dying bone ends draw in neutrophils, macrophages and then mesenchymal stem cells (days 1–7). Swelling and pain peak.' },
  'soft-callus': { label: 'Soft (fibrocartilaginous) callus', text: 'Granulation tissue, then cartilage and fibrous tissue, bridge the gap from the periosteum inwards; new vessels grow in. The fracture is "sticky" but not yet strong.' },
  'hard-callus': { label: 'Hard (bony) callus', text: 'The cartilage calcifies and is replaced by woven bone (endochondral ossification), while the periosteum lays bone directly; a bony collar unites the fragments. On X-ray the callus shows as a fuzzy cuff; clinically the fracture is united when it is no longer tender or mobile.' },
  remodelling: { label: 'Remodelling', text: 'Over months to years the woven bone is replaced by lamellar bone along the lines of stress (Wolff’s law), the medullary canal reopens and the callus shrinks; in children even some angulation corrects.' },
};

/** The stage at a time, with how far each process has gone (0–1) for drawing. */
export function healingAt(weeks: number, union: number) {
  const h = Math.max(0.6, union * 0.1), soft = union * 0.4;
  const stage: HealingStage = weeks < h ? 'haematoma' : weeks < soft ? 'soft-callus' : weeks < union ? 'hard-callus' : 'remodelling';
  const ramp = (a: number, b: number) => Math.max(0, Math.min(1, (weeks - a) / Math.max(1e-6, b - a)));
  return {
    stage,
    haematoma: weeks < h ? 1 : Math.max(0, 1 - ramp(h, soft)),
    softCallus: ramp(h * 0.5, soft) * (1 - ramp(soft, union)),
    hardCallus: ramp(soft * 0.8, union) * (1 - 0.7 * ramp(union, union * 4)),
    /** How much of the gap has filled. */
    bridged: ramp(h, union),
  };
}
