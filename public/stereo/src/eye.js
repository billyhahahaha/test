/* The one place the eye-unpacking uniforms get set, shared by the composite,
   the analysis passes and the XR fallback — so a trim means the same thing
   everywhere. */

import { LAYOUT } from "./formats.js";
import { bindTex } from "./gl.js";

export function setEyeUniforms(gl, p, state, srcTex, unit = 0) {
  bindTex(gl, unit, srcTex);
  gl.uniform1i(p.u("u_src"), unit);
  gl.uniform1i(p.u("u_layout"), LAYOUT[state.layout] ?? 0);
  gl.uniform1f(p.u("u_swap"), state.swap ? 1 : 0);
  gl.uniform2f(p.u("u_trim"), state.conv, state.vert);
  gl.uniform1f(p.u("u_roll"), state.roll);
  gl.uniform1f(p.u("u_eyeAspect"), state.eyeAspect || 16 / 9);
}
