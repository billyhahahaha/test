"""Build the C4D AIVU template scene — Redshift Stereo Spherical camera +
AIV render preset — in one Execute. The C4D half of the "seamless" setup.

    Extensions > Script Manager > File > Open... > c4d_aivu_template_builder.py > Execute

What it creates (values from aivu_pipeline.json if found next to the scene
or next to this script; otherwise the verified Cadillac defaults):

  * Redshift Camera object 'AIV_180_Stereo_Cam' set to
      - Stereo Spherical projection
      - Side by Side (or Separate Left/Right per config)
      - Eye Separation 6.4 (scene cm = 64 mm human IPD)
      - Angle of View 180 x 180 (square per-eye, floor-to-ceiling)
      - convergence off / parallel where the build exposes a toggle
    and makes it the active scene camera.
  * Render Settings 'AIV 180 Stereo SBS 8640x4320 @ 90fps'
      - 8640x4320 (SBS) or 4320x4320 (separate) — per_eye from config
      - 90 fps render + document fps 90
      - OpenEXR sequence, save enabled, path renders/.../STEREO_EXR/...
      - bit depth 32 where scriptable — you still tick the EXR option
        "Use 16 Bit Floats" once by hand (C4D writes 16-half from the
        32-bit buffer; that checkbox is not reliably scriptable).

Then: run c4d_aivu_template_checker.py — the read-only audit — and save the
document as your project template (.c4d). Builder + checker = build, prove,
reuse.

WHY a Redshift Stereo Spherical camera and not the CAM_Stereo rig: for the
immersive path both eyes come out of ONE spherical camera (equirect 180); the
classic L/R rig with film-shift is the *windowed* pipeline. Redshift has no
stereo fisheye — the equirect render is reprojected to Apple's parametric
immersive lens-space later, in Resolve (PanoMap). See AIVU_MASTERING.md.

Technique note: Redshift camera parameters are set by walking the object's
description and matching UI names / option labels (same approach as the
checker) — no hard-coded RS parameter IDs, so it survives RS version drift.
Anything that can't be matched is reported for a 10-second manual fix, and
the checker audits the result either way.
"""

import json
import math
import os

import c4d

RS_CAM_OBJ = 1057516  # native Redshift Camera object type id

DEFAULTS = {
    "project": "Cadillac",
    "fps": 90,
    "per_eye": 4320,
    "stereo_layout": "sbs",
    "separation_cm": 6.4,
    "c4d": {
        "camera_name": "AIV_180_Stereo_Cam",
        "render_setting_name": "AIV 180 Stereo SBS 8640x4320 @ 90fps",
        "save_path": "renders/Cadillac/STEREO_EXR/Cadillac_stereo_",
    },
}


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
def load_config(doc):
    candidates = []
    if doc and doc.GetDocumentPath():
        candidates.append(os.path.join(doc.GetDocumentPath(), "aivu_pipeline.json"))
    try:
        candidates.append(os.path.join(os.path.dirname(__file__), "aivu_pipeline.json"))
    except NameError:
        pass
    for path in candidates:
        if os.path.isfile(path):
            try:
                with open(path) as fh:
                    cfg = json.load(fh)
                return cfg, path
            except Exception as err:
                print("aivu_pipeline.json unreadable (%s) — using defaults" % err)
    return {}, None


def cfg_get(cfg, path, fallback):
    node = cfg
    for key in path:
        if not isinstance(node, dict) or key not in node:
            return fallback
        node = node[key]
    return node


# ---------------------------------------------------------------------------
# Description-walking setters (checker-style, name/label matched)
# ---------------------------------------------------------------------------
def _walk_description(node):
    return node.GetDescription(c4d.DESCFLAGS_DESC_NONE)


def set_param_by_name(node, want_names, value):
    """Set the first parameter whose UI name matches; returns bool."""
    want = [w.lower() for w in want_names]
    for bc, pid, _group in _walk_description(node):
        name = (bc.GetString(c4d.DESC_NAME) or "").lower()
        if name in want:
            return bool(node.SetParameter(pid, value, c4d.DESCFLAGS_SET_NONE))
    return False


def get_param_by_name(node, want_names):
    want = [w.lower() for w in want_names]
    for bc, pid, _group in _walk_description(node):
        name = (bc.GetString(c4d.DESC_NAME) or "").lower()
        if name in want:
            return node.GetParameter(pid, c4d.DESCFLAGS_GET_NONE)
    return None


def set_cycle_by_label(node, label_contains):
    """Find ANY cycle (dropdown) parameter that offers an option whose label
    contains the given text, and select that option. Returns the label hit."""
    needle = label_contains.lower()
    for bc, pid, _group in _walk_description(node):
        cyc = bc.GetContainer(c4d.DESC_CYCLE)
        if cyc is None:
            continue
        for cid, cname in cyc:
            if isinstance(cname, str) and needle in cname.lower():
                if node.SetParameter(pid, cid, c4d.DESCFLAGS_SET_NONE):
                    return cname
    return None


# ---------------------------------------------------------------------------
# Camera
# ---------------------------------------------------------------------------
def build_camera(doc, cfg, report):
    name = cfg_get(cfg, ("c4d", "camera_name"), DEFAULTS["c4d"]["camera_name"])
    existing = doc.SearchObject(name)
    if existing is not None:
        report.append("camera: '%s' already exists — configuring it in place" % name)
        cam = existing
    else:
        cam = c4d.BaseObject(RS_CAM_OBJ)
        if cam is None:
            report.append("!! Redshift Camera object unavailable — is Redshift "
                          "installed? Camera NOT created.")
            return None
        cam.SetName(name)
        doc.InsertObject(cam)
        doc.AddUndo(c4d.UNDOTYPE_NEW, cam)
        report.append("camera: created Redshift camera '%s'" % name)

    hit = set_cycle_by_label(cam, "stereo spherical")
    report.append("  projection -> %s" % (hit or "!! set manually: Stereo Spherical"))

    layout = cfg_get(cfg, ("stereo_layout",), DEFAULTS["stereo_layout"])
    layout_label = "side by side" if layout == "sbs" else "separate"
    hit = set_cycle_by_label(cam, layout_label)
    report.append("  layout     -> %s" % (hit or "!! set manually: %s" % layout_label))

    sep = float(cfg_get(cfg, ("separation_cm",), DEFAULTS["separation_cm"]))
    ok = set_param_by_name(
        cam, ["separation", "eye separation", "interocular", "interaxial"], sep)
    report.append("  separation -> %s" % ("%g cm" % sep if ok
                                          else "!! set manually: %g" % sep))

    # Angle of View: RS exposes it as a degree vector; write radians.
    current = get_param_by_name(cam, ["angle of view", "fov"])
    half_turn = math.pi  # 180 deg
    if isinstance(current, c4d.Vector):
        ok = set_param_by_name(cam, ["angle of view", "fov"],
                               c4d.Vector(half_turn, half_turn, current.z))
        report.append("  angle of view -> %s"
                      % ("180 x 180" if ok else "!! set manually: 180 x 180"))
    else:
        report.append("  angle of view: !! not matched — set 180 x 180 manually")

    # Parallel eyes: kill any convergence toggle the build exposes.
    if set_param_by_name(cam, ["converge", "convergence", "use convergence"], False):
        report.append("  convergence -> off (parallel)")
    else:
        report.append("  convergence: no toggle matched — leave Focus Distance "
                      "unused / eyes parallel (checker will show it)")

    bd = doc.GetActiveBaseDraw()
    if bd is not None:
        bd.SetSceneCamera(cam)
        report.append("  set as active scene camera")
    doc.AddUndo(c4d.UNDOTYPE_CHANGE, cam)
    return cam


# ---------------------------------------------------------------------------
# Render settings
# ---------------------------------------------------------------------------
def _set_if_available(target, symbol_name, value):
    param_id = getattr(c4d, symbol_name, None)
    if param_id is None:
        return False
    try:
        target[param_id] = value
        return True
    except Exception:
        return False


def build_render_settings(doc, cfg, report):
    per_eye = int(cfg_get(cfg, ("per_eye",), DEFAULTS["per_eye"]))
    layout = cfg_get(cfg, ("stereo_layout",), DEFAULTS["stereo_layout"])
    fps = int(cfg_get(cfg, ("fps",), DEFAULTS["fps"]))
    name = cfg_get(cfg, ("c4d", "render_setting_name"),
                   DEFAULTS["c4d"]["render_setting_name"])
    save_path = cfg_get(cfg, ("c4d", "save_path"), DEFAULTS["c4d"]["save_path"])

    width = per_eye * 2 if layout == "sbs" else per_eye
    height = per_eye

    rd = doc.GetFirstRenderData()
    target = None
    while rd:
        if rd.GetName() == name:
            target = rd
            break
        rd = rd.GetNext()
    if target is None:
        target = c4d.documents.RenderData()
        target.SetName(name)
        doc.InsertRenderDataLast(target)
        report.append("render setting: created '%s'" % name)
    else:
        report.append("render setting: '%s' exists — updating in place" % name)

    target[c4d.RDATA_XRES] = float(width)
    target[c4d.RDATA_YRES] = float(height)
    _set_if_available(target, "RDATA_FILMASPECT", float(width) / float(height))
    target[c4d.RDATA_FRAMERATE] = float(fps)
    target[c4d.RDATA_SAVEIMAGE] = True
    target[c4d.RDATA_PATH] = save_path

    if getattr(c4d, "FILTER_EXR", None) is not None \
            and _set_if_available(target, "RDATA_FORMAT", c4d.FILTER_EXR):
        report.append("  format -> OpenEXR sequence")
    else:
        report.append("  format: !! set OpenEXR manually")
    if _set_if_available(target, "RDATA_FORMATDEPTH",
                         getattr(c4d, "RDATA_FORMATDEPTH_32", 2)):
        report.append("  bit depth -> 32 (tick EXR option 'Use 16 Bit Floats' "
                      "by hand once -> writes 16-half from the 32-bit buffer)")
    else:
        report.append("  bit depth: set 32-bit + EXR 'Use 16 Bit Floats' manually")

    report.append("  resolution -> %dx%d (%s), %d fps, path %s"
                  % (width, height,
                     "SBS" if layout == "sbs" else "per eye", fps, save_path))

    doc.SetActiveRenderData(target)
    doc.AddUndo(c4d.UNDOTYPE_CHANGE, target)

    if doc.GetFps() != fps:
        doc.SetFps(fps)
        report.append("  document fps -> %d (was different — if this scene "
                      "already had animation, re-check timing!)" % fps)
    return target


# ---------------------------------------------------------------------------
def main():
    doc = c4d.documents.GetActiveDocument()
    cfg, cfg_path = load_config(doc)

    report = ["AIVU template build", ""]
    report.append("config: %s" % (cfg_path or "(none found — Cadillac defaults)"))

    doc.StartUndo()
    cam = build_camera(doc, cfg, report)
    build_render_settings(doc, cfg, report)
    doc.EndUndo()
    c4d.EventAdd()

    report += [
        "",
        "Next steps:",
        "  1. Run c4d_aivu_template_checker.py — read-only audit, expect all OK.",
        "  2. Scene hygiene: real-world scale (1 unit = 1 cm), camera at eye",
        "     height, level horizon, subjects >= 0.5-1 m away, gentle moves.",
        "  3. Renderer color: scene-linear ACEScg, no display transform baked.",
        "  4. Save this document as your AIVU template .c4d.",
    ]
    if cam is None:
        report.insert(1, "!! CAMERA STEP FAILED — see above.")

    msg = "\n".join(report)
    print(msg)
    c4d.gui.MessageDialog(msg)


if __name__ == "__main__":
    main()
