# AIVU Shot Run Sheet

Copy per shot. Numbers live in `aivu_pipeline.json` — don't retype them.

## Before the render (C4D)

- [ ] Opened from the **AIVU template** (or ran `c4d_aivu_template_builder.py`)
- [ ] Scene at real-world scale (1 unit = 1 cm) — car-sized things ~car-sized
- [ ] Camera `AIV_180_Stereo_Cam` at eye height, level horizon, zero roll
- [ ] Subjects ≥ 0.5–1 m from camera; moves slow/motivated or locked off
- [ ] Frame range and doc fps (90) cover the intended cut, not a stub
      *(the Cadillac test shipped 14 frames = 0.15 s — check this!)*
- [ ] EXR option **Use 16 Bit Floats** ticked (32-bit save depth)
- [ ] **`c4d_aivu_template_checker.py` runs all OK / ⚠ understood**
- [ ] Render queued (Redshift; textures cached; no license/missing-asset
      errors in the first frame)

## After the render

- [ ] `STEREO_EXR/` frame count == frame range, names contiguous
      (`<shot>_####.exr`), no zero-byte files
- [ ] Spot-check one frame: L and R halves genuinely differ (mono creep is
      the classic silent failure)

## Resolve

- [ ] `python3 resolve_aivu.py conform --renders <STEREO_EXR>`
- [ ] First time only: clip attribute keys unknown → set by hand
      (Clip Attributes → Stereoscopic **Side by Side**, Projection
      **Equirectangular 180°**) then `discover --write`
- [ ] Fusion: drop `presets/PanoMap_LatLong_to_Immersive.setting` on
      **each eye stream** (MediaIn1→PanoMap→MediaOut1, same for 2);
      eyes check with viewer keys **1 / 2**
- [ ] Grade — PQ pipeline, output mapped to **108 nits**
- [ ] `python3 resolve_aivu.py deliver --out <masters>`   *(QC pass)*
- [ ] Finals: `deliver --bundle`, then Utility → **Create .aivu** (P3-D65 PQ ✓)

## Headset acceptance (no sign-off without it)

- [ ] Opens in **Apple Immersive Video Utility**; plays as real AIV
- [ ] Depth reads life-size (not miniature/giant), horizon locked
- [ ] Deepest background comfortable for 10+ seconds; no eye strain
- [ ] Poles/edges clean (reprojection artifacts), L/R not swapped
- [ ] Motion comfortable (visionOS Motion Sensitivity users considered)
