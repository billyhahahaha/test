"""
C4D_AIVU_Template_Checker.py  — READ ONLY, changes nothing.
Open your template in C4D, then: Extensions > Script Manager > paste > Execute.
It prints a ✓/⚠ audit of the camera + render settings for the stereo→Resolve→AIVU pipeline.
"""
import c4d
from c4d import utils

RS_CAM_OBJ = 1057516  # native Redshift Camera object

def find_param(node, want_names):
    """Return (value, unit_is_deg) for first param whose UI name matches, else (None,False)."""
    want = [w.lower() for w in want_names]
    for bc, pid, _g in node.GetDescription(c4d.DESCFLAGS_DESC_NONE):
        nm = (bc.GetString(c4d.DESC_NAME) or "").lower()
        if nm in want:
            try:
                deg = bc.GetInt32(c4d.DESC_UNIT) == c4d.DESC_UNIT_DEGREE
            except Exception:
                deg = False
            return node.GetParameter(pid, c4d.DESCFLAGS_GET_NONE), deg
    return None, False

def cycle_value_str(node, contains):
    for bc, pid, _g in node.GetDescription(c4d.DESCFLAGS_DESC_NONE):
        cyc = bc.GetContainer(c4d.DESC_CYCLE)
        if cyc is None:
            continue
        for cid, cname in cyc:
            if isinstance(cname, str) and contains.lower() in cname.lower():
                cur = node.GetParameter(pid, c4d.DESCFLAGS_GET_NONE)
                return cyc.GetString(cur)
    return None

def flag(ok):
    return "OK " if ok else "!! "

def main():
    doc = c4d.documents.GetActiveDocument()
    L = []
    L.append("=== C4D AIVU TEMPLATE AUDIT ===")
    L.append("Doc: %s" % (doc.GetDocumentName() or "(unsaved)"))

    # ---- camera ----
    bd = doc.GetActiveBaseDraw()
    cam = bd.GetSceneCamera(doc) if bd else None
    L.append("")
    L.append("[CAMERA]")
    if cam is None:
        L.append("!! No active scene camera")
    else:
        is_rs = cam.GetType() == RS_CAM_OBJ
        L.append("%sName: %s  (type %d %s)" % (flag(is_rs), cam.GetName(), cam.GetType(),
                 "= RS Camera obj" if is_rs else "= NOT an RS Camera object"))
        proj = cycle_value_str(cam, "stereo spherical") or cycle_value_str(cam, "spherical")
        L.append("%sProjection/Type: %s" % (flag(proj and "stereo" in (proj or "").lower()), proj))
        mode = cycle_value_str(cam, "side by side") or cycle_value_str(cam, "separate") or cycle_value_str(cam, "over")
        L.append("   Stereo layout mode: %s" % mode)
        sep, _ = find_param(cam, ["separation", "eye separation", "interocular", "interaxial"])
        L.append("%sSeparation: %s cm  (target 6.3-6.5)" % (flag(sep is not None and 6.0 <= sep <= 7.0), sep))
        aov, deg = find_param(cam, ["angle of view", "fov"])
        if isinstance(aov, c4d.Vector):
            h = utils.RadToDeg(aov.x); v = utils.RadToDeg(aov.y)
            L.append("%sAngle of View: %.1f x %.1f deg  (target 180 x 180)" % (flag(abs(h-180)<1 and abs(v-180)<1), h, v))
        else:
            L.append("   Angle of View (raw): %s" % str(aov))
        foc, _ = find_param(cam, ["focus distance", "convergence"])
        L.append("   Focus/convergence: %s  (want OFF / parallel eyes)" % foc)

    # ---- render settings ----
    rd = doc.GetActiveRenderData()
    x = int(rd[c4d.RDATA_XRES]); y = int(rd[c4d.RDATA_YRES])
    fps = rd[c4d.RDATA_FRAMERATE]
    L.append("")
    L.append("[RENDER]")
    L.append("   Active setting: %s" % rd.GetName())
    good_res = (x, y) in [(8640, 4320), (4320, 4320), (4320, 8640)]
    L.append("%sResolution: %d x %d  (target 4320x4320/eye, or 8640x4320 SBS)" % (flag(good_res), x, y))
    L.append("%sframe rate: %.3f  (target 90)" % (flag(abs(fps-90) < 0.01), fps))
    try:
        fmt = rd[c4d.RDATA_FORMAT]
        L.append("%sFormat id: %s  (want OpenEXR = %s)" % (flag(fmt == c4d.FILTER_EXR), fmt, c4d.FILTER_EXR))
    except Exception:
        L.append("   Format: (unreadable)")
    L.append("   Project fps: %d" % doc.GetFps())
    L.append("   Save path: %s" % rd[c4d.RDATA_PATH])

    # ---- scale sanity ----
    xs = []; ys = []; zs = []
    def walk(o):
        while o:
            r = o.GetRad()
            if r and (r.x or r.y or r.z):
                m = o.GetMg().off
                xs.extend([m.x-r.x, m.x+r.x]); ys.extend([m.y-r.y, m.y+r.y]); zs.extend([m.z-r.z, m.z+r.z])
            walk(o.GetDown()); o = o.GetNext()
    walk(doc.GetFirstObject())
    if xs:
        biggest = max(max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs))
        L.append("")
        L.append("[SCALE]")
        L.append("   Biggest scene dim: %.1f units  (real-world cm? an F1 car ~ 500)" % biggest)

    msg = "\n".join(L)
    print(msg)
    c4d.gui.MessageDialog(msg)

main()
