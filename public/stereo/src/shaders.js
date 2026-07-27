/* All GLSL lives here. Everything shares one "sample an eye" chunk so the
   alignment trims apply identically to display, analysis and XR. */

import { MODE } from "./formats.js";

const MODE_DEFS = Object.entries(MODE)
  .map(([k, v]) => `#define M_${k} ${v}`)
  .join("\n");

/* ---------------------------------------------------------------
   Shared: unpack an eye out of the frame, with alignment trims.
   uv is eye-local, (0,0) = top-left of that eye's image.
   --------------------------------------------------------------- */
const EYE = `
uniform sampler2D u_src;
uniform int   u_layout;      // 0 mono, 1 side-by-side, 2 over/under
uniform float u_swap;        // 1.0 = swap eyes
uniform vec2  u_trim;        // x: convergence, y: vertical — per eye, uv units
uniform float u_roll;        // radians, split between the two eyes
uniform float u_eyeAspect;

vec2 packUV(int e, vec2 uv) {
  if (u_layout == 1) return vec2(uv.x * 0.5 + float(e) * 0.5, uv.y);
  if (u_layout == 2) return vec2(uv.x, uv.y * 0.5 + float(e) * 0.5);
  return uv;
}

// eye: 0 = left as displayed, 1 = right as displayed.
// The valid flag is 0 where the trims pushed us off the edge of the plate —
// analysis passes must not treat two clamped border pixels as a great match.
vec3 eyeAt(int eye, vec2 uv, out float valid) {
  float sgn = (eye == 0) ? 1.0 : -1.0;
  vec2 p = uv;
  if (u_roll != 0.0) {
    float a = u_roll * 0.5 * sgn;
    vec2 c = (p - 0.5) * vec2(u_eyeAspect, 1.0);
    float s = sin(a), co = cos(a);
    c = vec2(c.x * co - c.y * s, c.x * s + c.y * co);
    p = vec2(c.x / u_eyeAspect, c.y) + 0.5;
  }
  // +u_trim.x pushes the scene behind the screen (classic HIT).
  p.x += u_trim.x * sgn;
  p.y += u_trim.y * sgn;
  valid = (p.x >= 0.0 && p.x <= 1.0 && p.y >= 0.0 && p.y <= 1.0) ? 1.0 : 0.0;
  p = clamp(p, 0.0, 1.0);
  int e = eye;
  if (u_swap > 0.5) e = 1 - e;
  return texture(u_src, packUV(e, p)).rgb;
}

vec4 sampleEye(int eye, vec2 uv) {
  float v;
  vec3 c = eyeAt(eye, uv, v);
  return vec4(c * v, v);
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
`;

/* ---------------------------------------------------------------
   Reduce one eye to the analysis grid with a box filter.

   This step is not optional: matching straight against the full-res
   plate point-samples it, so fine detail aliases and the search locks
   onto noise. Box-filter first, match second.
   --------------------------------------------------------------- */
export const REDUCE = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o_col;
${EYE}

uniform vec2 u_span;    // one output texel, in eye-uv
uniform int  u_eye;

void main() {
  float s = 0.0, v = 0.0;
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      vec2 o = ((vec2(float(i), float(j)) + 0.5) * 0.25 - 0.5) * u_span;
      float valid;
      vec3 c = eyeAt(u_eye, v_uv + o, valid);
      s += luma(c) * valid;
      v += valid;
    }
  }
  o_col = vec4(v > 0.0 ? s / v : 0.0, v * 0.0625, 0.0, 1.0);
}`;

/* ---------------------------------------------------------------
   Composite — everything you can look at on a flat screen.
   --------------------------------------------------------------- */
export const COMPOSITE = `#version 300 es
precision highp float;
${MODE_DEFS}
in vec2 v_uv;
out vec4 o_col;
${EYE}

uniform sampler2D u_disp;
uniform int   u_mode;
uniform vec4  u_panel[2];
uniform int   u_panelEye[2];
uniform int   u_panelCount;
uniform float u_wiggle;
uniform vec2  u_parallax;
uniform float u_depthScale;
uniform vec2  u_lens;          // barrel k1, k2
uniform float u_lensShift;
uniform float u_panelAspect;
uniform vec3  u_bg;

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c)   { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

// Dubois least-squares red/cyan — far less retinal rivalry than a naive split.
vec3 duboisL(vec3 c) {
  return vec3(
    dot(c, vec3( 0.4561,     0.500484,   0.176381)),
    dot(c, vec3(-0.0400822, -0.0378246, -0.0157589)),
    dot(c, vec3(-0.0152161, -0.0205971, -0.00546856)));
}
vec3 duboisR(vec3 c) {
  return vec3(
    dot(c, vec3(-0.0434706, -0.0879388, -0.00155529)),
    dot(c, vec3( 0.378476,   0.73364,   -0.0184503)),
    dot(c, vec3(-0.0721527, -0.112961,   1.2264)));
}

vec3 turbo(float t) {
  t = clamp(t, 0.0, 1.0);
  const vec3 c0 = vec3(0.1140890, 0.0628834, 0.2248337);
  const vec3 c1 = vec3(6.7164195, 3.1822867, 7.5715816);
  const vec3 c2 = vec3(-66.094024, -4.9279827, -10.094394);
  const vec3 c3 = vec3(228.76608, 25.049867, -91.541053);
  const vec3 c4 = vec3(-334.83516, -69.317497, 288.58589);
  const vec3 c5 = vec3(218.76372, 67.521506, -305.20458);
  const vec3 c6 = vec3(-52.889035, -21.545274, 110.517465);
  return clamp(c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6))))), 0.0, 1.0);
}

// Pre-warp so a cheap plastic lens un-warps it back to straight.
vec2 barrel(vec2 uv, float side) {
  vec2 c = uv - vec2(0.5 + u_lensShift * side, 0.5);
  c.x *= u_panelAspect;
  float r2 = dot(c, c);
  c *= 1.0 + u_lens.x * r2 + u_lens.y * r2 * r2;
  c.x /= u_panelAspect;
  return c + vec2(0.5);
}

void main() {
  int pi = -1;
  vec2 uv = vec2(0.0);
  for (int i = 0; i < 2; i++) {
    if (i >= u_panelCount) break;
    vec4 r = u_panel[i];
    vec2 t = (v_uv - r.xy) / r.zw;
    if (t.x >= 0.0 && t.x <= 1.0 && t.y >= 0.0 && t.y <= 1.0) { pi = i; uv = t; }
  }
  if (pi < 0) { o_col = vec4(u_bg, 1.0); return; }
  int eye = u_panelEye[pi];

  if (u_mode == M_CARDBOARD) {
    uv = barrel(uv, pi == 0 ? 1.0 : -1.0);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { o_col = vec4(0.0, 0.0, 0.0, 1.0); return; }
  }

  vec3 c;
  if (u_mode == M_ANAGLYPH) {
    vec3 l = toLinear(sampleEye(0, uv).rgb);
    vec3 r = toLinear(sampleEye(1, uv).rgb);
    c = toSrgb(clamp(duboisL(l) + duboisR(r), 0.0, 1.0));
  } else if (u_mode == M_DIFF) {
    float d = luma(sampleEye(0, uv).rgb) - luma(sampleEye(1, uv).rgb);
    c = vec3(max(d, 0.0), abs(d) * 0.35, max(-d, 0.0)) * 3.0;
  } else if (u_mode == M_WIGGLE) {
    c = sampleEye(int(u_wiggle), uv).rgb;
  } else if (u_mode == M_DEPTH) {
    vec4 d = texture(u_disp, uv);
    c = turbo(d.r) * mix(0.18, 1.0, d.g);
  } else if (u_mode == M_PARALLAX) {
    // Backward warp, fixed-point iterated. Holes get stretched, not filled.
    vec2 p = uv;
    for (int i = 0; i < 4; i++) {
      float d = texture(u_disp, p).r - 0.5;
      p = uv + u_parallax * d * u_depthScale;
    }
    c = sampleEye(0, clamp(p, 0.0, 1.0)).rgb;
  } else if (u_mode == M_INTERLEAVED) {
    c = sampleEye(int(mod(gl_FragCoord.y, 2.0)), uv).rgb;
  } else {
    c = sampleEye(eye, uv).rgb;
  }
  o_col = vec4(c, 1.0);
}`;

/* ---------------------------------------------------------------
   Disparity — winner-takes-all block match with sub-pixel refinement.
   Low res, temporally smoothed. Enough to read a depth budget and to
   drive parallax; not a substitute for an offline solve.
   --------------------------------------------------------------- */
export const DISPARITY = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o_col;

uniform sampler2D u_left;    // R = luma, G = validity
uniform sampler2D u_right;
uniform sampler2D u_prev;
uniform vec2  u_texel;
uniform float u_maxDisp;
uniform float u_blend;

const int STEPS = 20;

float cost(vec2 uv, float d) {
  vec2 o[5];
  o[0] = vec2(0.0, 0.0);
  o[1] = vec2( u_texel.x, 0.0);
  o[2] = vec2(-u_texel.x, 0.0);
  o[3] = vec2(0.0,  u_texel.y);
  o[4] = vec2(0.0, -u_texel.y);
  float s = 0.0, w = 0.0;
  for (int i = 0; i < 5; i++) {
    vec2 l = texture(u_left,  uv + o[i]).rg;
    vec2 r = texture(u_right, uv + o[i] + vec2(d, 0.0)).rg;
    float m = l.g * r.g;
    s += abs(l.r - r.r) * m;
    w += m;
  }
  return w > 0.001 ? s / w : 1.0;   // nothing valid here — worst possible match
}

void main() {
  float dStep = u_maxDisp / float(STEPS);
  float best = 1e9, sum = 0.0;
  int bestK = 0;
  for (int k = -STEPS; k <= STEPS; k++) {
    float c = cost(v_uv, float(k) * dStep);
    sum += c;
    if (c < best) { best = c; bestK = k; }
  }
  float mean = sum / float(2 * STEPS + 1);

  // Parabola through the two neighbours for sub-step accuracy.
  float bd = float(bestK) * dStep;
  float cm = cost(v_uv, bd - dStep);
  float cp = cost(v_uv, bd + dStep);
  float den = cm - 2.0 * best + cp;
  float sub = abs(den) > 1e-6 ? clamp(0.5 * (cm - cp) / den, -1.0, 1.0) : 0.0;
  float d = (float(bestK) + sub) * dStep;

  // Flat regions make every candidate look equally good — that's low confidence.
  float conf = clamp((mean - best) * 7.0, 0.0, 1.0);

  // An argmin sitting on the edge of the search window is not a measurement:
  // the real minimum may be outside it, and repeating structure (fences,
  // grids, brickwork) parks false matches there. Always drop it — but only
  // *report* it as pinned when the match looked strong, so "the depth runs off
  // the end of the window" stays distinguishable from "this patch is flat and
  // nothing matched anywhere".
  float atEdge = (bestK <= -STEPS || bestK >= STEPS) ? 1.0 : 0.0;
  float pinned = (atEdge > 0.5 && conf > 0.25) ? 1.0 : 0.0;
  conf *= 1.0 - atEdge;

  float enc = clamp(d / (2.0 * u_maxDisp) + 0.5, 0.0, 1.0);

  vec4 prev = texture(u_prev, v_uv);
  float a = clamp(u_blend + conf * 0.35, 0.0, 1.0);
  o_col = vec4(mix(prev.r, enc, a), mix(prev.g, conf, 0.4), pinned, 1.0);
}`;

/* Confidence-weighted 3x3 clean-up over the raw disparity. */
export const SMOOTH = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o_col;
uniform sampler2D u_map;
uniform vec2 u_texel;

void main() {
  float dsum = 0.0, wsum = 0.0, csum = 0.0, psum = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec4 s = texture(u_map, v_uv + vec2(float(i), float(j)) * u_texel);
      float w = s.g * s.g + 0.03;
      dsum += s.r * w;
      wsum += w;
      csum += s.g;
      psum += s.b;
    }
  }
  o_col = vec4(dsum / wsum, csum / 9.0, psum / 9.0, 1.0);
}`;

/* ---------------------------------------------------------------
   Vertical alignment sweep. One output texel per candidate offset;
   each texel is a whole-region SAD that takes the minimum over
   horizontal shifts, so real stereo disparity doesn't pollute it.
   Result is packed to 16 bits across R,G.
   --------------------------------------------------------------- */
export const ALIGN = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o_col;

uniform sampler2D u_left;
uniform sampler2D u_right;
uniform vec4  u_crop;
uniform float u_maxV;
uniform float u_maxH;
uniform float u_bins;

const int GRID = 28;
const int HS = 8;

void main() {
  float k = floor(v_uv.x * u_bins);
  float half_ = (u_bins - 1.0) * 0.5;
  float dv = (k - half_) / half_ * u_maxV;

  float total = 0.0, count = 0.0;
  for (int y = 0; y < GRID; y++) {
    for (int x = 0; x < GRID; x++) {
      vec2 g = (vec2(float(x), float(y)) + 0.5) / float(GRID);
      vec2 uv = u_crop.xy + g * u_crop.zw;
      vec2 l = texture(u_left, uv).rg;
      if (l.g < 0.5) continue;
      float m = 2.0;
      // Take the best over horizontal shifts, so real stereo disparity
      // doesn't get mistaken for vertical error.
      for (int h = -HS; h <= HS; h++) {
        vec2 r = texture(u_right, uv + vec2(float(h) / float(HS) * u_maxH, dv)).rg;
        if (r.g >= 0.5) m = min(m, abs(l.r - r.r));
      }
      if (m < 1.5) { total += m; count += 1.0; }
    }
  }
  float v = clamp(count > 0.0 ? total / count * 4.0 : 1.0, 0.0, 0.99999);
  o_col = vec4(floor(v * 255.0) / 255.0, fract(v * 255.0), 0.0, 1.0);
}`;

/* ---------------------------------------------------------------
   XR fallback — used when WebXR Layers / XRMediaBinding aren't
   available, or when alignment trims mean we can't hand raw video
   to the compositor. Pure ray-cast: no geometry, no matrix inverse.
   --------------------------------------------------------------- */
export const XR_VIEW = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o_col;
${EYE}

uniform int   u_xrEye;
uniform vec4  u_proj;          // m0, m5, m8, m9 of the XR projection matrix
uniform mat4  u_viewToWorld;
uniform int   u_projection;    // 0 flat, 1 vr180, 2 vr360
uniform float u_dist;
uniform vec2  u_half;
uniform vec3  u_bg;

const float PI = 3.14159265359;

void main() {
  vec2 ndc = vec2(v_uv.x, 1.0 - v_uv.y) * 2.0 - 1.0;
  vec3 dv = normalize(vec3((ndc.x + u_proj.z) / u_proj.x,
                           (ndc.y + u_proj.w) / u_proj.y, -1.0));
  vec3 dir = normalize(mat3(u_viewToWorld) * dv);
  vec3 org = (u_viewToWorld * vec4(0.0, 0.0, 0.0, 1.0)).xyz;

  vec2 uv;
  if (u_projection == 0) {
    if (dir.z > -1e-4) { o_col = vec4(u_bg, 1.0); return; }
    float t = (-u_dist - org.z) / dir.z;
    if (t <= 0.0) { o_col = vec4(u_bg, 1.0); return; }
    vec3 hit = org + dir * t;
    uv = vec2(hit.x / u_half.x, -hit.y / u_half.y) * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { o_col = vec4(u_bg, 1.0); return; }
  } else {
    float lon = atan(dir.x, -dir.z);
    float lat = asin(clamp(dir.y, -1.0, 1.0));
    float span = (u_projection == 1) ? PI : 2.0 * PI;
    uv = vec2(lon / span + 0.5, 0.5 - lat / PI);
    if (u_projection == 1 && (uv.x < 0.0 || uv.x > 1.0)) { o_col = vec4(u_bg, 1.0); return; }
    uv.x = fract(uv.x);
  }
  o_col = vec4(sampleEye(u_xrEye, uv).rgb, 1.0);
}`;
