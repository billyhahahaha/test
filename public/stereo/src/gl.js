/* Minimal WebGL2 helpers.
   Everything draws with a full-screen triangle generated from gl_VertexID —
   no vertex buffers anywhere in this app. */

/* Display passes: v = 0 is the TOP of the canvas, matching image convention. */
export const VERT = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  v_uv = vec2(p.x, 1.0 - p.y);
}`;

/* Off-screen passes. A framebuffer's texel row 0 is the BOTTOM, so the display
   vertex shader would store every intermediate upside down — which silently
   mirrors the depth map and, worse, makes the temporal filter blend row y
   against row 1-y. Here v_uv is exactly the destination texel's coordinate, so
   "texture coordinate" and "image coordinate" stay the same thing throughout
   the analysis chain. */
export const VERT_OFFSCREEN = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  v_uv = p;
}`;

export function createGL(canvas) {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
    xrCompatible: true,
  });
  if (!gl) throw new Error("WebGL2 is required — this browser doesn't have it.");
  return gl;
}

function shader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s) || "";
    // Point at the offending line — shader errors are otherwise miserable.
    const line = /ERROR:\s*\d+:(\d+)/.exec(log);
    const ctx = line ? "\n> " + (src.split("\n")[+line[1] - 1] || "").trim() : "";
    gl.deleteShader(s);
    throw new Error("Shader compile failed: " + log + ctx);
  }
  return s;
}

/** Compile a program and return it with a cached uniform-location lookup. */
export function program(gl, fragSrc, vertSrc = VERT) {
  const p = gl.createProgram();
  const vs = shader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = shader(gl, gl.FRAGMENT_SHADER, fragSrc);
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("Program link failed: " + gl.getProgramInfoLog(p));
  }
  const cache = new Map();
  p.u = (name) => {
    if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name));
    return cache.get(name);
  };
  return p;
}

export function draw(gl) {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/** A texture we re-upload a video/canvas/image frame into each tick. */
export function createSourceTexture(gl) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  // 1x1 grey so the first frames have something valid to sample.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
    new Uint8Array([20, 22, 26, 255]));
  return t;
}

export function uploadSource(gl, tex, el) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); // row 0 stays the top row
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);
}

/** Off-screen render target (RGBA8). */
export function createTarget(gl, w, h, filter) {
  const f = filter || gl.LINEAR;
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo, w, h };
}

export function bindTarget(gl, t) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
  if (t) gl.viewport(0, 0, t.w, t.h);
}

export function bindTex(gl, unit, tex) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
}
