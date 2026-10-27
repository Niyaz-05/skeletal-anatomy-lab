const pairs = (...bases: string[]) => bases.flatMap((b) => [`${b}-left`, `${b}-right`]);

/** The structure list: groups expand to their parts, so every mesh is listed once. */
export const SECTIONS: { title: string; ids: string[] }[] = [
  { title: 'Skull', ids: ['skull', 'hyoid'] },
  { title: 'Teeth', ids: ['upper-teeth', 'lower-teeth'] },
  { title: 'Larynx and nose', ids: ['larynx', ...pairs('major-alar-cartilage')] },
  { title: 'Vertebral column', ids: ['cervical-spine', 'thoracic-spine', 'lumbar-spine', 'sacrum', 'coccyx', 'intervertebral-discs'] },
  { title: 'Thorax', ids: ['sternum', 'ribs-left', 'ribs-right'] },
  { title: 'Upper limb', ids: [...pairs('clavicle', 'scapula', 'humerus', 'radius', 'ulna', 'interosseous-membrane-forearm'), 'hand-left', 'hand-right'] },
  { title: 'Pelvis and lower limb', ids: [...pairs('hip-bone', 'femur', 'patella', 'tibia', 'fibula', 'interosseous-membrane-leg'), 'knee-ligaments-left', 'knee-ligaments-right', 'foot-left', 'foot-right'] },
  { title: 'Other ligaments', ids: pairs('stylohyoid-ligament') },
  { title: 'Female pelvis (comparison)', ids: ['female-pelvis'] },
];
