# C4D + Redshift → DaVinci Resolve → Apple Immersive Video (.aivu)
### Verified pipeline spec for Vision Pro immersive scenes
_Researched and source-checked, Jul 2026. Every non-obvious claim is cited at the bottom. Points I could not verify are marked ⚠._

---

## 0. The one thing that changes everything

**Apple Immersive Video is a parametric fisheye projection driven by per-shot lens-calibration metadata (ILPD) — it is NOT equirectangular / VR180.** Apple's 2025 *Apple Projected Media Profile* (APMP) defines three projection kinds: `equi` (360 equirect), `hequ` (180 half-equirect = VR180), and **`prim` = ParametricImmersive** (this is AIV, tagged `PROJ-AIV` in HLS). `prim` requires a lens-collection box (`lnsc`) carrying lens intrinsics, distortion, and extrinsics — the headset reprojects every pixel from that metadata.

Redshift's Stereo Spherical camera outputs **equirectangular only** (no stereo fisheye exists in Redshift). So there is a mandatory **reprojection step** between our render and a genuine `.aivu`.

This forks into two targets — pick with eyes open:

| Target | Projection | How we get there | Is it "real" AIV? |
|---|---|---|---|
| **VR180 / APMP-180** | `hequ` half-equirect | render equirect → MV-HEVC, tag 180 | ❌ Plays on Vision Pro, but it's VR180, not AIV |
| **Genuine AIVU** | `prim` ParametricImmersive + ILPD | render equirect → **reproject to immersive lens-space in Resolve** + assign ILPD → deliver AIVU | ✅ Real Apple Immersive Video |

You said **AIVU only**, so this doc targets the second row. **DaVinci Resolve Studio 20.1+ is the tool that does the reprojection** — Compressor cannot (it only encodes/packages content already in Apple's projection).

⚠ **Honest fidelity caveat:** ILPD is designed as a *real lens's* optical fingerprint. Apple's docs explicitly allow a "real **or virtual** lens," so a synthetic/default ILPD on CG is legitimate — but there is **no Apple-published exact CG-render-to-AIV recipe**, and round-tripping through equirect incurs pole-stretch/aliasing that AIV's native projection exists to avoid. The **highest-fidelity path is to render CG directly into Resolve's immersive lens space with Fusion Renderer3D** (skip equirect entirely). The equirect→PanoMap route below is the practical C4D/Redshift path; validate every output in **Apple Immersive Video Utility** before trusting it.

---

## 1. Cinema 4D scene + camera setup

**Scene hygiene (non-negotiable for comfort + AIV's 1:1 world mapping):**
- **Real-world scale.** 1 unit = 1 cm. The whole depth model derives from a ~64 mm interaxial against true scale — this is why depth looked flat before (scene scale / mono camera). Model the car at real size.
- **Camera at eye height** for the POV — seated ≈ 110–120 cm, standing ≈ 160–165 cm. In immersive, camera height *is* audience placement.
- **Level horizon, zero roll/bank.** No Dutch tilt — nauseating in-headset.
- **Nothing too close.** Keep principal subjects ≳ 0.5–1 m from the eyepoint; near-parallax is uncomfortable.
- **Slow, motivated moves; cut sparingly.** visionOS 26's Motion Sensitivity setting deliberately breaks immersion on high motion — keep camera motion gentle.

**Redshift camera:**
- Camera type / projection → **Stereo Spherical**.
- **Mode:** *Separate Left/Right* (two passes) is preferred for CG — each eye is a clean 4320×4320, easier on VRAM, maps cleanly onto a stereo timeline. Side-by-Side (one pass, 8640×4320) is fine if you prefer a single file.
- **Horizontal FOV 180° · Vertical FOV 180°** → gives the **square 1:1 per-eye** frame AIV wants (floor-to-ceiling). Do NOT render 2:1 (that's 180×90 and loses the ceiling/floor).
- **Eye Separation (interaxial): 6.3–6.5 cm** (≈63–65 mm, human IPD). Value is in scene units, so real-world scale must be set first.
- **Focus Distance: OFF / parallel.** Leave eyes looking straight ahead. Toe-in convergence adds edge vertical parallax; VR standard is parallel, and Vision Pro re-converges per viewer's IPD at playback.

---

## 2. Redshift + Cinema 4D render/export settings

| Setting | Value | Why |
|---|---|---|
| Resolution (per eye) | **4320 × 4320** | Apple AIV per-eye delivery target (1:1 = 180×180) |
| Resolution (if SBS single file) | **8640 × 4320** | 2:1; Over/Under = 4320×8640 |
| Optional supersample | render ~4600–5000/eye, downscale to 4320 (**Mitchell** filter) | matches pro practice; cleaner edges |
| Frame rate | **90 fps** | AIV spec (heavy for path-traced CG — budget it) |
| Motion blur | shutter consistent with 90 fps | |
| Format | **OpenEXR** | scene-referred |
| Bit depth | **16-bit half float** | standard/sufficient for a linear grade; 32-bit only for data AOVs (depth/position) |
| Render color space | **scene-linear ACEScg** (Redshift default), **no display transform baked** | do all PQ/HDR shaping in Resolve |

**C4D EXR gotcha (verified):** to write a 16-bit half EXR from C4D's 32-bit internal buffer, set Save bit depth to **32 Bit/Channel** and enable **"Use 16 Bit Floats"** in the EXR options — renders internally at 32-bit in ACEScg, saves 16-bit half.

**Output path/name:** clean per-eye or SBS EXR sequence, e.g. `…/STEREO_EXR/Cadillac_stereo_####.exr`. Keep the folder isolated so Resolve reads a clean sequence.

> Your existing overnight render (equirect 180 SBS, 8640×4320, 90fps, EXR) is a **valid source** for the Resolve reproject path below — it is not wasted.

---

## 3. DaVinci Resolve — project, timeline, reprojection, AIVU delivery

**This is where equirect becomes genuine AIV.** Resolve Studio **20.1+** (macOS, Apple Silicon; MV-HEVC export is macOS-only).

### 3a. Project setup
- **Project Settings → Master → Immersive workflows: Apple Immersive** (this is the AIV path; *Standard Immersive* is the VR180/equirect path we used before — wrong for genuine AIVU).
- **Timeline frame rate: 90 fps** (set before adding media).
- Timeline resolution: the immersive preset (Apple's immersive canvas; 8160×7200 or the half res — the workflow sets this).
- **Color management: P3-D65 / ST2084 (PQ), HDR.** Master 1000-nit, CST maps to **108 nits** for Vision Pro delivery.
- **Project Settings → Apple Immersive → ILPD:** assign a custom ILPD if you have one; for CG with no lens, Resolve applies a **default lens distortion ("gap ILPD")** automatically.

### 3b. Bring CG in — two options
- **Option A (highest fidelity): Fusion Renderer3D** — build/import the CG in Fusion's 3D and render it **directly into the immersive lens space**, sent straight to a stereoscopic immersive timeline. Skips equirect entirely — no pole-stretch penalty.
- **Option B (practical, from our EXRs): import the equirect 180 SBS sequence, reproject with Fusion PanoMap.**
  1. Import `Cadillac_stereo_[####].exr` as one clip (image sequence).
  2. Clip Attributes → **Stereoscopic Mode: Side by Side**, **Projection: Equirectangular 180°**.
  3. On a Fusion clip, add **PanoMap** set **lat/long → immersive** (the guide explicitly frames this as "useful to compose CG, often rendered in equirectangular"). Use **Immersive Patcher** to undistort→composite→re-distort any flat elements.

### 3c. Deliver AIVU
Deliver page → set output **4320×4320**, then one of:
- **Vision Pro Review** → produces an **`.aivu` directly** (MV-HEVC via Apple Video Toolbox) — AirDrop/Wi-Fi to Vision Pro, open in **Apple Immersive Video Utility**. ⚠ Video Toolbox review encodes are QC-grade, not final-quality.
- **Vision Pro Bundle** → dual-track **ProRes + FCPXMLD + AIME** for pro external encoding, then mux to `.aivu` in **Apple Immersive Video Utility** (drag folder → "Create .aivu File"; tick P3-D65 PQ). Optional **ASAF** spatial-audio render.

**Metadata that MUST be present for a genuine AIVU:** ILPD/lens-calibration (→ APMP `lnsc`), **AIME** file, a **presentation/temporal-metadata track** (camera switches/fades rendered at playback, not baked), **ASAF→APAC** spatial audio, and correct APMP signaling (`projection_kind = prim`, stereo MV-HEVC, PQ HDR, 90 fps, 4320×4320).

### 3d. Verify
Open every deliverable in the free **Apple Immersive Video Utility** and on the headset before sign-off. This is the acceptance test for "is it really AIV."

---

## 4. Secondary: reusable environment for future AIVU tests / Fusion

Build a **template Resolve project** once and reuse:
- Project preset: **Apple Immersive workflow, 90 fps, P3-D65 PQ**, default ILPD assigned.
- A **"CG_IMMERSIVE" timeline** at the immersive res with: V1 for imported equirect (PanoMap reproject node baked into a saved Fusion comp), V2 for Renderer3D CG, a grade node tree stub (Input CST → primary → creative → Output CST to 108-nit).
- Save a **Deliver preset** "AIVU_VisionPro_Review" and "AIVU_VisionPro_Bundle" so future scenes are one click.
- Save the **Fusion PanoMap + Immersive Patcher** comp as a `.setting` you can drop onto any new equirect clip.
- Keep a **C4D template scene** with the Stereo Spherical camera rig (180×180, 6.4cm, parallel) + the AIV render setting preset.

That gives you a drop-in environment: render equirect from C4D → import → apply saved PanoMap comp → apply grade → apply Deliver preset → AIVU.

---

## 5. Bottom line

- Genuine **AIVU = parametric fisheye + ILPD**, reached by **reprojecting** equirect in Resolve (PanoMap) or rendering CG directly in immersive lens-space (Renderer3D) — **not** by encoding equirect as-is (that's VR180).
- **Resolve Studio 20.1+ Apple Immersive** project → reproject → **Deliver → Vision Pro Review (direct .aivu)** or **Bundle → Apple Immersive Video Utility**.
- C4D/Redshift: **Stereo Spherical, 180×180, 6.4 cm parallel, 4320×4320/eye, 90 fps, 16-bit half linear ACEScg EXR.**
- ⚠ Biggest open risk: fidelity/legitimacy of a synthetic ILPD on reprojected equirect CG, and no Apple CG-render recipe — prototype and QC in Apple Immersive Video Utility.

---

## Sources
- Apple Movie Profiles for Spatial & Immersive Media v0.9 (APMP `prim`/lens spec) — https://developer.apple.com/av-foundation/Apple-Movie-Profiles.pdf
- Apple Immersive Video (developer) — https://developer.apple.com/apple-immersive-video/
- WWDC25-297 Apple Projected Media Profile — https://developer.apple.com/videos/play/wwdc2025/297
- Compressor: Create an Apple Immersive Video package — https://support.apple.com/guide/compressor/create-an-apple-immersive-video-package-cpsrf32c84cc/mac
- Apple Immersive Video Utility: create AIVU files — https://support.apple.com/guide/immersive-video-utility/import-media-and-create-aivu-files-dev386a5b6ea/web
- DaVinci Resolve Immersive Workflow Guide (Aug 2025) — https://documents.blackmagicdesign.com/SupportNotes/DaVinci_Resolve_Immersive_Workflow_Guide.pdf
- Maxon: Redshift Stereo Spherical Camera — https://help.maxon.net/c4d/s26/en-us/Content/_REDSHIFT_/html/Stereo+Spherical+Camera.html
- Maxon: C4D Color Management & EXR Output — https://support.maxon.net/hc/en-us/articles/20581176089756
- Mike Swanson: Apple's Mysterious Fisheye Projection — https://blog.mikeswanson.com/apples-mysterious-fisheye-projection/
- SpatialGen: How to Stream Apple Immersive Video (real HLS manifest) — https://spatialgen.com/blog/how-to-stream-apple-immersive-video/
- fxguide: URSA Cine Immersive first look (real Resolve settings) — https://www.fxguide.com/quicktakes/first-look-blackmagic-ursa-cine-immersive-test-footage-for-apple-vision-pro/
- ProVideo Coalition: Creating Stereoscopic Video for AVP — https://www.provideocoalition.com/creating-stereoscopic-video-for-the-apple-vision-pro/
