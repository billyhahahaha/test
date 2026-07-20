"""Stereoscopic camera rig builder for Cinema 4D.

Stage 1 of the C4D -> DaVinci Resolve Studio -> Apple Vision Pro pipeline
(see README.md; stage 2 is c4d_export_setup.py).

Run this from inside Cinema 4D:
    Extensions > Script Manager > File > Open... > c4d_stereo_rig.py > Execute
(or paste the whole file into the Script Manager and hit Execute).

It creates one rig in the active document:

    CAM_Stereo               <- MASTER camera. Animate this one. Stereo controls
      |                         live in its User Data tab.
      +- CAM_Stereo_L        <- left eye  (driven by the Python tag — hands off)
      +- CAM_Stereo_R        <- right eye (driven by the Python tag — hands off)

Two ways to render it (details in README.md):

  A. Native C4D stereo (Standard / Physical renderer)
     The script also fills in the master camera's Stereoscopic tab and switches
     the active Render Settings to stereoscopic where the running C4D version
     exposes those settings. Render through the master camera.

  B. Renderer-agnostic (Redshift / Octane / Arnold / ...)
     Render the _L and _R cameras as two passes. Run c4d_export_setup.py to
     build the L/R Takes and output settings automatically. The Python tag
     keeps the eyes locked to the master with correct OFF-AXIS (film-shift)
     convergence — parallel optical axes, no toe-in, no keystone, no vertical
     parallax.

Stereo controls (User Data on the master camera):

  Interaxial              Eye separation in scene units. 6.5 cm = human scale.
  Zero Parallax Distance  Distance at which L/R images line up exactly — this
                          plane lands ON the screen when viewed. Rule of thumb:
                          keep it near your subject, and keep Interaxial around
                          1/30th of it.
  Off-Axis Convergence    ON  = converge via horizontal film shift (recommended
                                for screen/TV/cinema delivery).
                          OFF = parallel rig, zero shift (Vision Pro spatial /
                                VR180 — converge later in Resolve or at
                                MV-HEVC packaging time).
  Swap Eyes               Flip L/R if your pipeline expects the other order.

The math (off-axis / film-shift stereo):
  Each eye sits at x = ±Interaxial/2 with its optical axis parallel to the
  master. Its film window is shifted horizontally by
      shift = (Interaxial/2) * focal / (ZeroParallax * sensor_width)
  (as a fraction of frame width — which is exactly what C4D's Film Offset X
  expects) so both frustums cross at the zero-parallax plane without rotating
  the cameras. Rotating ("toe-in") is the classic beginner mistake: it creates
  keystone distortion and vertical parallax, which is what makes audiences'
  eyes hurt.

Tested against the classic camera object (c4d.Ocamera), which is what all
current C4D versions create by default. Native-stereo/render symbols are looked
up defensively so the script degrades gracefully on versions that lack them —
the manual L/R rig always works.
"""

import c4d

RIG_NAME = "CAM_Stereo"

DEFAULT_INTERAXIAL = 6.5        # scene units (cm in a default document) — human interocular
DEFAULT_ZERO_PARALLAX = 200.0   # scene units; ~30x the interaxial ("1/30 rule")
DEFAULT_FOCAL = 36.0            # mm
DEFAULT_APERTURE = 36.0         # mm sensor width

# ---------------------------------------------------------------------------
# Code for the Python tag that drives the eyes every frame.
# ---------------------------------------------------------------------------
TAG_CODE = r"""import c4d

# Stereo driver — lives on the master camera. Positions the L/R eye cameras,
# syncs their lenses to the master, and applies off-axis convergence as a
# horizontal film shift. Edit the User Data on the master camera, not the
# eye cameras.

def _find_eyes(cam):
    left = right = None
    child = cam.GetDown()
    while child:
        if child.CheckType(c4d.Ocamera):
            name = child.GetName()
            if name.endswith("_L"):
                left = child
            elif name.endswith("_R"):
                right = child
        child = child.GetNext()
    return left, right


def main():
    cam = op.GetObject()
    left, right = _find_eyes(cam)
    if left is None or right is None:
        return

    interaxial = cam[c4d.ID_USERDATA, 1]
    zero_par   = cam[c4d.ID_USERDATA, 2]
    converge   = cam[c4d.ID_USERDATA, 3]
    swap       = cam[c4d.ID_USERDATA, 4]

    focal    = cam[c4d.CAMERA_FOCUS]           # mm
    aperture = cam[c4d.CAMERAOBJECT_APERTURE]  # mm (sensor width)

    # Horizontal film shift (fraction of frame width) that re-centres each eye
    # on the zero-parallax plane while the optical axes stay parallel.
    shift = 0.0
    if converge and zero_par > 0.0 and aperture > 0.0:
        shift = (interaxial * 0.5) * focal / (zero_par * aperture)

    for eye, side in ((left, -1.0), (right, 1.0)):
        s = -side if swap else side

        # Lens stays locked to the master.
        eye[c4d.CAMERA_PROJECTION]             = cam[c4d.CAMERA_PROJECTION]
        eye[c4d.CAMERA_FOCUS]                  = focal
        eye[c4d.CAMERAOBJECT_APERTURE]         = aperture
        eye[c4d.CAMERAOBJECT_TARGETDISTANCE]   = cam[c4d.CAMERAOBJECT_TARGETDISTANCE]
        eye[c4d.CAMERAOBJECT_FILM_OFFSET_Y]    = cam[c4d.CAMERAOBJECT_FILM_OFFSET_Y]
        # Left eye shifts its window towards +X (positive offset), right eye
        # towards -X, so both frustums cross at the zero-parallax distance.
        eye[c4d.CAMERAOBJECT_FILM_OFFSET_X]    = (
            cam[c4d.CAMERAOBJECT_FILM_OFFSET_X] - s * shift
        )

        # Transform: pure horizontal offset, axes parallel to the master.
        eye.SetRelRot(c4d.Vector(0.0))
        eye.SetRelScale(c4d.Vector(1.0))
        eye.SetRelPos(c4d.Vector(s * interaxial * 0.5, 0.0, 0.0))
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _set_if_available(target, symbol_name, value):
    """Set target[c4d.<symbol_name>] = value if the symbol exists. Returns bool."""
    param_id = getattr(c4d, symbol_name, None)
    if param_id is None:
        return False
    try:
        target[param_id] = value
        return True
    except Exception:
        return False


def _make_camera(name, focal, aperture):
    cam = c4d.BaseObject(c4d.Ocamera)
    cam.SetName(name)
    cam[c4d.CAMERA_FOCUS] = focal
    cam[c4d.CAMERAOBJECT_APERTURE] = aperture
    return cam


def _real_userdata(name, unit_step):
    bc = c4d.GetCustomDataTypeDefault(c4d.DTYPE_REAL)
    bc[c4d.DESC_NAME] = name
    bc[c4d.DESC_SHORT_NAME] = name
    bc[c4d.DESC_UNIT] = c4d.DESC_UNIT_METER   # displays in the document's units
    bc[c4d.DESC_MIN] = 0.0
    bc[c4d.DESC_STEP] = unit_step
    return bc


def _bool_userdata(name):
    bc = c4d.GetCustomDataTypeDefault(c4d.DTYPE_BOOL)
    bc[c4d.DESC_NAME] = name
    bc[c4d.DESC_SHORT_NAME] = name
    return bc


def _add_stereo_userdata(cam):
    """User data order matters: the driver tag reads ID_USERDATA 1..4."""
    entries = (
        (_real_userdata("Interaxial", 0.1), DEFAULT_INTERAXIAL),
        (_real_userdata("Zero Parallax Distance", 1.0), DEFAULT_ZERO_PARALLAX),
        (_bool_userdata("Off-Axis Convergence"), True),
        (_bool_userdata("Swap Eyes"), False),
    )
    for container, default in entries:
        element = cam.AddUserData(container)
        cam[element] = default


def _configure_native_stereo(cam):
    """Fill in the classic camera's Stereoscopic tab (Standard/Physical path)."""
    ok = _set_if_available(
        cam, "CAMERAOBJECT_STEREO_MODE",
        getattr(c4d, "CAMERAOBJECT_STEREO_MODE_SYMMETRICAL", 1),
    )
    _set_if_available(
        cam, "CAMERAOBJECT_STEREO_PLACEMENT",
        getattr(c4d, "CAMERAOBJECT_STEREO_PLACEMENT_OFFAXIS", 1),
    )
    _set_if_available(cam, "CAMERAOBJECT_STEREO_EYESEPARATION", DEFAULT_INTERAXIAL)
    _set_if_available(cam, "CAMERAOBJECT_STEREO_ZERO_PARALLAX", DEFAULT_ZERO_PARALLAX)
    _set_if_available(cam, "CAMERAOBJECT_STEREO_AUTO_PLANES", True)
    _set_if_available(cam, "CAMERAOBJECT_STEREO_SHOW_FLOATING_FRAME", True)
    return ok


def _configure_render_settings(doc):
    """Enable stereoscopic output in the active Render Settings (native path)."""
    rd = doc.GetActiveRenderData()
    if rd is None:
        return False
    enabled = _set_if_available(rd, "RDATA_STEREO", True)
    if enabled:
        doc.AddUndo(c4d.UNDOTYPE_CHANGE, rd)
    return enabled


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
def build_rig(doc):
    master = _make_camera(RIG_NAME, DEFAULT_FOCAL, DEFAULT_APERTURE)
    left = _make_camera(RIG_NAME + "_L", DEFAULT_FOCAL, DEFAULT_APERTURE)
    right = _make_camera(RIG_NAME + "_R", DEFAULT_FOCAL, DEFAULT_APERTURE)

    # Anaglyph-convention display colours: left = red, right = cyan.
    for eye, colour in ((left, c4d.Vector(0.9, 0.15, 0.15)),
                        (right, c4d.Vector(0.15, 0.75, 0.9))):
        eye[c4d.ID_BASEOBJECT_USECOLOR] = c4d.ID_BASEOBJECT_USECOLOR_ALWAYS
        eye[c4d.ID_BASEOBJECT_COLOR] = colour

    _add_stereo_userdata(master)

    tag = c4d.BaseTag(c4d.Tpython)
    tag.SetName("Stereo Driver")
    tag[c4d.TPYTHON_CODE] = TAG_CODE
    master.InsertTag(tag)

    doc.InsertObject(master)
    doc.AddUndo(c4d.UNDOTYPE_NEW, master)
    left.InsertUnder(master)
    doc.AddUndo(c4d.UNDOTYPE_NEW, left)
    right.InsertUnder(master)
    doc.AddUndo(c4d.UNDOTYPE_NEW, right)

    return master


def main():
    doc = c4d.documents.GetActiveDocument()

    if doc.SearchObject(RIG_NAME) is not None:
        c4d.gui.MessageDialog(
            "A '%s' rig already exists in this scene.\n"
            "Delete or rename it first if you want a fresh one." % RIG_NAME
        )
        return

    doc.StartUndo()
    master = build_rig(doc)
    native_cam = _configure_native_stereo(master)
    native_rd = _configure_render_settings(doc)
    doc.EndUndo()

    doc.SetActiveObject(master)
    c4d.EventAdd()

    lines = [
        "Stereo rig created.",
        "",
        "Animate '%s' — stereo controls are in its User Data tab." % RIG_NAME,
    ]
    if native_cam and native_rd:
        lines.append(
            "Native stereo is configured: Standard/Physical renders through the "
            "master camera now output stereo."
        )
    else:
        lines.append(
            "Native stereo settings were not available in this C4D version — "
            "render the _L/_R cameras as two passes (see README.md)."
        )
    lines.append(
        "Next: run c4d_export_setup.py to build the L/R render Takes for the "
        "DaVinci Resolve handoff."
    )
    print("\n".join(lines))
    c4d.gui.MessageDialog("\n".join(lines))


if __name__ == "__main__":
    main()
