/* WebXR presentation.

   Two paths, and the difference is the whole point of shooting stereo for
   headsets:

   1. LAYERS — XRMediaBinding hands the <video> straight to the XR compositor
      as a stereo quad or equirect layer. No copy into a WebGL texture, no
      resample, so you get the panel's real resolution instead of a soft
      textured billboard.

   2. FALLBACK — an XRWebGLLayer plus a per-eye ray-cast, used when the
      browser has no Layers support, when the source isn't a real video, or
      when alignment trims are active (the compositor samples the raw file,
      so it cannot honour them). */

import { program, draw } from "./gl.js";
import { XR_VIEW } from "./shaders.js";
import { setEyeUniforms, setProjectionUniforms } from "./eye.js";

const SCREEN_DIST = 2.2;      // metres to the virtual screen
const SCREEN_HALF_W = 1.1;    // half-width, metres

export function xrSupported() {
  if (!navigator.xr || !navigator.xr.isSessionSupported) return Promise.resolve(false);
  return navigator.xr.isSessionSupported("immersive-vr").catch(() => false);
}

export function createXR(gl, hooks) {
  let prog = null;
  let session = null;
  let refSpace = null;
  let path = "fallback";

  function layoutName(layout) {
    if (layout === "sbs") return "stereo-left-right";
    if (layout === "tb") return "stereo-top-bottom";
    return "mono";
  }

  function trimsActive(s) {
    return Math.abs(s.conv) > 1e-5 || Math.abs(s.vert) > 1e-5 ||
           Math.abs(s.roll) > 1e-5 || s.swap;
  }

  function mediaLayer(state, video) {
    const binding = new XRMediaBinding(session);
    const layout = layoutName(state.layout);
    if (state.projection === "flat") {
      return binding.createQuadLayer(video, {
        space: refSpace,
        layout,
        transform: new XRRigidTransform({ x: 0, y: 0, z: -SCREEN_DIST }),
        width: SCREEN_HALF_W,
        height: SCREEN_HALF_W / (state.eyeAspect || 16 / 9),
      });
    }
    return binding.createEquirectLayer(video, {
      space: refSpace,
      layout,
      radius: 0,
      centralHorizontalAngle: state.projection === "vr180" ? Math.PI : 2 * Math.PI,
      upperVerticalAngle: Math.PI / 2,
      lowerVerticalAngle: -Math.PI / 2,
    });
  }

  async function enter() {
    const state = hooks.getState();
    session = await navigator.xr.requestSession("immersive-vr", {
      optionalFeatures: ["layers", "local-floor"],
    });
    session.addEventListener("end", ended);

    await gl.makeXRCompatible();
    refSpace = await session.requestReferenceSpace("local");

    const video = hooks.getVideo();
    const hasLayers = !session.enabledFeatures || session.enabledFeatures.includes("layers");
    const trims = trimsActive(state);

    let why = "";
    if (state.projection === "fisheye") why = "fisheye has no WebXR layer type";
    else if (!("XRMediaBinding" in window) || !hasLayers) why = "no Layers support";
    else if (!video || video.readyState < 2) why = "source isn't a decodable video";
    else if (trims) why = "alignment trims are active";

    if (!why) {
      try {
        session.updateRenderState({ layers: [mediaLayer(state, video)] });
        path = "layers";
      } catch (e) {
        why = "layer creation failed (" + (e && e.message ? e.message : e) + ")";
      }
    }

    if (why) {
      path = "fallback";
      const glLayer = new XRWebGLLayer(session, gl);
      session.updateRenderState({ baseLayer: glLayer });
      if (!prog) prog = program(gl, XR_VIEW);
    }

    session.requestAnimationFrame(onFrame);
    hooks.onStart(path, why);
    return path;
  }

  function onFrame(time, frame) {
    if (!session) return;
    session.requestAnimationFrame(onFrame);
    hooks.tick(time);
    if (path === "layers") return;

    const pose = frame.getViewerPose(refSpace);
    if (!pose) return;
    const layer = session.renderState.baseLayer;
    const state = hooks.getState();

    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
    gl.clearColor(0.02, 0.028, 0.038, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(prog);
    setEyeUniforms(gl, prog, state, hooks.getTexture(), 0);
    setProjectionUniforms(gl, prog, state);
    gl.uniform1f(prog.u("u_dist"), SCREEN_DIST);
    gl.uniform2f(prog.u("u_half"), SCREEN_HALF_W, SCREEN_HALF_W / (state.eyeAspect || 16 / 9));
    gl.uniform3f(prog.u("u_bg"), 0.02, 0.028, 0.038);

    for (const view of pose.views) {
      const vp = layer.getViewport(view);
      gl.viewport(vp.x, vp.y, vp.width, vp.height);
      const m = view.projectionMatrix;
      gl.uniform4f(prog.u("u_proj"), m[0], m[5], m[8], m[9]);
      gl.uniformMatrix4fv(prog.u("u_viewToWorld"), false, view.transform.matrix);
      gl.uniform1i(prog.u("u_xrEye"), view.eye === "right" ? 1 : 0);
      draw(gl);
    }
  }

  function ended() {
    session = null;
    refSpace = null;
    hooks.onEnd();
  }

  async function exit() {
    if (session) await session.end();
  }

  return {
    enter,
    exit,
    get active() { return !!session; },
    get path() { return path; },
  };
}
