#!/usr/bin/env python3
"""Package stereo output from DaVinci Resolve into an Apple Vision Pro
spatial video (MV-HEVC .mov) — the last step of the pipeline.

Runs on macOS (Apple Silicon recommended). Wraps two tools:

  * ffmpeg        — only if you hand it separate L/R movies: they get muxed
                    into one full-width side-by-side (SBS) intermediate.
  * spatial CLI   — Mike Swanson's MV-HEVC encoder/tagger
                    (https://blog.mikeswanson.com/spatial/ — installable via
                    his Homebrew tap). Flag names below match spatial 1.x;
                    run `spatial make --help` if yours differ.

The script computes the spatial metadata FROM YOUR RIG NUMBERS so the file
carries physically-correct depth hints:

  --hfov   horizontal field of view  = 2*atan(sensor / 2*focal)
  --cdist  camera baseline in mm     = interaxial (cm) * 10

By default it just PRINTS the exact commands (dry run). Add --run to execute.

Examples:

  # Two discrete eye masters out of Resolve:
  python3 package_spatial.py --left L.mov --right R.mov --out shot_spatial.mov \
      --focal 36 --sensor 36 --interaxial-cm 6.5 --run

  # Already have a full-width SBS master:
  python3 package_spatial.py --sbs shot_SBS.mov --out shot_spatial.mov \
      --focal 36 --sensor 36 --interaxial-cm 6.5 --hadjust 0.02 --run

If you rendered PARALLEL from C4D (Off-Axis Convergence OFF — the recommended
Vision Pro path), use --hadjust to set the convergence at packaging time:
positive values shift the images toward each other (scene reads deeper /
further behind the window). Start around 0.01-0.03, check on device.
If convergence was already baked in C4D or set in Resolve, leave it at 0.
"""

import argparse
import math
import shutil
import subprocess
import sys


def hfov_degrees(focal_mm, sensor_mm):
    return math.degrees(2.0 * math.atan(sensor_mm / (2.0 * focal_mm)))


def build_commands(args):
    cmds = []
    sbs = args.sbs
    if sbs is None:
        sbs = args.out.rsplit(".", 1)[0] + "_SBS_intermediate.mov"
        cmds.append([
            "ffmpeg", "-y",
            "-i", args.left,
            "-i", args.right,
            "-filter_complex", "[0:v][1:v]hstack=inputs=2[v]",
            "-map", "[v]", "-map", "0:a?",
            "-c:v", "prores_ks", "-profile:v", "3", "-pix_fmt", "yuv422p10le",
            "-c:a", "copy",
            sbs,
        ])

    cmd = [
        "spatial", "make",
        "-i", sbs,
        "-f", "sbs",
        "-o", args.out,
        "--cdist", "%g" % (args.interaxial_cm * 10.0),      # mm baseline
        "--hadjust", "%g" % args.hadjust,
        "--primary", "left",
    ]
    if args.projection == "hequ":
        # VR180 half-equirect (APMP, visionOS 26+): FOV is fixed at 180 by
        # the projection itself — needs spatial CLI 2.x.
        cmd += ["--projection", "hequ"]
    else:
        cmd += ["--hfov", "%.2f" % hfov_degrees(args.focal, args.sensor)]
    cmds.append(cmd)
    return cmds


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Package Resolve stereo output as Vision Pro MV-HEVC spatial video."
    )
    src = ap.add_argument_group("source (separate eyes OR one SBS file)")
    src.add_argument("--left", help="left-eye movie from Resolve")
    src.add_argument("--right", help="right-eye movie from Resolve")
    src.add_argument("--sbs", help="full-width side-by-side movie (skips the ffmpeg mux)")

    ap.add_argument("--out", required=True, help="output spatial .mov path")
    ap.add_argument("--focal", type=float, default=36.0,
                    help="C4D camera focal length, mm (default 36)")
    ap.add_argument("--sensor", type=float, default=36.0,
                    help="C4D camera sensor/aperture width, mm (default 36)")
    ap.add_argument("--interaxial-cm", type=float, default=6.5,
                    help="rig interaxial in cm (default 6.5 = human)")
    ap.add_argument("--hadjust", type=float, default=0.0,
                    help="horizontal disparity adjustment, fraction of width "
                         "(use only for parallel renders; default 0)")
    ap.add_argument("--projection", choices=("rect", "hequ"), default="rect",
                    help="rect = windowed spatial video (default); hequ = "
                         "VR180 half-equirect immersive (APMP, visionOS 26+, "
                         "spatial CLI 2.x — see APPLE_IMMERSIVE_180.md)")
    ap.add_argument("--run", action="store_true",
                    help="execute the commands instead of just printing them")
    args = ap.parse_args(argv)

    if args.sbs is None and not (args.left and args.right):
        ap.error("give either --sbs, or both --left and --right")
    if args.sbs is not None and (args.left or args.right):
        ap.error("--sbs and --left/--right are mutually exclusive")

    print("spatial metadata derived from rig numbers:")
    print("  hfov  = %.2f deg  (focal %gmm, sensor %gmm)"
          % (hfov_degrees(args.focal, args.sensor), args.focal, args.sensor))
    print("  cdist = %g mm baseline  (interaxial %g cm)"
          % (args.interaxial_cm * 10.0, args.interaxial_cm))
    print()

    cmds = build_commands(args)
    for cmd in cmds:
        print("$ " + " ".join(cmd))
    if not args.run:
        print("\n(dry run — add --run to execute)")
        return 0

    for cmd in cmds:
        tool = cmd[0]
        if shutil.which(tool) is None:
            print("\nERROR: '%s' not found on PATH." % tool, file=sys.stderr)
            if tool == "spatial":
                print("Install: see https://blog.mikeswanson.com/spatial/ "
                      "(Homebrew tap), or use Apple Compressor's MV-HEVC "
                      "setting instead — see RESOLVE_TO_VISIONPRO.md.",
                      file=sys.stderr)
            else:
                print("Install ffmpeg (e.g. `brew install ffmpeg`).",
                      file=sys.stderr)
            return 1
        print("\n>>> running: %s" % " ".join(cmd))
        result = subprocess.run(cmd)
        if result.returncode != 0:
            print("command failed with exit code %d" % result.returncode,
                  file=sys.stderr)
            return result.returncode

    print("\nDone: %s" % args.out)
    print("AirDrop it to the Vision Pro — it should land in Photos as a "
          "Spatial video. If it plays flat, the MV-HEVC metadata is missing.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
