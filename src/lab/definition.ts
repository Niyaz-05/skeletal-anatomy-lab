/** The simulation definition of the skeletal lab. */
import type { SimulationDefinition } from '../contract/schema';
import { CAMERAS, DISCLAIMERS, SOURCES } from './content/common';
import { LAYERS, STRUCTURES } from './content/skeleton';
import { TOUR } from './content/tour';

const OBJECTIVES = [
  { id: 'anatomy', text: 'Name and locate the bones of the axial and appendicular skeleton and their main features, and classify bones by shape.' },
  { id: 'joints', text: 'Classify joints (fibrous, cartilaginous, synovial and the types of synovial joint) and describe the movements and normal ranges of the main joints.' },
  { id: 'synovial', text: 'Describe the structure of a synovial joint, the knee’s ligaments and menisci, and the scapulohumeral rhythm.' },
  { id: 'tissue', text: 'Describe compact and spongy bone, the osteon, bone cells and the remodelling cycle.' },
  { id: 'mass', text: 'Explain how bone mass changes through life, what affects it, and how the T-score defines osteopenia and osteoporosis.' },
  { id: 'fractures', text: 'Classify fracture patterns, recognise the common fractures and their complications, and describe the stages and timing of fracture healing.' },
  { id: 'growth', text: 'Explain endochondral and intramembranous ossification, growth plates and their closure, the eruption of the permanent teeth, and how the skeleton differs between the sexes.' },
];

export const definition: SimulationDefinition = {
  schemaVersion: 1,
  id: 'skeletal',
  title: 'Human Skeletal System',
  domain: 'biology',
  simulationType: '3d-anatomy',
  audience: 'University anatomy and physiology (medicine, physiotherapy, nursing, sports science, biology)',
  summary: 'The BodyParts3D adult skeleton with the HuBMAP coccyx, knee ligaments and a female pelvis: the bones and their features, joints and movement with normal ranges, bone tissue and bone mass through life, fractures and their healing, and growth and the differences between the sexes.',
  learningObjectives: OBJECTIVES,
  assets: [{ id: 'bp3d-skeleton-v1', role: 'anatomy-model' }],
  layers: LAYERS,
  structures: STRUCTURES,
  cameraPresets: CAMERAS,
  defaultCamera: 'anterior',
  tour: TOUR,
  sources: SOURCES,
  disclaimers: DISCLAIMERS,
};
