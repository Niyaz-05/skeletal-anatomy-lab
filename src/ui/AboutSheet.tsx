import { useEffect, useRef } from 'react';
import { useLab } from '../app/LabContext';
import { LAYER_COLOUR } from '../viewer/palette';

/**
 * Source, scope and credits, kept off the main screen. The BodyParts3D and HuBMAP attribution
 * required by CC BY 4.0 lives here and is reachable from the ⓘ button and the "Source & credits" link.
 */
export function AboutSheet({ onClose }: { onClose: () => void }) {
  const { def } = useLab();
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    title.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="about-sheet glass" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ghost sheet-close" onClick={onClose} aria-label="Close">✕</button>
        <p className="eyebrow">Source &amp; scope</p>
        <h2 id="about-title" className="sheet-title" tabIndex={-1} ref={title}>About this lab</h2>
        <p>An interactive 3D lab of the human skeleton for university anatomy and physiology. {def.summary}</p>

        <h3 className="group-title">You will learn to</h3>
        <ul className="objectives">{def.learningObjectives.map((o) => <li key={o.id}>{o.text}</li>)}</ul>

        <h3 className="group-title">Colours</h3>
        <p className="small muted">
          “Real” shows a cleaned skeleton with its cartilage: ivory bone, glossy blue-white hyaline cartilage, grey fibrocartilage
          discs and menisci, silvery ligaments, white enamel and pink gums; the female pelvis’s spongy bone is red with marrow.
          “Regions” gives each region its own colour; “X-ray” shows the bones as on a radiograph, brightest where the beam crosses
          the most bone (in the bone tissue view its brightness follows bone density).
        </p>
        <p className="legend-row">{def.layers.map((l) => <span key={l.id}><span className="dot" style={{ background: LAYER_COLOUR[l.id] }} aria-hidden="true" /> {l.label}</span>)}</p>

        <h3 className="group-title">Simulations</h3>
        <ul className="small">
          <li><strong>Joints and movement:</strong> every bone hangs from its parent and turns about the joint centre measured on the model (the femoral and humeral heads fitted as spheres, the elbow, knee and ankle axes through the epicondyles, condyles and malleoli, the subtalar axis after Inman). Normal ranges from the AAOS as tabulated by Norkin &amp; White; spinal movement shared between the levels after White &amp; Panjabi; scapulohumeral rhythm at the shoulder.</li>
          <li><strong>Bone mass:</strong> femoral-neck density through life on the NHANES III reference (Looker 1998), with losses after 40 and after the menopause (Riggs &amp; Melton), glucocorticoids (Van Staa 2002), the WHO T-score categories and hip-fracture risk per SD (Marshall 1996).</li>
          <li><strong>Fractures:</strong> ten common fractures on the real bones, their patterns, healing stages (Marsell &amp; Einhorn 2011) and typical union times, slowed by smoking (Scolaro 2014) and diabetes (Loder 1988).</li>
          <li><strong>Through life:</strong> ossification and growth-plate fusion by age and sex (Scheuer &amp; Black), eruption of the permanent teeth, and the female and male pelvises compared, measured on the two models.</li>
        </ul>

        <h3 className="group-title">The 3D model</h3>
        <p className="small">
          <strong>Skeleton:</strong> <a href="https://doi.org/10.1093/nar/gkn613" target="_blank" rel="noopener noreferrer">BodyParts3D 4.0</a> (Database Center for Life Science), CC BY 4.0: 198 bones of one adult male, the costal and laryngeal cartilages, 23 discs, 28 teeth and a few ligaments. The inferior nasal conchae and the six ear ossicles are not in it.<br />
          <strong>From the HuBMAP female body</strong> (3D Reference Organ Set for Female v1.5, Kristen Browne, Heidi Schlehlein et al.;
          <a href="https://doi.org/10.48539/HBM352.BTSQ.586" target="_blank" rel="noopener noreferrer"> doi:10.48539/HBM352.BTSQ.586</a>), CC BY 4.0: the coccyx, carried onto the BodyParts3D sacrum by matching the same bone in both atlases; the knee’s cruciate and anterolateral ligaments and menisci, placed on the tibial plateau; and a female pelvis (compact and spongy bone) for comparison.<br />
          The growth plates, the haematoma and callus and every close-up are drawn in code. Full provenance and hashes: <code>ATTRIBUTION.md</code>.
        </p>

        <h3 className="group-title">Limits</h3>
        <ul className="small">{def.disclaimers.map((d) => <li key={d}>{d}</li>)}</ul>
      </section>
    </div>
  );
}
