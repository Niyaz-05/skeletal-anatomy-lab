import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import { useLab } from '../app/LabContext';
import { SkeletonModel, modelUrl, type ModelView } from './SkeletonModel';
import { CameraRig, type ViewInsets } from './CameraRig';
import { FractureOverlay, Physes } from './Overlays';
import { CloseUps } from './CloseUps';
import { Lighting } from './Lighting';
import { LabelLayer } from './LabelLayer';
import { hasWebGL, prefersReducedMotion } from './webgl';
import { closeUpFrame, homeBounds } from '../lab/anchors';
import { effectiveCloseUp, effectiveColourBy, effectiveFracture, effectiveLife, effectiveMode, effectivePose, effectiveTissue, jointBones, type LabState } from '../app/state';
import { FEMALE_PELVIS_OFFSET } from '../app/modes';
import type { SimulationDefinition } from '../contract/schema';
import { bmdAt, YOUNG } from '../lab/bone';
import { boneStage, erupted, PHYSES, physisOpen, type BoneStage } from '../lab/growth';
import { siteById } from '../lab/fractures';
import { fractureView } from './fracture';

class SceneBoundary extends Component<{ onError: (e: Error) => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function LoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="viewer-status" role="status">
      <div className="spinner" aria-hidden="true" />
      Loading the model… {Math.round(progress)}%
    </div>
  );
}

/** Keyboard camera control: arrows orbit, +/- zoom. Esc and 0 are handled by the lab shell. */
function KeyboardOrbit({ host }: { host: React.RefObject<HTMLDivElement | null> }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update(): void } | null;
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const el = host.current;
    if (!el || !controls) return;
    const onKey = (e: KeyboardEvent) => {
      const step = Math.PI / 18;
      const offset = camera.position.clone().sub(controls.target);
      const sph = new THREE.Spherical().setFromVector3(offset);
      if (e.key === 'ArrowLeft') sph.theta -= step;
      else if (e.key === 'ArrowRight') sph.theta += step;
      else if (e.key === 'ArrowUp') sph.phi = Math.max(0.05, sph.phi - step);
      else if (e.key === 'ArrowDown') sph.phi = Math.min(Math.PI - 0.05, sph.phi + step);
      else if (e.key === '+' || e.key === '=') sph.radius *= 0.85;
      else if (e.key === '-' || e.key === '_') sph.radius /= 0.85;
      else return;
      e.preventDefault();
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
      camera.lookAt(controls.target);
      controls.update();
      invalidate();
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [host, camera, controls, invalidate]);
  return null;
}

const NONE = new Set<string>();

/** What the model shows for the simulation state (pure apart from the definition's ids). */
export function modelView(def: SimulationDefinition, state: LabState): ModelView {
  const mode = effectiveMode(def, state);
  const life = effectiveLife(def, state);
  const tissue = effectiveTissue(def, state);
  const frac = effectiveFracture(def, state);
  const meshIds = def.structures.filter((s) => s.kind === 'mesh').map((s) => s.id);
  let stages: Map<string, BoneStage> | null = null;
  const hidden = new Set<string>();
  if (mode === 'life' && !life.compare) {
    stages = new Map(meshIds.map((id) => [id, boneStage(id, life.age, life.sex)]));
    for (const id of meshIds) if (id.startsWith('tooth-') && !erupted(id, life.age)) hidden.add(id);
  }
  const glow = mode === 'joints' && state.mode !== 'tour' ? new Set(jointBones(state.joints.joint, state.joints.side))
    : mode === 'fractures' ? new Set([siteById(frac.site)?.bone ?? '']) : NONE;
  return {
    pose: effectivePose(def, state),
    femaleOffset: mode === 'life' && life.compare ? FEMALE_PELVIS_OFFSET.compare : FEMALE_PELVIS_OFFSET.beside,
    glow,
    density: mode === 'tissue' ? bmdAt(tissue.age, tissue.sex, tissue.factors) / YOUNG[tissue.sex].mean : 1,
    stages,
    hidden,
    fracture: mode === 'fractures' ? fractureView(frac.site, frac.pattern, frac.weeks, frac.healing) : null,
  };
}

const NO_INSETS: ViewInsets = { left: 0, right: 0, top: 0, bottom: 0 };

export function LabViewer({ insets = NO_INSETS }: { insets?: ViewInsets }) {
  const { def, state, dispatch } = useLab();
  const [webgl] = useState(hasWebGL);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const mode = effectiveMode(def, state);
  const close = effectiveCloseUp(def, state);
  const view = useMemo(() => modelView(def, state), [def, state]);
  const life = effectiveLife(def, state);
  const physes = useMemo(() => (mode === 'life' && !life.compare ? PHYSES.map((p) => ({ p, open: physisOpen(p, life.age, life.sex) })).filter((x) => x.open > 0) : []), [mode, life.compare, life.age, life.sex]);
  const healing = view.fracture ?? fractureView('tibial-shaft', 'transverse', 3, effectiveFracture(def, state).healing);
  const animating = !!close && state.playing && !reducedMotion;
  const xray = effectiveColourBy(def, state) === 'xray' && !close;

  if (!webgl) {
    return (
      <div className="viewer viewer-fallback" role="note">
        <h2>3D view unavailable</h2>
        <p>This browser or device could not start WebGL, which the 3D model needs. You can still use the structure list, search and explanations, and the joint, bone, fracture and growth panels.</p>
        <p className="muted">To get the 3D view, turn on hardware acceleration in your browser settings or try another browser.</p>
      </div>
    );
  }

  const [lo, hi] = homeBounds(def, mode);
  const radius = new THREE.Vector3(...lo).distanceTo(new THREE.Vector3(...hi)) / 2;
  const modelRadius = Math.max(radius, 0.06);
  const closeRadius = close ? closeUpFrame(def, close).radius : 0;

  return (
    <div
      className={`viewer${xray ? ' is-xray' : ''}`}
      ref={host}
      tabIndex={0}
      data-ready={ready && !error ? 'true' : 'false'}
      data-close-up={close ?? 'none'}
      data-colour={xray ? 'xray' : 'tissue'}
      aria-label="3D model of the human skeleton. Drag to rotate, scroll or pinch to zoom, right-drag to pan. Arrow keys rotate, plus and minus zoom."
    >
      {error ? (
        <div className="viewer-status is-error" role="alert">
          <strong>The 3D model could not be loaded.</strong>
          <span className="muted">{error}</span>
          <button
            type="button"
            onClick={() => {
              // The loader caches a failed request; drop it so the retry really fetches again.
              useGLTF.clear(modelUrl());
              setError(null);
              setReady(false);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : (
        <SceneBoundary key={attempt} onError={(e) => setError(e.message || 'Unknown error')}>
          <Canvas
            frameloop={animating ? 'always' : 'demand'}
            dpr={[1, 2]}
            camera={{ fov: 32, near: 0.0005, far: 20, position: [0, 0, radius * 4] }}
            gl={{ antialias: true, alpha: true, stencil: true, powerPreference: 'high-performance' }}
            onPointerMissed={(e) => { if (e.type === 'click') dispatch({ type: 'hover', id: null }); }}
            onCreated={({ gl }) => {
              gl.localClippingEnabled = true;
              gl.domElement.addEventListener('webglcontextlost', (ev) => {
                ev.preventDefault();
                setError('The graphics context was lost (the GPU may have been reset).');
              });
            }}
            aria-hidden="true"
          >
            <Lighting />
            <Suspense fallback={null}>
              <SkeletonModel onReady={onReady} view={view} />
            </Suspense>
            {!close && view.fracture && !view.fracture.crush && !xray && <FractureOverlay f={view.fracture} />}
            {!close && physes.length > 0 && !xray && <Physes items={physes} />}
            {close && <CloseUps def={def} which={close} playing={state.playing} reducedMotion={reducedMotion} healing={healing ?? { haematoma: 0, softCallus: 0.6, hardCallus: 0.3 }} />}
            <OrbitControls
              makeDefault
              enableDamping={!reducedMotion}
              dampingFactor={0.12}
              minDistance={close ? closeRadius * 0.4 : radius * 0.02}
              maxDistance={close ? closeRadius * 8 : modelRadius * 5}
              zoomToCursor
              rotateSpeed={0.8}
            />
            <CameraRig reducedMotion={reducedMotion} insets={insets} />
            <KeyboardOrbit host={host} />
            <LabelLayer container={labels} />
          </Canvas>
          <LoadingOverlay />
        </SceneBoundary>
      )}
      <div className="label-layer" ref={labels} />
    </div>
  );
}
