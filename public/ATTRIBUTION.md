# Attribution and asset provenance

## 3D model — `models/skeleton.glb`

### Sources

1. **BodyParts3D 4.0**, © The **Database Center for Life Science** (DBCLS), CC BY 4.0. https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
   - The skeleton of one adult male: 198 bones (all but the two inferior nasal conchae and the six ear ossicles), the costal, laryngeal and nasal alar cartilages, the 23 intervertebral discs from C2–C3 to L5–S1, the 28 permanent teeth (no third molars) and the gums, the interosseous membranes of the forearm and leg, and the long plantar and stylohyoid ligaments.
   - Taken as converted by *Human Atlas* (github.com/Niyaz-05/human-atlas, commit `76f069640f2c3dd40a58d1556896ac25008f592e`; its `atlas.json` sha256 `c359f4bcd2cba90b7411d66d5e9fc04dc81294d46cd5c1e8b212c824f2e5bbee`).
2. **3D Reference Organ Set for Female v1.5 (HuBMAP Human Reference Atlas, united female)**, by **Kristen Browne and Heidi Schlehlein** (and HRA contributors), from the Visible Human Female (National Library of Medicine). DOI https://doi.org/10.48539/HBM352.BTSQ.586. Licensed **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/).
   - The coccyx (BodyParts3D has none); the anterior and posterior cruciate ligaments, anterolateral ligaments and menisci of both knees; and the female pelvis (sacrum, coccyx, and the compact and spongy bone of each hip bone) shown beside the skeleton for comparison.
   - Taken as converted by *Female Atlas* (github.com/Niyaz-05/female-atlas, commit `4c2dfcca02739b59827601915128ee64abdff2ea`; its `atlas.json` sha256 `5fec63b2ebcb76ecd9c33027ed725e8ec0a7a76b756f72681285410072ae5c51`).

Neither DBCLS nor HuBMAP has reviewed or endorsed this lab.

### Placing the HuBMAP parts

The Female Atlas holds the same BodyParts3D bones (resized to her body) beside the HRA parts, so the HRA parts are carried into the BodyParts3D frame by the vertex-for-vertex correspondence of those bones (Horn's quaternion method):

- **Coccyx:** fitted on the BodyParts3D sacrum within 5 cm of its apex (392 vertex pairs, 0.9 mm RMS, scale 1.005).
- **Female pelvis:** a rigid fit (no scaling, so it keeps its own size) on the sacrum and both hip bones (4,793 pairs, 5.7 mm RMS; the Female Atlas resized the BodyParts3D pelvis unevenly). It is drawn 0.62 m to the side of the skeleton, or 0.30 m from the male pelvis when the two are compared.
- **Knee ligaments and menisci:** the Female Atlas did not put its BodyParts3D legs under the HRA knees, so these are placed on the BodyParts3D tibial plateau instead: the menisci centred on the top 12 mm of the tibia, resting on it and scaled to its width (72.6 mm, scale 1.00); the ligaments move with them. The placement is approximate and is labelled as such in the lab.

### Changes made (as CC BY 4.0 requires)

`tools/make-structures.mjs` maps the BodyParts3D part names to the lab's structures by rule (muscles and fasciae filed under the skeletal system in the source, the larynx's soft ligaments and the eye's check ligaments are left out; parts filed twice with identical geometry are taken once).

`tools/extract-skeleton.mjs`:
- Selected and merged the source meshes listed in `src/lab/source/structures.source.json`; welded coincident vertices; subdivided and smoothed (Taubin) the meshes under 400 triangles and the long bones and patellae, which the source simplified hard; simplified the large HRA meshes with meshoptimizer within 0.4 % relative error; recomputed smooth normals.
- Carried the HRA parts across as above.
- Measured the joints (sphere fits of the femoral and humeral heads, the epicondylar elbow axis, the condylar knee axis, the malleolar ankle axis, the subtalar axis after Inman, the finger and toe joints, each spinal level at its disc, the atlanto-occipital and temporomandibular joints), the bones' lengths, the two pelvises (true conjugate, subpubic angle, width, height), ten fracture sites and the growth plates of the long bones and clavicles.
- Translated so that the middle of the skeleton's bounds is the origin.

`tools/bake-shading.mjs` then adds a per-vertex `_TISSUE` attribute: ambient occlusion and a noise value, for the real-tissue look.

The output is `models/skeleton.glb` (9,249,652 bytes, 449,043 triangles, sha256 `760829effac22f757110fff4f70938db82106c5c643cab9f550c4f242a7ee1a9`). Every input hash is in `src/lab/generated/provenance.json`.

The growth plates, the haematoma and callus around a fracture, the fracture fragments' displacement and every close-up (osteons, spongy bone, a growth plate, a remodelling unit, a synovial joint, a healing fracture) are drawn in code at runtime and are not part of the model.

### Scientific sources

- Anatomy and physiology: OpenStax *Anatomy and Physiology 2e*, chapters 6–9, CC BY 4.0; Gray's Anatomy, 42nd ed.
- Joint ranges: AAOS (1965) as tabulated in Norkin CC, White DJ. *Measurement of Joint Motion*, 5th ed., 2016. Spinal levels: White AA, Panjabi MM. *Clinical Biomechanics of the Spine*, 2nd ed., 1990. Subtalar axis: Inman VT. *The Joints of the Ankle*, 1976.
- Bone mass: Looker AC et al. *Osteoporos Int* 1998;8:468–489 (NHANES III); WHO Technical Report 843 (1994); ISCD official positions 2019; Riggs BL, Melton LJ. *N Engl J Med* 1986;314:1676; Van Staa TP et al. *Osteoporos Int* 2002;13:777; Marshall D et al. *BMJ* 1996;312:1254.
- Fractures: Marsell R, Einhorn TA. *Injury* 2011;42:551; McRae's Orthopaedic Trauma, 3rd ed.; Scolaro JA et al. *J Bone Joint Surg Am* 2014;96:674; Loder RT. *Clin Orthop* 1988;232:210; NICE CG124.
- Growth: Scheuer L, Black S. *The Juvenile Skeleton*, 2004; American Dental Association eruption charts.
