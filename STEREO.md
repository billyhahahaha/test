# Stereo Bench

A stereoscopic footage player and QC bench that runs entirely in a browser tab.
Lives at **`/stereo/`**, deploys with the rest of `public/`, and shares nothing
with the golf app in this repo beyond the static host.

Two jobs:

1. **Play stereo footage properly** — on a flat screen, through cheap optics, on
   3D-capable displays, and in a headset over WebXR.
2. **Tell you whether the footage is any good** — depth budget, vertical
   misalignment and roll, measured live off the GPU.

No build step, no framework, no dependencies. Nothing leaves the device.

```bash
npm install
npm run dev        # then open http://localhost:<port>/stereo/
```

## Loading footage

Drag a file onto the stage, use **Open file…**, or paste a URL. Video and still
pairs both work.

Frame layout is auto-detected from the aspect ratio and the filename, and can be
overridden. Per-eye aspect defaults to un-squeezing half-width SBS to 16:9;
override it if your footage is anamorphic or VR180.

| Packing | Detected from |
|---|---|
| Side-by-side (full or half) | aspect ≥ 3.0, or `sbs` / `lr` / `.jps` in the name |
| Over/under | aspect ≤ 1.05, or `ou` / `tb` / `over-under` in the name |
| Mono | anything else |

### MV-HEVC / Apple spatial video

Plays as its **base (left) view only**. That isn't a limitation of this tool —
browsers expose no second-view API outside an immersive context. Convert to
side-by-side for anything cross-browser:

```bash
# spatial .MOV -> full side-by-side
ffmpeg -i spatial.MOV -filter_complex "[0:v:0][0:v:1]hstack=inputs=2" \
  -c:v libx264 -crf 18 -pix_fmt yuv420p sbs.mp4

# full SBS -> half SBS (same pixel budget, squeezed)
ffmpeg -i sbs.mp4 -vf "scale=iw/2:ih" -c:v libx264 -crf 18 half_sbs.mp4
```

## View modes

| Mode | Key | What it's for |
|---|---|---|
| Anaglyph | `1` | Dubois red/cyan — least retinal rivalry of the anaglyph matrices |
| Cross-eye / Parallel | `2` `3` | Free-viewing the pair, no hardware at all |
| Left / Right | `4` `5` | Isolating one eye |
| Wiggle | `6` | Alternating eyes. Reads as depth with no glasses — fastest sanity check there is |
| Difference | `7` | L−R. Vertical misalignment jumps out as coloured banding |
| Depth | `8` | The estimated disparity map |
| Parallax | `9` | Depth-driven view shift on pointer/gyro. Depth on a flat screen, no hardware |
| Cardboard | `0` | Split + barrel pre-warp for phone holsters |
| Interleaved | `-` | Row-interleaved, for passive 3D panels |
| SBS out | `=` | Untouched pass-through for AR glasses and 3D displays fed over HDMI/DP |

## Alignment and the meters

**Convergence** is horizontal image translation. Positive pushes the scene
behind the screen. It's the one creative control here; the other two are fault
correction.

**Vertical trim** and **roll trim** correct rig faults. **Auto-align** measures
the residual and applies it, iterating twice.

The analysis panel reports, all as percentages of eye width or height so the
numbers are resolution-independent:

- **depth budget / nearest / furthest / scene median** — where the scene sits
  relative to the screen plane. Under ~2% span is comfortable anywhere; past
  ~1.5% of *positive* parallax you start asking eyes to diverge on a big screen.
- **vertical error / roll error** — the misalignment between eyes. This is the
  measurement that predicts whether footage will hurt to watch.
- **coverage** — the share of the frame the matcher is confident about.
- **align confidence** — below 20% the SAD curve isn't localising and the
  alignment numbers are reported but not graded.

Thresholds are guidance, not gospel, and they assume a viewer at a normal
distance from a large screen or in a headset.

## WebXR

Two paths, and the difference is the reason to shoot stereo for headsets at all.

**Compositor layer** (preferred) — `XRMediaBinding` hands the `<video>` straight
to the XR compositor as a stereo quad or equirect layer, with `layout` set from
the detected packing. No copy into a WebGL texture, no resample, so you get the
panel's real resolution rather than a soft textured billboard.

**WebGL fallback** — an `XRWebGLLayer` and a per-eye ray-cast (flat plane or
equirect, no geometry). Used when the browser has no Layers support, when the
source isn't a decodable video, or **when alignment trims are active** — the
compositor samples the raw file, so it cannot honour them. The badge tells you
which path you got, and why.

## How this was verified

Driven headless through Chromium/SwiftShader against two sources with known
ground truth:

| Check | Truth | Measured |
|---|---|---|
| Uniform disparity, SBS plate | +1.458% | +1.48% |
| Convergence linearity, −5%…+2% | exact | error ≤ 0.06% across the range |
| Calibration card depth range | −3.0% … +3.0% | −3.65% … +2.94% |
| Vertical fault, injected into the card | +0.60% | +0.69% |
| Clean pair, vertical / roll | 0 / 0° | 0.09% / 0.02° |
| Auto-align residual | — | 0.01% / 0.00° |

The calibration card exists for exactly this: every plaque is drawn at its
labelled screen parallax, and the **Inject error** sliders dial a known vertical
or roll fault into the right eye so you can confirm the meter reports it back.
That tests the measurement, not the footage.

## Known limits

- Disparity is a low-resolution winner-takes-all block match, temporally
  smoothed. Good enough to read a depth budget and drive parallax; **not** a
  substitute for an offline solve. Repeating detail (fences, grids, brickwork)
  fools it — those matches get rejected and reported as pinned.
- Alignment resolves to roughly ±0.1% of height. Treat it as a screening tool.
- Parallax view stretches occlusion holes rather than filling them.
- Trims and the XR compositor path are mutually exclusive, by design.
- Separate left/right files aren't supported — mux to SBS first.

## Files

```
public/stereo/
  index.html          shell
  stereo.css          styles
  src/gl.js           WebGL2 helpers; display vs off-screen vertex shaders
  src/shaders.js      all GLSL — one shared eye-unpacking chunk
  src/formats.js      packing model, aspect handling, on-screen panel layout
  src/eye.js          the single place eye uniforms get set
  src/testcard.js     procedural calibration card + fault injection
  src/analysis.js     reduce -> disparity -> budget, and the alignment sweep
  src/renderer.js     flat-screen composite
  src/xr.js           WebXR, both paths
  src/main.js         state and UI wiring
```
