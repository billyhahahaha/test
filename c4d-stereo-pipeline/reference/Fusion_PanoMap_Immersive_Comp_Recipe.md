# Reusable Fusion comp: equirect → Apple Immersive (for AIVU)
### Drop-in reprojection preset for CG rendered as equirectangular 180 stereo
_Verified against Resolve 20.1+ immersive workflow, Jul 2026._

## Prerequisites (do once per project)
- Project Settings → Master → **Immersive workflows: Apple Immersive**, 90 fps, P3-D65 / ST2084 PQ.
- Import the equirect stereo EXR sequence; Clip Attributes → **Side by Side**, **Equirectangular 180°**.
- Put the clip on the immersive stereo timeline.

## Build the comp (once)
1. Select the clip → right-click → **New Fusion Clip** (or open the **Fusion** page on the clip).
2. Resolve's immersive comp **auto-creates dual-eye nodes**: `MediaIn1` = left eye, `MediaIn2` = right eye, feeding `MediaOut1/2`. You do **not** hand-build the L/R split.
3. On **each** eye stream, insert a **PanoMap** node between MediaIn and MediaOut:
   - Right-click node editor → Add Tool → **VR → PanoMap** (or search "PanoMap").
   - Inspector → **Input/From projection: LatLong** (equirectangular).
   - **Output/To projection: Immersive** (this is the Apple immersive lens-space).
   - Leave rotation 0 unless you need to re-orient the horizon.
   - Wire `MediaIn1 → PanoMap → MediaOut1`, same for eye 2.
4. (Only for flat/graphic elements you comp in) add an **Immersive Patcher**: undistort fisheye→rectilinear (FOV ~90°), composite/paint, then it re-distorts back. Not needed for pure passthrough reprojection.
5. Use the **1 / 2 number keys** in the viewer to check left vs right eye.

## Save as a drop-in preset
- Select the PanoMap node(s) → right-click → **Settings → Save As…** → store as `PanoMap_LatLong_to_Immersive.setting` in a `~/Fusion/Presets/Immersive/` folder.
- Or **Fusion menu → Export → Fusion Composition** to save the whole comp.
- **Reuse:** on any future equirect clip, open its Fusion comp and **drag the `.setting`** onto each eye stream (or paste the node). Same reprojection, zero rebuild.

## Deliver + verify
- Deliver → **Vision Pro Review** (direct `.aivu`) or **Vision Pro Bundle** (ProRes + AIME + FCPXMLD → Apple Immersive Video Utility → Create .aivu).
- **Always confirm** the reprojected result in **Apple Immersive Video Utility** before trusting it — this is the "is it really AIV" acceptance test.

## Honest caveats
- ⚠ Don't assume Deliver auto-reprojects an equirect timeline — the **PanoMap step is what makes it AIV projection**; verify visually.
- ⚠ Highest fidelity is rendering CG straight into immersive lens-space via **Renderer3D** (no equirect round-trip). The PanoMap route is the practical path from Redshift equirect renders but incurs some pole-stretch — QC it.

## Sources
- Blackmagic Resolve Immersive Workflow Guide — https://documents.blackmagicdesign.com/SupportNotes/DaVinci_Resolve_Immersive_Workflow_Guide.pdf
- Videomaker: Resolve 20.1 Apple Immersive workflows — https://www.videomaker.com/news/davinci-resolve-studio-update-adds-apple-immersive-video-workflows-for-macos/
