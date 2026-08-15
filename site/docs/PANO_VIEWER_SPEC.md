# PANO / WEBGL VIEWER — CANONICAL SPEC

The panorama viewer was already built and tuned. It is not to be reimplemented from scratch.

**Canonical implementation:** `public/stereo/pano.html` on branch `claude/stereoscopic-footage-web-r2mrw0` of this repo — a single-file, dependency-free WebGL2 viewer (works over `file://` by double-click).
Direct link: https://github.com/billyhahahaha/test/blob/claude/stereoscopic-footage-web-r2mrw0/public/stereo/pano.html

Any pano moment on the site starts from that file. Below are the settings that were derived the hard way; a pass that drops any of them is wrong, not simplified.

## Projection — the part that gets faked

- **WebGL2, per-pixel ray cast.** A fragment shader casts a pinhole ray per pixel and samples the source. No CSS transforms, no `background-position` pans, no pre-warped crops. Those are not panoramic viewers.
- **Equirect 180° and 360°** (`u_span` 1.0 / 2.0): `lon = atan(x, −z)`, `lat = asin(y)`; out-of-coverage → black, `uv.x` wrapped only at 360.
- **Fisheye = equisolid**, because that is what immersive rigs record: `r = sin(θ/2) / sin(fovHalf/2)`, angle-off-axis to radius, NOT longitude. Sampling fisheye as equirect is exactly the "squashed frame" failure. Lens angle is user-adjustable **120°–230°, default 180°** — the imaged circle is often cropped by the frame, so it must be tunable, not hardcoded.
- **Stereo frame unpacking:** layouts mono / side-by-side / over-under (`u_layout`), one eye picked out (`u_eye`); auto-detect from aspect — >3.4 → sbs, <0.7 → tb; square eye ⇒ 180° content.

## Framing law

- FOV is quoted for a **16:9 window**. Hold the **vertical** framing constant and let width follow the window, with the horizontal half-angle **capped at 60°** — otherwise a short wide window silently pushes past 120° and rectilinear projection smears the edges, which reads as "warped footage".
- View FOV clamped **~25°–115°** (0.44–2.0 rad). Pitch clamped ±1.25 rad.
- DPR capped at 2.

## Interaction

- Drag to look (scale = fov / canvasWidth), flick inertia with **0.94 decay**, pinch to zoom, wheel zoom (×(1 + deltaY·0.0015)), arrows step 0.12·fov, double-click resets, `f` fullscreen, space play/pause.

## Video handling (Safari-hardened)

- The `<video>` element **stays in the document** (offscreen at −9999px) — off-document video decodes unreliably in Safari; this is the difference between frames and a black screen.
- Muted + playsInline for autoplay; on block, say so.
- **Never a silent black frame.** Status readout for loaded/stalled/error; explicit codec message (needs H.264 MP4; HEVC unreliable outside Safari; ProRes/APV/MV-HEVC never decode in a browser); an 8-second no-frames watchdog.

## Site-brief obligations (block 6 of MASTER_BRIEF.md)

- Entered deliberately — never autoloaded behind a scroll.
- Static poster that reads fully before anything streams.
- No-WebGL, low-power, and reduced-motion each get a real answer, not a blank box.
- Never autoplay with sound. Never block first paint on a viewer.
