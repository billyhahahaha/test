# Automating Resolve — `resolve_auto_conform.py`

Scripted version of the Resolve Studio leg: it conforms the C4D renders,
mirrors your grade between the eyes, renders the masters, and hands them to
`package_spatial.py` — so the manual work shrinks to *grading one timeline*.

```
C4D renders ──▶ [conform] ──▶ YOU grade TL_L ──▶ [sync ▸ render ▸ package] ──▶ .mov (MV-HEVC)
                 scripted                              scripted
```

## One-time setup

1. **DaVinci Resolve Studio** (free Resolve has neither stereo tools nor
   external scripting).
2. Resolve **running**, with: Preferences → System → General →
   **External scripting using: Local**.
3. Plain `python3` on the same machine. The script auto-appends Resolve's
   default scripting-module path per OS; for non-standard installs set the
   usual trio yourself:

   | OS | Module path to add to `PYTHONPATH` |
   | --- | --- |
   | macOS | `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules` |
   | Windows | `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules` |
   | Linux | `/opt/resolve/Developer/Scripting/Modules` |

   (plus `RESOLVE_SCRIPT_API` / `RESOLVE_SCRIPT_LIB` per Blackmagic's
   scripting README if you relocate the app itself).

Prefer running inside Resolve? Drop the script into the Scripts folder
(macOS: `~/Library/Application Support/Blackmagic Design/DaVinci Resolve/
Fusion/Scripts/Utility/`) and it appears under **Workspace → Scripts**; with
no CLI args it errors helpfully, so in-app use is best for the conform phase
only — external CLI is the intended mode.

## Phase 1 — conform (seconds after the C4D render lands)

```bash
python3 resolve_auto_conform.py \
    --project MyPrj_Stereo \
    --renders ~/prj/renders/MyPrj \
    --fps 30 --width 3840 --height 2160        # VR180: --width 4096 --height 4096
```

Creates/loads the project, sets timeline resolution/fps, imports
`renders/MyPrj/L` and `/R` into bins **L** and **R** (EXR sequences collapse
to clips), and builds timelines **TL_L** and **TL_R** with the clips appended
in name order. Re-runnable: existing bins/timelines are reused, not
duplicated.

Then do the one human step: **grade TL_L** (and set your color-management
input transform in Project Settings if you haven't). Touch only TL_L — R is
script-territory.

## Phase 2 — finish

```bash
python3 resolve_auto_conform.py \
    --project MyPrj_Stereo \
    --sync-grades --render --out ~/masters \
    --package --spatial-out ~/masters/MyPrj_spatial.mov \
    --interaxial-cm 6.5 --focal 36 --sensor 36
```

- `--sync-grades` — copies every grade TL_L → TL_R item-by-item
  (`TimelineItem.CopyGrades`, Resolve 18.5+).
- `--render` — queues both timelines as QuickTime **ProRes 422 HQ** (codec
  discovered from your build's codec list), renders only those jobs, waits,
  and verifies completion. Masters land as `<project>_L.mov` / `_R.mov`.
- `--package` — invokes `package_spatial.py --run` on the pair with your rig
  numbers → MV-HEVC spatial `.mov`. Add `--projection hequ` for the VR180 /
  APMP immersive flavour (`APPLE_IMMERSIVE_180.md`).

Every flag is independent: re-grade and re-run phase 2 as often as you like;
`--sync-grades` alone is a cheap "mirror my latest pass" button.

## What stays manual, and why

| Step | Why |
| --- | --- |
| **Convert to Stereo 3D** (native stereo clips) | Not exposed in the scripting API (through Resolve 20). The automated route grades two mirrored timelines instead — same masters out. If you want native stereo clips (Stereo 3D palette, floating windows, SBS monitoring), do the manual workflow in `RESOLVE_TO_VISIONPRO.md`; the conform phase still saves you the import/setup. |
| Grading | That's the job. |
| Color-management input transform | Values differ per house style/version; set once in Project Settings. |
| Resolve's own MV-HEVC export (Route A) | Deliver-page spatial options aren't scriptable; the scripted route packages via `package_spatial.py` instead (Route C — same result, plus it's what `--package` uses). |

## Troubleshooting

| Error | Fix |
| --- | --- |
| `Could not import DaVinciResolveScript` | Non-standard install → set `PYTHONPATH`/`RESOLVE_SCRIPT_API`/`RESOLVE_SCRIPT_LIB` per the table above |
| `Connected to the module but not to Resolve` | Resolve isn't running, or external scripting pref isn't `Local`, or free (non-Studio) build |
| fps setting `SKIPPED (locked?)` | Project already has timelines — fps is locked; start a fresh project name |
| `CopyGrades` missing | Resolve < 18.5 → update, or copy grades via stills/PowerGrade |
| Render job stuck `Failed` | Open the Deliver page — codec/disk errors show there; re-run `--render` |
| Masters render but look ungraded on R | You graded after syncing → re-run `--sync-grades --render` |

Headless note: Resolve Studio can run `-nogui` for farm-style automation of
exactly this phase-2 work; same API, no UI. Test interactively first.
