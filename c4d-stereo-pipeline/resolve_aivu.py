#!/usr/bin/env python3
"""AIVU automation for DaVinci Resolve Studio 20.1+ — config-driven, so the
whole pipeline runs off aivu_pipeline.json.

Subcommands (chainable mentally: discover once, then conform -> grade ->
deliver per shot):

  discover   Dump this Resolve build's actual setting keys, clip-property
             keys, render presets and codecs to aivu_discovery.json, and
             suggest the immersive/stereo/projection keys. With --write it
             fills the null keys in aivu_pipeline.json. Resolve's immersive
             scripting keys are UNPUBLISHED and version-specific — this is
             the honest first move; nothing is guessed.

  conform    Create/load the project, apply settings from the config
             (fps, immersive workflow if its key is known), import the EXR
             sequence, set clip attributes (Stereo SBS + Equirect 180) when
             their keys are known — otherwise it prints the exact manual
             clicks — and build the CG_IMMERSIVE timeline. Ends by reminding
             you to drop the saved PanoMap .setting on the Fusion comp
             (the reprojection that makes it genuine AIV cannot be scripted).

  deliver    Project.LoadRenderPreset('AIVU_VisionPro_Review' or --bundle),
             queue, render, wait, report — then the AirDrop / Apple
             Immersive Video Utility acceptance steps.

  config     Print the resolved config (sanity check, no Resolve needed).

Examples:
  python3 resolve_aivu.py discover --write
  python3 resolve_aivu.py conform --renders "~/Desktop/PETER PAN(for compressor)/STEREO_EXR"
  python3 resolve_aivu.py deliver --out ~/masters
  python3 resolve_aivu.py deliver --bundle --out ~/masters

Division of labor (from the MCP audit): scripting handles project setup,
import, clip attributes, timeline and preset-driven delivery. The PanoMap
reprojection comp and the Deliver presets are built ONCE in the UI (see
AIVU_MASTERING.md one-time list) and reused here forever after.
"""

import argparse
import json
import sys
import time
from pathlib import Path

from resolve_auto_conform import connect  # same-dir import

CONFIG_DEFAULT = "aivu_pipeline.json"
DISCOVERY_OUT = "aivu_discovery.json"


# ---------------------------------------------------------------------------
def load_config(path):
    p = Path(path)
    if not p.is_file():
        sys.exit("Config not found: %s" % p)
    with open(p) as fh:
        return json.load(fh), p


def get_project(resolve, cfg):
    pm = resolve.GetProjectManager()
    name = cfg["resolve"]["project"]
    project = pm.LoadProject(name) or pm.CreateProject(name)
    if project is None:
        sys.exit("Could not create or load Resolve project '%s'." % name)
    print("project: %s" % name)
    return project


# ---------------------------------------------------------------------------
# discover
# ---------------------------------------------------------------------------
def _suggest(keys, needles):
    hits = []
    for key in keys:
        low = str(key).lower()
        if any(n in low for n in needles):
            hits.append(str(key))
    return hits


def cmd_discover(args, cfg, cfg_path):
    resolve = connect()
    project = get_project(resolve, cfg)

    settings = project.GetSetting("") or {}
    presets = project.GetRenderPresetList() or []
    formats = project.GetRenderFormats() or {}
    codecs = project.GetRenderCodecs("QuickTime") or {}

    clip_props = {}
    mp = project.GetMediaPool()
    folder = mp.GetCurrentFolder()
    clips = (folder.GetClipList() or []) if folder else []
    if clips:
        clip_props = clips[0].GetClipProperty() or {}
    else:
        print("note: no clip in the current Media Pool folder — clip-property "
              "keys can't be dumped until one is imported (run conform, then "
              "discover again).")

    dump = {
        "project_settings": settings,
        "clip_properties": clip_props,
        "render_presets": presets,
        "render_formats": formats,
        "quicktime_codecs": codecs,
    }
    out = Path(args.dump)
    out.write_text(json.dumps(dump, indent=2, default=str))
    print("full dump: %s" % out)

    imm = _suggest(settings.keys(), ("immersive", "spatial"))
    stereo = _suggest(clip_props.keys(), ("stereo",))
    proj_keys = _suggest(clip_props.keys(), ("projection",))
    print("\nsuggested keys:")
    print("  immersive workflow (project): %s" % (imm or "none found"))
    print("  stereo mode (clip):           %s" % (stereo or "none found"))
    print("  projection (clip):            %s" % (proj_keys or "none found"))

    for name in (cfg["resolve"]["render_preset_review"],
                 cfg["resolve"]["render_preset_bundle"]):
        mark = "present" if name in presets else "MISSING — build once in the " \
               "Deliver page and save under exactly this name"
        print("  render preset '%s': %s" % (name, mark))

    if args.write:
        changed = False
        s = cfg["resolve"]["settings"]
        c = cfg["resolve"]["clip_attributes"]
        if s.get("immersive_workflow_key") is None and len(imm) == 1:
            s["immersive_workflow_key"] = imm[0]
            changed = True
        if c.get("stereo_mode_key") is None and len(stereo) == 1:
            c["stereo_mode_key"] = stereo[0]
            changed = True
        if c.get("projection_key") is None and len(proj_keys) == 1:
            c["projection_key"] = proj_keys[0]
            changed = True
        if changed:
            cfg_path.write_text(json.dumps(cfg, indent=2))
            print("\nconfig updated: %s" % cfg_path)
        else:
            print("\nconfig unchanged (no single unambiguous candidate — pick "
                  "from the dump and fill the keys by hand).")
    return 0


# ---------------------------------------------------------------------------
# conform
# ---------------------------------------------------------------------------
def cmd_conform(args, cfg, cfg_path):
    resolve = connect()
    project = get_project(resolve, cfg)
    rcfg = cfg["resolve"]

    print("settings:")
    s = rcfg["settings"]
    if s.get("immersive_workflow_key"):
        ok = project.SetSetting(s["immersive_workflow_key"],
                                s["immersive_workflow_value"])
        print("  %s = %s %s" % (s["immersive_workflow_key"],
                                s["immersive_workflow_value"],
                                "ok" if ok else "FAILED"))
    else:
        print("  immersive workflow key unknown — run `discover --write`, or "
              "set it once in the UI: Project Settings > Master > Immersive "
              "workflows > %s" % s["immersive_workflow_value"])
    for key, value in (s.get("extra") or {}).items():
        ok = project.SetSetting(key, str(value))
        print("  %s = %s %s" % (key, value, "ok" if ok else "FAILED (locked?)"))

    renders = Path(args.renders).expanduser()
    if not renders.is_dir():
        sys.exit("Renders folder not found: %s" % renders)
    mp = project.GetMediaPool()
    items = resolve.GetMediaStorage().AddItemListToMediaPool([str(renders)])
    items = items or []
    if not items:
        sys.exit("Nothing imported from %s." % renders)
    print("imported: %d clip(s) from %s" % (len(items), renders))

    c = rcfg["clip_attributes"]
    for item in items:
        for key_name, value_name in (("stereo_mode_key", "stereo_mode_value"),
                                     ("projection_key", "projection_value")):
            key, value = c.get(key_name), c.get(value_name)
            if key:
                ok = item.SetClipProperty(key, value)
                print("  clip '%s': %s = %s %s"
                      % (item.GetName(), key, value, "ok" if ok else "FAILED"))
    if not (c.get("stereo_mode_key") and c.get("projection_key")):
        print("  clip-attribute keys incomplete — do it by hand once "
              "(right-click clip > Clip Attributes > Stereoscopic Mode = %s, "
              "Projection = %s), then `discover --write` learns the keys."
              % (c["stereo_mode_value"], c["projection_value"]))

    tl_name = rcfg.get("timeline", "CG_IMMERSIVE")
    timeline = None
    for i in range(1, int(project.GetTimelineCount() or 0) + 1):
        t = project.GetTimelineByIndex(i)
        if t and t.GetName() == tl_name:
            timeline = t
            print("timeline: %s exists — reusing" % tl_name)
            break
    if timeline is None:
        timeline = mp.CreateEmptyTimeline(tl_name)
        if timeline is None:
            sys.exit("Could not create timeline '%s'." % tl_name)
        project.SetCurrentTimeline(timeline)
        mp.AppendToTimeline(items)
        print("timeline: %s created, clips appended" % tl_name)

    print("\nNOT scriptable — the step that makes it genuine AIV:")
    print("  open the clip's Fusion comp and drop "
          "presets/PanoMap_LatLong_to_Immersive.setting on EACH eye stream")
    print("  (LatLong -> Immersive; recipe: "
          "reference/Fusion_PanoMap_Immersive_Comp_Recipe.md).")
    print("Then grade (PQ, 108-nit mapping) and run: resolve_aivu.py deliver")
    return 0


# ---------------------------------------------------------------------------
# deliver
# ---------------------------------------------------------------------------
def cmd_deliver(args, cfg, cfg_path):
    resolve = connect()
    project = get_project(resolve, cfg)
    rcfg = cfg["resolve"]

    preset = rcfg["render_preset_bundle"] if args.bundle \
        else rcfg["render_preset_review"]
    if not hasattr(project, "LoadRenderPreset"):
        sys.exit("This Resolve build has no LoadRenderPreset in the API — "
                 "load '%s' in the Deliver page by hand and render." % preset)
    if not project.LoadRenderPreset(preset):
        presets = project.GetRenderPresetList() or []
        sys.exit("Render preset '%s' not found.\nAvailable: %s\nBuild it once "
                 "in the Deliver page (see AIVU_MASTERING.md one-time list)."
                 % (preset, ", ".join(presets) or "(none)"))
    print("render preset: %s" % preset)

    out_dir = Path(args.out).expanduser()
    out_dir.mkdir(parents=True, exist_ok=True)
    custom = "%s_%s" % (cfg.get("shot_name", cfg.get("project", "shot")),
                        "bundle" if args.bundle else "aivu")
    project.SetRenderSettings({"TargetDir": str(out_dir), "CustomName": custom})

    job = project.AddRenderJob()
    if not job:
        sys.exit("AddRenderJob failed — is the timeline current and non-empty?")
    if not project.StartRendering([job]):
        sys.exit("StartRendering refused the job.")
    print("rendering '%s' to %s ..." % (custom, out_dir))
    while project.IsRenderingInProgress():
        time.sleep(5)
    status = project.GetRenderJobStatus(job) or {}
    state = status.get("JobStatus", "Unknown")
    print("job status: %s" % state)
    if state != "Complete":
        sys.exit("Render did not complete — check the Deliver page.")

    print("\nAcceptance test (every deliverable, no exceptions):")
    if args.bundle:
        print("  Bundle output -> Apple Immersive Video Utility > drag folder "
              "> 'Create .aivu File' (tick P3-D65 PQ), then:")
    print("  open the .aivu in Apple Immersive Video Utility, AirDrop/Wi-Fi "
          "to the Vision Pro, and confirm in-headset: real AIV wrap, depth, "
          "horizon, comfort. Review encodes are QC-grade, not final.")
    return 0


# ---------------------------------------------------------------------------
def cmd_config(args, cfg, cfg_path):
    print("config: %s" % cfg_path)
    print(json.dumps(cfg, indent=2))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Config-driven AIVU automation for Resolve Studio 20.1+."
    )
    ap.add_argument("--config", default=CONFIG_DEFAULT,
                    help="pipeline config (default %s)" % CONFIG_DEFAULT)
    sub = ap.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("discover", help="dump/suggest this build's keys")
    d.add_argument("--dump", default=DISCOVERY_OUT)
    d.add_argument("--write", action="store_true",
                   help="fill unambiguous null keys back into the config")

    c = sub.add_parser("conform", help="project + import + attrs + timeline")
    c.add_argument("--renders", required=True,
                   help="folder with the stereo EXR sequence")

    r = sub.add_parser("deliver", help="load AIVU preset, render, report")
    r.add_argument("--out", default="masters")
    r.add_argument("--bundle", action="store_true",
                   help="use the Bundle preset (ProRes+AIME) instead of Review")

    sub.add_parser("config", help="print resolved config and exit")

    args = ap.parse_args(argv)
    cfg, cfg_path = load_config(args.config)
    return {"discover": cmd_discover, "conform": cmd_conform,
            "deliver": cmd_deliver, "config": cmd_config}[args.cmd](args, cfg, cfg_path)


if __name__ == "__main__":
    sys.exit(main())
