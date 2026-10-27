import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useLab } from '../app/LabContext';
import { effectiveCloseUp, effectiveColourBy, effectiveMode, effectiveSlice, effectiveTint, focusIds, highlightedIds, isVisible } from '../app/state';
import type { AnatomicalStructure } from '../contract/schema';
import { modeBounds, sliceWorld } from '../lab/anchors';
import { poseMatrices } from '../lab/rig';
import type { Pose } from '../lab/joints';
import type { BoneStage } from '../lab/growth';
import { baseColour, CARTILAGE_STAGE, cutColour, GLOW, HIGHLIGHT, HOVER, lobules, realLook, realOpacity, XRAY } from './palette';
import { closeHoles } from './closeHoles';
import type { FractureView } from './fracture';
import { applyQuality, hasTissueData, makeTissueMaterial, quality, type TissueMaterial } from './tissue';

export const modelUrl = () => `${import.meta.env.BASE_URL}models/skeleton.glb`;

const GREY = new THREE.Color('#a59a96');
const HIGHLIGHT_COLOUR = new THREE.Color(HIGHLIGHT);
const GLOW_COLOUR = new THREE.Color(GLOW);

/** Pointer travel (px) above which a press is treated as a drag (rotate), not a pick. */
const CLICK_SLOP = 5;

/** The cut shared with the label layer and the overlays, so hits on the removed side can be ignored. */
export const clip = { plane: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), active: false };
/** Bumped whenever parts move (pose, fracture, offsets), so the labels re-anchor. */
export const motion = { version: 0 };

/** What the model shows beyond the learner's selection: computed by the viewer from the simulation state. */
export interface ModelView {
  pose: Pose;
  /** Where the female pelvis is drawn (model-space offset). */
  femaleOffset: readonly number[];
  /** Parts glowing as the subject of a simulation (a joint's bones, a fractured bone). */
  glow: ReadonlySet<string>;
  /** X-ray brightness (bone density in the bone tissue view), 1 = young adult. */
  density: number;
  /** Through life: each bone's stage and whether each tooth has erupted. */
  stages: ReadonlyMap<string, BoneStage> | null;
  hidden: ReadonlySet<string>;
  fracture: FractureView | null;
}

interface Cap { back: THREE.Mesh; front: THREE.Mesh; face: THREE.Mesh; material: THREE.MeshStandardMaterial; closed: THREE.BufferGeometry }
/** A part of the model. Its cut cap is built the first time a cut crosses it (closing a mesh is costly). */
interface Part { id: string; mesh: THREE.Mesh; material: TissueMaterial; structure: AnatomicalStructure; box: THREE.Box3; cap: Cap | null; order: number; capSize: number; capTint: THREE.Color }
/** A broken bone's extra fragments and the caps on its break faces. */
interface Fragments { id: string; meshes: THREE.Mesh[]; caps: THREE.Mesh[]; materials: THREE.Material[]; closed: THREE.BufferGeometry; entries: { mesh: THREE.Mesh; tissue: THREE.Material; xray: THREE.ShaderMaterial }[] }

/** Cut-face grain: one tile of the noise texture spans this many metres. */
const GRAIN_TILE = 0.01;
let grain: THREE.DataTexture | null = null;
/** A soft, tileable value-noise texture (deterministic) that gives cut faces a bony grain. */
function grainTexture(): THREE.DataTexture {
  if (grain) return grain;
  const n = 128;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const octave = (cells: number) => {
    const lattice = Array.from({ length: cells * cells }, rand);
    const at = (x: number, y: number) => lattice[(y % cells) * cells + (x % cells)]!;
    const step = n / cells;
    return (x: number, y: number) => {
      const gx = Math.floor(x / step), gy = Math.floor(y / step);
      const fx = smooth((x % step) / step), fy = smooth((y % step) / step);
      const top = at(gx, gy) * (1 - fx) + at(gx + 1, gy) * fx;
      const bottom = at(gx, gy + 1) * (1 - fx) + at(gx + 1, gy + 1) * fx;
      return top * (1 - fy) + bottom * fy;
    };
  };
  const coarse = octave(8), medium = octave(16), fine = octave(32);
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = 0.84 + 0.08 * coarse(x, y) + 0.05 * medium(x, y) + 0.03 * fine(x, y);
    data.set([v * 255, v * 255, v * 255, 255], (y * n + x) * 4);
  }
  grain = new THREE.DataTexture(data, n, n);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.magFilter = THREE.LinearFilter;
  grain.minFilter = THREE.LinearMipmapLinearFilter;
  grain.generateMipmaps = true;
  grain.colorSpace = THREE.SRGBColorSpace;
  grain.needsUpdate = true;
  return grain;
}

/**
 * Stencil capping (as in three.js' clipping-stencil example): back faces behind the cut add 1 and
 * front faces subtract 1, so the stencil is non-zero exactly where the cut passes through the
 * inside of a closed mesh. The face drawn there is the filled cut surface, in the tissue's colour.
 * `planes` clip the stencil passes (the cut plane, plus any other planes the part is clipped by);
 * the face lies on planes[0] and is clipped by the rest.
 */
function makeCap(closed: THREE.BufferGeometry, planes: THREE.Plane[], order: number, colour: string, size: number): Cap {
  const stencilMat = (side: THREE.Side, op: THREE.StencilOp) => new THREE.MeshBasicMaterial({
    side, colorWrite: false, depthWrite: false, depthTest: false,
    stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc,
    stencilFail: op, stencilZFail: op, stencilZPass: op,
    clippingPlanes: planes,
  });
  const back = new THREE.Mesh(closed, stencilMat(THREE.BackSide, THREE.IncrementWrapStencilOp));
  const front = new THREE.Mesh(closed, stencilMat(THREE.FrontSide, THREE.DecrementWrapStencilOp));
  back.renderOrder = front.renderOrder = order;
  const map = grainTexture().clone();
  map.repeat.setScalar(Math.max(1, size / GRAIN_TILE));
  const material = new THREE.MeshStandardMaterial({
    color: colour, map, roughness: 0.6, metalness: 0, side: THREE.DoubleSide,
    stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
    clippingPlanes: planes.slice(1),
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  face.renderOrder = order + 0.1;
  for (const m of [back, front, face]) {
    m.visible = false;
    m.raycast = () => {}; // never pickable
    m.matrixAutoUpdate = false;
  }
  return { back, front, face, material, closed };
}

/** A fine pitted pattern in the colour: the trabecular lattice of spongy bone. */
function makeLobuleMaterial(material: TissueMaterial, scale: number, depth: number, key: string) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLobPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLobPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLobPos;')
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        '{',
        `  vec3 p = vLobPos * ${scale.toFixed(1)};`,
        '  vec3 q = p + 0.6 * sin(p.yzx * 0.37 + 1.7);',
        '  float a = abs(sin(q.x) * sin(q.y) * sin(q.z));',
        '  float b = abs(sin(q.x * 0.71 + q.z * 0.7 + 2.3) * sin(q.y * 0.69 - q.x * 0.7 + 0.4) * sin(q.z * 0.7 + q.y * 0.71 + 1.1));',
        `  diffuseColor.rgb *= 1.0 - ${depth.toFixed(2)} * (1.0 - smoothstep(0.02, 0.35, max(a, b)));`,
        '}',
      ].join('\n'));
  };
  material.customProgramCacheKey = () => `tissue-lobule-${key}${material.defines?.USE_TISSUE !== undefined ? '-baked' : ''}`;
}

/** X-ray: bright where the surface is seen edge-on (more bone along the ray), additive on a dark field. */
function makeXray(colour: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(colour) }, intensity: { value: 1 } },
    vertexShader: [
      '#include <common>', '#include <clipping_planes_pars_vertex>',
      'varying vec3 vN; varying vec3 vV;',
      'void main() {', '#include <begin_vertex>', '#include <project_vertex>', '#include <clipping_planes_vertex>',
      '  vN = normalize(normalMatrix * normal); vV = normalize(-mvPosition.xyz);', '}',
    ].join('\n'),
    fragmentShader: [
      '#include <common>', '#include <clipping_planes_pars_fragment>',
      'uniform vec3 color; uniform float intensity; varying vec3 vN; varying vec3 vV;',
      'void main() {', '#include <clipping_planes_fragment>',
      '  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));',
      '  float a = (0.07 + 0.55 * f * f) * intensity;',
      '  gl_FragColor = vec4(color * a, a);', '}',
    ].join('\n'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    clipping: true, clippingPlanes: [clip.plane],
  });
}

export function SkeletonModel({ onReady, view }: { onReady?: () => void; view: ModelView }) {
  const { def, state, dispatch } = useLab();
  const gltf = useGLTF(modelUrl());
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  // Shaders compiled for every part (see below), so changing view never stalls on compiling.
  const [warm, setWarm] = useState(false);
  const mode = effectiveMode(def, state);
  const close = effectiveCloseUp(def, state);
  const bounds = useMemo(() => modeBounds(def, mode), [def, mode]);
  const xray = useMemo(() => ({ plain: makeXray(XRAY), lit: makeXray(HIGHLIGHT) }), []);
  /** The fragments of a broken bone, each with its tissue and its own clipped X-ray material. */
  const fragRef = useRef<Fragments | null>(null);

  const parts = useMemo(() => {
    const out = new Map<string, Part>();
    gltf.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const id = o.name || o.parent?.name || '';
      const s = def.structures.find((x) => x.id === id);
      if (!s) return;
      const material = makeTissueMaterial(realLook(s), hasTissueData(o));
      material.clippingPlanes = [clip.plane];
      const lob = lobules(s);
      if (lob) makeLobuleMaterial(material, lob.scale, lob.depth, s.layer);
      o.geometry.computeBoundingBox();
      const box = o.geometry.boundingBox!.clone();
      const capSize = box.getSize(new THREE.Vector3()).length() * 1.05;
      o.matrixAutoUpdate = false;
      out.set(id, { id, mesh: o, material, structure: s, box, cap: null, order: 0, capSize, capTint: new THREE.Color(cutColour(s)) });
    });
    // Large structures first, so smaller ones inside them draw their caps last.
    const sorted = [...out.values()].sort((a, b) => b.box.getSize(new THREE.Vector3()).lengthSq() - a.box.getSize(new THREE.Vector3()).lengthSq());
    sorted.forEach((p, i) => { p.order = 10 + i * 2; });
    return out;
  }, [gltf, def]);

  // Attach materials in an effect, not in useMemo: StrictMode may run the memo twice, and the
  // meshes must carry the materials this component actually updates. Dispose them on unmount.
  useLayoutEffect(() => {
    for (const p of parts.values()) {
      p.mesh.material = p.material;
      p.mesh.userData.structureId = p.id;
    }
    // Compile every part's shader once, with all parts shown, before the model counts as ready.
    let live = true;
    for (const p of parts.values()) p.mesh.visible = true;
    gl.compileAsync(gltf.scene, camera).catch(() => {}).finally(() => {
      if (!live) return;
      setWarm(true);
      onReady?.();
      invalidate();
    });
    return () => parts.forEach((p) => {
      live = false;
      p.material.dispose();
      const c = p.cap;
      if (c) {
        c.material.map?.dispose();
        c.material.dispose();
        if (c.closed !== p.mesh.geometry) c.closed.dispose();
        (c.back.material as THREE.Material).dispose();
        (c.front.material as THREE.Material).dispose();
        c.face.geometry.dispose();
        gltf.scene.remove(c.back, c.front, c.face);
        p.cap = null;
      }
      p.mesh.matrix.identity();
    });
  }, [parts, onReady, gltf, gl, camera, invalidate]);

  // Follow quality changes (a slow device drops the costly coat and sheen).
  useEffect(() => quality.subscribe((level) => {
    for (const p of parts.values()) { applyQuality(p.material, level); p.material.needsUpdate = true; }
    invalidate();
  }), [parts, invalidate]);

  const focus = focusIds(def, state);
  const tint = effectiveTint(def, state);
  const lit = tint ? highlightedIds(def, focus) : new Set<string>();
  const colourBy = effectiveColourBy(def, state);
  const slice = effectiveSlice(def, state);

  // The cut plane: keeps the side where n·p + c ≥ 0. The plane stays attached to every material
  // (parked far outside the model when there is no cut), so turning a cut on or off never
  // recompiles the tissue shaders.
  useEffect(() => {
    const a = slice.axis;
    clip.active = a !== 'off';
    if (clip.active) {
      const ax = a === 'sagittal' ? 0 : a === 'axial' ? 1 : 2;
      const at = sliceWorld(bounds, ax, slice.at);
      const n = new THREE.Vector3();
      n.setComponent(ax, slice.flip ? 1 : -1);
      clip.plane.set(n, slice.flip ? -at : at);
    } else {
      clip.plane.set(new THREE.Vector3(-1, 0, 0), 100);
    }
    invalidate();
  }, [slice.axis, slice.at, slice.flip, bounds, invalidate]);

  // Where every part is: the pose, the female pelvis's place, a crushed vertebra.
  const poseKey = JSON.stringify(view.pose);
  const crushKey = view.fracture?.crush ? `${view.fracture.bone}:${view.fracture.crush.elements.join()}` : '';
  useEffect(() => {
    const mats = poseMatrices([...parts.keys()], view.pose);
    const off = new THREE.Matrix4().makeTranslation(view.femaleOffset[0] ?? 0, view.femaleOffset[1] ?? 0, view.femaleOffset[2] ?? 0);
    for (const p of parts.values()) {
      const m = p.structure.layer === 'female-pelvis' ? off.clone() : (mats.get(p.id) ?? new THREE.Matrix4()).clone();
      if (view.fracture?.crush && view.fracture.bone === p.id) m.multiply(view.fracture.crush);
      p.mesh.matrix.copy(m);
      p.mesh.matrixWorldNeedsUpdate = true;
    }
    motion.version++;
    invalidate();
    // poseKey and crushKey stand for the pose and crush matrices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, poseKey, view.femaleOffset[0], crushKey, invalidate]);

  // A fracture: the bone's own mesh keeps the first fragment; clones carry the others. Each break face is capped.
  const fracKey = view.fracture ? `${view.fracture.bone}|${view.fracture.fragments.map((f) => `${f.planes.map((q) => `${q.normal.toArray().join()},${q.constant}`).join(';')}@${f.matrix.elements.join()}`).join('/')}` : '';
  useEffect(() => {
    const f = view.fracture;
    const p = f ? parts.get(f.bone) : undefined;
    if (!f || !p || f.fragments.length < 2) return;
    const own = p.material;
    const ownPlanes = own.clippingPlanes;
    const frag: Fragments = { id: p.id, meshes: [], caps: [], materials: [], closed: closeHoles(p.mesh.geometry), entries: [] };
    const colour = `#${p.capTint.getHexString()}`;
    f.fragments.forEach((fr, i) => {
      let mesh = p.mesh;
      if (i === 0) {
        own.clippingPlanes = [clip.plane, ...fr.planes];
        own.needsUpdate = true;
      } else {
        const mat = own.clone() as TissueMaterial;
        mat.onBeforeCompile = own.onBeforeCompile;
        mat.customProgramCacheKey = own.customProgramCacheKey;
        mat.clippingPlanes = [clip.plane, ...fr.planes];
        mesh = new THREE.Mesh(p.mesh.geometry, mat);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(p.mesh.matrix).multiply(fr.matrix);
        mesh.userData.structureId = p.id;
        mesh.renderOrder = p.mesh.renderOrder;
        gltf.scene.add(mesh);
        frag.meshes.push(mesh);
        frag.materials.push(mat);
      }
      const x = makeXray(XRAY);
      x.clippingPlanes = [clip.plane, ...fr.planes];
      frag.entries.push({ mesh, tissue: i === 0 ? own : (mesh.material as THREE.Material), xray: x });
      frag.materials.push(x);
      // Cap each break face: the stencil passes are clipped by all of this fragment's planes (in world space).
      const world = (q: THREE.Plane) => q.clone().applyMatrix4(mesh.matrix);
      fr.planes.forEach((q, k) => {
        const planes = [world(q), ...fr.planes.filter((_, j) => j !== k).map(world)];
        const cap = makeCap(frag.closed, planes, p.order + 200 + i * 10 + k * 3, colour, p.capSize * 0.3);
        cap.back.matrix.copy(mesh.matrix); cap.front.matrix.copy(mesh.matrix);
        const centre = planes[0]!.projectPoint(f.centre.clone().applyMatrix4(mesh.matrix), new THREE.Vector3());
        cap.face.position.copy(centre);
        cap.face.lookAt(centre.clone().sub(planes[0]!.normal));
        cap.face.scale.setScalar(Math.max(0.02, f.radius * 6));
        cap.face.updateMatrix();
        cap.face.renderOrder = p.order + 200 + i * 10 + k * 3 + 1;
        for (const m of [cap.back, cap.front, cap.face]) { m.visible = true; gltf.scene.add(m); frag.caps.push(m); }
        frag.materials.push(cap.material, cap.back.material as THREE.Material, cap.front.material as THREE.Material);
      });
    });
    fragRef.current = frag;
    motion.version++;
    invalidate();
    return () => {
      fragRef.current = null;
      own.clippingPlanes = ownPlanes;
      own.needsUpdate = true;
      for (const m of [...frag.meshes, ...frag.caps]) gltf.scene.remove(m);
      frag.materials.forEach((m) => m.dispose());
      if (frag.closed !== p.mesh.geometry) frag.closed.dispose();
      motion.version++;
      invalidate();
    };
    // fracKey stands for the fracture's planes and matrices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, fracKey, gltf, invalidate]);

  useEffect(() => {
    const isXray = colourBy === 'xray';
    xray.plain.uniforms.intensity!.value = view.density;
    xray.lit.uniforms.intensity!.value = Math.max(0.6, view.density);
    const fractured = view.fracture?.fragments.length ? view.fracture.bone : null;
    for (const p of parts.values()) {
      const s = p.structure;
      const stage = view.stages?.get(p.id);
      p.mesh.visible = isVisible(def, state, p.id) && !view.hidden.has(p.id);
      const isLit = lit.has(p.id);
      const isHover = state.hovered === p.id && !isLit;
      const dim = lit.size > 0 && !isLit;
      const glow = view.glow.has(p.id);
      if (isXray) {
        p.mesh.material = isLit || glow ? xray.lit : xray.plain;
        p.mesh.renderOrder = 3;
        continue;
      }
      p.mesh.material = p.material;
      const painted = colourBy !== 'real';
      p.material.color.set(stage === 'cartilage' && !painted ? CARTILAGE_STAGE : baseColour(s, colourBy));
      if (isLit && !painted) p.material.color.lerp(HIGHLIGHT_COLOUR, 0.35);
      else if (dim && !glow) p.material.color.lerp(GREY, 0.45);
      if (glow && !isLit) { p.material.emissive.copy(GLOW_COLOUR); p.material.emissiveIntensity = 0.22; }
      else if (isLit) { p.material.emissive.copy(painted ? p.material.color : HIGHLIGHT_COLOUR); p.material.emissiveIntensity = painted ? 0.22 : 0.3; }
      else { p.material.emissive.set(isHover ? HOVER : '#000000'); p.material.emissiveIntensity = isHover ? 0.3 : 0; }

      let opacity = realOpacity(s, mode);
      if (stage === 'cartilage') opacity = Math.min(opacity, 0.5);
      if (dim && opacity < 1) opacity *= 0.6;
      const transparent = opacity < 1;
      // Changing `transparent` changes the shader program; only flag an update when it flips.
      if (p.material.transparent !== transparent) p.material.needsUpdate = true;
      p.material.transparent = transparent;
      p.material.opacity = opacity;
      p.material.depthWrite = !transparent;
      p.mesh.renderOrder = transparent ? 2 : 0;

      p.capTint.set(colourBy !== 'real' ? baseColour(s, colourBy) : cutColour(s));
      if (isLit) p.capTint.lerp(HIGHLIGHT_COLOUR, 0.3);
      else if (dim) p.capTint.lerp(GREY, 0.35);
      p.cap?.material.color.copy(p.capTint);
      if (p.id === fractured && p.cap) p.cap.face.visible = false;
    }
    // A broken bone's fragments follow the same look; in X-ray each keeps its own clipping.
    const frag = fragRef.current;
    if (frag) {
      const fp = parts.get(frag.id);
      const shown = !!fp?.mesh.visible;
      for (const e of frag.entries) {
        e.mesh.visible = shown;
        if (isXray) { e.mesh.material = e.xray; e.xray.uniforms.intensity!.value = view.density; e.xray.uniforms.color!.value.set(lit.has(frag.id) || view.glow.has(frag.id) ? HIGHLIGHT : XRAY); }
        else e.mesh.material = e.tissue;
      }
      for (const c of frag.caps) c.visible = shown && !isXray;
    }
    invalidate();
  }, [parts, def, state, lit, colourBy, mode, close, view, warm, invalidate, xray]);

  // Keep each cap on the plane, just large enough to cover the part's footprint, and show it only
  // where the plane crosses a solid part.
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const size = useMemo(() => new THREE.Vector3(), []);
  const worldBox = useMemo(() => new THREE.Box3(), []);
  useFrame(() => {
    const fractured = view.fracture?.fragments.length ? view.fracture.bone : null;
    for (const p of parts.values()) {
      const solid = p.mesh.visible && p.mesh.material === p.material && !p.material.transparent && p.id !== fractured;
      worldBox.copy(p.box).applyMatrix4(p.mesh.matrix);
      const show = clip.active && solid && clip.plane.intersectsBox(worldBox);
      if (show && !p.cap) {
        const c = makeCap(closeHoles(p.mesh.geometry), [clip.plane], p.order, `#${p.capTint.getHexString()}`, p.capSize);
        c.face.renderOrder = p.order + 1;
        gltf.scene.add(c.back, c.front, c.face);
        p.cap = c;
      }
      const c = p.cap;
      if (!c) continue;
      c.back.visible = c.front.visible = c.face.visible = show;
      if (show) {
        c.back.matrix.copy(p.mesh.matrix);
        c.front.matrix.copy(p.mesh.matrix);
        clip.plane.projectPoint(worldBox.getCenter(tmp), tmp);
        c.face.position.copy(tmp);
        c.face.lookAt(tmp.x - clip.plane.normal.x, tmp.y - clip.plane.normal.y, tmp.z - clip.plane.normal.z);
        c.face.scale.setScalar(worldBox.getSize(size).length() * 1.05);
        c.face.updateMatrix();
      }
    }
  });

  /** Ignore hits on the part of the model the cut has removed. */
  const removed = (e: ThreeEvent<PointerEvent | MouseEvent>) => clip.active && clip.plane.distanceToPoint(e.point) < 0;
  const pick = (e: ThreeEvent<MouseEvent>) => {
    const id = e.object.userData.structureId as string | undefined;
    if (!id || !e.object.visible || removed(e)) return; // let the event reach the next hit
    const m = (e.object as THREE.Mesh).material as THREE.Material;
    if (m.transparent && m.opacity < 0.3) return; // ghosted parts are see-through to clicks
    e.stopPropagation();
    if (e.delta > CLICK_SLOP) return;
    dispatch({ type: 'select', id });
  };
  const over = (e: ThreeEvent<PointerEvent>) => {
    const id = e.object.userData.structureId as string | undefined;
    if (!id || !e.object.visible || removed(e)) return;
    const m = (e.object as THREE.Mesh).material as THREE.Material;
    if (m.transparent && m.opacity < 0.3) return;
    e.stopPropagation();
    dispatch({ type: 'hover', id });
    document.body.style.cursor = 'pointer';
  };
  const out = (e: ThreeEvent<PointerEvent>) => {
    if (e.object.userData.structureId === state.hovered) dispatch({ type: 'hover', id: null });
    document.body.style.cursor = '';
  };

  return <primitive object={gltf.scene} onClick={pick} onPointerOver={over} onPointerOut={out} />;
}
