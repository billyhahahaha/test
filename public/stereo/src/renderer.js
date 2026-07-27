/* Flat-screen composite pass. */

import { program, draw, bindTex } from "./gl.js";
import { COMPOSITE } from "./shaders.js";
import { setEyeUniforms } from "./eye.js";
import { panelsFor } from "./formats.js";

export function createRenderer(gl) {
  const p = program(gl, COMPOSITE);

  function render(state, srcTex, dispTex, w, h) {
    const { rects, eyes, count } = panelsFor(state.mode, state.eyeAspect, w, h);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(p);

    setEyeUniforms(gl, p, state, srcTex, 0);
    bindTex(gl, 1, dispTex);
    gl.uniform1i(p.u("u_disp"), 1);

    gl.uniform1i(p.u("u_mode"), state.mode);
    gl.uniform4fv(p.u("u_panel[0]"), rects);
    gl.uniform1iv(p.u("u_panelEye[0]"), eyes);
    gl.uniform1i(p.u("u_panelCount"), count);
    gl.uniform1f(p.u("u_wiggle"), state.wigglePhase);
    gl.uniform2f(p.u("u_parallax"), state.parallaxX, state.parallaxY);
    gl.uniform1f(p.u("u_depthScale"), state.parallaxStrength);
    gl.uniform2f(p.u("u_lens"), state.k1, state.k1 * 1.1);
    gl.uniform1f(p.u("u_lensShift"), state.lensShift);
    gl.uniform1f(p.u("u_panelAspect"), (w * (count === 2 ? 0.5 : 1)) / h);
    gl.uniform3f(p.u("u_bg"), 0.02, 0.028, 0.038);

    draw(gl);
  }

  return { render };
}
