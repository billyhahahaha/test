# DaVinci Resolve Studio → Apple Vision Pro

How to take the L/R renders out of Cinema 4D, finish them in **DaVinci Resolve
Studio** (stereo 3D tools are Studio-only — the free version won't do this),
and deliver an **MV-HEVC spatial video** that plays with real depth on Vision
Pro.

## What you're delivering

| Property | Target |
| --- | --- |
| Container / codec | QuickTime `.mov`, **MV-HEVC** (multiview HEVC, both eyes in one stream) |
| Per-eye resolution | up to 4K per eye — 3840×2160 (what `c4d_export_setup.py` renders) is a strong target; 1920×1080 is fine for review |
| Frame rate | 30 or 60 fps (match your C4D doc; don't deliver odd rates) |
| Bit depth / color | 10-bit HEVC, Rec.709 SDR first pass (P3-D65 PQ HDR once the SDR pass is approved) |
| Bitrate | ~50 Mbps at 4K-per-eye is a good review target |
| Spatial metadata | baseline (mm), horizontal FOV, disparity adjustment — without these it plays flat |

A plain HEVC file, or an SBS file without MV-HEVC packaging, will play as a
flat 2D movie on the device. The metadata is not optional.

## 1 · Handoff from C4D

`c4d_export_setup.py` leaves you with two matching image sequences:

```
renders/<project>/L/<project>_L_0000.exr ...
renders/<project>/R/<project>_R_0000.exr ...
```

Same frame count, same start number, same resolution — that's the contract.
EXRs are **linear**; you'll assign the input transform in Resolve.

Convergence policy (decide once, per project):

- **Parallel renders** (rig's *Off-Axis Convergence* **OFF**) — recommended
  for Vision Pro. Depth placement happens later (Resolve convergence or
  `--hadjust` at packaging), so it stays adjustable after render.
- **Baked off-axis** (checkbox ON) — fine too; the zero-parallax plane you set
  in C4D becomes the window plane. Then converge **nowhere else**: leave
  Resolve convergence and `--hadjust` at zero. Converging twice compounds
  disparity and breaks the depth budget.

> **Automation:** `resolve_auto_conform.py` scripts §2–§3 (project, import,
> timelines), mirrors grades between eyes, renders the masters and runs the
> Route C packaging — everything below except the grade and the native
> stereo-clip pairing. See `RESOLVE_AUTOMATION.md`.

## 2 · Resolve Studio project setup

1. New project; timeline = **per-eye** resolution and fps (3840×2160 @ your fps).
2. Color management: *DaVinci YRGB Color Managed* (or ACES if that's house
   style). Set the EXR input transform to **Linear** (Rec.709 primaries out of
   a default C4D/Redshift setup, or tag ACEScg if you rendered ACES); output
   Rec.709 for the SDR pass.

## 3 · Build the stereo clips

1. Media page: bring both sequences into the Media Pool (keep `L`/`R` bins).
2. Select the matching L and R clips → right-click → **Convert to Stereo 3D**
   (greyed out? attributes differ — fps/resolution/length must match, and you
   must be on Studio).
3. The pair collapses into one stereo clip. Edit with it like any clip.

## 4 · Stereo finishing (Color page → Stereo 3D palette)

- **Grade linked**: grade the left eye, keep L/R ganged (`Ripple Link`) so both
  eyes stay identical. Only ever unlink to fix a render fault.
- **Alignment**: CG renders from this rig need **zero** vertical/rotation
  fix-ups. If Resolve's auto-align wants to move anything, suspect the render
  (eye cameras touched by hand?) rather than accepting the fix.
- **Convergence**: for parallel renders, set depth placement per shot here —
  or leave it for packaging (`--hadjust`) if you want one global setting.
  Positive convergence pushes the scene behind the window.
- **Floating windows**: anything popping out that touches frame edge = window
  violation → mask a floating window or recompose.
- **QC modes**: the palette's anaglyph view (cheap red/cyan glasses) for depth
  review; difference mode to confirm the eyes register at the window plane.
- **Depth budget**: `stereo_parallax_calc.py` numbers still apply — on Vision
  Pro, spatial video plays in a virtual window a couple of metres wide by
  default; run the calculator with `--screen-width 2500` as a sanity pass and
  keep background disparity conservative. Viewers can scale the window up, so
  divergence headroom matters more than on a fixed TV.

## 5 · Export — three routes

### Route A — straight out of Resolve (fewest moving parts)

Resolve Studio **18.6.5+** on an **Apple Silicon Mac** can render MV-HEVC
spatial clips directly: Deliver page → Format **QuickTime**, Codec **H.265**
— on a stereo timeline the codec panel exposes the MV-HEVC / spatial-video
option (wording shifts between 18.6/19/20; look in the H.265 advanced
settings). Fill in baseline/FOV metadata if your version offers the fields
(65 mm / your rig's FOV), render, done.

### Route B — ProRes masters + Apple Compressor

1. Deliver from Resolve as ProRes 422 HQ: either one **full-width side-by-side**
   master (stereo timeline output mode SBS) or two discrete eye masters.
2. In Compressor (4.7.1+): QuickTime setting, video codec **MV-HEVC**, frame
   layout side-by-side, then enter **baseline** (interaxial in mm, e.g. 65),
   **field of view** (your rig: `2*atan(sensor/2·focal)` — 53.13° for the
   36 mm/36 mm default), and **horizontal disparity adjustment** (0 unless
   parallel renders, see above).

### Route C — `package_spatial.py` (scripted, repeatable)

Wraps ffmpeg + the `spatial` CLI and derives the metadata from your rig
numbers, so it can't drift from the renders:

```bash
python3 package_spatial.py --left shot_L.mov --right shot_R.mov \
    --out shot_spatial.mov --focal 36 --sensor 36 --interaxial-cm 6.5 --run
```

Dry-runs by default (prints the exact ffmpeg/spatial commands); `--run`
executes. `--hadjust 0.01..0.03` sets packaging-time convergence for parallel
renders.

## 6 · Onto the device

- **AirDrop** the `.mov` to the Vision Pro → lands in **Photos** as a Spatial
  video (depth badge on the thumbnail).
- Or put it in iCloud Drive / **Files**, open with Quick Look.
- For client review at scale, TestFlight an AVKit player or use any spatial
  video review app — AVKit plays MV-HEVC natively.

**On-device QC checklist**

1. Thumbnail shows the spatial badge; playback offers the immersive treatment
   (if it plays flat → metadata missing, re-package).
2. Window plane sits where you placed zero parallax (hero on/near the window).
3. Look at the deepest background for several seconds — no eye strain
   (divergence). Scale the window bigger and re-check.
4. Nothing with pop-out clips the window edges.
5. Depth direction correct — if the scene looks hollow/inverted, eyes are
   swapped: flip `--primary`, or Swap Eyes upstream.

## Gotchas

| Symptom | Cause → fix |
| --- | --- |
| Plays flat in Photos | Not MV-HEVC / metadata stripped (re-encoded by a share service?) → re-package, AirDrop directly |
| Depth inverted / cardboard-hollow | L/R swapped somewhere → fix at one place only (rig Swap Eyes, Resolve, or `--primary`) |
| Everything floats uncomfortably in front of the window | Converged twice (baked in C4D **and** Resolve/`--hadjust`) → converge exactly once |
| Eye strain on far backgrounds | Disparity too hot for a scalable window → lower interaxial in C4D or pull zero parallax deeper; re-check calculator at bigger `--screen-width` |
| `Convert to Stereo 3D` greyed out | Free Resolve (needs Studio) or L/R attributes mismatch → check fps/res/length |
| Colors shift between eyes | Eyes graded unlinked → re-gang, copy grade L→R |

---

*Beyond spatial video: for full 180° immersion — **Apple Immersive Video
(`.aivu`)** and APMP VR180 — switch to `c4d_vr180_setup.py` on the C4D side
and follow `APPLE_IMMERSIVE_180.md`. Different rules apply there (human-locked
interaxial, parallel eyes, no convergence anywhere, 60–90 fps).*
