/* The one place the eye-unpacking uniforms get set, shared by the composite,
   the analysis passes and the XR fallback — so a trim means the same thing
   everywhere. */

import { LAYOUT } from "./formats.js";
import { bindTex } from "./gl.js";

export const PROJECTION = { flat: 0, vr180: 1, vr360: 2, fisheye: 3 };

/** How pixels map to directions. Shared by the XR view and the flat preview,
    so tuning at a desk is the same maths the headset runs. */
export function setProjectionUniforms(gl, p, state) {
  gl.uniform1i(p.u("u_projection"), PROJECTION[state.projection] ?? 0);
  gl.uniform1i(p.u("u_lensModel"), state.lensModel | 0);
  gl.uniform1f(p.u("u_fovHalf"), state.fovHalf);
  gl.uniform2f(p.u("u_circle"), state.circleX, state.circleY);
  gl.uniform1f(p.u("u_radius"), state.radius);
  gl.uniform1f(p.u("u_eqVert"), state.eqVert);
  gl.uniform1f(p.u("u_yaw"), state.yaw);
  // The fisheye circle is round in pixels, so this must be the stored aspect
  // of one eye — not the un-squeezed display aspect.
  gl.uniform1f(p.u("u_plateAspect"), state.plateAspect || 1);
}

export function setEyeUniforms(gl, p, state, srcTex, unit = 0) {
  bindTex(gl, unit, srcTex);
  gl.uniform1i(p.u("u_src"), unit);
  gl.uniform1i(p.u("u_layout"), LAYOUT[state.layout] ?? 0);
  gl.uniform1f(p.u("u_swap"), state.swap ? 1 : 0);
  gl.uniform2f(p.u("u_trim"), state.conv, state.vert);
  gl.uniform1f(p.u("u_roll"), state.roll);
  gl.uniform1f(p.u("u_eyeAspect"), state.eyeAspect || 16 / 9);
}
