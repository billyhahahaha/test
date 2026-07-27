/* Live stereo analysis on the GPU:
     · a low-res disparity map (drives the depth + parallax views)
     · a depth-budget readout from that map
     · a vertical-alignment / roll sweep, which is the measurement that
       actually predicts whether footage will hurt to watch.

   All of it is deliberately cheap. It is a bench meter, not a solver. */

import { program, createTarget, bindTarget, bindTex, draw, VERT_OFFSCREEN } from "./gl.js";
import { setEyeUniforms } from "./eye.js";
import { REDUCE, DISPARITY, SMOOTH, ALIGN } from "./shaders.js";

/* Disparity grid: wide, because the search is horizontal. */
const DW = 256;
const DH = 144;

/* Alignment grid: tall. Sub-texel vertical precision is the entire point of
   this measurement, and 144 rows puts the noise floor above the threshold
   we want to hold footage to. */
const AW = 192;
const AH = 256;

const BINS = 25;

/** Band centres used for the roll estimate, as a fraction of eye width. */
const BAND_SEPARATION = 0.6;

export function createAnalysis(gl) {
  const pReduce = program(gl, REDUCE, VERT_OFFSCREEN);
  const pDisp = program(gl, DISPARITY, VERT_OFFSCREEN);
  const pSmooth = program(gl, SMOOTH, VERT_OFFSCREEN);
  const pAlign = program(gl, ALIGN, VERT_OFFSCREEN);

  const eyeL = createTarget(gl, DW, DH);
  const eyeR = createTarget(gl, DW, DH);
  const alnL = createTarget(gl, AW, AH);
  const alnR = createTarget(gl, AW, AH);
  const ping = createTarget(gl, DW, DH);
  const pong = createTarget(gl, DW, DH);
  const out = createTarget(gl, DW, DH);
  const alignT = createTarget(gl, BINS, 1, gl.NEAREST);

  let cur = ping;
  let prev = pong;
  let warm = 0;

  const px = new Uint8Array(DW * DH * 4);
  const alignPx = new Uint8Array(BINS * 4);

  /** Box-filter both eyes down onto an analysis grid. */
  function reduce(state, srcTex, left, right, w, h) {
    gl.useProgram(pReduce);
    setEyeUniforms(gl, pReduce, state, srcTex, 0);
    gl.uniform2f(pReduce.u("u_span"), 1 / w, 1 / h);
    for (const [eye, target] of [[0, left], [1, right]]) {
      gl.uniform1i(pReduce.u("u_eye"), eye);
      bindTarget(gl, target);
      draw(gl);
    }
  }

  /** One disparity iteration. maxDisp is in eye-uv units (0.06 ≈ 6% of width). */
  function disparity(state, srcTex, maxDisp) {
    reduce(state, srcTex, eyeL, eyeR, DW, DH);

    gl.useProgram(pDisp);
    bindTex(gl, 0, eyeL.tex);
    gl.uniform1i(pDisp.u("u_left"), 0);
    bindTex(gl, 1, eyeR.tex);
    gl.uniform1i(pDisp.u("u_right"), 1);
    bindTex(gl, 2, prev.tex);
    gl.uniform1i(pDisp.u("u_prev"), 2);
    gl.uniform2f(pDisp.u("u_texel"), 1 / DW, 1 / DH);
    gl.uniform1f(pDisp.u("u_maxDisp"), maxDisp);
    gl.uniform1f(pDisp.u("u_blend"), warm < 3 ? 1 : 0.25);
    bindTarget(gl, cur);
    draw(gl);

    gl.useProgram(pSmooth);
    bindTex(gl, 0, cur.tex);
    gl.uniform1i(pSmooth.u("u_map"), 0);
    gl.uniform2f(pSmooth.u("u_texel"), 1 / DW, 1 / DH);
    bindTarget(gl, out);
    draw(gl);

    const t = cur; cur = prev; prev = t;   // prev now holds the newest raw map
    warm++;
    return out.tex;
  }

  /** Depth budget, read back off the smoothed map. Throttle the caller. */
  function budget(maxDisp) {
    bindTarget(gl, out);
    gl.readPixels(0, 0, DW, DH, gl.RGBA, gl.UNSIGNED_BYTE, px);

    const hist = new Uint32Array(256);
    let n = 0;
    let pinned = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 2] > 128) pinned++;       // match sat on the search boundary
      if (px[i + 1] < 60) continue;        // ignore low-confidence pixels
      hist[px[i]]++;
      n++;
    }
    const total = DW * DH;
    const pinnedFrac = pinned / total;
    if (n < total * 0.04) return { coverage: n / total, pinned: pinnedFrac, valid: false };

    const at = (q) => {
      let acc = 0;
      const target = n * q;
      for (let b = 0; b < 256; b++) {
        acc += hist[b];
        if (acc >= target) return b;
      }
      return 255;
    };
    // byte -> eye-uv disparity -> % of eye width
    const pct = (b) => ((b / 255 - 0.5) * 2 * maxDisp) * 100;
    const near = pct(at(0.02));
    const far = pct(at(0.98));
    const mid = pct(at(0.5));
    return { near, far, mid, span: far - near, coverage: n / total, pinned: pinnedFrac, valid: true };
  }

  /** SAD sweep over vertical offsets within a crop; returns the best offset. */
  function sweep(crop, maxV, maxH) {
    gl.useProgram(pAlign);
    bindTex(gl, 0, alnL.tex);
    gl.uniform1i(pAlign.u("u_left"), 0);
    bindTex(gl, 1, alnR.tex);
    gl.uniform1i(pAlign.u("u_right"), 1);
    gl.uniform4f(pAlign.u("u_crop"), crop[0], crop[1], crop[2], crop[3]);
    gl.uniform1f(pAlign.u("u_maxV"), maxV);
    gl.uniform1f(pAlign.u("u_maxH"), maxH);
    gl.uniform1f(pAlign.u("u_bins"), BINS);
    bindTarget(gl, alignT);
    draw(gl);
    gl.readPixels(0, 0, BINS, 1, gl.RGBA, gl.UNSIGNED_BYTE, alignPx);

    const v = new Float32Array(BINS);
    let best = 0, sum = 0;
    for (let i = 0; i < BINS; i++) {
      v[i] = (alignPx[i * 4] + alignPx[i * 4 + 1] / 255) / 255;
      sum += v[i];
      if (v[i] < v[best]) best = i;
    }
    // Sub-bin refinement. A sum-of-absolute-differences cost is V-shaped near
    // its minimum, not parabolic — fitting a parabola to it biases the answer
    // toward the bin centre, which showed up as a consistent under-read.
    let sub = 0;
    if (best > 0 && best < BINS - 1) {
      const a = v[best - 1], c = v[best + 1];
      const den = 2 * (Math.max(a, c) - v[best]);
      if (den > 1e-9) sub = Math.max(-0.5, Math.min(0.5, (a - c) / den));
    }
    const half = (BINS - 1) / 2;
    const mean = sum / BINS;
    return {
      offset: ((best + sub - half) / half) * maxV,
      confidence: mean > 1e-6 ? Math.min(1, ((mean - v[best]) / mean) * 4) : 0,
    };
  }

  /**
   * Measure residual vertical offset and roll between the eyes, *after* the
   * current trims — so calling it repeatedly converges.
   * Returns radians / uv units.
   */
  function alignment(state, srcTex) {
    reduce(state, srcTex, alnL, alnR, AW, AH);
    // ±1.8% of height: anything worse than that is a broken rig, not a trim,
    // and a tighter sweep buys real precision out of the bins we have.
    const maxV = 0.018;
    const maxH = 0.05;   // horizontal tolerance, so disparity doesn't pollute it
    const full = sweep([0.1, 0.12, 0.8, 0.76], maxV, maxH);
    const left = sweep([0.07, 0.15, 0.26, 0.7], maxV, maxH);
    const right = sweep([0.67, 0.15, 0.26, 0.7], maxV, maxH);

    const aspect = state.eyeAspect || 16 / 9;
    const diff = right.offset - left.offset;
    return {
      vert: full.offset,
      roll: Math.atan2(diff, BAND_SEPARATION * aspect),
      confidence: Math.min(full.confidence, (left.confidence + right.confidence) / 2),
    };
  }

  return {
    disparity,
    budget,
    alignment,
    get texture() { return out.tex; },
    reset() { warm = 0; },
  };
}
