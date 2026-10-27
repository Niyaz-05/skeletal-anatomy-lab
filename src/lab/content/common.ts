/**
 * Content shared across the lab: sources, camera presets, disclaimers and helpers to write
 * structures.
 */
import type { AnatomicalStructure, CameraPreset, Source } from '../../contract/schema';

export const SOURCES: Source[] = [
  { id: 'openstax-ap', citation: 'Betts JG et al. Anatomy and Physiology 2e, chapters 6 (Bone Tissue and the Skeletal System), 7 (Axial Skeleton), 8 (Appendicular Skeleton) and 9 (Joints). OpenStax, 2022.', url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/6-introduction', license: 'CC BY 4.0' },
  { id: 'grays', citation: 'Standring S, ed. Gray’s Anatomy: The Anatomical Basis of Clinical Practice, 42nd ed. Elsevier, 2021.' },
  { id: 'bp3d', citation: 'Mitsuhashi N et al. BodyParts3D: 3D structure database for anatomical concepts. Nucleic Acids Res 2009;37:D782–5. Database Center for Life Science (DBCLS).', url: 'https://doi.org/10.1093/nar/gkn613', license: 'CC BY 4.0' },
  { id: 'hra', citation: 'Browne K, Schlehlein H et al. 3D Reference Organ Set for Female, v1.5. HuBMAP Human Reference Atlas, 2023.', url: 'https://doi.org/10.48539/HBM352.BTSQ.586', license: 'CC BY 4.0' },
  { id: 'scheuer-black', citation: 'Scheuer L, Black S. The Juvenile Skeleton. Elsevier Academic Press, 2004.' },
  { id: 'norkin', citation: 'Norkin CC, White DJ. Measurement of Joint Motion: A Guide to Goniometry, 5th ed. F.A. Davis, 2016 (with the AAOS normal ranges).' },
  { id: 'white-panjabi', citation: 'White AA, Panjabi MM. Clinical Biomechanics of the Spine, 2nd ed. Lippincott, 1990.' },
  { id: 'inman', citation: 'Inman VT. The Joints of the Ankle. Williams & Wilkins, 1976.' },
  { id: 'looker-1998', citation: 'Looker AC et al. Updated data on proximal femur bone mineral levels of US adults. Osteoporos Int 1998;8:468–89.', url: 'https://doi.org/10.1007/s001980050093' },
  { id: 'who-1994', citation: 'WHO Study Group. Assessment of fracture risk and its application to screening for postmenopausal osteoporosis. WHO Technical Report Series 843, 1994.' },
  { id: 'iscd-2019', citation: 'International Society for Clinical Densitometry. 2019 ISCD Official Positions – Adult.', url: 'https://iscd.org/official-positions-2019-adult/' },
  { id: 'marshall-1996', citation: 'Marshall D, Johnell O, Wedel H. Meta-analysis of how well measures of bone mineral density predict occurrence of osteoporotic fractures. BMJ 1996;312:1254–9.', url: 'https://doi.org/10.1136/bmj.312.7041.1254' },
  { id: 'riggs-1986', citation: 'Riggs BL, Melton LJ. Involutional osteoporosis. N Engl J Med 1986;314:1676–86.', url: 'https://doi.org/10.1056/NEJM198606263142605' },
  { id: 'van-staa-2002', citation: 'Van Staa TP, Leufkens HGM, Cooper C. The epidemiology of corticosteroid-induced osteoporosis: a meta-analysis. Osteoporos Int 2002;13:777–87.', url: 'https://doi.org/10.1007/s001980200108' },
  { id: 'marsell-2011', citation: 'Marsell R, Einhorn TA. The biology of fracture healing. Injury 2011;42:551–5.', url: 'https://doi.org/10.1016/j.injury.2011.03.031' },
  { id: 'scolaro-2014', citation: 'Scolaro JA, Schenker ML, Yannascoli S et al. Cigarette smoking increases complications following fracture: a systematic review. J Bone Joint Surg Am 2014;96:674–81.', url: 'https://doi.org/10.2106/JBJS.M.00081' },
  { id: 'loder-1988', citation: 'Loder RT. The influence of diabetes mellitus on the healing of closed fractures. Clin Orthop Relat Res 1988;232:210–6.' },
  { id: 'mcrae', citation: 'White TO, Mackenzie SP, Gray AJ. McRae’s Orthopaedic Trauma and Emergency Fracture Management, 3rd ed. Elsevier, 2016.' },
  { id: 'nice-hip', citation: 'NICE clinical guideline CG124: Hip fracture: management, 2011 (updated 2023).', url: 'https://www.nice.org.uk/guidance/cg124' },
  { id: 'ada-eruption', citation: 'American Dental Association. Tooth eruption charts: the permanent teeth.', url: 'https://www.mouthhealthy.org/all-topics-a-z/eruption-charts' },
];

export const CAMERAS: CameraPreset[] = [
  { id: 'anterior', label: 'Front', direction: [0, 0.05, 1] },
  { id: 'posterior', label: 'Back', direction: [0, 0.05, -1] },
  { id: 'left', label: 'Left side', direction: [1, 0.05, 0.02] },
  { id: 'right', label: 'Right side', direction: [-1, 0.05, 0.02] },
  { id: 'superior', label: 'From above', direction: [0, 1, 0.0001], up: [0, 0, -1] },
  { id: 'inferior', label: 'From below', direction: [0, -1, 0.35] },
  { id: 'oblique', label: '3/4', direction: [0.65, 0.2, 0.75] },
];

export const DISCLAIMERS = [
  'For learning only. Not a diagnostic or treatment tool: a suspected fracture, joint injury or osteoporosis needs a doctor.',
  'The bones are BodyParts3D (one adult male); the coccyx, knee ligaments and menisci and the female pelvis are from the HuBMAP female body. The inferior nasal conchae and the ear ossicles are not in the model.',
  'Joint ranges, bone density and healing times are textbook averages in teaching models; real people vary widely.',
];

/** Defaults for a structure entry. */
export function S(o: Partial<AnatomicalStructure> & Pick<AnatomicalStructure, 'id' | 'label' | 'layer' | 'summary' | 'function'>): AnatomicalStructure {
  return { kind: 'mesh', side: 'midline', synonyms: [], related: [], sources: ['openstax-ap', 'grays', 'bp3d'], ...o };
}
/** A left and a right structure from one description; `{side}` in the text is replaced. */
export function pair(id: string, label: string, o: Omit<Partial<AnatomicalStructure>, 'id' | 'label' | 'side'> & Pick<AnatomicalStructure, 'layer' | 'summary' | 'function'>, perSide: (side: 'left' | 'right') => Partial<AnatomicalStructure> = () => ({})): AnatomicalStructure[] {
  return (['left', 'right'] as const).map((side) => {
    const sub = (t: string) => t.replaceAll('{side}', side);
    const p = perSide(side);
    return S({
      ...o, ...p, id: `${id}-${side}`, label: `${label} (${side})`, side,
      summary: sub(p.summary ?? o.summary), function: sub(p.function ?? o.function),
      related: (p.related ?? o.related ?? []).map(sub),
      organ: p.organ ?? (o.organ ? sub(o.organ) : undefined),
    });
  });
}
export const group = (id: string, label: string, layer: string, members: string[], o: Omit<Partial<AnatomicalStructure>, 'id' | 'label' | 'layer' | 'members' | 'kind'> & Pick<AnatomicalStructure, 'summary' | 'function'>): AnatomicalStructure =>
  S({ ...o, id, label, layer, kind: 'group', members });
