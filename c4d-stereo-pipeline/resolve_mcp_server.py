#!/usr/bin/env python3
"""resolve-aivu — a purpose-built MCP server for DaVinci Resolve Studio with
first-class immersive / Apple Immersive Video (AIVU) support.

Built to close the gaps documented in reference/Resolve_MCP_Audit_and_AIVU_Gaps.md:
existing Resolve MCPs have zero immersive/stereo coverage and are missing the
three API entry points a real AIVU pipeline needs. This server ships them —
and adopts the audit's fixes rather than repeating the reviewed servers'
mistakes:

  * set_project_setting / set_clip_property / load_render_preset exist as
    typed tools (the audit's headline gap).
  * Liveness tests the app handle (GetProjectManager), never "is a project
    open" — a healthy connection with no project is not a dead connection.
  * execute_resolve_code is DISABLED unless RESOLVE_MCP_ALLOW_EXEC=1 is set
    in the server environment, and every executed snippet is logged.
  * No screenshot tool at all — the audit's privacy concern is solved by
    omission, not by a fallback.
  * Immersive setting keys are never guessed: discover_immersive_keys dumps
    the running build's real keys and can persist them to aivu_pipeline.json,
    which configure_immersive_workflow then applies.

Run (stdio transport):
    python3 resolve_mcp_server.py

Register with Claude Code:
    claude mcp add resolve-aivu -- python3 /abs/path/to/resolve_mcp_server.py

Requires: `pip install mcp`; DaVinci Resolve STUDIO running with
Preferences > System > General > External scripting = Local. Immersive
workflow settings need Resolve 20.1+; MV-HEVC delivery is macOS-only.
Full docs: RESOLVE_MCP.md.
"""

import contextlib
import io
import json
import logging
import os
import sys
import threading
import time
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from resolve_auto_conform import _default_module_paths

# stdout is the MCP protocol channel — all human/server chatter goes to stderr.
logging.basicConfig(stream=sys.stderr, level=logging.INFO,
                    format="[resolve-aivu] %(message)s")
log = logging.getLogger("resolve-aivu")

mcp = FastMCP("resolve-aivu")

_LOCK = threading.RLock()
_RESOLVE = None

CONFIG_DEFAULT = str(Path(__file__).resolve().parent / "aivu_pipeline.json")


# ---------------------------------------------------------------------------
# Connection (lazy, cached, audit-correct liveness)
# ---------------------------------------------------------------------------
def _import_module():
    try:
        import DaVinciResolveScript as dvr
        return dvr, None
    except ImportError:
        for p in _default_module_paths():
            if os.path.isdir(p) and p not in sys.path:
                sys.path.append(p)
        try:
            import DaVinciResolveScript as dvr
            return dvr, None
        except ImportError as err:
            return None, ("DaVinciResolveScript not importable (%s). For a "
                          "non-default install set PYTHONPATH / "
                          "RESOLVE_SCRIPT_API / RESOLVE_SCRIPT_LIB "
                          "(see RESOLVE_AUTOMATION.md)." % err)


def _get_resolve():
    """Return (resolve_app, error). Liveness = app handle, NOT project."""
    global _RESOLVE
    with _LOCK:
        if _RESOLVE is not None:
            try:
                if _RESOLVE.GetProjectManager() is not None:
                    return _RESOLVE, None
            except Exception:
                pass
            _RESOLVE = None  # genuinely dead — reconnect below
        dvr, err = _import_module()
        if dvr is None:
            return None, err
        app = dvr.scriptapp("Resolve")
        if app is None:
            return None, ("Scripting module loaded but Resolve is unreachable. "
                          "Is Resolve (Studio) RUNNING, with Preferences > "
                          "System > General > External scripting = Local?")
        _RESOLVE = app
        return app, None


def _project():
    """Return (app, project, error). Project may legitimately be None."""
    app, err = _get_resolve()
    if app is None:
        return None, None, err
    pm = app.GetProjectManager()
    project = pm.GetCurrentProject() if pm else None
    if project is None:
        return app, None, "No project open — call open_project first."
    return app, project, None


def _find_clip(project, clip_name):
    """Find a media-pool clip by name in current folder then root subfolders.
    Empty name = first clip of the current folder."""
    mp = project.GetMediaPool()
    folders = []
    current = mp.GetCurrentFolder()
    if current:
        folders.append(current)
    root = mp.GetRootFolder()
    if root:
        folders.append(root)
        folders.extend(root.GetSubFolderList() or [])
    seen = set()
    for folder in folders:
        if id(folder) in seen:
            continue
        seen.add(id(folder))
        for clip in folder.GetClipList() or []:
            if not clip_name or clip.GetName() == clip_name:
                return clip
    return None


def _j(data):
    return json.dumps(data, indent=2, default=str)


# ---------------------------------------------------------------------------
# Meta / project tools
# ---------------------------------------------------------------------------
@mcp.tool()
def resolve_status() -> str:
    """Connection and context check — call this first. Reports Resolve
    version, current project, current timeline, and page."""
    app, err = _get_resolve()
    if app is None:
        return "NOT CONNECTED: %s" % err
    pm = app.GetProjectManager()
    project = pm.GetCurrentProject() if pm else None
    timeline = project.GetCurrentTimeline() if project else None
    info = {
        "connected": True,
        "version": getattr(app, "GetVersionString", lambda: "unknown")(),
        "current_project": project.GetName() if project else None,
        "current_timeline": timeline.GetName() if timeline else None,
        "current_page": getattr(app, "GetCurrentPage", lambda: None)(),
    }
    return _j(info)


@mcp.tool()
def open_project(name: str, create_if_missing: bool = True) -> str:
    """Load a Resolve project by name (optionally creating it)."""
    app, err = _get_resolve()
    if app is None:
        return "ERROR: %s" % err
    pm = app.GetProjectManager()
    project = pm.LoadProject(name)
    if project is None and create_if_missing:
        project = pm.CreateProject(name)
        if project:
            return "Created and opened project '%s'." % name
    if project is None:
        return ("ERROR: could not load%s project '%s'."
                % ("/create" if create_if_missing else "", name))
    return "Opened project '%s'." % name


@mcp.tool()
def get_project_setting(key: str = "") -> str:
    """Read project settings. Empty key returns the FULL settings dict —
    the way to see this build's real (unpublished) immersive keys."""
    _, project, err = _project()
    if err:
        return "ERROR: %s" % err
    return _j(project.GetSetting(key if key else ""))


@mcp.tool()
def set_project_setting(key: str, value: str) -> str:
    """Set a project setting (Project.SetSetting) — e.g. timelineFrameRate,
    or the immersive-workflow key found via discover_immersive_keys.
    Note: some settings lock once timelines exist (fps)."""
    _, project, err = _project()
    if err:
        return "ERROR: %s" % err
    ok = project.SetSetting(key, value)
    return ("Set %s = %s" % (key, value)) if ok else (
        "FAILED to set %s (locked by existing timelines, read-only, or "
        "unknown key — dump keys with get_project_setting(''))." % key)


# ---------------------------------------------------------------------------
# Media / clip tools
# ---------------------------------------------------------------------------
@mcp.tool()
def import_media(path: str) -> str:
    """Import a file or folder (image sequences collapse to one clip) into
    the current Media Pool folder. Returns the imported clip names."""
    app, project, err = _project()
    if err:
        return "ERROR: %s" % err
    p = Path(path).expanduser()
    if not p.exists():
        return "ERROR: path not found: %s" % p
    items = app.GetMediaStorage().AddItemListToMediaPool([str(p)]) or []
    if not items:
        return "ERROR: nothing imported from %s." % p
    return _j({"imported": [clip.GetName() for clip in items]})


@mcp.tool()
def get_clip_properties(clip_name: str = "") -> str:
    """Dump a media-pool clip's full property dict (empty name = first clip
    of the current folder). This is where the Stereoscopic Mode / Projection
    keys for immersive conforms live."""
    _, project, err = _project()
    if err:
        return "ERROR: %s" % err
    clip = _find_clip(project, clip_name)
    if clip is None:
        return "ERROR: clip %s not found in Media Pool." % (
            "'%s'" % clip_name if clip_name else "(none imported)")
    return _j({"clip": clip.GetName(), "properties": clip.GetClipProperty()})


@mcp.tool()
def set_clip_property(clip_name: str, key: str, value: str) -> str:
    """Set a media-pool clip property (MediaPoolItem.SetClipProperty) — the
    only scriptable route to per-clip Stereoscopic Mode and Projection
    Format. Empty clip_name targets the first clip of the current folder."""
    _, project, err = _project()
    if err:
        return "ERROR: %s" % err
    clip = _find_clip(project, clip_name)
    if clip is None:
        return "ERROR: clip '%s' not found." % clip_name
    ok = clip.SetClipProperty(key, value)
    return ("Set '%s'.%s = %s" % (clip.GetName(), key, value)) if ok else (
        "FAILED to set %s on '%s' (unknown key or value — dump with "
        "get_clip_properties('%s'))." % (key, clip.GetName(), clip.GetName()))


# ---------------------------------------------------------------------------
# Timeline tools
# ---------------------------------------------------------------------------
@mcp.tool()
def list_timelines() -> str:
    """List timelines in the current project; marks the current one."""
    _, project, err = _project()
    if err:
        return "ERROR: %s" % err
    current = project.GetCurrentTimeline()
    current_name = current.GetName() if current else None
    names = []
    for i in range(1, int(project.GetTimelineCount() or 0) + 1):
        tl = project.GetTimelineByIndex(i)
        if tl:
            names.append({"name": tl.GetName(),
                          "current": tl.GetName() == current_name})
    return _j(names)


@mcp.tool()
def create_timeline(name: str, append_all_clips: bool = False) -> str:
    """Create an empty timeline (becomes current). Optionally append every
    clip in the current Media Pool folder in name order."""
    _, project, err = _project()
    if err:
        return "ERROR: %s" % err
    mp = project.GetMediaPool()
    timeline = mp.CreateEmptyTimeline(name)
    if timeline is None:
        return "ERROR: could not create timeline '%s' (name in use?)." % name
    project.SetCurrentTimeline(timeline)
    appended = 0
    if append_all_clips:
        folder = mp.GetCurrentFolder()
        clips = sorted(folder.GetClipList() or [],
                       key=lambda c: c.GetName() or "") if folder else []
        if clips and mp.AppendToTimeline(clips):
            appended = len(clips)
    return "Created timeline '%s'%s." % (
        name, ", appended %d clip(s)" % appended if append_all_clips else "")


@mcp.tool()
def set_current_timeline(name: str) -> str:
    """Switch the current timeline by name."""
    _, project, err = _project()
    if err:
        return "ERROR: %s" % err
    for i in range(1, int(project.GetTimelineCount() or 0) + 1):
        tl = project.GetTimelineByIndex(i)
        if tl and tl.GetName() == name:
            project.SetCurrentTimeline(tl)
            return "Current timeline: %s" % name
    return "ERROR: timeline '%s' not found." % name


@mcp.tool()
def set_timeline_setting(key: str, value: str) -> str:
    """Set a setting on the CURRENT timeline (Timeline.SetSetting)."""
    _, project, err = _project()
    if err:
        return "ERROR: %s" % err
    timeline = project.GetCurrentTimeline()
    if timeline is None:
        return "ERROR: no current timeline."
    ok = timeline.SetSetting(key, value)
    return ("Set timeline %s = %s" % (key, value)) if ok else (
        "FAILED to set timeline %s (unknown key/value?)." % key)


# ---------------------------------------------------------------------------
# Deliver tools
# ---------------------------------------------------------------------------
@mcp.tool()
def list_render_presets() -> str:
    """List saved Deliver-page render presets (e.g. AIVU_VisionPro_Review /
    AIVU_VisionPro_Bundle built per AIVU_MASTERING.md), plus formats."""
    _, project, err = _project()
    if err:
        return "ERROR: %s" % err
    return _j({
        "presets": project.GetRenderPresetList() or [],
        "formats": project.GetRenderFormats() or {},
        "quicktime_codecs": project.GetRenderCodecs("QuickTime") or {},
    })


@mcp.tool()
def load_render_preset(name: str) -> str:
    """Apply a saved render preset (Project.LoadRenderPreset) — the robust
    route to immersive/MV-HEVC delivery: build the preset once in the
    Deliver UI, load it here forever after."""
    _, project, err = _project()
    if err:
        return "ERROR: %s" % err
    if not hasattr(project, "LoadRenderPreset"):
        return "ERROR: this Resolve build's API lacks LoadRenderPreset."
    if project.LoadRenderPreset(name):
        return "Loaded render preset '%s'." % name
    return ("FAILED: preset '%s' not found. Available: %s"
            % (name, ", ".join(project.GetRenderPresetList() or []) or "(none)"))


@mcp.tool()
def render(target_dir: str = "", custom_name: str = "", wait: bool = True) -> str:
    """Queue the current timeline with the currently-loaded render settings/
    preset, start rendering, and (by default) wait for completion. Set
    target_dir/custom_name to override the preset's output location."""
    _, project, err = _project()
    if err:
        return "ERROR: %s" % err
    settings = {}
    if target_dir:
        out = Path(target_dir).expanduser()
        out.mkdir(parents=True, exist_ok=True)
        settings["TargetDir"] = str(out)
    if custom_name:
        settings["CustomName"] = custom_name
    if settings:
        project.SetRenderSettings(settings)
    job = project.AddRenderJob()
    if not job:
        return "ERROR: AddRenderJob failed (empty/invalid timeline?)."
    if not project.StartRendering([job]):
        return "ERROR: StartRendering refused job %s." % job
    if not wait:
        return "Rendering started, job %s (poll with render_status later)." % job
    while project.IsRenderingInProgress():
        time.sleep(3)
    status = project.GetRenderJobStatus(job) or {}
    return _j({"job": job, "status": status})


# ---------------------------------------------------------------------------
# Immersive / AIVU tools (the reason this server exists)
# ---------------------------------------------------------------------------
@mcp.tool()
def discover_immersive_keys(write_to_config: bool = False,
                            config_path: str = "") -> str:
    """Dump this Resolve build's REAL immersive-related keys instead of
    guessing: project-setting keys containing immersive/spatial, clip
    property keys containing stereo/projection, and the saved render
    presets. With write_to_config=True, unambiguous finds are persisted
    into aivu_pipeline.json for configure_immersive_workflow to apply."""
    _, project, err = _project()
    if err:
        return "ERROR: %s" % err
    settings = project.GetSetting("") or {}
    clip = _find_clip(project, "")
    clip_props = (clip.GetClipProperty() or {}) if clip else {}

    def suggest(keys, needles):
        return [str(k) for k in keys
                if any(n in str(k).lower() for n in needles)]

    result = {
        "immersive_project_keys": suggest(settings.keys(),
                                          ("immersive", "spatial")),
        "stereo_clip_keys": suggest(clip_props.keys(), ("stereo",)),
        "projection_clip_keys": suggest(clip_props.keys(), ("projection",)),
        "render_presets": project.GetRenderPresetList() or [],
        "clip_inspected": clip.GetName() if clip else None,
        "note": (None if clip else "No clip imported yet — clip keys can't "
                 "be discovered until one is (import_media first)."),
    }

    if write_to_config:
        path = Path(config_path or CONFIG_DEFAULT)
        if not path.is_file():
            result["config"] = "not found: %s" % path
        else:
            cfg = json.loads(path.read_text())
            s = cfg["resolve"]["settings"]
            c = cfg["resolve"]["clip_attributes"]
            changed = []
            if s.get("immersive_workflow_key") is None \
                    and len(result["immersive_project_keys"]) == 1:
                s["immersive_workflow_key"] = result["immersive_project_keys"][0]
                changed.append("immersive_workflow_key")
            if c.get("stereo_mode_key") is None \
                    and len(result["stereo_clip_keys"]) == 1:
                c["stereo_mode_key"] = result["stereo_clip_keys"][0]
                changed.append("stereo_mode_key")
            if c.get("projection_key") is None \
                    and len(result["projection_clip_keys"]) == 1:
                c["projection_key"] = result["projection_clip_keys"][0]
                changed.append("projection_key")
            if changed:
                path.write_text(json.dumps(cfg, indent=2))
            result["config"] = {"path": str(path), "wrote": changed or "nothing"}
    return _j(result)


@mcp.tool()
def configure_immersive_workflow(config_path: str = "") -> str:
    """Apply the AIVU pipeline config (aivu_pipeline.json) to the current
    project: immersive-workflow setting (if its key is known — run
    discover_immersive_keys first), fps and other extras, and clip
    attributes (Stereo SBS / Equirect 180) on every clip in the current
    folder. Reports every applied/skipped item. The Fusion PanoMap
    reprojection and Deliver presets remain one-time UI builds — see
    AIVU_MASTERING.md."""
    _, project, err = _project()
    if err:
        return "ERROR: %s" % err
    path = Path(config_path or CONFIG_DEFAULT)
    if not path.is_file():
        return "ERROR: config not found: %s" % path
    cfg = json.loads(path.read_text())
    rcfg = cfg["resolve"]
    report = {"config": str(path), "settings": [], "clips": [], "manual": []}

    s = rcfg["settings"]
    if s.get("immersive_workflow_key"):
        ok = project.SetSetting(s["immersive_workflow_key"],
                                s["immersive_workflow_value"])
        report["settings"].append("%s = %s: %s" % (
            s["immersive_workflow_key"], s["immersive_workflow_value"],
            "ok" if ok else "FAILED"))
    else:
        report["manual"].append(
            "immersive workflow key unknown — discover_immersive_keys, or UI: "
            "Project Settings > Master > Immersive workflows > %s"
            % s["immersive_workflow_value"])
    for key, value in (s.get("extra") or {}).items():
        ok = project.SetSetting(key, str(value))
        report["settings"].append("%s = %s: %s"
                                  % (key, value, "ok" if ok else "FAILED"))

    c = rcfg["clip_attributes"]
    mp = project.GetMediaPool()
    folder = mp.GetCurrentFolder()
    clips = (folder.GetClipList() or []) if folder else []
    for clip in clips:
        for key_id, value_id in (("stereo_mode_key", "stereo_mode_value"),
                                 ("projection_key", "projection_value")):
            key, value = c.get(key_id), c.get(value_id)
            if key:
                ok = clip.SetClipProperty(key, value)
                report["clips"].append("'%s' %s = %s: %s" % (
                    clip.GetName(), key, value, "ok" if ok else "FAILED"))
    if not (c.get("stereo_mode_key") and c.get("projection_key")):
        report["manual"].append(
            "clip attribute keys incomplete — set once by hand (Clip "
            "Attributes > Stereoscopic %s, Projection %s) then re-run "
            "discover_immersive_keys(write_to_config=True)"
            % (c["stereo_mode_value"], c["projection_value"]))
    return _j(report)


# ---------------------------------------------------------------------------
# Escape hatch (gated + logged, per the audit)
# ---------------------------------------------------------------------------
@mcp.tool()
def execute_resolve_code(code: str) -> str:
    """DISABLED BY DEFAULT. Run raw Python against the scripting API with
    resolve / project / media_pool / timeline bound. Enable by setting
    RESOLVE_MCP_ALLOW_EXEC=1 in the server's environment. Every snippet is
    logged to stderr. Prefer the typed tools — this exists only for the
    corners the API reaches but no tool covers yet."""
    if os.environ.get("RESOLVE_MCP_ALLOW_EXEC") != "1":
        return ("Disabled. Start the server with RESOLVE_MCP_ALLOW_EXEC=1 to "
                "enable this tool (defense-in-depth per the MCP audit — see "
                "RESOLVE_MCP.md).")
    app, err = _get_resolve()
    if app is None:
        return "ERROR: %s" % err
    log.info("execute_resolve_code:\n%s", code)
    pm = app.GetProjectManager()
    project = pm.GetCurrentProject() if pm else None
    namespace = {
        "resolve": app,
        "project": project,
        "media_pool": project.GetMediaPool() if project else None,
        "timeline": project.GetCurrentTimeline() if project else None,
        "json": json,
    }
    buffer = io.StringIO()
    try:
        with contextlib.redirect_stdout(buffer):
            exec(code, namespace)  # noqa: S102 — gated + logged by design
    except Exception as exc:
        return "EXCEPTION: %r\n--- stdout ---\n%s" % (exc, buffer.getvalue())
    out = buffer.getvalue()
    return out if out.strip() else "(no output)"


if __name__ == "__main__":
    log.info("starting resolve-aivu MCP server (stdio); exec tool %s",
             "ENABLED" if os.environ.get("RESOLVE_MCP_ALLOW_EXEC") == "1"
             else "disabled")
    mcp.run()
