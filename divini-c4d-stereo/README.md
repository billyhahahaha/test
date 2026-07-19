# Divini — Stereoscopic Setup for Cinema 4D

Everything needed to shoot, check and deliver stereoscopic 3D out of Cinema 4D
for the Divini project: a one-click camera rig, a depth-budget calculator, and
the workflow for both C4D's native stereo renderer and third-party renderers
(Redshift / Octane / Arnold).

| File | What it is |
| --- | --- |
| `divini_stereo_rig.py` | Script Manager script — builds the stereo camera rig in the open scene |
| `divini_parallax_calc.py` | Standalone Python — turns rig numbers into on-screen parallax + comfort warnings |
| `README.md` | This guide |

---

## Quick start (60 seconds)

1. In C4D: **Extensions → Script Manager → File → Open…** → `divini_stereo_rig.py` → **Execute**.
2. You get `CAM_Divini_Stereo` with `_L` / `_R` eye cameras parented under it.
   **Animate only the master.** All stereo controls are in the master camera's
   **User Data** tab.
3. Put the **Zero Parallax Distance** on (or just in front of) your subject.
   Keep **Interaxial ≈ Zero Parallax ÷ 30** as a starting point.
4. Render:
   - **Standard / Physical** → render the master camera; stereo output is
     already enabled in Render Settings (Path A below).
   - **Redshift / Octane / anything else** → render `_L` and `_R` as two takes
     (Path B below).

## The rig

```
CAM_Divini_Stereo          master — animate this, tweak User Data here
├─ Divini Stereo Driver    Python tag (keeps the eyes honest every frame)
├─ CAM_Divini_Stereo_L     left eye  (red)   — do not touch
└─ CAM_Divini_Stereo_R     right eye (cyan)  — do not touch
```

The driver tag locks each eye's lens (focal, sensor, focus distance,
projection) to the master, offsets it ±Interaxial/2 on X, and converges via
**horizontal film shift** (off-axis):

```
Film Offset X per eye = ±(Interaxial/2) · focal / (ZeroParallax · sensor width)
```

The optical axes stay **parallel** — the cameras are never rotated inward.
Toe-in convergence produces keystone distortion and vertical parallax, which is
the number-one cause of eye strain in amateur stereo. This rig can't do it.

### Controls (User Data on the master)

| Control | Meaning | Starting point |
| --- | --- | --- |
| **Interaxial** | Eye separation in scene units | 6.5 cm = human scale; ~Z0/30 |
| **Zero Parallax Distance** | Distance that lands exactly on the screen plane | On your subject |
| **Off-Axis Convergence** | ON: converge via film shift (screen/TV/cinema). OFF: strictly parallel rig (VR180 / Apple spatial — converge in post with HIT) | ON for flat screens |
| **Swap Eyes** | Flip L/R assignment | Off |

Interaxial is the *depth volume* knob (bigger = more roundness, more parallax,
faster into discomfort; smaller = flatter, safer — scenes read miniature when
interaxial is too big for the subject, gigantic when too small). Zero parallax
is the *placement* knob — it slides the whole scene forward/back through the
screen plane without changing roundness. Animate zero parallax gently; never
cut between wildly different depth placements.

## Path A — native C4D stereo (Standard / Physical)

The script pre-configures this; for reference, the manual steps:

1. Master camera → **Stereoscopic** tab: Mode **Symmetrical**, Placement
   **Off Axis**, Eye Separation = interaxial, Zero Parallax = your distance,
   **Auto Planes** on.
2. **Render Settings → Stereoscopic**: enable **Calculate Stereoscopic Images**.
   - **Merged Stereoscopic Image ON** → one anaglyph/side-by-side/interlaced
     file per frame (pick under *Stereoscopic Mode*). Anaglyph is perfect for
     dailies with red-cyan glasses.
   - **Merged OFF** → discrete L and R image streams — what you want for
     finishing/DCP/MV-HEVC.
3. Viewport check: with the master camera active, the view panel's
   **Options → Stereoscopic** shows live anaglyph in the viewport.

Note: C4D's native stereo is Standard/Physical only — Redshift ignores the
Stereoscopic tab entirely. Hence Path B.

## Path B — Redshift / Octane / Arnold (render the eyes directly)

1. Open the **Takes** manager. Create takes `L` and `R`.
2. In each take, override the scene camera: `L` → `CAM_Divini_Stereo_L`,
   `R` → `CAM_Divini_Stereo_R` (right-click the camera in the take: *Use as
   Scene Camera*).
3. Set output paths with the take token, e.g. `.../divini_$take/frame_$frame`,
   and render both takes (Render All Marked Takes / Team Render both).
4. The driver tag already applied film-shift convergence to the eye cameras,
   so the L/R streams line up at the zero-parallax plane with no post shift
   needed. (Film Offset X is respected by Redshift, Octane and Arnold on the
   classic C4D camera.)

If you use a dedicated **Redshift camera** object, parent two RS cameras under
the master in the same `_L`/`_R` layout — the driver tag drives any camera
children by name; RS cameras expose the same C4D film-offset parameters.

## Choosing numbers — the depth budget

- **1/30 rule.** Interaxial ≈ Zero Parallax ÷ 30 is the classic safe start for
  screen delivery. Tighten to 1/60 for close-ups, macro, or long lenses; loosen
  for aerials/landscapes where nothing is close.
- **Long lenses flatten, wide lenses round.** Parallax scales with focal
  length: at 100 mm the same interaxial produces ~3× the parallax of 36 mm.
  Re-run the calculator whenever the lens changes.
- **Screen size is part of the format.** Parallax that's comfortable on a
  laptop diverges eyes on a cinema screen. Decide the biggest delivery screen
  *first*, then budget:
  - Background (uncrossed) parallax on screen must stay **under ~63 mm**
    (human interocular) — beyond that eyes diverge. Hard limit.
  - Pop-out (crossed) parallax: keep within **~2% of screen width** for
    sustained shots; short stabs can exceed it.
- **Screen-edge rule.** Anything with negative parallax must not touch the
  frame edge (a "window violation" — the stereo window says *behind* while
  parallax says *in front*). Recompose, push it behind the screen, or mask a
  **floating window** in post.
- **Never any vertical parallax.** The rig can't create it; sloppy post can.

Check any setup before rendering:

```bash
python3 divini_parallax_calc.py --interaxial 6.5 --zero-parallax 200 \
    --focal 36 --sensor 36 --screen-width 1440 \
    --distances 80 150 200 400 inf
```

It prints per-distance parallax (% of width and mm on the delivery screen),
flags divergence and blown pop-out budgets, and suggests the maximum
divergence-safe interaxial for that screen.

## Verify the rig (2-minute sanity pass)

1. Drop a cube exactly at the Zero Parallax Distance, render L and R (or use
   viewport anaglyph): the cube must **coincide exactly** in both eyes.
2. A near object must sit further **right in the LEFT eye** than in the right
   eye (crossed = pop-out). If depth feels inside-out or weirdly miniature,
   the eyes are swapped — toggle **Swap Eyes**.
3. Scrub the animation: distant objects drift apart (behind screen), near
   objects cross. Nothing should ever move vertically between eyes.

## Delivery

| Target | What to hand over |
| --- | --- |
| Dailies / review | Merged anaglyph renders (Path A) or L/R comped to red-cyan; cheap glasses |
| 3D TV / YouTube "yt3d" | Side-by-side (full or half width); YouTube needs SBS + 3D flag on upload |
| Cinema / DCP | Discrete L+R streams, finish in Resolve, 3D DCP (L/R at 48 fps interleaved) |
| **Apple Vision Pro spatial video** | Render with **Off-Axis Convergence OFF** (parallel) at human 6.3–6.5 cm interaxial, discrete L/R, then package as **MV-HEVC** with Apple Compressor (or the `spatial` CLI) with correct baseline + FOV metadata; set convergence/disparity shift (HIT) at packaging time, not in camera |
| VR180 | Parallel rig, fisheye/equirect per eye via a 180° lens (renderer-side), L/R stacked or SBS per platform spec |

## Troubleshooting

| Symptom | Cause → fix |
| --- | --- |
| Everything looks like a tiny model | Interaxial too big for the scene → reduce, or move zero parallax closer |
| Eyes ache on the big screen | Divergence: background parallax > 63 mm → reduce interaxial or pull zero parallax deeper |
| Doubled edges on the hero | Subject too far from zero parallax → put Z0 on the subject |
| Depth feels inverted | L/R swapped → toggle **Swap Eyes** |
| Keystone / vertical misalignment | Cameras were rotated or eye cams touched by hand → let the driver tag own them (it re-locks every frame) |
| Redshift output isn't stereo | Native stereo tab is Standard/Physical only → use Path B takes |
| Object at Z0 doesn't line up | Someone disabled the driver tag or Off-Axis Convergence is OFF → re-enable |

---

*Scene-unit note: all distance controls are in scene units (cm in a default
C4D document). The math is unit-agnostic as long as interaxial and zero
parallax use the same unit.*
