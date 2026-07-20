# DaVinci Resolve MCP — Audit, Best Practices & AIVU Gaps
_Review of `barckley75/resolve-claude-mcp` (server, 52 tools) + the `davinci-resolve-mcp` skill (docs). Jul 2026._

## Verdict
The `barckley75/resolve-claude-mcp` server is **well-engineered and, with few exceptions, uses the Resolve scripting API correctly** — good error handling, thread safety, cross-platform import guarding, full type hints, and honest README disclosures. The **headline gap for your work: zero immersive / Apple Immersive Video / stereoscopic support.** It can only reach the AIVU pipeline through the `execute_resolve_code` escape hatch, and the three API entry points a real immersive pipeline needs — `SetSetting`, `SetClipProperty`, `LoadRenderPreset` — are **not wired into any tool.** That's the fix that matters.

The uploaded **skill** (for the *other* MCP, `samuelgursky/davinci-resolve-mcp`, 27 compound tools) is a strong, well-organized general-Resolve reference, but it **also has no immersive/AIVU coverage** (only a `timeline_item_stereo` tool for legacy stereo convergence).

---

## Strengths (barckley75 server)
- **Correct, defensive API usage** — verified: `MediaPool.ImportMedia/AppendToTimeline/CreateEmptyTimeline`, `Timeline.AddMarker`, `TimelineItem.SetCDL/SetProperty`, `Graph.SetLUT`, full render chain (`SetCurrentRenderFormatAndCodec → SetRenderSettings → AddRenderJob → StartRendering → GetRenderJobStatus`).
- **Enum constants handled the right way** — `export_timeline` / `create_subtitles_from_audio` map friendly strings to constant *names* and resolve via `getattr(resolve, NAME, None)` with a `None` guard. This is the correct pattern for Resolve's fragile constants.
- **Connection layer** — `RLock` thread safety, fresh accessors, auto-config of `RESOLVE_SCRIPT_LIB`/`sys.path`, lazy reconnect, non-fatal startup.
- **Cross-platform safe** — `Quartz` import is lazy/guarded; platform deps gated in `pyproject.toml`.
- **Transcription** — ffmpeg auto-chunking with rolling prompt continuity, tempdir cleanup in `finally`.
- **README disclosure is exemplary** — states plainly that `execute_resolve_code` runs arbitrary Python and that `screenshot` images are sent to the AI provider.

---

## Prioritized issues to fix

**HIGH**
1. **`execute_resolve_code` is ungated in code.** Runs raw `exec()` with `resolve/project/mediaPool/timeline/mediaStorage` + full filesystem access; the only guard is client approval + README prose. Add defense-in-depth: **disable by default behind an env flag** (`RESOLVE_MCP_ALLOW_EXEC=1`) and log every executed snippet.

**MEDIUM**
2. **`screenshot` silently falls back to full-screen.** If the Resolve window isn't found, `_capture_screenshot` runs `screencapture -x` on the **whole display** (other apps, notifications, passwords) and sends it to the provider. Make the fallback opt-in, or return a "window not found" error instead.
3. **`is_alive()` conflates "no project open" with "dead connection"** — it returns `False` when `GetCurrentProject()` is `None`, and since it's called on **every** tool invocation, a healthy connection with no project open gets torn down and rebuilt every call. Fix: test the app handle (`GetProjectManager() is not None`), not project presence.
4. **Version claims understated.** README says Studio 18.0+, but Magic Mask/Smart Reframe/Stabilize need ~19.x, Voice Isolation ~20, and **`DetectSceneCuts()` is only scriptable in Resolve 21** (the tool's error string wrongly says "19+"). Correct the docs and version-gate.
5. **No `LoadRenderPreset`, `SetSetting`, or `SetClipProperty` tools** — can *read* settings but not *apply* a render preset, change project/timeline settings, or set clip attributes except via `execute_resolve_code`. This is also the AIVU blocker (below).

**LOW**
6. `RLock` held across arbitrary `exec` and every API call (serializes tools — fine for single-user).
7. Blocking transcription/ffmpeg with no `shutil.which()` pre-check (raw `FileNotFoundError` if ffmpeg missing).
8. Mixed return conventions (`json.dumps` vs `_ok(...)` which discards the API's failure reason).
9. Unvalidated filesystem paths in `import_media`/`export_*` (local-tool risk, no confinement).
10. `get_current_thumbnail` requires the Color page but doesn't auto-switch/detect.

---

## The AIVU gap — what to add

**Confirmed:** no tool references immersive, stereo, projection, MV-HEVC, spatial, equirect, or 180/360. No `SetSetting`, `SetClipProperty`, `SetCurrentRenderMode`, or `LoadRenderPreset` anywhere.

**Can current tools drive AIVU anyway?**
- `execute_resolve_code` — **yes, but fragile**: it can call `project.SetSetting(...)`, `mediaPoolItem.SetClipProperty(...)`, `project.LoadRenderPreset(...)` *if the model already knows the exact, version-specific keys.* Undiscoverable for repeatable pro work.
- `set_render_settings` — **partial**: passes an arbitrary dict to `SetRenderSettings` and can set format/codec, but the immersive-specific config (MV-HEVC eye layout, Apple Immersive projection/packaging) largely lives in the Deliver **format/codec selection and render presets**, not `SetRenderSettings` keys — and there's no `LoadRenderPreset` tool to reach the preset path.

**Reality check:** the true AIV reprojection (Fusion PanoMap lat/long→immersive, Immersive Patcher, ILPD assignment, Renderer3D) is **Fusion/UI work that the scripting API exposes only thinly** — the MCP will not fully automate it. The right division of labor: **MCP automates project setup + import + timeline + applying a pre-built AIVU render preset**; the reprojection comp + ILPD is built once in the UI and saved as a Fusion `.setting` / render preset.

### Recommended new tools
1. **`set_project_setting` / `get_project_setting`** → `Project.SetSetting/GetSetting`. Only way to toggle immersive/spatial + color-management settings. Ship a documented key list, version-gate.
2. **`set_clip_property`** → `MediaPoolItem.SetClipProperty`. Needed for per-clip **Stereoscopic Mode** and **Projection Format** (180/mono/stereo). Note: `TimelineItem.SetProperty` (what `set_timeline_item_property` uses) is transform/composite only and **cannot** reach these.
3. **`load_render_preset`** → `Project.LoadRenderPreset(name)` — apply the AIVU/MV-HEVC preset built once in the Deliver UI. This is the robust route to immersive delivery.
4. Optional: `set_timeline_setting`, plus a `configure_immersive_workflow` convenience wrapper.

Frame all of these **experimental / version-gated (Resolve 20.1+ Studio, Apple Silicon; MV-HEVC export macOS-only)** and document exact keys, since Resolve's *scripting* coverage of immersive is itself limited and partly preset-driven.

---

## Bridge you can use TODAY (via `execute_resolve_code`)

Before adding tools, **introspect** to discover the exact keys on this Resolve build, then set them. Run these through `execute_resolve_code`:

```python
# 1) Dump every project setting key/value (find the immersive-workflow + color keys)
import json
proj = resolve.GetProjectManager().GetCurrentProject()
print(json.dumps(proj.GetSetting(''), indent=2, default=str))   # '' returns the full dict

# 2) List clip properties on the selected media-pool item (find Stereo/Projection keys)
mp = proj.GetMediaPool()
item = mp.GetCurrentFolder().GetClipList()[0]
print(json.dumps(item.GetClipProperty(), indent=2, default=str))

# 3) List render formats/codecs + saved presets (find the MV-HEVC / Apple Immersive entries)
print(proj.GetRenderFormats())
print(proj.GetRenderCodecs('QuickTime'))
print(proj.GetRenderPresetList())
```

Then apply, e.g.:
```python
proj.SetSetting('<immersiveWorkflowKey>', 'Apple Immersive')   # key from step 1
proj.SetSetting('timelineFrameRate', '90')
item.SetClipProperty('<stereoKey>', 'Side by Side')            # keys from step 2
item.SetClipProperty('<projectionKey>', 'Equirectangular 180')
proj.LoadRenderPreset('AIVU_VisionPro_Review')                 # preset built once in UI
proj.SetCurrentRenderMode(1)
proj.AddRenderJob(); proj.StartRendering()
```

⚠ The exact key strings (`immersiveWorkflowKey`, `stereoKey`, `projectionKey`) are **not published** and vary by version — that's why step 1–2 introspection is the honest first move rather than guessing. Capture what they return and hard-code them into the new tools.

---

## Sources
- DaVinci Resolve Scripting API (community mirrors): https://deric.github.io/DaVinciResolve-API-Docs/ · https://gist.github.com/mhadifilms/2b84d469135315793220dbf2226cbe63
- Resolve Immersive Workflow Guide: https://documents.blackmagicdesign.com/SupportNotes/DaVinci_Resolve_Immersive_Workflow_Guide.pdf
- Repo: https://github.com/barckley75/resolve-claude-mcp
