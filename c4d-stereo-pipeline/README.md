# Stereoscopic Pipeline — Cinema 4D → DaVinci Resolve Studio → Apple Vision Pro

A complete stereo 3D pipeline: build a correct stereoscopic camera rig in
Cinema 4D, render matched L/R passes, finish in DaVinci Resolve Studio, and
deliver MV-HEVC spatial video to Apple Vision Pro.

| File | Stage | What it does |
| --- | --- | --- |
| `c4d_stereo_rig.py` | 1 — shoot | Script Manager script — builds the stereo camera rig in the open scene |
| `c4d_export_setup.py` | 2 — render | Sets Render Settings + L/R Takes for the Resolve handoff |
| `RESOLVE_TO_VISIONPRO.md` | 3 — finish & deliver | Resolve Studio stereo conform/grade + MV-HEVC spatial export, on-device QC |
| `package_spatial.py` | 3b | Scripted MV-HEVC packaging (ffmpeg + `spatial` CLI), metadata derived from rig numbers |
| `stereo_parallax_calc.py` | any | Depth-budget calculator — on-screen parallax + comfort warnings |

---

## Quick start

1. **Rig** — In C4D: **Extensions → Script Manager** → open `c4d_stereo_rig.py`
   → **Execute**. Animate the `CAM_Stereo` master; stereo controls are in its
   **User Data** tab. For Vision Pro delivery, set **Off-Axis Convergence OFF**
   (parallel eyes — converge later); for TV/cinema leave it ON.
2. **Export** — Run `c4d_export_setup.py` the same way, then
   **Render → Render All Marked Takes**. You get matching
   `renders/<prj>/L/` and `/R/` EXR sequences (3840×2160 per eye).
3. **Finish & deliver** — Follow `RESOLVE_TO_VISIONPRO.md`: conform the pair to
   a stereo clip in Resolve Studio, grade linked, then export MV-HEVC (native,
   Compressor, or `package_spatial.py`) and AirDrop to the headset.

## The rig

```
CAM_Stereo                 master — animate this, tweak User Data here
├─ Stereo Driver           Python tag (keeps the eyes honest every frame)
├─ CAM_Stereo_L            left eye  (red)   — do not touch
└─ CAM_Stereo_R            right eye (cyan)  — do not touch
```

The driver tag locks each eye's lens (focal, sensor, focus distance,
projection) to the master, offsets it ±Interaxial/2 on X, and converges via
**horizontal film shift** (off-axis):

```
Film Offset X per eye = ±(Interaxial/2) · focal / (ZeroParallax · sensor width)
```

The optical axes stay **parallel** — the cameras are never rotated inward.
Toe-in convergence produces keystone distortion and vertical parallax, which
is the number-one cause of eye strain in amateur stereo. This rig can't do it.

### Controls (User Data on the master)

| Control | Meaning | Starting point |
| --- | --- | --- |
| **Interaxial** | Eye separation in scene units | 6.5 cm = human scale; ~Z0/30 |
| **Zero Parallax Distance** | Distance that lands exactly on the screen/window plane | On your subject |
| **Off-Axis Convergence** | ON: converge via film shift (TV/cinema). OFF: strictly parallel rig (Vision Pro spatial / VR180 — converge in Resolve or at packaging) | OFF for Vision Pro |
| **Swap Eyes** | Flip L/R assignment | Off |

Interaxial is the *depth volume* knob (bigger = more roundness, more parallax,
faster into discomfort; scenes read miniature when it's too big for the
subject, gigantic when too small). Zero parallax is the *placement* knob — it
slides the scene through the screen plane without changing roundness. Animate
it gently; never cut between wildly different depth placements.

## Rendering the eyes

- **Standard / Physical**: C4D's native stereo works — the rig script fills in
  the camera's Stereoscopic tab and Render Settings (Mode Symmetrical,
  Placement Off Axis; merged anaglyph for dailies, discrete L/R for finishing).
- **Redshift / Octane / Arnold / anything**: native stereo is ignored, so
  render the `_L`/`_R` cameras directly. `c4d_export_setup.py` builds the two
  camera-overridden Takes and the `$take`-tokenised output path — one
  *Render All Marked Takes* renders both eyes. (Film Offset X is respected by
  the classic C4D camera in all major renderers. Using dedicated Redshift
  camera objects? Parent two RS cams as `..._L`/`..._R` under the master —
  the driver tag drives any camera children by suffix.)

## Choosing numbers — the depth budget

- **1/30 rule.** Interaxial ≈ Zero Parallax ÷ 30 is the classic safe start.
  Tighten to 1/60 for close-ups/macro/long lenses; loosen for aerials.
- **Long lenses flatten, wide lenses round.** Parallax scales with focal
  length — re-run the calculator whenever the lens changes.
- **Screen size is part of the format.** Uncrossed (background) parallax on
  the physical screen must stay under **~63 mm** (human interocular) — beyond
  that eyes diverge. Pop-out should stay within **~2% of screen width** for
  sustained shots. Vision Pro plays spatial video in a *scalable* window —
  budget for a big one (`--screen-width 2500`+).
- **Screen-edge rule.** Nothing with pop-out may touch the frame edge (window
  violation) — recompose, push behind the window, or float the window in
  Resolve.
- **Never any vertical parallax.** The rig can't create it; sloppy post can.

```bash
python3 stereo_parallax_calc.py --interaxial 6.5 --zero-parallax 200 \
    --focal 36 --sensor 36 --screen-width 2500 \
    --distances 80 150 200 400 inf
```

Prints per-distance parallax (% of width and mm on the delivery screen), flags
divergence and blown pop-out budgets, and suggests the max divergence-safe
interaxial for that screen.

## Verify the rig (2-minute sanity pass)

1. Drop a cube exactly at the Zero Parallax Distance, render L and R (or use
   viewport anaglyph): with Off-Axis Convergence ON the cube must **coincide
   exactly** in both eyes.
2. A near object must sit further **right in the LEFT eye** than in the right
   eye (crossed = pop-out). Depth feels inside-out or miniature? Eyes are
   swapped — toggle **Swap Eyes**.
3. Scrub the animation: distant objects drift apart (behind screen), near
   objects cross. Nothing should ever move vertically between eyes.

## Delivery cheatsheet

| Target | What to hand over |
| --- | --- |
| Dailies / review | Merged anaglyph renders (native path) or anaglyph out of Resolve; cheap red-cyan glasses |
| **Apple Vision Pro** | **MV-HEVC spatial video — full walkthrough in `RESOLVE_TO_VISIONPRO.md`** |
| 3D TV / YouTube 3D | Side-by-side (full or half width) + 3D flag on upload |
| Cinema / DCP | Discrete L+R streams, finish in Resolve, 3D DCP |
| VR180 | Parallel rig + 180° fisheye/equirect per eye (renderer-side lens), platform-specific packing |

## Troubleshooting (C4D side)

| Symptom | Cause → fix |
| --- | --- |
| Everything looks like a tiny model | Interaxial too big for the scene → reduce, or move zero parallax closer |
| Eyes ache on the big screen | Divergence: background parallax > 63 mm → reduce interaxial or pull zero parallax deeper |
| Doubled edges on the hero | Subject too far from zero parallax → put Z0 on the subject |
| Depth feels inverted | L/R swapped → toggle **Swap Eyes** |
| Keystone / vertical misalignment | Cameras rotated or eye cams touched by hand → let the driver tag own them (it re-locks every frame) |
| Redshift output isn't stereo | Native stereo tab is Standard/Physical only → render the L/R takes |
| Object at Z0 doesn't line up | Driver tag disabled, or Off-Axis Convergence is OFF (parallel is *supposed* to do this — converge downstream) |

Resolve/Vision Pro issues: see the gotchas table in `RESOLVE_TO_VISIONPRO.md`.

---

*Scene-unit note: all distance controls are in scene units (cm in a default
C4D document). The math is unit-agnostic as long as interaxial and zero
parallax use the same unit.*
