/* Frame-layout model: how two eyes are packed into one image, and how that
   maps back to a per-eye display aspect. */

export const LAYOUT = { mono: 0, sbs: 1, tb: 2 };

export const MODE = {
  ANAGLYPH: 0,
  CROSS: 1,
  PARALLEL: 2,
  LEFT: 3,
  RIGHT: 4,
  WIGGLE: 5,
  DIFF: 6,
  DEPTH: 7,
  PARALLAX: 8,
  CARDBOARD: 9,
  INTERLEAVED: 10,
  SBS_OUT: 11,
};

export const MODE_LIST = [
  { id: MODE.ANAGLYPH, key: "1", name: "Anaglyph", note: "Dubois red/cyan" },
  { id: MODE.CROSS, key: "2", name: "Cross-eye", note: "free-view, eyes crossed" },
  { id: MODE.PARALLEL, key: "3", name: "Parallel", note: "free-view, eyes relaxed" },
  { id: MODE.LEFT, key: "4", name: "Left", note: "left eye only" },
  { id: MODE.RIGHT, key: "5", name: "Right", note: "right eye only" },
  { id: MODE.WIGGLE, key: "6", name: "Wiggle", note: "alternating — fastest depth check" },
  { id: MODE.DIFF, key: "7", name: "Difference", note: "L−R, for spotting misalignment" },
  { id: MODE.DEPTH, key: "8", name: "Depth", note: "estimated disparity map" },
  { id: MODE.PARALLAX, key: "9", name: "Parallax", note: "depth-driven, no glasses" },
  { id: MODE.CARDBOARD, key: "0", name: "Cardboard", note: "split + barrel distortion" },
  { id: MODE.INTERLEAVED, key: "-", name: "Interleaved", note: "row-interleaved 3D panels" },
  { id: MODE.SBS_OUT, key: "=", name: "SBS out", note: "pass-through for 3D glasses/displays" },
];

/** Modes that composite both eyes into one panel. */
const SINGLE_PANEL = new Set([
  MODE.ANAGLYPH, MODE.LEFT, MODE.RIGHT, MODE.WIGGLE,
  MODE.DIFF, MODE.DEPTH, MODE.PARALLAX, MODE.INTERLEAVED,
]);

/** Guess the packing from dimensions plus whatever the filename admits to. */
export function guessLayout(w, h, name = "") {
  const n = name.toLowerCase();
  if (/\.(jps)$/.test(n)) return "sbs";
  if (/(^|[^a-z])(ou|tb|over.?under|top.?bottom|half.?ou)([^a-z]|$)/.test(n)) return "tb";
  if (/(^|[^a-z])(sbs|lr|side.?by.?side|half.?sbs|full.?sbs|_3dh)([^a-z]|$)/.test(n)) return "sbs";
  if (!w || !h) return "mono";
  const a = w / h;
  if (a >= 3.0) return "sbs";   // 3840x1080 and friends
  if (a <= 1.05) return "tb";   // 1920x2160 and friends
  return "mono";
}

/** Aspect of a single eye as stored in the file (before any un-squeeze). */
export function nativeEyeAspect(layout, w, h) {
  if (!w || !h) return 16 / 9;
  if (layout === "sbs") return (w / 2) / h;
  if (layout === "tb") return w / (h / 2);
  return w / h;
}

/** Aspect a single eye should be *displayed* at. */
export function displayEyeAspect(state) {
  const { layout, srcW, srcH, aspectMode, projection } = state;
  const native = nativeEyeAspect(layout, srcW, srcH);
  if (aspectMode === "native") return native;
  if (aspectMode !== "auto") return parseFloat(aspectMode) || native;

  if (projection === "vr360") return 2;
  if (projection === "vr180") return 1;
  // Half-width SBS / half-height OU are stored squeezed; un-squeeze to 16:9.
  if (layout !== "mono" && native < 1.25) return 16 / 9;
  return native;
}

/** Fit an aspect inside a rect (x, y, w, h in 0..1 screen space). */
function fit(rect, aspect) {
  const [x, y, w, h] = rect;
  const containerAspect = (w * rect.px) / (h * rect.py);
  let iw = w, ih = h;
  if (containerAspect > aspect) iw = w * (aspect / containerAspect);
  else ih = h * (containerAspect / aspect);
  return [x + (w - iw) / 2, y + (h - ih) / 2, iw, ih];
}

function box(x, y, w, h, px, py) {
  const r = [x, y, w, h];
  r.px = px; r.py = py;
  return r;
}

/**
 * Where each eye lands on screen.
 * Returns { rects: Float32Array(8), eyes: Int32Array(2), count }.
 */
export function panelsFor(mode, eyeAspect, canvasW, canvasH) {
  const rects = new Float32Array(8);
  const eyes = new Int32Array(2);
  let count;

  if (SINGLE_PANEL.has(mode)) {
    const r = fit(box(0, 0, 1, 1, canvasW, canvasH), eyeAspect);
    rects.set(r.slice(0, 4), 0);
    eyes[0] = mode === MODE.RIGHT ? 1 : 0;
    count = 1;
  } else if (mode === MODE.SBS_OUT || mode === MODE.CARDBOARD) {
    // Fill exactly half each — a display or lens is expecting the full panel.
    rects.set([0, 0, 0.5, 1], 0);
    rects.set([0.5, 0, 0.5, 1], 4);
    eyes[0] = 0; eyes[1] = 1;
    count = 2;
  } else {
    // Free-view: letterbox each eye inside its half so the pair stays fusable.
    const l = fit(box(0, 0, 0.5, 1, canvasW, canvasH), eyeAspect);
    const r = fit(box(0.5, 0, 0.5, 1, canvasW, canvasH), eyeAspect);
    rects.set(l.slice(0, 4), 0);
    rects.set(r.slice(0, 4), 4);
    // Cross-eye puts the RIGHT image on the LEFT side.
    const crossed = mode === MODE.CROSS;
    eyes[0] = crossed ? 1 : 0;
    eyes[1] = crossed ? 0 : 1;
    count = 2;
  }
  return { rects, eyes, count };
}

export function needsDisparity(mode) {
  return mode === MODE.DEPTH || mode === MODE.PARALLAX;
}
