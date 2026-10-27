# Human Skeletal System — Interactive 3D Learning Lab

**Live:** https://skeletal-anatomy-lab.vercel.app

An interactive 3D human skeleton for university anatomy and physiology:

- **Anatomy explorer.** 198 bones of one adult (BodyParts3D), with the costal and laryngeal cartilages, 23 intervertebral discs, 28 teeth and the gums, and from the HuBMAP female body the coccyx and the knee's cruciate ligaments and menisci. Each structure has its features, function and clinical notes, its shape class (long, short, flat, irregular, sesamoid, pneumatic) and how it ossifies. Search with everyday names and abbreviations ("collarbone", "kneecap", "ACL", "C7"); fly to the skull, spine, thorax, hand, pelvis, knee or foot; cut the body in three planes; colour by **Regions** or view it as an **X-ray**.
- **Joints and movement.** Every bone hangs from its parent and turns about the joint measured on the model: the hip and shoulder about sphere-fitted heads, the elbow, knee and ankle about their epicondylar, condylar and malleolar axes, the spine level by level. Move 22 movements of 13 joints within their AAOS normal ranges (with scapulohumeral rhythm at the shoulder and the jaw's glide at the TMJ), or pick a pose: walking, sitting, squatting, reaching, throwing, kneeling, a fist. Each joint is classified (synovial types, fibrous, cartilaginous) with its ligaments and clinical notes.
- **Bone tissue and bone mass.** Femoral-neck bone density from childhood to 90 on the NHANES III reference, with the menopause, hormone therapy, smoking, glucocorticoids, calcium and youthful exercise; the T-score, the WHO categories and hip-fracture risk; an X-ray view whose brightness follows the density. Close-ups of osteons, spongy bone and marrow, a remodelling unit and a growth plate; the HuBMAP female pelvis shows real compact bone over spongy bone.
- **Fractures and healing.** Ten common fractures on the real bones (distal radius, scaphoid, clavicle, humeral neck, femoral neck, tibial shaft, ankle, vertebral compression, metatarsal stress, rib) in their patterns (transverse, oblique, spiral, comminuted, greenstick, compression, avulsion, impacted, stress): the bone splits into fragments, displaced at the injury, then the haematoma, soft callus and hard callus over the weeks. Union time adjusts for age, smoking, diabetes and displacement.
- **Through life.** An age slider from birth to 30 for each sex: the growth plates (drawn across the long bones) close at their ages, the carpal and tarsal bones ossify, the permanent teeth erupt and the bone count falls to 206. The female and male pelvises side by side, with their subpubic angle, inlet and width measured on the two models.
- **Guided tour** of 24 steps through all of it.

**Educational only.** This is not a clinical tool, and the text has not been reviewed by a physician. The bones are BodyParts3D (DBCLS) and the coccyx, knee ligaments and female pelvis are from the HuBMAP Human Reference Atlas, all CC BY 4.0; see [public/ATTRIBUTION.md](public/ATTRIBUTION.md). The inferior nasal conchae and the ear ossicles are not in the model; the growth plates, callus and close-ups are drawn in code.

## Run

Requires Node.js ≥ 22.12.

```sh
npm install
npm run dev            # http://localhost:5196
npm run build          # type-check + production build → dist/
npm run preview        # http://localhost:5197
```

Add `?quality=high` or `?quality=low` to the URL to force a rendering quality. By default the lab drops the costly wet coat and sheen on software renderers and when frames stay slow.

## Check

```sh
npm run typecheck
npm test                                     # unit tests (Vitest)
npm run validate:assets                      # model hash, nodes, geometry sanity, baked shading, attribution
npm run build && npx playwright test --project=gpu        # every browser test, in installed Chrome with a GPU
npx playwright install chromium && npx playwright test --project=software   # the @smoke tests with software WebGL
```

See [docs/TESTING.md](docs/TESTING.md) for results and what is not verified, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it is built.

## Rebuild the model

`public/models/skeleton.glb` is generated from two checkouts:

1. The Human Atlas (`github.com/Niyaz-05/human-atlas`): BodyParts3D.
2. The Female Atlas (`github.com/Niyaz-05/female-atlas`): the HRA united female body.

```sh
node tools/make-structures.mjs "<human-atlas>/public/models"
node tools/extract-skeleton.mjs "<female-atlas>/public/models" "<human-atlas>/public/models"
node tools/bake-shading.mjs
node tools/validate-assets.mjs
```

Every step is deterministic, and every input and output is hashed in `src/lab/generated/provenance.json`, with the fits, the joints, the measurements and the layout checks.

## Deploy

The site is a Vercel project (Vite preset, output `dist/`) deployed with `vercel deploy --prod`.

## Layout

| Path | What |
|---|---|
| `src/contract/` | Simulation schema (zod), approved-asset registry, validation gate |
| `src/lab/` | The definition (structures, layers, tour, sources); joints, movements and poses; the posing rig; bone mass; fractures and healing; growth and the sexes; anchors; generated geometry and provenance |
| `src/app/` | Pure state reducer (modes, colour, cut, close-ups, pose, bone tissue, fracture, life), mode layers, search, React context |
| `src/viewer/` | three.js / react-three-fiber scene: tissue and X-ray materials, the posed model with fracture fragments and capped breaks, growth plates and callus, close-ups, camera rig, labels |
| `src/ui/` | Panels: structures (colour, cut, layers), details, Joints, Bone tissue, Fractures, Through life, close-up, tour, About; a small SVG chart |
| `tools/` | Structure list, extraction, shading bake and asset validation |
| `tests/unit`, `tests/e2e` | Vitest and Playwright suites |
