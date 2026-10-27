import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { CloseUp, SimulationDefinition } from '../contract/schema';
import { closeUpFrame } from '../lab/anchors';

/**
 * Close-ups built in code: magnified scenes drawn where their tissue is while the body is hidden.
 * Scenes are laid out in local units (about −10 … 10) and scaled to the frame. Layouts are
 * deterministic and illustrative, at textbook proportions, not to scale with each other.
 */
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
const curve = (pts: THREE.Vector3[]) => new THREE.CatmullRomCurve3(pts, false, 'centripetal');

function Label({ at, children }: { at: THREE.Vector3 | [number, number, number]; children: ReactNode }) {
  return <Html position={at} center zIndexRange={[3, 0]} className="closeup-label" pointerEvents="none">{children}</Html>;
}
function Tube({ points, radius, colour, opacity = 1, emissive = 0.12 }: { points: THREE.Vector3[]; radius: number; colour: string; opacity?: number; emissive?: number }) {
  const g = useMemo(() => new THREE.TubeGeometry(curve(points), Math.max(16, points.length * 8), radius, 8, false), [points, radius]);
  useEffect(() => () => g.dispose(), [g]);
  return (
    <mesh geometry={g} renderOrder={3} raycast={() => null}>
      <meshStandardMaterial color={colour} roughness={0.4} emissive={colour} emissiveIntensity={emissive} transparent={opacity < 1} opacity={opacity} depthWrite={opacity >= 1} />
    </mesh>
  );
}
/** Instanced cells (spheres or other shapes) with their own colours. */
function Cells({ items, geometry, opacity = 1 }: { items: { p: THREE.Vector3; s: number | [number, number, number]; c: string; q?: THREE.Quaternion }[]; geometry: THREE.BufferGeometry; opacity?: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.5, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }), [opacity]);
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const tmp = new THREE.Object3D(), c = new THREE.Color();
    items.forEach((it, i) => {
      tmp.position.copy(it.p);
      if (typeof it.s === 'number') tmp.scale.setScalar(it.s); else tmp.scale.set(...it.s);
      tmp.quaternion.copy(it.q ?? new THREE.Quaternion()); tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix); m.setColorAt(i, c.set(it.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [items]);
  return <instancedMesh ref={mesh} args={[geometry, mat, Math.max(1, items.length)]} raycast={() => null} />;
}
/** Particles running along curves. */
function Particles({ curves, colour, radius, speed, playing, perCurve = 10 }: { curves: THREE.CatmullRomCurve3[]; colour: string; radius: number; speed: number; playing: boolean; perCurve?: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const t = useRef(0);
  const geo = useMemo(() => new THREE.SphereGeometry(radius, 8, 6), [radius]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: colour, toneMapped: false, transparent: true, opacity: 0.95 }), [colour]);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    if (playing) t.current += Math.min(dt, 0.25) * speed;
    let i = 0;
    for (const c of curves) for (let k = 0; k < perCurve; k++, i++) {
      c.getPointAt((((k / perCurve + t.current) % 1) + 1) % 1, p);
      tmp.position.copy(p); tmp.updateMatrix(); m.setMatrixAt(i, tmp.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[geo, mat, Math.max(1, curves.length * perCurve)]} frustumCulled={false} renderOrder={7} />;
}
const SPHERE = new THREE.SphereGeometry(1, 14, 10);

/** A flat ring on the section face (z = 0) and its shell running back into the block. */
function Lamella({ at, r0, r1, depth, colour }: { at: THREE.Vector3; r0: number; r1: number; depth: number; colour: string }) {
  const g = useMemo(() => new THREE.RingGeometry(r0, r1, 48), [r0, r1]);
  const shell = useMemo(() => new THREE.CylinderGeometry(r1, r1, depth, 48, 1, true), [r1, depth]);
  useEffect(() => () => { g.dispose(); shell.dispose(); }, [g, shell]);
  return (
    <group position={at}>
      <mesh geometry={g} raycast={() => null}><meshStandardMaterial color={colour} roughness={0.6} side={THREE.DoubleSide} /></mesh>
      <mesh geometry={shell} position={[0, 0, -depth / 2]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}><meshStandardMaterial color={colour} roughness={0.6} side={THREE.DoubleSide} /></mesh>
    </group>
  );
}

// ── Compact bone: osteons in a cross-section of a long bone's cortex ──────
function OsteonScene({ playing }: { playing: boolean }) {
  const d = useMemo(() => {
    const r = rng(11);
    const centres = [v3(-4.5, 2.5, 0), v3(3.5, 3.5, 0), v3(0, -3.2, 0), v3(-6.5, -4.2, 0), v3(6.2, -2.8, 0)];
    const osteons = centres.map((c, i) => ({ c, rings: 4 + (i % 2), r: 2.4 + r() * 0.5 }));
    const cytes: { p: THREE.Vector3; s: [number, number, number]; c: string; q: THREE.Quaternion }[] = [];
    for (const o of osteons) for (let k = 1; k <= o.rings; k++) {
      const rr = (o.r * k) / (o.rings + 0.4);
      const n = 5 + k * 3;
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2 + r() * 0.3;
        cytes.push({ p: v3(o.c.x + Math.cos(a) * rr, o.c.y + Math.sin(a) * rr, 0.05), s: [0.32, 0.12, 0.1], c: '#5a3a2a', q: new THREE.Quaternion().setFromAxisAngle(v3(0, 0, 1), a + Math.PI / 2) });
      }
    }
    const vessels = osteons.map((o) => [v3(o.c.x + 0.25, o.c.y, 2), v3(o.c.x + 0.25, o.c.y, -9)]);
    const flow = vessels.map((v) => curve(v));
    return { osteons, cytes, vessels, flow };
  }, []);
  return (
    <group>
      <mesh position={[0, 0, -4.5]} raycast={() => null}><boxGeometry args={[20, 14, 9]} /><meshStandardMaterial color="#e2d4b4" roughness={0.75} /></mesh>
      <mesh position={[0, 7.3, -4.5]} raycast={() => null}><boxGeometry args={[20, 0.6, 9.2]} /><meshStandardMaterial color="#c88a70" roughness={0.5} /></mesh>
      {d.osteons.map((o, i) => (
        <group key={i}>
          {Array.from({ length: o.rings }, (_, k) => {
            const r1 = (o.r * (o.rings - k)) / o.rings, r0 = (o.r * (o.rings - k - 1)) / o.rings;
            return <Lamella key={k} at={v3(o.c.x, o.c.y, 0.01 + k * 0.002)} r0={Math.max(0.45, r0)} r1={r1} depth={9} colour={k % 2 ? '#efe2c4' : '#e0cfa8'} />;
          })}
          <mesh position={[o.c.x, o.c.y, 0.03]} raycast={() => null}><circleGeometry args={[0.45, 24]} /><meshStandardMaterial color="#2a1a14" /></mesh>
        </group>
      ))}
      <Cells items={d.cytes} geometry={SPHERE} />
      {d.vessels.map((v, i) => <Tube key={`a${i}`} points={v} radius={0.15} colour="#c0283a" />)}
      {d.vessels.map((v, i) => <Tube key={`v${i}`} points={v.map((p) => p.clone().add(v3(-0.45, 0.1, 0)))} radius={0.15} colour="#3a4aa8" />)}
      <Tube points={[v3(-4.5, 2.5, -3), v3(-0.5, 0.2, -3), v3(3.5, 3.5, -3)]} radius={0.35} colour="#2a1a14" opacity={0.85} />
      <Particles curves={d.flow} colour="#ff6a7a" radius={0.12} speed={0.25} playing={playing} perCurve={6} />
      <Label at={[-4.5, 5.6, 0.5]}>Osteon (Haversian system)</Label>
      <Label at={[0, -0.4, 0.5]}>Central (Haversian) canal: artery, vein, nerve</Label>
      <Label at={[4.5, 0.8, 0.5]}>Concentric lamellae</Label>
      <Label at={[-6.5, -7, 0.5]}>Osteocytes in lacunae, linked by canaliculi</Label>
      <Label at={[0, 8.4, 0]}>Periosteum</Label>
      <Label at={[-1, 1.8, -3]}>Perforating (Volkmann) canal</Label>
    </group>
  );
}

// ── Spongy bone with red marrow ───────────────────────────────────────────
function SpongyScene() {
  const d = useMemo(() => {
    const r = rng(5);
    const nodes: THREE.Vector3[] = [];
    for (let x = -8; x <= 8; x += 3.2) for (let y = -8; y <= 8; y += 3.2) for (let z = -6; z <= 0; z += 3.2) {
      const p = v3(x + (r() - 0.5) * 1.8, y + (r() - 0.5) * 1.8, z + (r() - 0.5) * 1.5);
      if (p.length() < 10.5) nodes.push(p);
    }
    const struts: [THREE.Vector3, THREE.Vector3][] = [];
    nodes.forEach((a, i) => nodes.slice(i + 1).forEach((b) => { const l = a.distanceTo(b); if (l < 4.3 && r() > 0.35) struts.push([a, b]); }));
    const marrow: { p: THREE.Vector3; s: number; c: string }[] = [];
    for (let k = 0; k < 900; k++) {
      const p = v3((r() - 0.5) * 20, (r() - 0.5) * 20, -r() * 6.5);
      if (p.length() > 10) continue;
      if (struts.some(([a, b]) => { const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(b.clone().sub(a)) / a.distanceToSquared(b))); return p.distanceTo(a.clone().lerp(b, t)) < 0.6; })) continue;
      const fat = r() < 0.18;
      marrow.push({ p, s: fat ? 0.55 : 0.2 + r() * 0.08, c: fat ? '#f4e2a0' : r() < 0.7 ? '#b8202e' : '#d8b8c8' });
    }
    const blasts = struts.slice(0, 18).map(([a, b]) => ({ p: a.clone().lerp(b, 0.5).add(v3(0, 0.38, 0)), s: [0.4, 0.22, 0.3] as [number, number, number], c: '#5a7ad0' }));
    return { struts, marrow, blasts };
  }, []);
  return (
    <group>
      {d.struts.map(([a, b], i) => <Tube key={i} points={[a, a.clone().lerp(b, 0.5), b]} radius={0.38} colour="#e6d6b0" emissive={0.02} />)}
      <Cells items={d.marrow} geometry={SPHERE} />
      <Cells items={d.blasts} geometry={SPHERE} />
      <Label at={[0, 9.5, 0]}>Trabeculae: struts lined up with the lines of stress</Label>
      <Label at={[-6, -6, 1]}>Red marrow: blood cell formation</Label>
      <Label at={[6, -7.5, 1]}>Yellow (fat) marrow</Label>
      <Label at={[5, 4, 1]}>Osteoblasts lining the trabeculae</Label>
    </group>
  );
}

// ── A growth plate (physis), zone by zone ─────────────────────────────────
function GrowthPlateScene({ playing }: { playing: boolean }) {
  const t = useRef(0);
  const grp = useRef<THREE.Group>(null);
  const d = useMemo(() => {
    const r = rng(9);
    const cells: { p: THREE.Vector3; s: [number, number, number]; c: string }[] = [];
    for (let col = -4; col <= 4; col++) {
      const x = col * 2.1;
      for (let k = 0; k < 4; k++) cells.push({ p: v3(x + (r() - 0.5) * 1.2, 7 - k * 0.9 + (r() - 0.5) * 0.4, (r() - 0.5) * 2), s: [0.35, 0.35, 0.35], c: '#9ab8d8' });
      for (let k = 0; k < 9; k++) cells.push({ p: v3(x, 3.8 - k * 0.55, 0), s: [0.75, 0.2, 0.6], c: '#7aa0d0' });
      for (let k = 0; k < 4; k++) cells.push({ p: v3(x, -1.6 - k * 1.25, 0), s: [0.8, 0.55 + k * 0.06, 0.7], c: '#c0d8f0' });
    }
    return { cells };
  }, []);
  useFrame((_, dt) => {
    if (!playing || !grp.current) return;
    // Growth: the cartilage pushes the epiphysis away from the shaft.
    t.current = (t.current + dt * 0.08) % 1;
    grp.current.position.y = 0.4 * Math.sin(t.current * Math.PI * 2);
  });
  return (
    <group>
      <mesh position={[0, 9.4, -1]} raycast={() => null}><boxGeometry args={[20, 2.6, 2.4]} /><meshStandardMaterial color="#e6d4ac" roughness={0.8} /></mesh>
      <mesh position={[0, 2, -1.3]} raycast={() => null}><boxGeometry args={[20, 12.5, 0.4]} /><meshStandardMaterial color="#d8e6f0" roughness={0.3} transparent opacity={0.85} /></mesh>
      <group ref={grp}><Cells items={d.cells} geometry={SPHERE} /></group>
      <mesh position={[0, -6.4, -1.3]} raycast={() => null}><boxGeometry args={[20, 1.4, 0.45]} /><meshStandardMaterial color="#9aa8b8" roughness={0.6} /></mesh>
      {[-7, -3, 1, 5].map((x) => <Tube key={x} points={[v3(x, -10, 0.4), v3(x + 0.6, -8.4, 0.4), v3(x, -6.6, 0.4)]} radius={0.22} colour="#c0283a" />)}
      {[-9, -5, -1, 3, 7].map((x) => <Tube key={`t${x}`} points={[v3(x, -10.5, -0.5), v3(x + 0.3, -8.6, -0.5), v3(x, -7.2, -0.5)]} radius={0.5} colour="#e2d0a8" />)}
      <Label at={[-6, 9.6, 1]}>Epiphysis (secondary ossification centre)</Label>
      <Label at={[-7.5, 6.4, 1]}>Resting zone: reserve chondrocytes</Label>
      <Label at={[-7.5, 2.4, 1]}>Proliferative zone: cells divide and stack in columns</Label>
      <Label at={[-7.5, -3, 1]}>Hypertrophic zone: cells swell, then die</Label>
      <Label at={[-7.5, -6.3, 1]}>Calcified cartilage</Label>
      <Label at={[5.5, -9.6, 1]}>Ossification zone: vessels invade, osteoblasts lay bone (metaphysis)</Label>
    </group>
  );
}

// ── A remodelling unit (BMU) tunnelling through compact bone ──────────────
function RemodellingScene({ playing }: { playing: boolean }) {
  const t = useRef(0);
  const cone = useRef<THREE.Group>(null);
  const d = useMemo(() => {
    const r = rng(17);
    const clasts = Array.from({ length: 5 }, (_, i) => { const a = (i / 5) * Math.PI * 2; return { p: v3(6.6 + r() * 0.6, Math.cos(a) * 1.6, Math.sin(a) * 1.6 - 0.5), s: [0.9, 0.7, 0.7] as [number, number, number], c: '#8a4ab0' }; });
    const blasts = Array.from({ length: 40 }, (_, i) => { const x = -8 + (i % 20) * 0.6, a = Math.floor(i / 20) * Math.PI + (r() - 0.5) * 0.4; return { p: v3(x, Math.cos(a) * 2.05, Math.sin(a) * 2.05 - 0.5), s: [0.32, 0.22, 0.22] as [number, number, number], c: '#4a6ad0' }; });
    const reversal = Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return { p: v3(3 + r(), Math.cos(a) * 2.2, Math.sin(a) * 2.2 - 0.5), s: 0.22, c: '#c8b090' }; });
    return { clasts, blasts, reversal };
  }, []);
  useFrame((_, dt) => {
    if (!playing || !cone.current) return;
    t.current = (t.current + dt * 0.05) % 1;
    cone.current.position.x = -1.5 + 3 * t.current;
  });
  return (
    <group>
      <mesh position={[0, 0, -5.95]} raycast={() => null}><boxGeometry args={[22, 10, 6]} /><meshStandardMaterial color="#e2d4b4" roughness={0.75} /></mesh>
      <group ref={cone}>
        <mesh position={[-1, 0, -0.5]} rotation={[0, 0, Math.PI / 2]} raycast={() => null}><cylinderGeometry args={[2.4, 2.4, 16, 32, 1, true]} /><meshStandardMaterial color="#7a5a48" side={THREE.BackSide} roughness={0.6} /></mesh>
        <mesh position={[-4, 0, -0.5]} rotation={[0, 0, Math.PI / 2]} raycast={() => null}><cylinderGeometry args={[2.38, 2.38, 9, 32, 1, true]} /><meshStandardMaterial color="#e89ab0" side={THREE.BackSide} transparent opacity={0.7} roughness={0.5} /></mesh>
        <Cells items={d.clasts} geometry={SPHERE} />
        <Cells items={d.blasts} geometry={SPHERE} />
        <Cells items={d.reversal} geometry={SPHERE} />
        <Tube points={[v3(-10, 0, -0.5), v3(0, 0.2, -0.5), v3(7, 0, -0.5)]} radius={0.3} colour="#c0283a" />
      </group>
      <Label at={[7, 3.6, 0]}>Osteoclasts: cutting cone (resorption, ~3 weeks)</Label>
      <Label at={[3, -3.6, 0]}>Reversal zone: cement line</Label>
      <Label at={[-5, 3.6, 0]}>Osteoblasts lay osteoid (closing cone, ~3 months)</Label>
      <Label at={[-8, -3.6, 0]}>New osteon with its central capillary</Label>
    </group>
  );
}

// ── A synovial joint in section (a knee, cut from front to back) ───────────
const extrude = (shape: THREE.Shape, depth = 2) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
function SynovialScene() {
  const geo = useMemo(() => {
    const shape = (draw: (s: THREE.Shape) => void) => { const s = new THREE.Shape(); draw(s); return s; };
    // The femoral condyle: convex below; its cartilage a band under it.
    const femur = shape((s) => { s.moveTo(-6, 11); s.lineTo(6, 11); s.lineTo(6, 3); s.absellipse(0, 3, 6, 3.5, 0, Math.PI, true); s.lineTo(-6, 11); });
    const femCart = shape((s) => { s.moveTo(6, 3); s.absellipse(0, 3, 6, 4.1, 0, Math.PI, true); s.absellipse(0, 3, 6, 3.5, Math.PI, 0, false); });
    // The tibial plateau with its cartilage.
    const tibia = shape((s) => { s.moveTo(-7, -11); s.lineTo(7, -11); s.lineTo(7, -2.4); s.lineTo(-7, -2.4); s.lineTo(-7, -11); });
    const tibCart = shape((s) => { s.moveTo(-6.6, -2.4); s.lineTo(6.6, -2.4); s.lineTo(6.6, -1.8); s.lineTo(-6.6, -1.8); s.lineTo(-6.6, -2.4); });
    // Menisci: wedges, thick at the rim, filling the gap where the condyle curves away.
    const men = (sg: number) => shape((s) => { s.moveTo(sg * 7, -1.8); s.lineTo(sg * 3.8, -1.8); s.lineTo(sg * 7, 0.8); s.lineTo(sg * 7, -1.8); });
    const fluid = shape((s) => { s.moveTo(-7, -1.8); s.lineTo(7, -1.8); s.lineTo(7, 2.5); s.lineTo(-7, 2.5); s.lineTo(-7, -1.8); });
    const band = (x0: number, x1: number, y0: number, y1: number) => shape((s) => { s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.lineTo(x0, y0); });
    return {
      femur: extrude(femur), femCart: extrude(femCart), tibia: extrude(tibia), tibCart: extrude(tibCart),
      menL: extrude(men(-1)), menR: extrude(men(1)), fluid: extrude(fluid, 1.4),
      capL: extrude(band(-8.4, -7.6, -6, 6.5)), capR: extrude(band(7.6, 8.4, -6, 6.5)),
      synL: extrude(band(-7.6, -7.15, -3.5, 4.5)), synR: extrude(band(7.15, 7.6, -3.5, 4.5)),
    };
  }, []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);
  const m = (c: string, o = 1) => <meshPhysicalMaterial color={c} roughness={0.4} clearcoat={0.5} transparent={o < 1} opacity={o} depthWrite={o >= 1} />;
  return (
    <group>
      <mesh geometry={geo.fluid} position={[0, 0, -0.4]} raycast={() => null}>{m('#f2e6a0', 0.6)}</mesh>
      <mesh geometry={geo.femur} raycast={() => null}>{m('#e6d6b2')}</mesh>
      <mesh geometry={geo.femCart} raycast={() => null}>{m('#c4dce6')}</mesh>
      <mesh geometry={geo.tibia} raycast={() => null}>{m('#e6d6b2')}</mesh>
      <mesh geometry={geo.tibCart} raycast={() => null}>{m('#c4dce6')}</mesh>
      <mesh geometry={geo.menL} raycast={() => null}>{m('#dcdcd0')}</mesh>
      <mesh geometry={geo.menR} raycast={() => null}>{m('#dcdcd0')}</mesh>
      <mesh geometry={geo.capL} raycast={() => null}>{m('#f4efe6')}</mesh>
      <mesh geometry={geo.capR} raycast={() => null}>{m('#f4efe6')}</mesh>
      <mesh geometry={geo.synL} raycast={() => null}>{m('#e0909e')}</mesh>
      <mesh geometry={geo.synR} raycast={() => null}>{m('#e0909e')}</mesh>
      <Label at={[0, 8, 1.5]}>Bone (femoral condyle)</Label>
      <Label at={[0, -1.2 + 2.6, 1.5]}>Articular (hyaline) cartilage</Label>
      <Label at={[0, -1.45, 1.5]}>Joint space: synovial fluid</Label>
      <Label at={[0, -7, 1.5]}>Bone (tibial plateau)</Label>
      <Label at={[10.8, 5.5, 1]}>Fibrous capsule</Label>
      <Label at={[10.6, 3.4, 1]}>Synovial membrane</Label>
      <Label at={[5.2, -4, 1.5]}>Meniscus (fibrocartilage)</Label>
    </group>
  );
}

// ── A healing fracture: the callus at the current stage ───────────────────
function CallusScene({ healing }: { healing: { haematoma: number; softCallus: number; hardCallus: number } }) {
  const prof = (r: number, l: number) => Array.from({ length: 13 }, (_, i) => { const t = i / 12; return new THREE.Vector2(r * (0.95 + 0.45 * Math.sin(Math.PI * t)), (t - 0.5) * l); });
  const geo = useMemo(() => ({ soft: new THREE.LatheGeometry(prof(3.6, 9), 40), hard: new THREE.LatheGeometry(prof(3.3, 10), 40) }), []);
  useEffect(() => () => { geo.soft.dispose(); geo.hard.dispose(); }, [geo]);
  // Each fragment is the back half of a tube of cortex round the marrow, cut lengthwise towards the reader.
  const bone = (y: number) => (
    <group position={[0, y, 0]}>
      <mesh raycast={() => null}><cylinderGeometry args={[3, 3, 8, 40, 1, true, 0, Math.PI]} /><meshStandardMaterial color="#e6d6b2" side={THREE.DoubleSide} roughness={0.7} /></mesh>
      {[-2.55, 2.55].map((z) => <mesh key={z} position={[-0.01, 0, z]} rotation={[0, -Math.PI / 2, 0]} raycast={() => null}><planeGeometry args={[0.9, 8]} /><meshStandardMaterial color="#e8d8b0" side={THREE.DoubleSide} /></mesh>)}
      <mesh position={[-0.02, 0, 0]} rotation={[0, -Math.PI / 2, 0]} raycast={() => null}><planeGeometry args={[4.2, 8]} /><meshStandardMaterial color="#b8503c" side={THREE.DoubleSide} roughness={0.6} /></mesh>
    </group>
  );
  return (
    <group>
      <group rotation={[0, Math.PI / 2, 0]}>
        {bone(5)}
        {bone(-5)}
        {healing.haematoma > 0.02 && <mesh scale={[4.2, 2.2, 4.2]} raycast={() => null}><sphereGeometry args={[1, 32, 16]} /><meshStandardMaterial color="#7a0c18" transparent opacity={0.55 * healing.haematoma} depthWrite={false} /></mesh>}
        {healing.softCallus > 0.02 && <mesh geometry={geo.soft} raycast={() => null}><meshStandardMaterial color="#9ab0c4" transparent opacity={0.6 * healing.softCallus} depthWrite={false} /></mesh>}
        {healing.hardCallus > 0.02 && <mesh geometry={geo.hard} raycast={() => null}><meshStandardMaterial color="#e2d0a4" transparent opacity={0.35 + 0.5 * healing.hardCallus} depthWrite={false} /></mesh>}
      </group>
      <Label at={[0, 9.8, 0]}>Bone: compact cortex round the marrow cavity</Label>
      {healing.haematoma > 0.2 && <Label at={[-6.5, 0, 0]}>Haematoma: clot, inflammatory cells</Label>}
      {healing.softCallus > 0.2 && <Label at={[-6.5, -2, 0]}>Soft callus: cartilage and fibrous tissue</Label>}
      {healing.hardCallus > 0.2 && <Label at={[6.5, 2, 0]}>Hard callus: woven bone</Label>}
    </group>
  );
}

/** The close-up in its frame: magnified scenes scaled to the frame's radius. */
export function CloseUps({ def, which, playing, reducedMotion, healing }: { def: SimulationDefinition; which: CloseUp; playing: boolean; reducedMotion: boolean; healing: { haematoma: number; softCallus: number; hardCallus: number } }) {
  const fr = closeUpFrame(def, which);
  const k = fr.radius / 11;
  const play = playing && !reducedMotion;
  return (
    <group position={fr.centre} scale={k}>
      <hemisphereLight args={['#ffffff', '#806060', 0.6]} />
      {which === 'osteon' && <OsteonScene playing={play} />}
      {which === 'spongy' && <SpongyScene />}
      {which === 'growth-plate' && <GrowthPlateScene playing={play} />}
      {which === 'remodelling' && <RemodellingScene playing={play} />}
      {which === 'synovial' && <SynovialScene />}
      {which === 'callus' && <CallusScene healing={healing} />}
    </group>
  );
}
