# AIVU Mastering — genuine Apple Immersive Video, seamlessly

The full-immersion flagship path: C4D/Redshift equirect 180 stereo →
Resolve Studio 20.1+ reprojection → **`.aivu`**. Built around one config file
so every stage carries the same numbers, with everything template-able
templated. Grounded in the verified pipeline spec in
`reference/AIVU_Pipeline_C4D_Redshift_Resolve.md` — read that once; this is
the operating manual.

**The one thing that changes everything:** Apple Immersive Video is a
**parametric fisheye projection (`prim`) driven by ILPD lens-calibration
metadata** — not equirect, not VR180, not a generic fisheye remap. Encoding
your equirect as-is gives you VR180 (`hequ` — the `APPLE_IMMERSIVE_180.md`
tier). Genuine AIVU requires the **reprojection into Apple's immersive
lens-space, which Resolve Studio 20.1+ does (Fusion PanoMap)**, plus the
ILPD/AIME metadata Resolve's Vision Pro delivery writes. Compressor cannot
do the reprojection. Redshift has no stereo fisheye — equirect + reproject
IS the C4D path.

## The kit

| Piece | Role |
| --- | --- |
| `aivu_pipeline.json` | **Single source of truth** — resolution, fps, separation, names, Resolve keys/presets. Every tool reads it. |
| `c4d_aivu_template_builder.py` | Builds the C4D template: RS Stereo Spherical camera + AIV render preset, from the config |
| `c4d_aivu_template_checker.py` | Read-only ✓/⚠ audit of camera + render settings (run after builder, and before any overnight render) |
| `resolve_aivu.py` | `discover` / `conform` / `deliver` — the Resolve automation |
| `presets/PanoMap_LatLong_to_Immersive.setting` | Drop-in reprojection node (scaffold → becomes permanent after one UI save) |
| `reference/` | The verified pipeline spec, Fusion PanoMap recipe, Resolve MCP audit |
| `SHOT_CHECKLIST.md` | The per-shot run sheet |

## Locked numbers (from the config)

**C4D / Redshift:** Stereo Spherical camera, 180°×180°, **Separation 6.4**
(scene at real-world scale, 1 unit = 1 cm — the depth model depends on it),
parallel eyes, **4320×4320 per eye** (SBS 8640×4320), **90 fps**, OpenEXR
**16-bit half** (save as 32-bit + tick *Use 16 Bit Floats*), scene-linear
**ACEScg**, no display transform baked. Scene hygiene: camera at eye height
(seated ~110–120 cm, standing ~160–165 cm), level horizon, subjects ≥ 0.5–1 m,
slow motivated moves.

**Resolve:** project *Immersive workflows = Apple Immersive* (NOT Standard
Immersive — that's the VR180 lane), 90 fps timeline, **P3-D65 / ST2084 PQ**,
master 1000-nit with CST mapping to **108 nits** for Vision Pro. CG with no
real lens: Resolve applies its default **("gap") ILPD** automatically —
legitimate per Apple ("real or virtual lens"), but QC it.

## One-time setup (build once, reuse forever)

| # | Item | Scripted? | How |
| --- | --- | --- | --- |
| 1 | C4D template scene (camera + render preset) | ✅ | `c4d_aivu_template_builder.py`, audit with checker, **save as template .c4d** |
| 2 | Resolve project settings (immersive workflow, fps, color) | ⚙ semi | `resolve_aivu.py discover --write` learns this build's key names, `conform` applies them; first time may need the UI clicks (Project Settings → Master → Immersive workflows → Apple Immersive; color to P3-D65 PQ) |
| 3 | Deliver preset **AIVU_VisionPro_Review** (direct `.aivu`, QC-grade) | ❌ UI once | Deliver page → Vision Pro Review → save preset under exactly this name → `deliver` loads it forever |
| 4 | Deliver preset **AIVU_VisionPro_Bundle** (ProRes + AIME + FCPXMLD, finals) | ❌ UI once | Deliver page → Vision Pro Bundle → save preset |
| 5 | PanoMap reprojection preset | ⚙ semi | Drop `presets/PanoMap_LatLong_to_Immersive.setting` on an eye stream, set **LatLong → Immersive** in the Inspector, re-save over the file → permanent drop-in |
| 6 | (Optional) custom ILPD | ❌ UI | Project Settings → Apple Immersive → assign; otherwise default gap ILPD |

Items 3–5 are genuinely un-file-authorable (Resolve stores them build-side) —
that's ~10 minutes of UI, once, and the scripts pick them up by name after.

## Per shot (the seamless loop)

```
1  C4D: open template  ▸ set scene  ▸ checker ✓  ▸ Render (overnight)
2  resolve_aivu.py conform --renders <STEREO_EXR folder>
3  Fusion: drop the PanoMap .setting on each eye stream        (~30 s)
4  Grade (PQ, 108-nit output)
5  resolve_aivu.py deliver [--bundle] --out <masters>
6  Review: .aivu ▸ Apple Immersive Video Utility ▸ AirDrop/Wi-Fi ▸ headset
   Bundle: Utility ▸ drag folder ▸ Create .aivu (P3-D65 PQ ✓) ▸ headset
```

Detailed run sheet with checkboxes: `SHOT_CHECKLIST.md`.

## Acceptance test — every deliverable

Open in **Apple Immersive Video Utility** and confirm **in the headset**:
true AIV wrap (not a VR180 look-alike), life-size depth, level horizon,
comfort on the deepest background, no pole-stretch artifacts from the
reprojection. Review encodes (Video Toolbox) are QC-grade — finals go
through the Bundle → Utility route. This is the "is it really AIV" gate.

## Honest caveats (carried from the verified spec)

- Synthetic/default ILPD on reprojected equirect CG is *legitimate but
  unproven by Apple recipe* — prototype and QC before promising a client.
- Equirect → immersive round-trip costs some pole fidelity. The
  highest-fidelity route is rendering CG **directly in immersive lens-space
  with Fusion Renderer3D** (no equirect) — worth a test for hero shots.
- 90 fps path-traced CG is expensive (~15–16 min/frame on the Cadillac
  test). Budget render time; supersample ~4600–5000/eye and downscale with
  Mitchell when edges shimmer.
- MV-HEVC delivery is macOS/Apple Silicon only.

## Automation notes

`resolve_aivu.py` follows the division of labor from
`reference/Resolve_MCP_Audit_and_AIVU_Gaps.md`: scripting owns project
setup, import, clip attributes, timeline and preset-driven delivery;
the PanoMap comp and Deliver presets are UI-built once. The `discover`
subcommand exists because Resolve's immersive setting keys are unpublished —
it dumps and learns your build's real keys instead of guessing, and
`--write` stores them in `aivu_pipeline.json` so conform is fully automatic
from then on. If you later wire this into a Resolve MCP server, the same
config + discovered keys are exactly what its missing
`set_project_setting` / `set_clip_property` / `load_render_preset` tools
should call.
