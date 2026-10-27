import { useMemo } from 'react';
import * as THREE from 'three';
import type { FractureView } from './fracture';
import type { Physis } from '../lab/growth';
import { clip } from './SkeletonModel';

/** A spindle (callus) profile turned about the bone's axis: widest at the break, tapering both ways. */
function spindle(radius: number, length: number): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, y = (t - 0.5) * length;
    pts.push(new THREE.Vector2(radius * (0.92 + 0.38 * Math.sin(Math.PI * t) ** 1.4), y));
  }
  return new THREE.LatheGeometry(pts, 40);
}
const along = (axis: THREE.Vector3) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());

/**
 * Around a break: the haematoma (dark red, the first week), the soft callus (grey-blue cartilage and
 * fibrous tissue) and the hard callus (woven bone), each as far as healing has gone.
 */
export function FractureOverlay({ f }: { f: FractureView }) {
  const q = useMemo(() => along(f.axis), [f.axis]);
  const r = f.radius;
  const geo = useMemo(() => ({ haem: new THREE.SphereGeometry(1, 32, 20), soft: spindle(r * 1.25, r * 3.2), hard: spindle(r * 1.12, r * 3.6) }), [r]);
  const mat = (colour: string, opacity: number) => <meshStandardMaterial color={colour} transparent opacity={opacity} depthWrite={false} roughness={0.5} clippingPlanes={[clip.plane]} />;
  return (
    <group position={f.centre} quaternion={q}>
      {f.haematoma > 0.02 && (
        <mesh geometry={geo.haem} scale={[r * 1.55, r * 2.1, r * 1.55]} renderOrder={4}>{mat('#7a0c18', 0.32 * f.haematoma)}</mesh>
      )}
      {f.softCallus > 0.02 && <mesh geometry={geo.soft} renderOrder={5}>{mat('#9ab0c4', 0.55 * f.softCallus)}</mesh>}
      {f.hardCallus > 0.02 && <mesh geometry={geo.hard} renderOrder={6}>{mat('#e2d4b2', 0.35 + 0.6 * f.hardCallus)}</mesh>}
    </group>
  );
}

/** Open growth plates: blue cartilage discs across the bones, fading as they fuse. */
export function Physes({ items }: { items: { p: Physis; open: number }[] }) {
  const geo = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 40, 1), []);
  return (
    <group>
      {items.map(({ p, open }) => {
        const r = (p.radiusMm / 1000) * 1.12;
        const q = along(new THREE.Vector3(...p.axis));
        return (
          <mesh key={p.id} geometry={geo} position={p.centre as [number, number, number]} quaternion={q} scale={[r, 0.0026, r]} renderOrder={4}>
            <meshStandardMaterial color="#5aa8e8" emissive="#2a6aa8" emissiveIntensity={0.35} transparent opacity={0.35 + 0.55 * open} depthWrite={false} roughness={0.3} clippingPlanes={[clip.plane]} />
          </mesh>
        );
      })}
    </group>
  );
}
