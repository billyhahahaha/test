# resolve-aivu MCP server

A purpose-built [MCP](https://modelcontextprotocol.io) server that lets
Claude (Code, Desktop, or any MCP client) drive DaVinci Resolve Studio —
with the immersive/AIVU coverage that the audited community servers lack
(`reference/Resolve_MCP_Audit_and_AIVU_Gaps.md` is the spec this was built
against).

## Why this exists

The audit found the existing Resolve MCPs (52- and 27-tool servers) have
**zero** immersive/stereo/AIVU support and are missing the three API entry
points that matter: `SetSetting`, `SetClipProperty`, `LoadRenderPreset`.
This server ships those as typed tools, plus the audit's safety fixes:

| Audit finding | What this server does |
| --- | --- |
| `execute_resolve_code` ungated (HIGH) | Disabled unless `RESOLVE_MCP_ALLOW_EXEC=1`; every snippet logged to stderr |
| Screenshot falls back to full display (MEDIUM) | No screenshot tool at all |
| `is_alive` conflates "no project" with "dead" (MEDIUM) | Liveness = `GetProjectManager()` app handle; reconnect only when genuinely dead |
| Missing `SetSetting`/`SetClipProperty`/`LoadRenderPreset` (MEDIUM + AIVU blocker) | All three are first-class tools |
| Unpublished immersive keys → guessing | `discover_immersive_keys` dumps the running build's real keys, optionally persists them to `aivu_pipeline.json` |

## Setup

```bash
pip install mcp                       # MCP Python SDK
# Resolve Studio running · Preferences > System > General > External scripting = Local
```

Register with **Claude Code** (project scope):

```bash
claude mcp add resolve-aivu -- python3 /abs/path/to/c4d-stereo-pipeline/resolve_mcp_server.py
```

or in `.mcp.json`:

```json
{
  "mcpServers": {
    "resolve-aivu": {
      "command": "python3",
      "args": ["/abs/path/to/c4d-stereo-pipeline/resolve_mcp_server.py"],
      "env": {}
    }
  }
}
```

To enable the escape hatch (off by default, on your own head):
`"env": {"RESOLVE_MCP_ALLOW_EXEC": "1"}`.

The server keeps `resolve_auto_conform.py` next to it (shared connection
boilerplate) — register it from inside this folder.

## Tools (17)

**Meta / project** — `resolve_status` · `open_project` ·
`get_project_setting` (empty key = full dict dump) · `set_project_setting`

**Media / clips** — `import_media` (folder → sequence clip) ·
`get_clip_properties` · `set_clip_property` (the only scriptable route to
per-clip Stereoscopic Mode / Projection Format)

**Timelines** — `list_timelines` · `create_timeline` ·
`set_current_timeline` · `set_timeline_setting`

**Deliver** — `list_render_presets` · `load_render_preset` (the robust
immersive-delivery route: UI-built preset, script-loaded forever) ·
`render` (queue + start + wait + status)

**Immersive / AIVU** — `discover_immersive_keys` (dump + suggest + optional
config write) · `configure_immersive_workflow` (applies
`aivu_pipeline.json`: workflow setting, fps, clip attributes; reports every
applied/skipped/manual item)

**Escape hatch** — `execute_resolve_code` (gated + logged; prints are
captured, so exec'd code can't corrupt the MCP stdio channel)

## The AIVU conversation it enables

```
you:    "conform the Cadillac render"
claude: open_project("STERO TEST FOR VISION PRO CLAUDE")
        import_media("~/Desktop/PETER PAN(for compressor)/STEREO_EXR")
        configure_immersive_workflow()          ← config-driven, no guessing
        create_timeline("CG_IMMERSIVE", append_all_clips=True)
        → "PanoMap .setting on each eye stream is your 30-second manual step"
you:    (grade)
you:    "deliver a review aivu"
claude: load_render_preset("AIVU_VisionPro_Review")
        render(target_dir="~/masters", custom_name="Cadillac_aivu")
        → job Complete + Utility acceptance checklist
```

First run on a new Resolve build: `discover_immersive_keys(write_to_config=True)`
once (after one clip is imported), and the unpublished key names are learned
and stored — after that, everything above is deterministic.

## Limits (same physics as everything else in this pipeline)

- Requires **Resolve Studio**; immersive workflow settings need **20.1+**;
  MV-HEVC/AIVU delivery is macOS/Apple Silicon.
- The Fusion **PanoMap reprojection** and the two **Vision Pro Deliver
  presets** are one-time UI builds (`AIVU_MASTERING.md` §one-time). The API
  doesn't reach them; the server loads/uses them by name afterwards.
- Version-sensitive calls degrade with explicit errors (e.g. a build
  without `LoadRenderPreset` says so) rather than pretending.
