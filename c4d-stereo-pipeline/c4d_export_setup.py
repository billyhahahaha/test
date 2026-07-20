"""Configure the L/R stereo export out of Cinema 4D — stage 2 of the
C4D -> DaVinci Resolve Studio -> Apple Vision Pro pipeline.

Run AFTER building the rig with c4d_stereo_rig.py:
    Extensions > Script Manager > File > Open... > c4d_export_setup.py > Execute

What it does to the active document:

  1. Active Render Settings
       - resolution     3840 x 2160 PER EYE (16:9 UHD — a solid Vision Pro
                        spatial-video target; change the constants below for
                        square or other formats)
       - frame rate     matched to the document fps (use 30 or 60 for AVP)
       - output         OpenEXR image sequence (falls back to PNG if EXR is
                        unavailable), Save enabled
       - save path      renders/$prj/$take/$prj_$take   ($take resolves to
                        L / R per take, so both eyes land in parallel,
                        identically-numbered sequences — exactly what
                        Resolve's stereo conform wants)

  2. Takes
       - creates (or reuses) takes 'L' and 'R' under the Main take
       - each take overrides the scene camera to CAM_Stereo_L / CAM_Stereo_R
       - both takes are marked for rendering

Then render both eyes in one go:
    Render > Render All Marked Takes   (Team Render: same, via marked takes)

Vision Pro note: for spatial delivery consider turning the rig's
'Off-Axis Convergence' OFF (parallel eyes) and setting the disparity/
convergence at MV-HEVC packaging time instead — see RESOLVE_TO_VISIONPRO.md.
Baked off-axis convergence also works; just don't converge twice.

Works with any renderer that respects the scene camera (Standard, Physical,
Redshift, ...). If the rig isn't found by name, the currently selected camera
is used as the master instead.
"""

import c4d

RIG_NAME = "CAM_Stereo"

PER_EYE_WIDTH = 3840     # px per eye
PER_EYE_HEIGHT = 2160    # px per eye
SAVE_PATH = "renders/$prj/$take/$prj_$take"


def _set_if_available(target, symbol_name, value):
    param_id = getattr(c4d, symbol_name, None)
    if param_id is None:
        return False
    try:
        target[param_id] = value
        return True
    except Exception:
        return False


def _find_rig(doc):
    """Return (master, left, right). Falls back to the selected camera."""
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
    """Per-eye resolution, doc fps, EXR sequence, $take-tokenised path."""
    rd = doc.GetActiveRenderData()
    if rd is None:
        return None

    rd[c4d.RDATA_XRES] = float(PER_EYE_WIDTH)
    rd[c4d.RDATA_YRES] = float(PER_EYE_HEIGHT)
    _set_if_available(rd, "RDATA_FILMASPECT",
                      float(PER_EYE_WIDTH) / float(PER_EYE_HEIGHT))
    rd[c4d.RDATA_FRAMERATE] = float(doc.GetFps())
    rd[c4d.RDATA_SAVEIMAGE] = True
    rd[c4d.RDATA_PATH] = SAVE_PATH

    fmt = "unchanged"
    if _set_if_available(rd, "RDATA_FORMAT", getattr(c4d, "FILTER_EXR", -1)) \
            and getattr(c4d, "FILTER_EXR", None) is not None:
        fmt = "OpenEXR sequence"
    elif _set_if_available(rd, "RDATA_FORMAT", getattr(c4d, "FILTER_PNG", -1)) \
            and getattr(c4d, "FILTER_PNG", None) is not None:
        fmt = "PNG sequence"

    doc.AddUndo(c4d.UNDOTYPE_CHANGE, rd)
    return fmt


def _configure_takes(doc, left, right):
    """Create/reuse takes L and R, override cameras, mark for rendering."""
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
    doc.EndUndo()
    c4d.EventAdd()

    lines = [
        "Stereo export configured.",
        "",
        "Render Settings: %dx%d per eye, %g fps, %s"
        % (PER_EYE_WIDTH, PER_EYE_HEIGHT, doc.GetFps(), fmt or "unchanged"),
        "Output path: %s" % SAVE_PATH,
    ]
    if takes_ok:
        lines += [
            "Takes 'L' and 'R' are camera-overridden and marked.",
            "",
            "Now run: Render > Render All Marked Takes.",
            "Then conform in Resolve — see RESOLVE_TO_VISIONPRO.md.",
        ]
    else:
        lines += [
            "",
            "Takes could not be created on this C4D version — render the",
            "_L and _R cameras as two manual passes into .../L/ and .../R/.",
        ]
    print("\n".join(lines))
    c4d.gui.MessageDialog("\n".join(lines))


if __name__ == "__main__":
    main()
