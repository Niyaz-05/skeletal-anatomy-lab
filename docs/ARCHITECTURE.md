# Architecture

The skeletal lab shares the heart, lungs, brain, digestive, eye, kidney, endocrine and reproductive labs' design: a validated, data-only **`SimulationDefinition`** rendered by a generic viewer. The code is a deliberate copy of the reproductive lab, not a shared package, so each lab deploys independently. Its domain code now lives in `src/lab/` (not a per-lab folder name), so the next lab can be copied without renaming.

## Differences from the reproductive lab

| Area | Skeletal |
|---|---|
| Body | One body (the reproductive lab had two). The female pelvis is part of the same model, drawn beside the skeleton. |
| Contract | Modes `explore` / `joints` / `tissue` / `fractures` / `life` / `tour`. Structures carry a bone shape class and their ossification. Tour steps can set a pose, an age for bone mass, a fracture (site, pattern, weeks), an age for growth, the pelvis comparison, a close-up, a cut, the colour (real, regions, X-ray) and whether to isolate and tint the focus. Up to 400 structures and 64 members per group. |
| Science (`src/lab/`) | `joints.ts`: 18 joints with their classification, 22 movements with AAOS normal ranges, 8 named poses, the share of each spinal movement per level (White & Panjabi). `rig.ts`: a pose to a matrix per bone (below). `bone.ts`: femoral-neck BMD through life on the NHANES III reference, its factors, the T-score, WHO categories and hip-fracture risk; the BMU's phases. `fractures.ts`: patterns, ten sites with their clinical notes, union time and the healing stages. `growth.ts`: ossification and growth-plate fusion by age and sex, tooth eruption, the bone count, the sexes' traits. All pure and unit-tested. |
| Posing (`rig.ts`) | Each part has a parent: the pelvis is the root; L5 … C1, then the skull and mandible; the thorax (ribs, cartilages, sternum) rides on T7 and carries the shoulder girdles; girdle → humerus → ulna → radius → carpus → fingers; pelvis → femur → tibia and fibula → talus → foot → toes. A part turns about its measured joint (the pivot and axes from the extractor), so its world matrix is the parent's times a rotation about that joint. Discs, the cruciate ligaments and the forearm's interosseous membrane lie between two bones: their centre goes to the midpoint of where each bone would carry it, and they turn halfway (blending the matrices directly mixes the pivots and throws the parts centimetres away). The shoulder adds scapulohumeral rhythm: the girdle rises about the sternoclavicular joint while the humerus keeps the asked orientation about its (carried) head. Angle signs follow the clinical names, worked out once per movement and side and checked by the unit tests (flexion moves the forearm forwards, abduction outwards on each side, the face turns left, a part-way grip moves the fingertip towards the palm). |
| Model (`SkeletonModel.tsx`) | Meshes take their pose matrix (`matrixAutoUpdate` off). The cut caps follow the posed matrices. **X-ray** is a second material per part: additive, brightest where the surface is seen edge-on (more bone along the ray), on a dark field; in the bone tissue view its brightness follows the density. **Through life** paints bones that are still cartilage pale blue and see-through and hides teeth not yet erupted. **Fractures**: the bone's own mesh keeps the first fragment (clipped by the fracture plane); clones with their own clipped tissue and X-ray materials carry the other fragments, displaced as the pattern leaves them at the injury and reduced afterwards; each break face is capped with the same stencil technique as the cut (`makeCap` takes several planes, so a butterfly fragment between two planes is capped correctly). A vertebral compression crushes the vertebra instead. |
| Overlays | `Overlays.tsx`: the haematoma, soft callus and hard callus as a sphere and spindles about the break, each as far as healing has gone; growth plates as blue discs across the bones, fading as they fuse. |
| Labels | Surface samples are kept in each mesh's own space and placed by its current matrix, and a motion counter re-anchors the labels when parts move. |
| Camera | A request can frame a sphere (`around`) instead of structures: a fracture site, or both pelvises side by side where the female one is drawn. |
| Close-ups (`CloseUps.tsx`) | Osteons in a cross-section of cortex, spongy bone with red and yellow marrow, the zones of a growth plate, a remodelling unit tunnelling through cortex, a synovial joint in section, and a healing fracture at the stage chosen. |

The real-tissue look (`tissue.ts`, `Lighting.tsx`, `tools/bake-shading.mjs`) is the same in every lab. The shading bake lets each layer shade only itself and the parts that never move apart from it, so posing never leaves shadows where a bone used to be.

## Asset pipeline

```
BodyParts3D (Human Atlas): 198 bones, cartilages, discs, teeth, ligaments   ─┐
  named by rule from the source names (tools/make-structures.mjs)            │
HRA united female (Female Atlas):                                            ├─ tools/extract-skeleton.mjs
  coccyx ─ correspondence fit on the sacrum (0.9 mm)                         │
  female pelvis ─ rigid correspondence fit (5.7 mm)                          │
  knee ligaments and menisci ─ placed on the tibial plateau                  ┘
        │  301 nodes; joints, measures, fracture sites, growth plates; layout checks
        └─ tools/bake-shading.mjs ─▶ public/models/skeleton.glb (9.2 MB) · skeleton.json · provenance.json
```

**Correspondence fits.** The Female Atlas holds the same BodyParts3D meshes (same vertex count and order, resized to her body) beside its HRA parts, so a fit needs no landmarks: Horn's method on vertex pairs. For the coccyx only the sacrum within 5 cm of its apex counts (the Female Atlas resized the pelvis unevenly: one similarity over the whole pelvis leaves 5.7 mm). The knees could not be fitted this way, because the Female Atlas's BodyParts3D legs lie 1–2 cm inside the HRA knees.

**Joints.** Sphere fits (algebraic least squares) to the caps of the femoral and humeral heads (radius checked against 17–32 mm); the elbow axis through the epicondyles (the extremes across the distal humerus), the knee axis through the condyles, the ankle axis through the tips of the malleoli; the radioulnar axis from the radial head to the ulnar head; the subtalar axis 42° up and 23° medial (Inman); each finger and toe joint where a bone's proximal end meets its parent; each spinal level at the middle of its disc, C1 on the dens and the skull on C1; the temporomandibular axis through the condyles.

**Measured and checked.** Stature and long-bone lengths; both pelvises' true conjugate, subpubic angle (the 3D angle between the lower edges of the inferior pubic rami: 65° male, 108° female), width and height (the inlet's transverse diameter is not measured: the brim is not planar, and no automatic ring through it proved reliable on both pelvises); each fracture site centred on the bone's cross-section with its radius there; each growth plate as the cross-section a set depth from the bone's end. Checks: limbs on their sides, joints in order down the body, the coccyx below the sacrum, the knee set in the knees, femoral heads of textbook size, the female arch wider and her inlet deeper, plausible radii. The extraction fails if any check fails.

## Performance

On an AMD integrated GPU (installed Chrome, D3D11) every view runs at about 60 fps, posed or not; the close-ups too. Ready in about 7–11 s. Under software WebGL (SwiftShader) the views work but slowly, which is why the browser suite runs on the GPU and only the smoke tests in software.
