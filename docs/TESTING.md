# Testing

Results recorded on 2026-10-27 on Windows 11, Node 22.14.0. The browser suite ran in installed Google Chrome with hardware WebGL on an AMD Radeon integrated GPU (ANGLE, Direct3D 11) through Playwright 1.64; the smoke tests also ran in Playwright's Chromium with software WebGL (SwiftShader).

## Commands

| Check | Command | What it covers |
|---|---|---|
| Types | `npm run typecheck` | TypeScript strict, `noUncheckedIndexedAccess` |
| Unit | `npm test` | **Definition:** passes the validation gate with no warnings; an unapproved asset and a missing left/right partner are rejected; one mesh structure per model node (301); every left/right part on its side; https-only sources; HRA parts carry a model note; every tour step's focus exists. **Model:** the extractor's checks; adult stature and textbook bone proportions (femur a quarter of the stature, tibia about four fifths of the femur); femoral and humeral heads 38–56 mm across with sphere fits under 2 mm RMS; the coccyx and female-pelvis fits within their limits; a wider pubic arch and deeper inlet in the female pelvis; fracture sites and growth plates on their bones. **Rig:** the rest pose moves nothing; elbow flexion moves the wrist forwards and up and keeps the ulna on the elbow; hip flexion brings the knee forwards, knee flexion takes the ankle back, abduction moves each arm outwards; the girdle rises with the arm while the humeral head stays in the glenoid; the face turns left and the trunk bends forwards; a part-way grip moves the fingertip towards the palm and a full fist brings it onto the palm; the knee ligaments stay in the flexed knee; every pose within its ranges; the spinal shares sum to 1. **Bone mass:** the young-adult peak; women in their 70s near a T-score of −2, men higher; each factor in the right direction; the WHO thresholds and 2.6-fold risk per SD. **Fractures:** every site on a real bone with patterns that exist; slower union with smoking, diabetes and age, faster in children; the stages in order; fragments on either side of the break, three for a comminuted fracture, a crushed vertebra. **Growth:** carpal ossification in order; growth plates closing earlier in girls, the clavicle's last; tooth eruption and the bone count. **Reducer:** movements clamped, one side or both; the fracture camera and patterns; the pelvis comparison; the tour's poses, fractures and comparison. **Search** by everyday names and abbreviations. `closeHoles` on synthetic meshes and all 301 model meshes |
| Assets | `npm run validate:assets` | The GLB's sha256 = provenance and the recorded baked hash, node set = geometry record, finite positions in range, unit normals, indices in range, triangle counts, baked `_TISSUE` on every mesh, no morph targets; the attribution names BodyParts3D, DBCLS, HuBMAP, Kristen Browne, the DOI, CC BY 4.0, what is drawn in code and the source and output hashes |
| Determinism | re-run `tools/extract-skeleton.mjs` then `tools/bake-shading.mjs` | Byte-identical `skeleton.glb` |
| Build | `npm run build` | Type check + production bundle |
| E2E (GPU) | `npm run build && npx playwright test --project=gpu` | All 21 scenarios below; screenshots in `docs/screenshots/` |
| E2E (software) | `npx playwright test --project=software` | The 4 scenarios tagged @smoke, with software WebGL |

## E2E scenarios (`tests/e2e/lab.spec.ts`)

1. Loads with no console errors and a clean main screen (@smoke).
2. Clicking the model selects the bone under the pointer.
3. Search finds bones by everyday names and abbreviations ("collarbone", "kneecap", "ACL", "C7", "breastbone").
4. A group lists its parts, a part links back, its bone class shows, and HRA parts say where they came from.
5. Colour by regions and X-ray repaint the model; X-ray darkens the field.
6. Layers hide and show structures, including the female pelvis.
7. Isolate, Zoom to and Reset.
8. Camera presets and region buttons change the view.
9. Labels mode shows labels that do not overlap.
10. The cut turns the camera to face it; Flip and Off.
11. Joints: poses move the skeleton; the knee slider stops at its range; both sides; the jaw; back to the anatomical position (@smoke).
12. Bone tissue: osteopenia at 80, osteoporosis with smoking and steroids; the X-ray view; four close-ups.
13. Fractures: sites, patterns, slower union for a smoker, the healing stages over the weeks, X-ray, a vertebral compression, the callus close-up (@smoke).
14. Through life: open growth plates and no permanent teeth at 4, teeth at 12, only the clavicle open at 26, none and 206 bones at 30, the pelvises compared.
15. A close-up opens from a structure's details and returns to the body.
16. The guided tour: every step in order, back, jumps to a pose and to the comparison, Finish.
17. Phone 390×844: no horizontal overflow; Structures opens from the dock; picking shows the details.
18. About (ⓘ): the BodyParts3D, HuBMAP and science credits; Escape closes.
19. `?nowebgl`: fallback message; the list, details and panels still work (@smoke).
20. Missing model (HTTP 404): error alert; Try again refetches and loads.
21. Reduced motion: every view and an animated close-up work without errors.

## Results

| Check | Result |
|---|---|
| `npm run typecheck` | **Pass** |
| `npm test` | **Pass**: 39/39 in 3 files |
| `npm run validate:assets` | **Pass**: 301 nodes, 449,043 triangles, sha256 `760829effac2…` |
| Determinism | **Pass**: re-extraction gives the same unbaked model (`3cc20b5afff8…`) and re-baking the recorded final sha256 (`760829effac2…`) |
| `npm run build` | **Pass**. Vite warns about chunk size (mostly three.js) |
| E2E, GPU | **Pass**: 21/21 in 2.3 minutes |
| E2E, software (SwiftShader) | **Pass**: 4/4 @smoke tests in 2.1 minutes |
| Live site (2026-10-27) | **Pass**: https://skeletal-anatomy-lab.vercel.app returns the page; `models/skeleton.glb` is served with its recorded sha256 (`760829effac2…`); Anatomy, the walking pose, Bone tissue, Fractures, Through life, the tour and a close-up open in Chrome with no console errors at 60–61 fps (ready in 10.6 s once the model was cached; the very first download took longer on a slow connection) |
| GPU check (Chrome, AMD Radeon, D3D11) | Every view renders with no console errors: Anatomy, the walking, squat and fist poses, Bone tissue, Fractures, Through life, X-ray and all six close-ups at 60–61 fps; ready in about 7–11 s |

## Defects found and fixed during QA

- **The knee ligaments flew off in a squat.** Blending the femur's and tibia's matrices mixed their pivots; parts between two bones now take the midpoint of where each bone would carry their centre, and turn halfway.
- **The callus sat a centimetre off the tibia.** Fracture sites were on each bone's overall axis, which a curved bone leaves; they are now centred on the bone's cross-section there.
- **The fracture camera framed the whole radius,** leaving the break behind the toolbar: the camera now frames a sphere round the site. Comparing the pelvises framed them at their rest positions and cut the female one off: it now frames both where they are drawn.
- **X-ray was invisible on the white background:** it now has a dark field.
- **The knee set could not be fitted by correspondence:** the Female Atlas's BodyParts3D legs do not sit under its HRA knees, so the set is placed on the tibial plateau and labelled as approximate. A similarity fit over the whole pelvis left 5.7 mm (the Female Atlas resized the pelvis unevenly), so the coccyx is fitted on the sacral apex alone (0.9 mm).
- **The pelvic inlet's transverse diameter could not be measured reliably** (the brim is not planar; every automatic ring caught the iliac wings or the cavity below); it is left to the textbook ranges, and only reliable measures are shown.
- **The first model was too heavy** (812k triangles, 14.8 MB, from subdividing every mesh under 1,600 triangles): only meshes under 400 triangles and the long bones are subdivided now (449k, 9.2 MB baked).
- **The synovial joint, callus and remodelling close-ups did not read as sections;** they were rebuilt as true sections.
- **The tour overstated bone loss** (it said an average woman of 75 is osteoporotic; the model, like NHANES, puts her near −2): the step now shows 80 and names what tips her into osteoporosis.

## Not verified

- **Physical devices other than one AMD integrated GPU.** No phone, tablet or discrete GPU was tested. Firefox and Safari were not run.
- **Automated accessibility audit.** axe-core is not installed; keyboard paths and ARIA labels were checked by hand and by E2E only.
- **Medical review.** The text follows OpenStax A&P 2e, Gray's Anatomy and the cited papers; no orthopaedic surgeon or radiologist has reviewed it.
- **The models are teaching models.** Joints turn about fixed axes (real joints roll and glide; the knee's screw-home rotation and the scapula's full motion are simplified); bone density follows average curves; union times are typical ranges; fusion ages are mid-range values. None is for diagnosis or treatment.
- **The knee ligaments' placement is approximate,** and the female pelvis comes from a different person than the skeleton.
- **Growth is shown on the adult skeleton:** the bones keep their adult size and proportions at every age.
