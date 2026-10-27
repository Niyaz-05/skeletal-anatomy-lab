import { useId } from 'react';
import { useLab } from '../app/LabContext';
import { effectiveCloseUp } from '../app/state';
import type { CloseUp } from '../contract/schema';
import { closeUpFrame } from '../lab/anchors';

export const CLOSE_UP_LABEL: Record<CloseUp, string> = {
  osteon: 'compact bone (osteons)', spongy: 'spongy bone and marrow', 'growth-plate': 'a growth plate', remodelling: 'a remodelling unit', synovial: 'a synovial joint', callus: 'fracture healing',
};

const TEXT: Record<CloseUp, { title: string; body: string; parts: [string, string][] }> = {
  osteon: {
    title: 'Compact bone: osteons', body: 'A cross-section of the cortex of a long bone. Osteons, about 0.2 mm across and a few millimetres long, run along the bone’s length like bundled tubes.',
    parts: [
      ['Lamellae', 'Concentric layers of mineralised collagen, the fibres of each layer at an angle to the next, like plywood: strong in every direction.'],
      ['Central (Haversian) canal', 'Carries an arteriole, a venule and a nerve; perforating (Volkmann) canals link neighbouring canals and the periosteum.'],
      ['Osteocytes', 'Former osteoblasts walled up in lacunae, linked by fluid-filled canaliculi: they sense strain and steer remodelling.'],
      ['Periosteum', 'A fibrous outer layer with an inner layer of bone-forming cells: it thickens bone and makes the callus after a fracture.'],
    ],
  },
  spongy: {
    title: 'Spongy bone and marrow', body: 'Inside the ends of long bones, the vertebrae, the pelvis and the flat bones: a lattice of trabeculae with marrow between.',
    parts: [
      ['Trabeculae', 'Thin plates and struts with no osteons, fed from the marrow, lined up along the lines of stress (Wolff’s law).'],
      ['Red marrow', 'Makes red cells, white cells and platelets; in adults it remains in the axial skeleton and the ends of the femur and humerus.'],
      ['Yellow marrow', 'Fat that replaces red marrow in the limb shafts with age.'],
      ['Osteoporosis', 'Trabeculae thin and break first, so fractures cluster where spongy bone predominates: vertebrae, hip and wrist.'],
    ],
  },
  'growth-plate': {
    title: 'A growth plate (physis)', body: 'A disc of hyaline cartilage between the epiphysis and the shaft, where long bones grow in length by endochondral ossification.',
    parts: [
      ['Resting zone', 'Reserve chondrocytes anchoring the plate to the epiphysis.'],
      ['Proliferative zone', 'Chondrocytes divide and stack in columns: this sets the rate of growth (driven by growth hormone, IGF-1 and thyroid hormone).'],
      ['Hypertrophic zone', 'The cells swell, mineralise their matrix and die.'],
      ['Ossification zone', 'Capillaries and osteoblasts invade the calcified cartilage and lay bone on it. Oestrogen in both sexes finally closes the plate.'],
    ],
  },
  remodelling: {
    title: 'A remodelling unit (BMU)', body: 'In compact bone a cutting cone of osteoclasts bores a tunnel, and osteoblasts behind it fill it in as a new osteon: about 4 months from start to finish.',
    parts: [
      ['Osteoclasts', 'Large multinucleate cells from the monocyte line; they seal onto bone and dissolve it with acid and cathepsin K. RANKL from osteoblasts and osteocytes drives them; osteoprotegerin blocks it.'],
      ['Reversal', 'A pause in which the floor is cleaned and a cement line is laid.'],
      ['Osteoblasts', 'Lay down osteoid (type I collagen), which mineralises over weeks; some become osteocytes.'],
      ['Balance', 'Resorption faster than formation (after the menopause, with glucocorticoids, immobility) loses bone; drugs act here: bisphosphonates and denosumab on the osteoclast, teriparatide and romosozumab on formation.'],
    ],
  },
  synovial: {
    title: 'A synovial joint', body: 'The freely movable joints (the knee, hip, shoulder and many more) share one plan.',
    parts: [
      ['Articular cartilage', 'Smooth hyaline cartilage, 2–4 mm thick, with no vessels or nerves: fed by the synovial fluid and squeezed by movement. Its wear is osteoarthritis.'],
      ['Joint cavity and synovial fluid', 'A thin film of viscous fluid (hyaluronic acid, lubricin) that lubricates and nourishes.'],
      ['Synovial membrane', 'Lines the capsule and makes the fluid; it is the tissue inflamed in rheumatoid arthritis.'],
      ['Capsule and ligaments', 'Dense fibrous tissue holding the bones together, rich in nerve endings for position sense; menisci and discs in some joints spread the load.'],
    ],
  },
  callus: {
    title: 'A healing fracture', body: 'The callus at the stage chosen in the fractures panel (or a typical early stage).',
    parts: [
      ['Haematoma', 'The first days: clot and inflammation bring in the cells that start repair.'],
      ['Soft callus', 'From about the first to the third week: cartilage and fibrous tissue bridge the gap.'],
      ['Hard callus', 'Woven bone replaces the cartilage and unites the fragments; the fracture is clinically united.'],
      ['Remodelling', 'Months to years: lamellar bone replaces woven bone and the shape is restored along the lines of stress.'],
    ],
  },
};

/** The explanation beside a close-up, and the way back to the body. */
export function CloseUpPanel() {
  const { def, state, dispatch } = useLab();
  const id = useId();
  const close = effectiveCloseUp(def, state);
  if (!close) return null;
  const t = TEXT[close];
  const mag = closeUpFrame(def, close).magnified;
  return (
    <section className="sheet closeup-panel" aria-labelledby={`${id}-title`} data-close-up={close}>
      <div className="detail-head">
        <div>
          <p className="eyebrow">Close-up · magnified about {mag}×</p>
          <h2 id={`${id}-title`} className="panel-title">{t.title}</h2>
        </div>
        {state.mode !== 'tour' && <button type="button" className="secondary" onClick={() => dispatch({ type: 'set-close-up', value: null })}>Back to the body</button>}
      </div>
      <p className="small">{t.body}</p>
      <dl className="closeup-parts small">{t.parts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <p className="muted small">Drawn in code at textbook proportions, not a scan; cells are simplified.</p>
    </section>
  );
}
