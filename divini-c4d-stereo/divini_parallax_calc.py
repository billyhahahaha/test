#!/usr/bin/env python3
"""Divini — stereoscopic depth-budget calculator (plain Python, no C4D needed).

Feed it your rig numbers and it tells you, for any object distance, how much
screen parallax you will get on the delivery screen — plus warnings when you
blow the comfort budget or force the audience's eyes to diverge.

Uses the same off-axis model as the C4D rig, so the numbers match renders:

    parallax (fraction of image width) = (focal * interaxial / sensor_width)
                                         * (1/zero_parallax - 1/distance)

    positive  -> uncrossed parallax, object appears BEHIND the screen
    zero      -> object sits ON the screen plane
    negative  -> crossed parallax, object pops OUT of the screen

Examples:
    python3 divini_parallax_calc.py
    python3 divini_parallax_calc.py --interaxial 6.5 --zero-parallax 200 \
        --focal 36 --sensor 36 --screen-width 1440 --distances 80 150 200 400 inf
    python3 divini_parallax_calc.py --screen-width 9000   # cinema screen, 9 m

Notes:
    * interaxial, zero-parallax and distances are in SCENE units (any unit,
      as long as they are all the same — cm in a default C4D document).
    * focal and sensor width are in mm (as shown on the C4D camera).
    * screen width is the physical delivery screen width in mm
      (65" 16:9 TV ~ 1440 mm, small cinema ~ 9000 mm).
"""

import argparse
import math
import sys

HUMAN_INTEROCULAR_MM = 63.0   # max comfortable uncrossed parallax on screen
CROSSED_BUDGET_FRAC = 0.02    # ~2% of screen width of pop-out before it hurts
UNCROSSED_SOFT_FRAC = 0.03    # flag very large behind-screen parallax too


def parallax_fraction(focal, sensor, interaxial, zero_parallax, distance):
    """Screen parallax as a signed fraction of image width."""
    inv_d = 0.0 if math.isinf(distance) else 1.0 / distance
    return (focal * interaxial / sensor) * (1.0 / zero_parallax - inv_d)


def fmt_dist(d):
    return "inf" if math.isinf(d) else ("%g" % d)


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Stereo depth-budget calculator for the Divini C4D rig."
    )
    ap.add_argument("--interaxial", type=float, default=6.5,
                    help="eye separation, scene units (default 6.5)")
    ap.add_argument("--zero-parallax", type=float, default=200.0,
                    help="zero-parallax / convergence distance, scene units (default 200)")
    ap.add_argument("--focal", type=float, default=36.0,
                    help="focal length in mm (default 36)")
    ap.add_argument("--sensor", type=float, default=36.0,
                    help="sensor width in mm (C4D aperture, default 36)")
    ap.add_argument("--screen-width", type=float, default=1440.0,
                    help="delivery screen width in mm (default 1440 = 65-inch TV)")
    ap.add_argument("--distances", nargs="*", default=None,
                    help="object distances to evaluate, scene units ('inf' allowed). "
                         "Default: Z0/2, Z0, 2*Z0, 4*Z0, inf")
    args = ap.parse_args(argv)

    t, z0, f, w, sw = (args.interaxial, args.zero_parallax,
                       args.focal, args.sensor, args.screen_width)
    if min(t, z0, f, w, sw) <= 0:
        ap.error("all parameters must be positive")

    if args.distances:
        distances = [float("inf") if d.lower() in ("inf", "infinity") else float(d)
                     for d in args.distances]
    else:
        distances = [z0 * 0.5, z0, z0 * 2.0, z0 * 4.0, float("inf")]

    print("Divini stereo depth budget")
    print("  interaxial %g | zero parallax %g | focal %gmm | sensor %gmm | screen %gmm wide"
          % (t, z0, f, w, sw))
    print("  ratio check: interaxial is 1/%.0f of zero parallax (aim for ~1/30)" % (z0 / t))
    print()
    print("  %10s  %10s  %12s  %-14s  %s"
          % ("distance", "% width", "on screen", "depth", "flags"))
    print("  " + "-" * 66)

    for d in distances:
        frac = parallax_fraction(f, w, t, z0, d)
        mm = frac * sw
        if abs(frac) < 1e-9:
            zone = "on screen"
        elif frac > 0:
            zone = "behind screen"
        else:
            zone = "pops out"

        flags = []
        if mm > HUMAN_INTEROCULAR_MM:
            flags.append("DIVERGENT — eyes forced apart, never ship this")
        elif frac > UNCROSSED_SOFT_FRAC:
            flags.append("very deep, check on the big screen")
        if frac < -CROSSED_BUDGET_FRAC:
            flags.append("beyond pop-out comfort budget")

        print("  %10s  %+9.2f%%  %+9.1f mm  %-14s  %s"
              % (fmt_dist(d), frac * 100.0, mm, zone, "; ".join(flags) or "ok"))

    # Summary guidance ------------------------------------------------------
    inf_frac = parallax_fraction(f, w, t, z0, float("inf"))
    inf_mm = inf_frac * sw
    max_t = HUMAN_INTEROCULAR_MM * w * z0 / (sw * f)
    near_limit = 1.0 / (1.0 / z0 + CROSSED_BUDGET_FRAC * w / (f * t))

    print()
    print("  background at infinity lands %.1f mm behind the screen plane" % inf_mm)
    if inf_mm > HUMAN_INTEROCULAR_MM:
        print("  !! that exceeds the %.0f mm interocular limit: on this screen keep"
              % HUMAN_INTEROCULAR_MM)
        print("     interaxial <= %.2f scene units (or pull zero parallax closer)" % max_t)
    else:
        print("  max divergence-safe interaxial for this screen: %.2f scene units" % max_t)
    print("  nearest comfortable object (%.0f%% pop-out budget): ~%.1f scene units"
          % (CROSSED_BUDGET_FRAC * 100, near_limit))
    return 0


if __name__ == "__main__":
    sys.exit(main())
