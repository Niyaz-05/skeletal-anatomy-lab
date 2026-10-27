import { useId } from 'react';
import { useLab } from '../app/LabContext';
import { jointBones } from '../app/state';
import type { CloseUp } from '../contract/schema';
import { CLASS_TEXT, JOINTS, keyOf, POSES, type Movement } from '../lab/joints';
import { BMU_PHASES, bmdAt, category, CATEGORY_TEXT, curve, hipRiskRelative, tScore, YOUNG, type Sex } from '../lab/bone';
import { FRACTURE_SITES, FRACTURE_TYPES, healingAt, patternById, siteById, STAGE_TEXT, unionWeeks } from '../lab/fractures';
import { boneCount, boneStage, eruptionAge, erupted, fusionAge, PHYSES, physisOpen, SEX_TRAITS, timingOf } from '../lab/growth';
import { measures } from '../lab/anchors';
import { CLOSE_UP_LABEL } from './CloseUpPanel';
import { Legend, LineChart } from './Chart';

function Radios<T extends string | number>({ label, options, value, onChange }: { label: string; options: readonly { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg-toggle wrap" role="radiogroup" aria-label={label}>
      {options.map((o) => <button key={String(o.id)} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>)}
    </div>
  );
}
function Slider({ label, min, max, step, value, onChange, text }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; text: string }) {
  const id = useId();
  return (
    <div className="field slider-field">
      <label htmlFor={id} className="small"><span>{label}</span> <strong>{text}</strong></label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} aria-valuetext={text} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}
function Head({ title }: { title: string }) {
  const id = useId();
  return <div className="detail-head"><h2 id={id} className="panel-title">{title}</h2></div>;
}
function CloseUpButtons({ ids }: { ids: CloseUp[] }) {
  const { dispatch } = useLab();
  return <div className="button-row">{ids.map((c) => <button key={c} type="button" className="secondary" onClick={() => dispatch({ type: 'set-close-up', value: c })}>Close-up: {CLOSE_UP_LABEL[c]}</button>)}</div>;
}
const f0 = (x: number) => Math.round(x).toLocaleString('en-GB');
const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);
const SEXES: { id: Sex; label: string }[] = [{ id: 'female', label: 'Female' }, { id: 'male', label: 'Male' }];

// ── Joints and movement ────────────────────────────────────────────────────
/** A movement's value in words: the name of the end it is towards, and the angle. */
export function describe(m: Movement, v: number): string {
  if (m.id === 'grip') return v === 0 ? 'open' : `${f0(v)} % of a fist`;
  if (m.id === 'jaw-open') return v === 0 ? 'closed' : `${f0(v)} mm`;
  if (v === 0) return 'neutral (0°)';
  const word = (v > 0 ? m.maxName : m.minName).replace(/\s*\d+\s*(°|%|mm)?$/, '').replace(/\s*\(%\)$/, '');
  return `${word} ${f0(Math.abs(v))}°`;
}

export function JointsPanel() {
  const { state, dispatch } = useLab();
  const j = JOINTS.find((x) => x.id === state.joints.joint) ?? JOINTS[0]!;
  const cls = CLASS_TEXT[j.cls];
  const limb = j.movements.some((m) => m.limb);
  const side = state.joints.side;
  const preset = POSES.find((p) => p.id === state.joints.preset);
  const valueOf = (m: Movement) => state.joints.pose[keyOf(m, side === 'both' ? 'left' : side)] ?? 0;
  const id = useId();
  return (
    <section className="sheet joints-panel" aria-label="Joints and movement" data-joint={j.id} data-pose={state.joints.preset ?? 'custom'}>
      <Head title="Joints and movement" />
      <h3 className="group-title">Poses</h3>
      <Radios label="Pose" options={POSES.map((p) => ({ id: p.id, label: p.label }))} value={state.joints.preset ?? ''} onChange={(p) => dispatch({ type: 'set-pose', preset: p })} />
      {preset && <p className="small">{preset.text}</p>}
      <h3 className="group-title">Move a joint</h3>
      <div className="field">
        <label htmlFor={`${id}-j`} className="small">Joint</label>
        <select id={`${id}-j`} value={j.id} onChange={(e) => dispatch({ type: 'set-joint', joint: e.target.value })}>
          {JOINTS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>
      {limb && <Radios label="Side" options={[{ id: 'left' as const, label: 'Left' }, { id: 'right' as const, label: 'Right' }, { id: 'both' as const, label: 'Both' }]} value={side} onChange={(s) => dispatch({ type: 'set-joint', side: s })} />}
      {j.movements.map((m) => {
        const v = valueOf(m);
        const key = m.limb ? `${m.id}-${side}` : m.id;
        return (
          <div key={m.id} data-movement={m.id} data-value={v}>
            <Slider label={m.label} min={m.min} max={m.max} step={1} value={v} text={describe(m, v)} onChange={(x) => dispatch({ type: 'set-movement', key, value: x })} />
            <p className="muted small range-note">Normal range: {m.minName} to {m.maxName}</p>
          </div>
        );
      })}
      {!j.movements.length && <p className="muted small">This joint barely moves, so it has no slider.</p>}
      <div className="joint-card" data-class={j.cls}>
        <p className="chip-row"><span className="chip-static">{cls.family === 'synovial' ? 'Synovial' : cls.family === 'fibrous' ? 'Fibrous' : 'Cartilaginous'} joint</span><span className="chip-static">{cls.label}</span></p>
        <p className="small"><strong>{cls.label}:</strong> {cls.text}</p>
        <p className="small">{j.text}</p>
        <ul className="chips">
          {jointBones(j.id, side === 'both' ? 'left' : side).map((b) => <li key={b}><button type="button" onClick={() => dispatch({ type: 'select', id: b })}>{b.replace(/-(left|right)$/, '').replace(/-/g, ' ')}</button></li>)}
        </ul>
      </div>
      <details className="more">
        <summary>All joint types</summary>
        <dl className="closeup-parts small">{Object.values(CLASS_TEXT).map((c) => <div key={c.label}><dt>{c.label} ({c.family})</dt><dd>{c.text}</dd></div>)}</dl>
      </details>
      <CloseUpButtons ids={['synovial']} />
      <button type="button" className="secondary" onClick={() => dispatch({ type: 'set-pose', preset: 'anatomical' })}>Back to the anatomical position</button>
    </section>
  );
}

// ── Bone tissue and bone mass ──────────────────────────────────────────────
export function TissuePanel() {
  const { state, dispatch } = useLab();
  const t = state.tissue, f = t.factors;
  const bmd = bmdAt(t.age, t.sex, f), ts = tScore(bmd), cat = category(ts);
  const pts = curve(t.sex, f, 5, 90, 1);
  const thr = (tv: number) => YOUNG.female.mean + tv * YOUNG.female.sd;
  const set = (value: Partial<typeof t>, factors?: Partial<typeof f>) => dispatch({ type: 'set-tissue', value, factors });
  return (
    <section className="sheet tissue-panel" aria-label="Bone tissue and bone mass" data-tscore={f2(ts)} data-category={cat} data-bmd={bmd.toFixed(3)}>
      <Head title="Bone mass through life" />
      <Radios label="Sex" options={SEXES} value={t.sex} onChange={(sex) => set({ sex })} />
      <Slider label="Age" min={5} max={90} step={1} value={t.age} text={`${t.age} years`} onChange={(age) => set({ age })} />
      <table className="small results">
        <tbody>
          <tr><th scope="row">Femoral-neck BMD</th><td>{bmd.toFixed(3)} g/cm²</td></tr>
          <tr><th scope="row">T-score</th><td>{ts >= 0 ? '+' : ''}{f1(ts)} <span className={`flag is-${cat === 'normal' ? 'normal' : cat === 'osteopenia' ? 'low' : 'high'}`}>{cat}</span></td></tr>
          <tr><th scope="row">Hip fracture risk</th><td>{ts < 0 ? `about ${f1(hipRiskRelative(ts))} × that of a young adult` : 'as a young adult'}</td></tr>
        </tbody>
      </table>
      <p className="small">{CATEGORY_TEXT[cat]}</p>
      <LineChart label={`Femoral-neck bone density from 5 to 90: ${bmd.toFixed(2)} g/cm² at ${t.age}.`} xMax={85} cursor={t.age - 5}
        xTicks={[0, 25, 45, 65, 85].map((a) => ({ at: a, text: `${a + 5}` }))}
        series={[{ label: 'BMD', colour: '#d8a040', values: pts.map((p) => p.bmd) }, { label: 'Osteoporosis (T −2.5)', colour: '#c04050', values: pts.map(() => thr(-2.5)), dashed: true }, { label: 'Osteopenia (T −1)', colour: '#9a9a9a', values: pts.map(() => thr(-1)), dashed: true }]}
        yLeft={{ min: 0.3, max: 1.1, ticks: [0.4, 0.6, 0.8, 1.0], unit: 'g/cm²' }} height={120} />
      <Legend items={[{ label: 'Bone density', colour: '#d8a040' }, { label: 'T-score −1', colour: '#9a9a9a' }, { label: 'T-score −2.5', colour: '#c04050' }]} />
      <h3 className="group-title">What changes it</h3>
      <div className="checks">
        <Check label="Active, weight-bearing youth" checked={f.activeYouth} onChange={(v) => set({}, { activeYouth: v })} />
        <Check label="Low calcium and vitamin D" checked={f.lowCalcium} onChange={(v) => set({}, { lowCalcium: v })} />
        <Check label="Smoking" checked={f.smoker} onChange={(v) => set({}, { smoker: v })} />
        <Check label="Long-term glucocorticoids from 50" checked={f.steroidsFrom !== null} onChange={(v) => set({}, { steroidsFrom: v ? 50 : null })} />
        {t.sex === 'female' && <Check label="Hormone therapy for 5 years from the menopause" checked={f.hrt} onChange={(v) => set({}, { hrt: v })} />}
      </div>
      {t.sex === 'female' && <Slider label="Menopause" min={40} max={58} step={1} value={f.menopause} text={`at ${f.menopause}`} onChange={(menopause) => set({}, { menopause })} />}
      <button type="button" className="secondary" aria-pressed={state.colourBy === 'xray'} onClick={() => dispatch({ type: 'set-colour-by', value: state.colourBy === 'xray' ? 'real' : 'xray' })}>
        {state.colourBy === 'xray' ? 'Back to real colours' : 'X-ray view (brightness follows density)'}
      </button>
      <h3 className="group-title">The remodelling cycle</h3>
      <dl className="closeup-parts small">{BMU_PHASES.map((p) => <div key={p.id}><dt>{p.label} (days {p.from}–{p.to})</dt><dd>{p.text}</dd></div>)}</dl>
      <CloseUpButtons ids={['osteon', 'spongy', 'remodelling', 'growth-plate']} />
      <p className="muted small">A teaching model built on NHANES III reference values; the female pelvis beside the skeleton shows real compact bone (see-through) over spongy bone.</p>
    </section>
  );
}

// ── Fractures and healing ──────────────────────────────────────────────────
export function FracturesPanel() {
  const { state, dispatch } = useLab();
  const fr = state.fracture, site = siteById(fr.site)!, pat = patternById(fr.pattern)!;
  const union = unionWeeks(fr.site, fr.pattern, fr.healing);
  const h = healingAt(fr.weeks, union);
  const set = (value: Partial<typeof fr>, healing?: Partial<typeof fr.healing>) => dispatch({ type: 'set-fracture', value, healing });
  const id = useId();
  return (
    <section className="sheet fractures-panel" aria-label="Fractures and healing" data-site={fr.site} data-pattern={fr.pattern} data-stage={h.stage} data-union={union}>
      <Head title="Fractures and healing" />
      <div className="field">
        <label htmlFor={`${id}-s`} className="small">Fracture</label>
        <select id={`${id}-s`} value={fr.site} onChange={(e) => set({ site: e.target.value })}>
          {FRACTURE_SITES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <Radios label="Pattern" options={site.patterns.map((p) => ({ id: p, label: FRACTURE_TYPES.find((x) => x.id === p)!.label }))} value={fr.pattern} onChange={(pattern) => set({ pattern })} />
      <p className="small"><strong>{pat.label}:</strong> {pat.text}</p>
      <Slider label="Time since the injury" min={0} max={52} step={0.5} value={fr.weeks} text={fr.weeks === 0 ? 'at the injury' : `${f1(fr.weeks)} weeks`} onChange={(weeks) => set({ weeks })} />
      <div className="stage-card" data-stage={h.stage}>
        <h3 className="group-title">{STAGE_TEXT[h.stage].label}</h3>
        <p className="small">{STAGE_TEXT[h.stage].text}</p>
        <p className="small">Expected union: about <strong>{f1(union)} weeks</strong> (typical adult {site.unionWeeks[0]}–{site.unionWeeks[1]}); {fr.weeks === 0 ? 'shown as displaced at the injury, then reduced and held' : `${f0(h.bridged * 100)} % bridged`}.</p>
      </div>
      <h3 className="group-title">The person</h3>
      <Slider label="Age" min={2} max={95} step={1} value={fr.healing.age} text={`${fr.healing.age} years`} onChange={(age) => set({}, { age })} />
      <div className="checks">
        <Check label="Smoker" checked={fr.healing.smoker} onChange={(v) => set({}, { smoker: v })} />
        <Check label="Diabetes" checked={fr.healing.diabetes} onChange={(v) => set({}, { diabetes: v })} />
        <Check label="Badly displaced" checked={fr.healing.displaced} onChange={(v) => set({}, { displaced: v })} />
      </div>
      <dl className="closeup-parts small">
        <div><dt>Who</dt><dd>{site.who}</dd></div>
        <div><dt>How</dt><dd>{site.mechanism}</dd></div>
        <div><dt>Signs</dt><dd>{site.signs}</dd></div>
        <div><dt>Complications</dt><dd>{site.complications}</dd></div>
        <div><dt>Treatment</dt><dd>{site.treatment}</dd></div>
      </dl>
      <button type="button" className="secondary" aria-pressed={state.colourBy === 'xray'} onClick={() => dispatch({ type: 'set-colour-by', value: state.colourBy === 'xray' ? 'real' : 'xray' })}>
        {state.colourBy === 'xray' ? 'Back to real colours' : 'X-ray view'}
      </button>
      <CloseUpButtons ids={['callus']} />
    </section>
  );
}

// ── Through life and the sexes ─────────────────────────────────────────────
const NAMES: Record<string, string> = { humerus: 'Humerus', radius: 'Radius', ulna: 'Ulna', femur: 'Femur', tibia: 'Tibia', fibula: 'Fibula', clavicle: 'Clavicle' };
export function LifePanel() {
  const { def, state, dispatch } = useLab();
  const l = state.life;
  const set = (value: Partial<typeof l>) => dispatch({ type: 'set-life', value });
  const left = PHYSES.filter((p) => p.bone.endsWith('-left'));
  const open = left.filter((p) => physisOpen(p, l.age, l.sex) > 0);
  const meshIds = def.structures.filter((s) => s.kind === 'mesh' && !s.id.startsWith('female-')).map((s) => s.id);
  const cartilage = meshIds.filter((id) => id.endsWith('-left') && boneStage(id, l.age, l.sex) === 'cartilage').map((id) => id.replace(/-left$/, ''));
  const teeth = meshIds.filter((id) => id.startsWith('tooth-'));
  const up = teeth.filter((id) => erupted(id, l.age)).length;
  const next = teeth.filter((id) => !erupted(id, l.age)).map((id) => ({ id, age: eruptionAge(id)! })).sort((a, b) => a.age - b.age)[0];
  const mp = measures().pelvis;
  const label = (id: string) => def.structures.find((s) => s.id === `${id}-left`)?.label.replace(/ \(left\)$/, '') ?? id;
  return (
    <section className="sheet life-panel" aria-label="Through life" data-age={l.age} data-open-physes={open.length} data-bone-count={boneCount(l.age)} data-teeth={up} data-compare={l.compare}>
      <Head title="The skeleton through life" />
      <Radios label="Sex" options={SEXES} value={l.sex} onChange={(sex) => set({ sex })} />
      <Slider label="Age" min={0} max={30} step={0.5} value={l.age} text={l.age === 0 ? 'birth' : `${f1(l.age)} years`} onChange={(age) => set({ age })} />
      <table className="small results">
        <tbody>
          <tr><th scope="row">Separate bones</th><td>about {boneCount(l.age)}</td></tr>
          <tr><th scope="row">Open growth plates (each side, shown in blue)</th><td>{open.length} of {left.length}</td></tr>
          <tr><th scope="row">Permanent teeth erupted</th><td>{up} of {teeth.length}{next ? ` · next: ${next.id.replace(/^tooth-|-left$|-right$/g, '').replace(/-/g, ' ')} at about ${next.age}` : ''}</td></tr>
        </tbody>
      </table>
      {cartilage.length > 0 && <p className="small"><strong>Still cartilage (pale blue):</strong> {cartilage.map(label).join(', ')}.</p>}
      {open.length > 0 && (
        <ul className="small plate-list">
          {open.map((p) => <li key={p.id}>{NAMES[p.bone.replace(/-left$/, '')] ?? p.bone}, {p.end} end: closes at about {f1(fusionAge(p, l.sex))}</li>)}
        </ul>
      )}
      <p className="muted small">The milk teeth before 6–12 years are not modelled, and the bones are shown at adult size: a child's skeleton is smaller and its head relatively larger (a quarter of its height at birth, an eighth in adults).</p>
      <CloseUpButtons ids={['growth-plate']} />
      <h3 className="group-title">Female and male</h3>
      <Check label="Compare the pelvises side by side" checked={l.compare} onChange={(compare) => set({ compare })} />
      <table className="small results compare-table">
        <thead><tr><th scope="col">Measured in this lab</th><th scope="col">Female (HuBMAP)</th><th scope="col">Male (BodyParts3D)</th></tr></thead>
        <tbody>
          <tr><th scope="row">Subpubic angle</th><td>{f0(mp.female.subpubicAngleDeg)}°</td><td>{f0(mp.male.subpubicAngleDeg)}°</td></tr>
          <tr><th scope="row">True conjugate of the inlet</th><td>{f0(mp.female.inletConjugateMm)} mm</td><td>{f0(mp.male.inletConjugateMm)} mm</td></tr>
          <tr><th scope="row">Width across the iliac crests</th><td>{f0(mp.female.biiliacWidthMm)} mm</td><td>{f0(mp.male.biiliacWidthMm)} mm</td></tr>
          <tr><th scope="row">Height of the pelvis</th><td>{f0(mp.female.heightMm)} mm</td><td>{f0(mp.male.heightMm)} mm</td></tr>
        </tbody>
      </table>
      <table className="small results compare-table">
        <thead><tr><th scope="col">Textbook</th><th scope="col">Female</th><th scope="col">Male</th></tr></thead>
        <tbody>{[...SEX_TRAITS.pelvis, ...SEX_TRAITS.skull].map(([k, f, m]) => <tr key={k}><th scope="row">{k}</th><td>{f}</td><td>{m}</td></tr>)}</tbody>
      </table>
      <p className="muted small">Two individuals, not averages. Sex is estimated from the pelvis with about 95 % accuracy, from the skull about 90 %; age from growth plates and teeth in the young, from the pubic symphysis, the auricular surface and the sternal rib ends in adults.</p>
      <p className="muted small">{timingOf('clavicle-left')?.note}</p>
    </section>
  );
}
