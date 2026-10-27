import { useId, useMemo, useState } from 'react';
import { useLab } from '../app/LabContext';
import { effectiveSlice, isVisible, keptHalf, type ColourBy } from '../app/state';
import { searchStructures } from '../app/search';
import type { AnatomicalStructure, SliceAxis } from '../contract/schema';
import { baseColour } from '../viewer/palette';
import { SECTIONS } from '../lab/content/sections';

const COLOUR_MODES: { id: ColourBy; label: string }[] = [
  { id: 'real', label: 'Real' },
  { id: 'region', label: 'Regions' },
  { id: 'xray', label: 'X-ray' },
];

const SLICES: { id: SliceAxis; label: string; hint: string }[] = [
  { id: 'off', label: 'Off', hint: 'No cut' },
  { id: 'sagittal', label: 'Side', hint: 'Sagittal cut: left from right' },
  { id: 'coronal', label: 'Front', hint: 'Coronal cut: front from back' },
  { id: 'axial', label: 'Top', hint: 'Axial (horizontal) cut: top from bottom' },
];

/** The cut control: axis, position and which side to keep. */
function SliceControl() {
  const { def, state, dispatch } = useLab();
  const id = useId();
  // In a tour the step sets the cut: show it, and leave the controls to the learner's own views.
  const touring = state.mode === 'tour';
  const s = effectiveSlice(def, state);
  return (
    <div className="slice" role="group" aria-labelledby={`${id}-t`}>
      <span className="group-title" id={`${id}-t`}>Cut</span>
      <div className="seg-toggle" role="radiogroup" aria-label="Cut direction">
        {SLICES.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={s.axis === x.id} title={x.hint} disabled={touring} onClick={() => dispatch({ type: 'set-slice', axis: x.id })}>
            {x.label}
          </button>
        ))}
      </div>
      {s.axis !== 'off' && (
        <div className="field slice-field">
          <label htmlFor={`${id}-at`} className="sr-only">Cut position</label>
          <input
            id={`${id}-at`}
            type="range" min={-1} max={1} step={0.01} value={s.at}
            aria-valuetext={`${Math.round(((s.at + 1) / 2) * 100)} percent across`}
            disabled={touring}
            onChange={(e) => dispatch({ type: 'set-slice', at: Number(e.target.value) })}
          />
          <button type="button" className="secondary small-button" aria-pressed={s.flip} disabled={touring} onClick={() => dispatch({ type: 'set-slice', flip: !s.flip })} title="Keep the other half">
            Flip
          </button>
        </div>
      )}
      {s.axis !== 'off' && <p className="slice-hint" aria-live="polite">Showing {keptHalf(s)}{touring ? ' (set by the tour)' : ''}</p>}
    </div>
  );
}

/** Search, colour mode, cut, layer toggles and the grouped structure list. Every entry selects on the model. */
export function StructurePanel() {
  const { def, state, dispatch } = useLab();
  const [query, setQuery] = useState('');
  const id = useId();
  const hits = useMemo(() => searchStructures(def.structures, query), [def, query]);
  const searching = query.trim().length > 0;
  const select = (sid: string) => dispatch({ type: 'select', id: sid });

  // Inside a group of one side the side is already said; elsewhere the label keeps it.
  const item = (s: AnatomicalStructure, swatch = false, inSidedGroup = false) => {
    const shown = s.kind === 'group' ? (s.members ?? []).some((m) => isVisible(def, state, m)) : isVisible(def, state, s.id);
    return (
      <li key={s.id}>
        <button
          type="button"
          aria-pressed={state.selected === s.id}
          className={shown ? undefined : 'is-hidden'}
          onClick={() => select(s.id)}
          onMouseEnter={() => dispatch({ type: 'hover', id: s.kind === 'mesh' ? s.id : null })}
          onMouseLeave={() => dispatch({ type: 'hover', id: null })}
        >
          {swatch && <span className="dot" aria-hidden="true" style={{ background: baseColour(s, state.colourBy) }} />}
          {inSidedGroup ? s.label.replace(/ \((right|left)\)$/, '') : s.label}
          {!shown && <span className="tag">hidden</span>}
        </button>
      </li>
    );
  };

  const meshesOf = (g: AnatomicalStructure) => (g.members ?? []).map((m) => def.structures.find((x) => x.id === m)).filter((x): x is AnatomicalStructure => !!x);

  return (
    <section className="panel structure-panel" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="panel-title">Structures</h2>

      <div className="search">
        <label htmlFor={`${id}-q`} className="sr-only">Search structures</label>
        <input
          id={`${id}-q`}
          type="search"
          placeholder="Search, e.g. collarbone, kneecap, ACL, C7"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits[0]) select(hits[0].structure.id);
            if (e.key === 'Escape') setQuery('');
          }}
          autoComplete="off"
        />
      </div>

      {searching ? (
        <div className="search-results" aria-live="polite">
          {hits.length === 0 ? (
            <p className="muted small">No structure matches “{query.trim()}”.</p>
          ) : (
            <ul className="struct-list">
              {hits.map((h) => (
                <li key={h.structure.id}>
                  <button type="button" aria-pressed={state.selected === h.structure.id} onClick={() => select(h.structure.id)}>
                    <span>{h.structure.label}</span>
                    {h.matched !== h.structure.label && <span className="muted small"> · {h.matched}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <div className="colour-by" role="radiogroup" aria-label="Colour the structures by">
            <span className="group-title">Colour</span>
            <div className="seg-toggle">
              {COLOUR_MODES.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={state.colourBy === c.id} onClick={() => dispatch({ type: 'set-colour-by', value: c.id })}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {state.colourBy === 'xray' && <p className="legend-row small">Bright where the beam crosses more bone, as on a radiograph.</p>}

          <SliceControl />

          <fieldset className="layers">
            <legend>Layers</legend>
            {def.layers.map((l) => (
              <label key={l.id} className="check" title={l.description}>
                <input type="checkbox" checked={state.visibleLayers.has(l.id)} onChange={() => dispatch({ type: 'toggle-layer', layer: l.id })} />
                {l.label}
              </label>
            ))}
          </fieldset>

          {SECTIONS.map((sec) => (
            <div key={sec.title} className="group">
              <h3 className="group-title">{sec.title}</h3>
              {sec.ids.map((id) => {
                const st = def.structures.find((x) => x.id === id);
                if (!st) return null;
                if (st.kind === 'mesh') return <ul key={id} className="struct-list">{item(st, state.colourBy === 'region')}</ul>;
                return (
                  <div key={id} className="tree-branch">
                    <ul className="struct-list">{item(st, true)}</ul>
                    <ul className="struct-list tree-leaves">{meshesOf(st).map((m) => item(m, state.colourBy === 'region', st.side !== 'midline'))}</ul>
                  </div>
                );
              })}
            </div>
          ))}

        </>
      )}
    </section>
  );
}
