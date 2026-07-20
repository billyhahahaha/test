#!/usr/bin/env python3
"""Automate the DaVinci Resolve Studio leg of the stereo pipeline.

Drives Resolve through its scripting API (Workflow Integration). One script,
two phases:

PHASE 1 — conform (run right after the C4D renders finish):
    python3 resolve_auto_conform.py --renders ~/prj/renders/MyPrj \
        --project MyPrj_Stereo --fps 30 --width 3840 --height 2160

    * creates/loads the Resolve project, sets timeline resolution + fps
    * imports renders/<prj>/L and /R into Media Pool bins 'L' and 'R'
      (image sequences collapse to clips automatically)
    * builds timelines TL_L and TL_R with the eyes appended in name order

    Then YOU grade TL_L (only TL_L — the script mirrors it later).

PHASE 2 — finish (after grading):
    python3 resolve_auto_conform.py --project MyPrj_Stereo \
        --sync-grades --render --out ~/masters \
        --package --spatial-out ~/masters/MyPrj_spatial.mov \
        --interaxial-cm 6.5 --focal 36 --sensor 36

    * --sync-grades   copies every grade TL_L -> TL_R, item by item
    * --render        queues ProRes masters of both timelines and renders
    * --package       feeds the two masters to package_spatial.py --run
                      (same folder as this script) -> MV-HEVC spatial .mov;
                      add --projection hequ for VR180/APMP immersive

Flags are independent — run any subset, phases are re-runnable.

REQUIREMENTS
    * DaVinci Resolve STUDIO (stereo work and external scripting are
      Studio features), running, with the target database reachable.
    * Preferences > System > General > "External scripting using" = Local.
    * Run with a normal python3 matching your OS build. If the module isn't
      found, this script appends Resolve's default script-module paths for
      macOS / Windows / Linux before giving up (see RESOLVE_AUTOMATION.md
      to relocate a non-standard install).

WHAT IS *NOT* AUTOMATED (Resolve API gaps, current through Resolve 20):
    * 'Convert to Stereo 3D' (pairing L/R into a native stereo clip) is not
      exposed to scripting. This pipeline therefore grades the eyes as two
      mirrored timelines + scripted grade-copy, which delivers the same
      masters. The native stereo-clip workflow in RESOLVE_TO_VISIONPRO.md
      remains available by hand — everything else here still applies.
    * Color-management specifics (input transforms) vary by project config;
      set them in Project Settings, or per clip in the UI, once.
"""

import argparse
import os
import platform
import subprocess
import sys
import time
from pathlib import Path


# ---------------------------------------------------------------------------
# Connection boilerplate
# ---------------------------------------------------------------------------
def _default_module_paths():
    system = platform.system()
    if system == "Darwin":
        return ["/Library/Application Support/Blackmagic Design/"
                "DaVinci Resolve/Developer/Scripting/Modules"]
    if system == "Windows":
        pd = os.environ.get("PROGRAMDATA", r"C:\ProgramData")
        return [os.path.join(pd, "Blackmagic Design", "DaVinci Resolve",
                             "Support", "Developer", "Scripting", "Modules")]
    return ["/opt/resolve/Developer/Scripting/Modules",
            "/home/resolve/Developer/Scripting/Modules"]


def connect():
    try:
        import DaVinciResolveScript as dvr
    except ImportError:
        for p in _default_module_paths():
            if os.path.isdir(p) and p not in sys.path:
                sys.path.append(p)
        try:
            import DaVinciResolveScript as dvr
        except ImportError:
            sys.exit(
                "Could not import DaVinciResolveScript.\n"
                "Is Resolve installed in the default location? For custom "
                "installs set RESOLVE_SCRIPT_API/RESOLVE_SCRIPT_LIB and "
                "PYTHONPATH — see RESOLVE_AUTOMATION.md."
            )

    resolve = dvr.scriptapp("Resolve")
    if resolve is None:
        sys.exit(
            "Connected to the module but not to Resolve.\n"
            "Checklist: Resolve (Studio) is RUNNING; Preferences > System > "
            "General > 'External scripting using' = Local."
        )
    return resolve


# ---------------------------------------------------------------------------
# Phase 1 — conform
# ---------------------------------------------------------------------------
def get_or_create_project(resolve, name):
    pm = resolve.GetProjectManager()
    project = pm.LoadProject(name)
    if project is None:
        project = pm.CreateProject(name)
    if project is None:
        sys.exit("Could not create or load project '%s'." % name)
    return project


def apply_project_settings(project, width, height, fps):
    # Must happen before timelines exist; on a populated project Resolve may
    # refuse fps changes — that's reported, not fatal.
    results = {
        "timelineResolutionWidth": project.SetSetting(
            "timelineResolutionWidth", str(width)),
        "timelineResolutionHeight": project.SetSetting(
            "timelineResolutionHeight", str(height)),
        "timelineFrameRate": project.SetSetting(
            "timelineFrameRate", str(fps)),
    }
    for key, ok in results.items():
        print("  %s %s" % ("set" if ok else "SKIPPED (locked?)", key))


def import_eye(resolve, project, renders_root, eye):
    """Import renders_root/<eye>/ into a bin named <eye>; returns clips."""
    src = Path(renders_root) / eye
    if not src.is_dir():
        sys.exit("Render folder not found: %s" % src)

    mp = project.GetMediaPool()
    root = mp.GetRootFolder()

    bin_folder = None
    for sub in root.GetSubFolderList() or []:
        if sub.GetName() == eye:
            bin_folder = sub
            break
    if bin_folder is None:
        bin_folder = mp.AddSubFolder(root, eye)
    if bin_folder is None:
        sys.exit("Could not create bin '%s'." % eye)

    mp.SetCurrentFolder(bin_folder)
    items = resolve.GetMediaStorage().AddItemListToMediaPool([str(src)])
    items = items or bin_folder.GetClipList() or []
    if not items:
        sys.exit("Nothing imported from %s — check the folder contents." % src)

    items.sort(key=lambda c: c.GetName() or "")
    print("  bin %s: %d clip(s)" % (eye, len(items)))
    return items


def build_timeline(project, name, clips):
    mp = project.GetMediaPool()

    # Reuse an existing timeline of that name (re-runs), else create.
    for i in range(1, int(project.GetTimelineCount() or 0) + 1):
        tl = project.GetTimelineByIndex(i)
        if tl and tl.GetName() == name:
            print("  timeline %s exists — leaving it untouched" % name)
            return tl

    tl = mp.CreateEmptyTimeline(name)
    if tl is None:
        sys.exit("Could not create timeline '%s'." % name)
    project.SetCurrentTimeline(tl)
    if clips and not mp.AppendToTimeline(clips):
        print("  WARNING: appending clips to %s reported failure" % name)
    print("  timeline %s: %d clip(s)" % (name, len(clips)))
    return tl


# ---------------------------------------------------------------------------
# Phase 2 — grade sync, render, package
# ---------------------------------------------------------------------------
def find_timeline(project, name):
    for i in range(1, int(project.GetTimelineCount() or 0) + 1):
        tl = project.GetTimelineByIndex(i)
        if tl and tl.GetName() == name:
            return tl
    sys.exit("Timeline '%s' not found — run the conform phase first." % name)


def sync_grades(project, src_name="TL_L", dst_name="TL_R"):
    src = find_timeline(project, src_name)
    dst = find_timeline(project, dst_name)
    src_items = src.GetItemListInTrack("video", 1) or []
    dst_items = dst.GetItemListInTrack("video", 1) or []
    if len(src_items) != len(dst_items):
        print("  WARNING: %s has %d items, %s has %d — pairing by index"
              % (src_name, len(src_items), dst_name, len(dst_items)))

    copied = failed = 0
    for item_l, item_r in zip(src_items, dst_items):
        if not hasattr(item_l, "CopyGrades"):
            sys.exit("This Resolve version lacks TimelineItem.CopyGrades "
                     "(needs 18.5+) — copy grades manually (Color page, "
                     "middle-click) or via a still/PowerGrade.")
        if item_l.CopyGrades([item_r]):
            copied += 1
        else:
            failed += 1
    print("  grades copied %s -> %s: %d ok, %d failed"
          % (src_name, dst_name, copied, failed))
    return failed == 0


def _pick_prores(project):
    fmts = project.GetRenderFormats() or {}
    fmt = fmts.get("QuickTime", "mov")
    codecs = project.GetRenderCodecs(fmt) or {}
    for label, codec in codecs.items():
        if "prores" in label.lower() and "hq" in label.lower():
            return fmt, codec, label
    if codecs:
        label, codec = next(iter(codecs.items()))
        print("  WARNING: no ProRes 422 HQ codec found; using '%s'" % label)
        return fmt, codec, label
    sys.exit("No render codecs reported for QuickTime — check the Deliver page.")


def queue_and_render(project, out_dir, base_name):
    out_dir = Path(out_dir).expanduser()
    out_dir.mkdir(parents=True, exist_ok=True)
    fmt, codec, label = _pick_prores(project)
    print("  render codec: %s" % label)

    jobs, expected = [], {}
    for eye in ("L", "R"):
        tl = find_timeline(project, "TL_%s" % eye)
        project.SetCurrentTimeline(tl)
        if not project.SetCurrentRenderFormatAndCodec(fmt, codec):
            sys.exit("Could not select render format/codec %s/%s." % (fmt, codec))
        custom = "%s_%s" % (base_name, eye)
        project.SetRenderSettings({
            "TargetDir": str(out_dir),
            "CustomName": custom,
            "ExportVideo": True,
            "ExportAudio": False,
        })
        job = project.AddRenderJob()
        if not job:
            sys.exit("AddRenderJob failed for TL_%s." % eye)
        jobs.append(job)
        expected[eye] = out_dir / ("%s.mov" % custom)

    print("  rendering %d job(s)..." % len(jobs))
    if not project.StartRendering(jobs):
        sys.exit("StartRendering refused the jobs.")
    while project.IsRenderingInProgress():
        time.sleep(5)
    for job in jobs:
        status = project.GetRenderJobStatus(job) or {}
        state = status.get("JobStatus", "Unknown")
        print("  job %s: %s" % (job, state))
        if state not in ("Complete",):
            sys.exit("Render job did not complete — see the Deliver page.")
    for eye, path in expected.items():
        if not path.exists():
            print("  WARNING: expected master missing on disk: %s" % path)
    return expected


def run_packager(masters, args):
    packager = Path(__file__).resolve().parent / "package_spatial.py"
    if not packager.exists():
        sys.exit("package_spatial.py not found next to this script.")
    cmd = [sys.executable, str(packager),
           "--left", str(masters["L"]),
           "--right", str(masters["R"]),
           "--out", str(Path(args.spatial_out).expanduser()),
           "--focal", str(args.focal),
           "--sensor", str(args.sensor),
           "--interaxial-cm", str(args.interaxial_cm),
           "--hadjust", str(args.hadjust),
           "--projection", args.projection,
           "--run"]
    print("  packaging: %s" % " ".join(cmd))
    result = subprocess.run(cmd)
    if result.returncode != 0:
        sys.exit("Packaging failed (exit %d)." % result.returncode)


# ---------------------------------------------------------------------------
def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Automate the Resolve Studio leg: conform C4D L/R "
                    "renders, mirror grades, render masters, package spatial."
    )
    ap.add_argument("--project", required=True, help="Resolve project name")
    ap.add_argument("--renders",
                    help="conform phase: C4D output root containing L/ and R/ "
                         "(the renders/<prj> folder)")
    ap.add_argument("--width", type=int, default=3840,
                    help="timeline width per eye (default 3840; VR180: 4096)")
    ap.add_argument("--height", type=int, default=2160,
                    help="timeline height per eye (default 2160; VR180: 4096)")
    ap.add_argument("--fps", type=float, default=30.0,
                    help="timeline frame rate (default 30)")
    ap.add_argument("--sync-grades", action="store_true",
                    help="copy grades TL_L -> TL_R")
    ap.add_argument("--render", action="store_true",
                    help="queue + render ProRes masters of TL_L and TL_R")
    ap.add_argument("--out", default="masters",
                    help="output dir for --render (default ./masters)")
    ap.add_argument("--package", action="store_true",
                    help="after --render, run package_spatial.py on the masters")
    ap.add_argument("--spatial-out", default="spatial_out.mov",
                    help="output .mov for --package")
    ap.add_argument("--focal", type=float, default=36.0)
    ap.add_argument("--sensor", type=float, default=36.0)
    ap.add_argument("--interaxial-cm", type=float, default=6.5)
    ap.add_argument("--hadjust", type=float, default=0.0)
    ap.add_argument("--projection", choices=("rect", "hequ"), default="rect",
                    help="rect = windowed spatial (default); hequ = VR180/APMP")
    args = ap.parse_args(argv)

    if args.package and not args.render:
        ap.error("--package needs --render (it consumes the rendered masters)")
    if not (args.renders or args.sync_grades or args.render):
        ap.error("nothing to do: give --renders (conform) and/or "
                 "--sync-grades / --render / --package")

    resolve = connect()
    project = get_or_create_project(resolve, args.project)
    print("project: %s" % args.project)

    if args.renders:
        print("conform:")
        apply_project_settings(project, args.width, args.height, args.fps)
        clips_l = import_eye(resolve, project, args.renders, "L")
        clips_r = import_eye(resolve, project, args.renders, "R")
        if len(clips_l) != len(clips_r):
            print("  WARNING: L has %d clips, R has %d — fix before grading"
                  % (len(clips_l), len(clips_r)))
        build_timeline(project, "TL_L", clips_l)
        build_timeline(project, "TL_R", clips_r)
        print("Conform done. Grade TL_L only, then re-run with "
              "--sync-grades --render [--package].")

    if args.sync_grades:
        print("grade sync:")
        sync_grades(project)

    masters = None
    if args.render:
        print("render:")
        masters = queue_and_render(project, args.out, args.project)

    if args.package and masters:
        print("package:")
        run_packager(masters, args)

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
