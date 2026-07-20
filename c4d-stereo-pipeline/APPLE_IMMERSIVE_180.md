# Apple Immersive Video & VR180 — the full-immersion path

Windowed spatial video (`RESOLVE_TO_VISIONPRO.md`) puts your stereo render in
a floating frame. This path removes the frame: **180° stereoscopic video that
wraps around the viewer**. On Vision Pro that comes in two tiers:

| Tier | What it is | File | Playback |
| --- | --- | --- | --- |
| **Apple Immersive Video (AIV)** | Apple's flagship immersive format: 180° stereo, **parametric fisheye (`prim`) driven by ILPD lens-calibration metadata**, 90 fps (mastered up to 8160×7200 per eye on Blackmagic's URSA Cine Immersive). NOT plain fisheye or equirect — the headset reprojects from the lens metadata | **`.aivu`** — Apple Immersive Video Universal | visionOS 26+: Files/Quick Look, AVKit apps, and the **Apple Immersive Video Utility** |
| **APMP** (Apple Projected Media Profile) | The pragmatic tier: standard MV-HEVC tagged with a projection (VR180 half-equirect, 360, wide-FOV) — no special camera metadata needed | `.mov` (MV-HEVC + APMP signaling) | visionOS 26+: Files/Quick Look, Safari, AVKit apps |

**This doc covers the APMP VR180 tier** — the fast, simple flavour for
iteration and platforms beyond Apple. **Genuine AIVU mastering has its own
full kit and manual: `AIVU_MASTERING.md`** (config-driven C4D/Redshift
template → Resolve 20.1+ PanoMap reprojection → Vision Pro Review/Bundle
delivery → Apple Immersive Video Utility).

Both tiers require **visionOS 26**; earlier visionOS only plays windowed
spatial video.

---

## 1 · Render 180° stereo from C4D

Run **`c4d_vr180_setup.py`** (after the rig script). It:

- sets the render to **4096×4096 per eye** (square = 180°×180°), EXR
  sequences, `$take` paths, L/R takes marked — same handoff contract as the
  windowed path;
- **forces Off-Axis Convergence OFF** on the rig. Film-shift convergence is
  meaningless in a spherical projection — depth comes purely from the
  physical baseline between the eye cameras;
- switches master + eye cameras to **spherical Lat-Long clamped to
  ±90°/±90°** = half-equirectangular 180 (Standard/Physical). If your C4D
  version doesn't expose those params to Python, the dialog tells you and you
  set it by hand: *Camera → Spherical: Enable, Mapping Lat-Long,
  Longitude −90..+90, Latitude −90..+90*.

**Renderer notes**

- **Redshift / Octane / Arnold**: the native spherical camera is ignored —
  use the renderer's own lens. For VR180, a spherical lens clamped to the
  same lat/long limits per eye camera (half-equirect). Note Redshift has
  **no stereo fisheye**: for the genuine-AIVU path you use one RS **Stereo
  Spherical** camera (both eyes, equirect) and reproject in Resolve — the
  template builder in `AIVU_MASTERING.md` sets that up. Keep the projection
  consistent across both eyes and the whole show.
- Simple twin parallel spherical cameras are the standard CG VR180 approach:
  stereo is exact at the view centre and softens toward the edges — fine for
  front-facing content. If your renderer offers **ODS / omnidirectional
  stereo** ("stereo spherical" in Redshift), it fixes edge stereo and pole
  handling; use it with the same 6.4 cm baseline and render each eye via the
  L/R takes as usual.

**Immersive shooting rules** (different instincts than the windowed path):

- **Interaxial locked to human: 6.3–6.5 cm.** The world plays life-size
  around the viewer; a stylised interaxial re-scales reality and reads as
  miniature/giant — nauseating at 180°. The depth-budget calculator and the
  1/30 rule are *windowed-screen* tools — they don't apply here.
- Nothing closer than ~1 m to camera. No frame edge exists to protect, but
  near-field geometry at high disparity is fatiguing.
- Horizon level, camera at natural eye height (seated ~1.2 m / standing
  ~1.65 m), no handheld shake, moves slow and axis-aligned or locked off.
- **Frame rate: 90 fps native for AIV; treat 60 as the CG floor.** 24/30
  judders badly in a headset.

## 2 · Finish in DaVinci Resolve Studio 20+

Resolve Studio 20 added the Apple Immersive workflow (built around the URSA
Cine Immersive, but CG conforms fine):

1. Timeline at your per-eye resolution/fps; conform the L/R sequences to a
   stereo clip exactly as in the windowed guide (§2–3 there).
2. Grade **linked** only. In immersive there is **no convergence/HIT and no
   floating windows** — those are window-plane concepts. Depth problems get
   fixed in CG (baseline, layout), never in post.
3. QC on the flat monitor with anaglyph/difference for L/R registration, but
   sign off **in the headset** — Resolve 20's immersive viewer can preview to
   a Vision Pro on the same network; otherwise QC the packaged file (below).

## 3 · Package & deliver

### Route 1 — APMP VR180 (recommended for CG)

Export a **full-width SBS half-equirect** master (or discrete eyes) from
Resolve — ProRes 422 HQ — then:

```bash
python3 package_spatial.py --left shot_L.mov --right shot_R.mov \
    --out shot_vr180.mov --projection hequ \
    --focal 36 --sensor 36 --interaxial-cm 6.4 --run
```

`--projection hequ` marks the MV-HEVC as half-equirect VR180 (APMP). Needs a
current `spatial` CLI (2.x — APMP support arrived with visionOS 26; run
`spatial make --help` to confirm the flag set). Alternatives: Apple
Compressor's APMP/immersive settings, or `avconvert` /AVFoundation for
re-signaling existing VR180 files (Canon EOS VR etc.).

### Route 2 — `.aivu` (Apple Immersive Video Universal)

Genuine AIVU is its own pipeline with its own kit — **`AIVU_MASTERING.md`**:
`aivu_pipeline.json` (shared numbers) → `c4d_aivu_template_builder.py`
(RS Stereo Spherical template) → `resolve_aivu.py` (conform/deliver via the
saved Vision Pro presets) → Apple Immersive Video Utility acceptance. Don't
try to reach `.aivu` by re-tagging this route's files — the parametric
projection + ILPD only come from the Resolve immersive delivery.

### Route 3 — quick review compromise

While iterating, package APMP VR180 at 2880×2880/eye 60 fps — fast to render,
fast to encode, AirDrops straight to the headset.

## 4 · Review on device

- **APMP files**: AirDrop or Files → open → Quick Look plays it immersive.
- **`.aivu` files**: open from Files on visionOS 26, or use the
  **Apple Immersive Video Utility** (free, macOS + visionOS): import AIVU
  masters on the Mac, build playlists, and stream/sync playback to one or
  several Vision Pros over Wi-Fi — the right tool for directed client
  reviews.
- **QC checklist**: depth reads life-size (not miniature) · horizon locked ·
  no near-field strain · L/R registration clean at the edges/poles ·
  motion smooth (fps) · no vignette/black beyond 180° seam.

## Gotchas

| Symptom | Cause → fix |
| --- | --- |
| World feels like a diorama / gigantic | Interaxial ≠ human → lock 6.3–6.5 cm and re-render |
| Warped, bowed world | Projection mismatch (fisheye master tagged hequ, or vice versa) → re-tag/re-render consistent |
| Double vision at screen edges | Parallel-twin edge falloff too visible → keep action frontal, or move to ODS rendering |
| Depth collapses at centre | Convergence was baked (film shift ON) into a spherical render → re-render with the vr180 script (it forces it off) |
| Plays flat / won't open on device | visionOS < 26, or metadata missing → update OS, re-package |
| Judder on pans | 24/30 fps in a headset → 60 minimum, 90 target |
| `.aivu` won't import to the Utility | Not a valid AIVU (plain MV-HEVC renamed?) → master via Resolve 20 immersive deliver or ImmersiveMediaSupport |

---

*Scope note: true Apple Immersive mastering parity means 90 fps at very high
per-eye resolutions (the URSA masters at 8160×7200/eye) — budget render time
accordingly, and treat 4096²@60 APMP as the working format until final.*
