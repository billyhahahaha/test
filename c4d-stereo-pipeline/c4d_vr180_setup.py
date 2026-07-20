"""Configure a VR180 / Apple Immersive render out of Cinema 4D — the
full-immersion alternative to the windowed spatial-video export
(see APPLE_IMMERSIVE_180.md; windowed path: c4d_export_setup.py).

Run AFTER building the rig with c4d_stereo_rig.py:
    Extensions > Script Manager > File > Open... > c4d_vr180_setup.py > Execute

What it does to the active document:

  1. Active Render Settings
       - resolution     4096 x 4096 PER EYE (square 180x180 half-equirect;
                        raise to 5760 if the farm can take it)
       - output         OpenEXR image sequence (PNG fallback), Save enabled
       - save path      renders/$prj/$take/$prj_$take  (L / R per take)

  2. Takes
       - creates/reuses takes 'L' and 'R' overriding the scene camera to
         CAM_Stereo_L / CAM_Stereo_R, both marked for rendering

  3. Cameras (master + both eyes)
       - attempts to enable the classic camera's SPHERICAL mode mapped to
         Lat-Long, clamped to +/-90 degrees in both axes = a 180x180
         half-equirectangular render (Standard/Physical renderers).
         Symbol names vary across C4D versions, so every set is guarded —
         the dialog tells you if you need to do it by hand:
             Camera object > Spherical tab:
                 Enable ON, Mapping Lat-Long, full range OFF,
                 Longitude -90..+90, Latitude -90..+90
         Redshift ignores the native spherical camera — set the RS camera
         lens to Fisheye (180 deg) or Spherical with the same limits instead
         (details in APPLE_IMMERSIVE_180.md).

IMMERSIVE RULES (why this script also nags you about the rig):
  - 'Off-Axis Convergence' must be OFF. Film-shift convergence is
    meaningless in a spherical projection — depth comes purely from the
    physical baseline between the eyes. This script forces it off.
  - Interaxial stays at human scale (6.3-6.5 cm). In a headset the world is
    life-size around the viewer; a stylised interaxial reads as a scaled
    world (miniature/giant) and gets nauseating fast at 180 degrees.
  - Keep geometry ~1 m or further from camera, horizon level, camera at
    natural eye height, moves slow or locked off.
  - Frame rate: 90 fps is Apple Immersive native; 60 is an acceptable CG
    floor. This script leaves your document fps alone but tells you.
"""

import math

import c4d

RIG_NAME = "CAM_Stereo"

PER_EYE_WIDTH = 4096
PER_EYE_HEIGHT = 4096
SAVE_PATH = "renders/$prj/$take/$prj_$take"

USERDATA_CONVERGENCE = 3   # rig user-data index for 'Off-Axis Convergence'


def _set_if_available(target, symbol_name, value):
    param_id = getattr(c4d, symbol_name, None)
    if param_id is None:
        return False
    try:
        target[param_id] = value
        return True
    except Exception:
        return False


def _set_first_available(target, symbol_names, value):
    for name in symbol_names:
        if _set_if_available(target, name, value):
            return True
    return False


def _find_rig(doc):
    master = doc.SearchObject(RIG_NAME)
    if master is None:
        sel = doc.GetActiveObject()
        if sel is not None and sel.CheckType(c4d.Ocamera):
            master = sel
    if master is None:
        return None, None, None

    left = right = None
    child = master.GetDown()
    while child:
        if child.CheckType(c4d.Ocamera):
            name = child.GetName()
            if name.endswith("_L"):
                left = child
            elif name.endswith("_R"):
                right = child
        child = child.GetNext()
    return master, left, right


def _configure_render_settings(doc):
    rd = doc.GetActiveRenderData()
    if rd is None:
        return None

    rd[c4d.RDATA_XRES] = float(PER_EYE_WIDTH)
    rd[c4d.RDATA_YRES] = float(PER_EYE_HEIGHT)
    _set_if_available(rd, "RDATA_FILMASPECT", 1.0)
    rd[c4d.RDATA_SAVEIMAGE] = True
    rd[c4d.RDATA_PATH] = SAVE_PATH

    fmt = "unchanged"
    if getattr(c4d, "FILTER_EXR", None) is not None \
            and _set_if_available(rd, "RDATA_FORMAT", c4d.FILTER_EXR):
        fmt = "OpenEXR sequence"
    elif getattr(c4d, "FILTER_PNG", None) is not None \
            and _set_if_available(rd, "RDATA_FORMAT", c4d.FILTER_PNG):
        fmt = "PNG sequence"

    doc.AddUndo(c4d.UNDOTYPE_CHANGE, rd)
    return fmt


def _configure_takes(doc, left, right):
    take_data = doc.GetTakeData()
    if take_data is None:
        return False

    main_take = take_data.GetMainTake()
    existing = {}
    t = main_take.GetDown()
    while t:
        existing[t.GetName()] = t
        t = t.GetNext()

    for name, cam in (("L", left), ("R", right)):
        take = existing.get(name)
        if take is None:
            take = take_data.AddTake(name, main_take, None)
        if take is None:
            return False
        take.SetCamera(take_data, cam)
        take.SetChecked(True)
    return True


def _configure_spherical(cam):
    """Best-effort: classic camera Spherical tab -> Lat-Long 180x180.

    Returns True only if the essential switches took. Symbol names differ
    across versions, hence the candidate lists.
    """
    doc_ok = _set_first_available(
        cam,
        ("CAMERAOBJECT_SPHERICAL", "CAMERAOBJECT_SPHERICAL_ENABLE"),
        True,
    )
    if not doc_ok:
        return False

    latlong = getattr(c4d, "CAMERAOBJECT_SPHERICAL_MAPPING_LATLONG", 0)
    _set_first_available(cam, ("CAMERAOBJECT_SPHERICAL_MAPPING",), latlong)
    _set_first_available(
        cam,
        ("CAMERAOBJECT_SPHERICAL_USEFULLRANGE", "CAMERAOBJECT_SPHERICAL_FULLRANGE"),
        False,
    )
    half_pi = math.pi * 0.5
    _set_first_available(cam, ("CAMERAOBJECT_SPHERICAL_LONGITUDE_MIN",), -half_pi)
    _set_first_available(cam, ("CAMERAOBJECT_SPHERICAL_LONGITUDE_MAX",), half_pi)
    _set_first_available(cam, ("CAMERAOBJECT_SPHERICAL_LATITUDE_MIN",), -half_pi)
    _set_first_available(cam, ("CAMERAOBJECT_SPHERICAL_LATITUDE_MAX",), half_pi)
    return True


def _force_parallel(master):
    """Immersive renders must not carry film-shift convergence."""
    try:
        master[c4d.ID_USERDATA, USERDATA_CONVERGENCE] = False
        return True
    except Exception:
        return False


def main():
    doc = c4d.documents.GetActiveDocument()

    master, left, right = _find_rig(doc)
    if master is None:
        c4d.gui.MessageDialog(
            "No '%s' rig found and no camera selected.\n"
            "Run c4d_stereo_rig.py first (or select your master camera)."
            % RIG_NAME
        )
        return
    if left is None or right is None:
        c4d.gui.MessageDialog(
            "Master camera '%s' has no _L/_R eye cameras under it.\n"
            "Run c4d_stereo_rig.py first." % master.GetName()
        )
        return

    doc.StartUndo()
    fmt = _configure_render_settings(doc)
    takes_ok = _configure_takes(doc, left, right)
    parallel_ok = _force_parallel(master)
    spherical_ok = all(_configure_spherical(cam) for cam in (master, left, right))
    for cam in (master, left, right):
        doc.AddUndo(c4d.UNDOTYPE_CHANGE, cam)
    doc.EndUndo()
    c4d.EventAdd()

    lines = [
        "VR180 / Apple Immersive export configured.",
        "",
        "Render Settings: %dx%d per eye (square 180), %s"
        % (PER_EYE_WIDTH, PER_EYE_HEIGHT, fmt or "unchanged"),
        "Output path: %s" % SAVE_PATH,
        "Doc fps: %g  (Apple Immersive native is 90; keep >= 60 for CG)"
        % doc.GetFps(),
    ]
    lines.append(
        "Off-Axis Convergence forced OFF (parallel eyes)." if parallel_ok
        else "Could not reach the rig's convergence control — set "
             "'Off-Axis Convergence' OFF yourself."
    )
    if spherical_ok:
        lines.append("Cameras switched to spherical Lat-Long, clamped to 180x180.")
    else:
        lines += [
            "Spherical camera params not scriptable on this C4D version —",
            "set manually on master + eyes: Camera > Spherical tab: Enable,",
            "Mapping Lat-Long, Longitude/Latitude -90..+90.",
            "(Redshift: set the RS camera lens to Fisheye 180 instead.)",
        ]
    if takes_ok:
        lines += ["", "Now run: Render > Render All Marked Takes.",
                  "Then: APPLE_IMMERSIVE_180.md."]
    else:
        lines += ["", "Takes unavailable — render _L/_R as two manual passes."]

    print("\n".join(lines))
    c4d.gui.MessageDialog("\n".join(lines))


if __name__ == "__main__":
    main()
