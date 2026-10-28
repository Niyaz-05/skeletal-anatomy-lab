import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabProvider, useLab } from './app/LabContext';
import type { Mode } from './app/state';
import { validateDefinition } from './contract/validate';
import { definition } from './lab/definition';
import { LabViewer } from './viewer/LabViewer';
import { StructurePanel } from './ui/StructurePanel';
import { DetailPanel } from './ui/DetailPanel';
import { FracturesPanel, JointsPanel, LifePanel, TissuePanel } from './ui/ModePanels';
import { CloseUpPanel } from './ui/CloseUpPanel';
import { TourPanel } from './ui/TourPanel';
import { AboutSheet } from './ui/AboutSheet';
import { Sheet } from './ui/Sheet';
import { isTouch, panelInsets, useChrome, useLayout, type SheetState } from './app/layout';

const MODES: { id: Mode; label: string }[] = [
  { id: 'explore', label: 'Anatomy' },
  { id: 'joints', label: 'Joints' },
  { id: 'tissue', label: 'Bone tissue' },
  { id: 'fractures', label: 'Fractures' },
  { id: 'life', label: 'Through life' },
  { id: 'tour', label: 'Guided tour' },
];

/** Quick flights to a region of the body. */
const REGIONS: { label: string; ids: string[] }[] = [
  { label: 'Skull', ids: ['skull', 'hyoid'] },
  { label: 'Spine', ids: ['cervical-spine', 'thoracic-spine', 'lumbar-spine', 'sacrum'] },
  { label: 'Thorax', ids: ['ribs-left', 'ribs-right', 'sternum'] },
  { label: 'Hand', ids: ['hand-left'] },
  { label: 'Pelvis', ids: ['pelvis'] },
  { label: 'Knee', ids: ['femur-left', 'patella-left', 'tibia-left'] },
  { label: 'Foot', ids: ['foot-left'] },
];

function Toolbar({ structuresOpen, onStructures }: { structuresOpen: boolean; onStructures: () => void }) {
  const { def, state, dispatch } = useLab();
  return (
    <div className="dock glass" role="toolbar" aria-label="View controls">
      <button type="button" className="mobile-only dock-structures" aria-pressed={structuresOpen} onClick={onStructures}>Structures</button>
      <div className="seg" role="group" aria-label="Camera views">
        {def.cameraPresets.map((c) => (
          <button key={c.id} type="button" aria-pressed={state.camera.preset === c.id && !state.camera.focus.length} onClick={() => dispatch({ type: 'camera', preset: c.id })}>{c.label}</button>
        ))}
      </div>
      <span className="dock-sep" aria-hidden="true" />
      <div className="seg regions" role="group" aria-label="Fly to a region">
        {REGIONS.map((r) => <button key={r.label} type="button" onClick={() => dispatch({ type: 'camera', preset: 'anterior', focus: r.ids })}>{r.label}</button>)}
      </div>
      <span className="dock-sep" aria-hidden="true" />
      <label className="check toolbar-check">
        <input type="checkbox" checked={state.labels} onChange={(e) => dispatch({ type: 'set-labels', value: e.target.checked })} />
        Labels
      </label>
      <button type="button" className="secondary" onClick={() => dispatch({ type: 'camera', preset: state.camera.preset })} title="Fit the model in view">Fit</button>
      <button type="button" className="secondary" onClick={() => dispatch({ type: 'reset' })} title="Reset camera, layers, selection and mode">Reset</button>
    </div>
  );
}

/** Right-hand sheet: shown only when there is something to show. */
function SidePanel() {
  const { state } = useLab();
  if (state.mode === 'tour') return <TourPanel />;
  if (state.selected) return <DetailPanel />;
  if (state.closeUp) return <CloseUpPanel />;
  switch (state.mode) {
    case 'joints': return <JointsPanel />;
    case 'tissue': return <TissuePanel />;
    case 'fractures': return <FracturesPanel />;
    case 'life': return <LifePanel />;
    default: return <DetailPanel />;
  }
}

function Lab() {
  const { def, state, dispatch } = useLab();
  const [about, setAbout] = useState(false);
  // Phones and tablets: the structure panel opens over the model from the dock.
  const [structuresOpen, setStructuresOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetState>('half');
  const root = useRef<HTMLDivElement>(null);
  const closeAbout = useCallback(() => setAbout(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (typing || about) return;
      if (e.key === 'Escape') dispatch({ type: 'select', id: null });
      if (e.key === '0' || e.key === 'Home') dispatch({ type: 'camera', preset: def.defaultCamera });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [def, dispatch, about]);

  // Picking a structure from the panel on a phone closes the panel so the details can show.
  useEffect(() => { if (state.selected) setStructuresOpen(false); }, [state.selected]);
  // Something new to read opens the sheet halfway.
  useEffect(() => { setSheet('half'); }, [state.selected, state.mode]);
  const toggleStructures = () => { if (!structuresOpen) setSheet('peek'); setStructuresOpen(!structuresOpen); };

  const pickMode = (m: Mode) => dispatch({ type: 'set-mode', mode: m });

  const hasSheet = state.mode !== 'explore' || state.selected !== null || state.closeUp !== null;
  // A structure's details (not a mode's own panel) are open: on phones and tablets they take the screen's top bar with them.
  const detail = state.selected !== null && state.mode !== 'tour';
  const { w, h, layout } = useLayout();
  const chrome = useChrome(root);
  const insets = useMemo(() => panelInsets(layout, w, h, { hasSheet, sheet, ...chrome }), [layout, w, h, hasSheet, sheet, chrome]);
  const touch = useMemo(isTouch, []);
  // Show what was picked: on a phone or tablet the camera frames the structure in the space above the sheet,
  // and frames the whole model again when the details close.
  const compact = layout !== 'desktop';
  const picked = useRef<string | null>(null);
  useEffect(() => {
    const before = picked.current;
    picked.current = state.selected;
    if (!compact || state.mode === 'tour' || before === state.selected) return;
    if (state.selected) dispatch({ type: 'camera', preset: state.camera.preset, focus: [state.selected] });
    else if (before) dispatch({ type: 'camera', preset: state.camera.preset });
    // The camera preset is read when the selection changes, not followed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selected, compact, state.mode, dispatch]);
  const meshCount = def.structures.filter((s) => s.kind === 'mesh').length;

  return (
    <div className="app" ref={root} data-mode={state.mode} data-layout={layout} data-sheet={hasSheet ? sheet : 'none'} data-detail={detail ? 'open' : 'closed'}>
      <main className="stage">
        <LabViewer insets={insets} />
      </main>

      <header className="identity">
        <p className="eyebrow"><span className="status-dot" aria-hidden="true" /> Interactive anatomy</p>
        <h1>Skeletal System</h1>
        <p className="identity-meta">{meshCount} structures · BodyParts3D · HuBMAP</p>
      </header>

      <nav className="top-actions" aria-label="Mode">
        <div className="modes glass">
          {MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={state.mode === m.id} onClick={() => pickMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <button type="button" className="icon-button glass" aria-label="About this lab, sources and credits" onClick={() => setAbout(true)}><span aria-hidden="true">i</span></button>
      </nav>

      <aside className={`left glass ${structuresOpen ? 'mobile-open' : ''}`}>
        <StructurePanel />
      </aside>

      {hasSheet && (
        <Sheet layout={layout} state={sheet} onState={setSheet} dismissible={detail} onClose={() => dispatch({ type: 'select', id: null })}>
          <SidePanel />
        </Sheet>
      )}

      <Toolbar structuresOpen={structuresOpen} onStructures={toggleStructures} />

      <footer className="studio-footer">
        <span className="hint">{touch ? 'Drag to rotate · Pinch to zoom · Tap to inspect' : 'Drag to rotate · Scroll to zoom · Click to inspect'}</span>
        <button type="button" className="link" onClick={() => setAbout(true)}>Source &amp; credits</button>
      </footer>

      {about && <AboutSheet onClose={closeAbout} />}
    </div>
  );
}

export default function App() {
  const result = useMemo(() => validateDefinition(definition), []);
  if (!result.ok) {
    // A broken definition must be visible, not silently half-rendered.
    return (
      <div className="fatal" role="alert">
        <h1>This simulation definition is invalid</h1>
        <ul>{result.issues.map((i) => <li key={`${i.path}-${i.code}`}><code>{i.path}</code>: {i.message}</li>)}</ul>
      </div>
    );
  }
  return (
    <LabProvider def={result.definition}>
      <Lab />
    </LabProvider>
  );
}
