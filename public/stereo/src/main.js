/* Stereo Bench — wiring. */

import { createGL, createSourceTexture, uploadSource } from "./gl.js";
import { createRenderer } from "./renderer.js";
import { createAnalysis } from "./analysis.js";
import { createTestCard } from "./testcard.js";
import { createXR, xrSupported } from "./xr.js";
import {
  MODE, MODE_LIST, guessLayout, displayEyeAspect, nativeEyeAspect, needsDisparity,
} from "./formats.js";

const $ = (id) => document.getElementById(id);

const els = {
  stage: $("stage"), canvas: $("gl"), badges: $("badges"), msg: $("msg"),
  hud: $("hud"), hudBudget: $("hud-budget"), hudNearfar: $("hud-nearfar"),
  hudVert: $("hud-vert"), hudRoll: $("hud-roll"),
  play: $("btn-play"), icPlay: $("ic-play"), scrub: $("scrub"), time: $("time"),
  loop: $("btn-loop"), mute: $("btn-mute"), full: $("btn-full"), xr: $("btn-xr"),
  drop: $("drop"), file: $("file"), srcMeta: $("src-meta"), modes: $("modes"),
  readout: $("readout"), transport: $("transport"), grpInject: $("grp-inject"),
};

const state = {
  layoutMode: "auto",
  // projection
  lensModel: 1,                    // equisolid — what most VR180 rigs record
  fovHalf: (190 / 2) * Math.PI / 180,
  circleX: 0.5, circleY: 0.5, radius: 0.5,
  eqVert: Math.PI / 2,
  yaw: 0,
  plateAspect: 16 / 9,
  preview: false,
  lookYaw: 0, lookPitch: 0,
  previewFov: 90 * Math.PI / 180,
  layout: "sbs",
  projection: "flat",
  aspectMode: "auto",
  eyeAspect: 16 / 9,
  srcW: 0, srcH: 0,
  swap: false,
  mode: MODE.PARALLEL,
  conv: 0, vert: 0, roll: 0,
  wigglePhase: 0,
  parallaxX: 0, parallaxY: 0, parallaxStrength: 1,
  k1: 0.22, lensShift: 0,
  maxDisp: 0.06,
  hud: true,
  gyro: true,
};

const inject = { vert: 0, roll: 0 };
const stats = { budget: null, align: null };

let gl, renderer, analysis, xr, srcTex;
let source = null;
let uploaded = false;
let xrPath = null;
let msgTimer = 0;
let tDisp = 0, tBudget = 0, tAlign = 0;   // analysis throttles

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

try {
  gl = createGL(els.canvas);
  renderer = createRenderer(gl);
  analysis = createAnalysis(gl);
  srcTex = createSourceTexture(gl);
} catch (err) {
  showMsg("<b>Can't start.</b><br>" + err.message);
  throw err;
}

xr = createXR(gl, {
  getState: () => state,
  getTexture: () => srcTex,
  getVideo: () => (source ? source.video || (source.kind === "video" ? source.el : null) : null),
  tick: (t) => { advanceSource(t); pushTexture(); },
  onStart: (path, why) => {
    xrPath = path;
    if (why) showMsg("Immersive session running on the <b>WebGL fallback</b> — " + why + ".", 4200);
    updateBadges();
  },
  onEnd: () => { xrPath = null; updateBadges(); },
});

buildModes();
wireUI();
useTestCard();
resize();
window.addEventListener("resize", resize);
requestAnimationFrame(loop);

xrSupported().then((ok) => { if (ok) els.xr.hidden = false; });

showMsg(
  "<b>Calibration card loaded.</b><br>Each plaque is drawn at its labelled screen parallax. " +
  "Pick a view mode on the right — or press <b>6</b> for wiggle, which reads as depth with no glasses at all.",
  7000
);

/* ------------------------------------------------------------------ */
/* sources                                                             */
/* ------------------------------------------------------------------ */

function disposeSource() {
  if (!source) return;
  if (source.dispose) source.dispose();
  if (source.kind === "video" && source.el) {
    source.el.pause();
    if (source.objectUrl) URL.revokeObjectURL(source.objectUrl);
    source.el.remove();
  }
  if (source.kind === "image" && source.el) {
    if (source.objectUrl) URL.revokeObjectURL(source.objectUrl);
  }
  source = null;
  uploaded = false;
  analysis.reset();
}

function useTestCard() {
  disposeSource();
  source = createTestCard();
  source.name = "calibration-card";
  els.grpInject.style.display = "";
  markSrcButton("test");
  els.srcMeta.textContent =
    "Procedural stereo card — every plaque is labelled with its true screen parallax, so you can verify the whole chain end to end.";
  applyLayout();
}

function useMedia(url, name, isObjectUrl) {
  const objectUrl = isObjectUrl ? url : null;
  const isImage = /\.(jpe?g|png|webp|avif|jps|pns)(\?|$)/i.test(name);
  disposeSource();
  els.grpInject.style.display = "none";
  markSrcButton(null);

  if (isImage) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      source.width = img.naturalWidth;
      source.height = img.naturalHeight;
      uploaded = false;
      applyLayout();
      updateBadges();
    };
    img.onerror = () => showMsg("<b>Couldn't load that image.</b><br>If it's remote, the host needs to allow cross-origin reads.", 6000);
    img.src = url;
    source = { kind: "image", el: img, width: 0, height: 0, name, objectUrl, video: null };
  } else {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = els.mute.getAttribute("aria-pressed") === "true";
    v.loop = els.loop.getAttribute("aria-pressed") === "true";
    v.playsInline = true;
    v.preload = "auto";
    v.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px";
    document.body.appendChild(v);
    v.addEventListener("loadedmetadata", () => {
      source.width = v.videoWidth;
      source.height = v.videoHeight;
      applyLayout();
      updateBadges();
    });
    v.addEventListener("error", () => {
      showMsg("<b>Couldn't decode that file.</b><br>If it's Apple spatial video (MV-HEVC), see the conversion recipe in the panel.", 7000);
    });
    v.src = url;
    v.play().catch(() => setTransport(false));
    source = { kind: "video", el: v, width: 0, height: 0, name, objectUrl, video: v };
  }

  els.srcMeta.textContent = name;
  analysis.reset();
}

function advanceSource(now) {
  if (source && source.kind === "canvas") {
    if (!source.video) source.attachStream();
    source.draw(now / 1000, inject);
  }
}

function pushTexture() {
  if (!source) return;
  const el = source.el;
  if (source.kind === "video" && el.readyState < 2) return;
  if (source.kind === "image") {
    if (uploaded || !el.complete || !el.naturalWidth) return;
  }
  try {
    uploadSource(gl, srcTex, el);
    uploaded = true;
  } catch {
    showMsg("<b>Blocked reading those pixels.</b><br>The source is cross-origin without CORS headers.", 6000);
    disposeSource();
    useTestCard();
  }
}

/* ------------------------------------------------------------------ */
/* layout / aspect                                                     */
/* ------------------------------------------------------------------ */

function applyLayout() {
  const w = source ? (source.width || 0) : 0;
  const h = source ? (source.height || 0) : 0;
  state.srcW = w;
  state.srcH = h;
  state.layout = state.layoutMode === "auto"
    ? (source && source.layoutHint ? source.layoutHint : guessLayout(w, h, source ? source.name || "" : ""))
    : state.layoutMode;
  state.eyeAspect = displayEyeAspect(state);
  state.plateAspect = nativeEyeAspect(state.layout, w, h);
  analysis.reset();
  updateBadges();
}

/* ------------------------------------------------------------------ */
/* loop                                                                */
/* ------------------------------------------------------------------ */

function loop(now) {
  requestAnimationFrame(loop);
  if (xr.active) return;   // the XR session drives its own frames

  advanceSource(now);
  pushTexture();

  state.wigglePhase = Math.floor(now / 145) % 2;

  const wantDepth = state.hud || needsDisparity(state.mode);
  if (wantDepth && now - tDisp > 90) {
    tDisp = now;
    analysis.disparity(state, srcTex, state.maxDisp);
  }
  if (state.hud && now - tBudget > 520) {
    tBudget = now;
    stats.budget = analysis.budget(state.maxDisp);
    renderReadout();
  }
  if (state.hud && now - tAlign > 760) {
    tAlign = now;
    stats.align = analysis.alignment(state, srcTex);
    renderReadout();
  }

  renderer.render(state, srcTex, analysis.texture, els.canvas.width, els.canvas.height);
  updateTransport();
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(els.stage.clientWidth * dpr));
  const h = Math.max(1, Math.round(els.stage.clientHeight * dpr));
  if (els.canvas.width !== w || els.canvas.height !== h) {
    els.canvas.width = w;
    els.canvas.height = h;
  }
}

/* ------------------------------------------------------------------ */
/* readouts                                                            */
/* ------------------------------------------------------------------ */

const grade = (v, ok, warn) => (v <= ok ? "ok" : v <= warn ? "warn" : "bad");

/** Below this, the alignment sweep isn't localising and we say so. */
const ALIGN_CONFIDENCE = 0.2;

function renderReadout() {
  const b = stats.budget;
  const a = stats.align;
  const rows = [];

  if (b && b.valid) {
    const g = grade(b.span, 2, 3.5);
    rows.push(row("depth budget", b.span.toFixed(2) + "% width", g));
    rows.push(row("nearest", b.near.toFixed(2) + "%", grade(-b.near, 2, 3)));
    rows.push(row("furthest", b.far.toFixed(2) + "%", grade(b.far, 1.5, 2.5)));
    rows.push(row("scene median", b.mid.toFixed(2) + "%", "ok"));
    rows.push(row("coverage", Math.round(b.coverage * 100) + "%", grade(100 - b.coverage * 100, 55, 80)));
  } else {
    rows.push(row("depth budget", b ? "low texture" : "—", "warn"));
  }

  if (a) {
    // Below this the SAD curve is too flat to trust — report that honestly
    // rather than grading a number the footage can't actually support.
    const firm = a.confidence >= ALIGN_CONFIDENCE;
    const vPct = Math.abs(a.vert) * 100;
    const rDeg = Math.abs(a.roll) * 180 / Math.PI;
    rows.push(row("vertical error", (a.vert * 100).toFixed(2) + "% height",
      firm ? grade(vPct, 0.15, 0.4) : ""));
    rows.push(row("roll error", (a.roll * 180 / Math.PI).toFixed(2) + "°",
      firm ? grade(rDeg, 0.15, 0.4) : ""));
    rows.push(row("align confidence", Math.round(a.confidence * 100) + "%",
      firm ? "ok" : "warn"));
  }

  els.readout.innerHTML = rows.join("") + noteFor(b, a);
  updateHud(b, a);
}

function row(label, value, g) {
  return `<div class="ro"><span>${label}</span><b class="${g}">${value}</b></div>`;
}

function noteFor(b, a) {
  const notes = [];
  if (a && a.confidence < ALIGN_CONFIDENCE) {
    notes.push("Alignment reading is soft — this frame is too smooth to localise. Scrub to something with hard edges across the whole frame.");
  } else if (a && Math.abs(a.vert) * 100 > 0.15) {
    notes.push("Vertical offset between the eyes is the fastest route to eye strain — hit Auto-align, and fix it at the rig if it persists.");
  }
  if (b && b.valid && b.far > 1.5) {
    notes.push("Positive parallax is past ~1.5% of width. On a large screen that starts asking eyes to diverge — pull convergence negative.");
  }
  if (b && b.valid && b.span > 3.5) {
    notes.push("Wide depth budget. Fusable in a headset, punishing on a phone.");
  }
  if (b && b.pinned > 0.08) {
    notes.push(Math.round(b.pinned * 100) + "% of matches hit the edge of the search window — widen Search range, or expect repeating detail (fences, grids) to be fooling it.");
  }
  if (!notes.length && b && b.valid) notes.push("Within comfortable limits for headset and large-screen viewing.");
  return notes.map((n) => `<div class="ro-note">${n}</div>`).join("");
}

function updateHud(b, a) {
  if (!state.hud) return;
  if (b && b.valid) {
    set(els.hudBudget, b.span.toFixed(2) + "%", grade(b.span, 2, 3.5));
    set(els.hudNearfar, b.near.toFixed(1) + " / +" + b.far.toFixed(1), grade(b.far, 1.5, 2.5));
  }
  if (a) {
    set(els.hudVert, (a.vert * 100).toFixed(2) + "%", grade(Math.abs(a.vert) * 100, 0.15, 0.4));
    set(els.hudRoll, (a.roll * 180 / Math.PI).toFixed(2) + "°", grade(Math.abs(a.roll) * 180 / Math.PI, 0.15, 0.4));
  }
}

function set(el, text, cls) {
  el.textContent = text;
  el.className = cls || "";
}

function updateBadges() {
  const bits = [];
  if (state.srcW) bits.push(`<span class="badge">${state.srcW}×${state.srcH}</span>`);
  bits.push(`<span class="badge hot">${state.layout.toUpperCase()}</span>`);
  if (state.projection !== "flat") {
    bits.push(`<span class="badge">${state.projection.toUpperCase()}</span>`);
    if (state.preview) bits.push('<span class="badge hot">PREVIEW</span>');
  }
  bits.push(`<span class="badge">eye ${state.eyeAspect.toFixed(2)}:1</span>`);
  if (state.swap) bits.push('<span class="badge warn">EYES SWAPPED</span>');
  if (xrPath) bits.push(`<span class="badge ${xrPath === "layers" ? "hot" : "warn"}">XR · ${xrPath === "layers" ? "compositor layer" : "webgl fallback"}</span>`);
  els.badges.innerHTML = bits.join("");
}

function showMsg(html, ms) {
  els.msg.innerHTML = html;
  els.msg.hidden = false;
  clearTimeout(msgTimer);
  if (ms) msgTimer = setTimeout(() => { els.msg.hidden = true; }, ms);
}

/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */

function buildModes() {
  els.modes.innerHTML = MODE_LIST.map((m) =>
    `<button data-mode="${m.id}" title="${m.note}"><i>${m.key}</i>${m.name}</button>`
  ).join("");
  els.modes.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) setMode(+b.dataset.mode);
  });
  syncModes();
}

function syncModes() {
  els.modes.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("on", +b.dataset.mode === state.mode);
  });
}

function setMode(m) {
  state.mode = m;
  syncModes();
}

function seg(id, apply) {
  const root = $(id);
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    root.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    apply(b.dataset.v);
  });
}

function slider(id, out, apply, fmt) {
  const el = $(id);
  const label = $(out);
  const run = () => {
    const v = +el.value;
    apply(v);
    label.textContent = fmt(v);
  };
  el.addEventListener("input", run);
  run();
  return el;
}

function toggle(el, initial, apply) {
  let on = initial;
  const sync = (fromUser) => { el.classList.toggle("on", on); apply(on, fromUser); };
  el.addEventListener("click", () => { on = !on; sync(true); });
  sync(false);
  return { get value() { return on; }, set(v) { on = v; sync(false); } };
}

function markSrcButton(which) {
  $("src-test").classList.toggle("on", which === "test");
}

function wireUI() {
  /* source */
  $("src-test").addEventListener("click", useTestCard);
  $("src-file").addEventListener("click", () => els.file.click());
  els.file.addEventListener("change", () => {
    const f = els.file.files && els.file.files[0];
    if (f) useMedia(URL.createObjectURL(f), f.name, true);
  });
  $("src-url").addEventListener("click", () => {
    const u = prompt("Video or image URL (must allow cross-origin reads):");
    if (u) useMedia(u.trim(), u.trim().split("/").pop() || "remote", false);
  });

  /* injected faults */
  slider("inj-v", "v-injv", (v) => { inject.vert = v / 10000; }, (v) => (v / 100).toFixed(2) + "%");
  slider("inj-r", "v-injr", (v) => { inject.roll = (v / 100) * (2 * Math.PI / 180); },
    (v) => ((v / 100) * 2).toFixed(2) + "°");

  /* layout */
  seg("seg-layout", (v) => { state.layoutMode = v; applyLayout(); });
  seg("seg-proj", (v) => {
    state.projection = v;
    state.eyeAspect = displayEyeAspect(state);
    $("grp-fisheye").hidden = v !== "fisheye";
    $("grp-equirect").hidden = v !== "vr180" && v !== "vr360";
    if (v !== "flat" && !state.preview) showMsg(
      "Turn on <b>Preview</b> to check this projection without a headset — drag to look around.", 4500);
    updateBadges();
  });

  toggle($("btn-preview"), false, (on) => {
    state.preview = on;
    if (on) { state.lookYaw = 0; state.lookPitch = 0; }
    updateBadges();
  });
  $("sel-lens").addEventListener("change", (e) => { state.lensModel = +e.target.value; });
  slider("s-fov", "v-fov", (v) => { state.fovHalf = (v / 2) * Math.PI / 180; }, (v) => v + "°");
  slider("s-rad", "v-rad", (v) => { state.radius = v / 1000; }, (v) => (v / 1000).toFixed(3));
  slider("s-cx", "v-cx", (v) => { state.circleX = v / 1000; }, (v) => (v / 1000).toFixed(3));
  slider("s-cy", "v-cy", (v) => { state.circleY = v / 1000; }, (v) => (v / 1000).toFixed(3));
  slider("s-eqv", "v-eqv", (v) => { state.eqVert = (v / 2) * Math.PI / 180; }, (v) => v + "°");
  slider("s-yaw", "v-yaw", (v) => { state.yaw = v * Math.PI / 180; }, (v) => v + "°");
  $("sel-aspect").addEventListener("change", (e) => {
    state.aspectMode = e.target.value;
    state.eyeAspect = displayEyeAspect(state);
    updateBadges();
  });
  toggle($("btn-swap"), false, (on) => { state.swap = on; analysis.reset(); updateBadges(); });

  /* alignment — a trim is a discontinuity, so drop the temporal filter and
     re-lock immediately rather than letting the readout drift into place */
  slider("s-conv", "v-conv", (v) => { state.conv = v / 8000; analysis.reset(); },
    (v) => (v / 40).toFixed(2) + "%");
  slider("s-vert", "v-vert", (v) => { state.vert = v / 4000; analysis.reset(); },
    (v) => (v / 20).toFixed(2) + "%");
  slider("s-roll", "v-roll", (v) => { state.roll = (v / 100) * (3 * Math.PI / 180); analysis.reset(); },
    (v) => ((v / 100) * 3).toFixed(2) + "°");

  $("btn-auto").addEventListener("click", autoAlign);
  $("btn-reset").addEventListener("click", () => {
    ["s-conv", "s-vert", "s-roll"].forEach((id) => { $(id).value = 0; $(id).dispatchEvent(new Event("input")); });
  });

  /* analysis */
  toggle($("btn-hud"), true, (on) => { state.hud = on; els.hud.hidden = !on; });
  slider("s-range", "v-range", (v) => { state.maxDisp = v / 1000; analysis.reset(); },
    (v) => (v / 10).toFixed(1) + "%");

  /* parallax */
  slider("s-pstr", "v-pstr", (v) => { state.parallaxStrength = v / 100; }, (v) => (v / 100).toFixed(2) + "×");
  // iOS only grants orientation access from a real gesture, so never on boot.
  toggle($("btn-gyro"), true, (on, fromUser) => { state.gyro = on; if (on && fromUser) requestGyro(); });

  /* cardboard */
  slider("s-k1", "v-k1", (v) => { state.k1 = v / 100; }, (v) => (v / 100).toFixed(2));
  slider("s-lens", "v-lens", (v) => { state.lensShift = v / 2000; }, (v) => (v / 2000).toFixed(3));

  /* transport */
  els.play.addEventListener("click", togglePlay);
  els.scrub.addEventListener("input", () => {
    const v = videoEl();
    if (v && v.duration) v.currentTime = (els.scrub.value / 1000) * v.duration;
  });
  els.loop.addEventListener("click", () => {
    const on = els.loop.getAttribute("aria-pressed") !== "true";
    els.loop.setAttribute("aria-pressed", String(on));
    const v = videoEl();
    if (v) v.loop = on;
  });
  els.mute.addEventListener("click", () => {
    const on = els.mute.getAttribute("aria-pressed") !== "true";
    els.mute.setAttribute("aria-pressed", String(on));
    const v = videoEl();
    if (v) v.muted = on;
  });
  els.full.addEventListener("click", toggleFullscreen);
  els.xr.addEventListener("click", () => {
    if (xr.active) xr.exit();
    else xr.enter().catch((e) => showMsg("<b>Couldn't start the immersive session.</b><br>" + e.message, 6000));
  });

  /* input */
  let drag = null;
  els.stage.addEventListener("pointerdown", (e) => {
    if (!state.preview || state.projection === "flat") return;
    drag = { x: e.clientX, y: e.clientY, yaw: state.lookYaw, pitch: state.lookPitch };
    els.stage.setPointerCapture(e.pointerId);
  });
  els.stage.addEventListener("pointerup", () => { drag = null; });
  els.stage.addEventListener("pointermove", (e) => {
    if (drag) {
      const k = state.previewFov / els.stage.clientWidth;
      state.lookYaw = drag.yaw + (e.clientX - drag.x) * k;
      state.lookPitch = Math.max(-1.5, Math.min(1.5, drag.pitch + (e.clientY - drag.y) * k));
      return;
    }
    const r = els.stage.getBoundingClientRect();
    setParallax(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
  });
  els.stage.addEventListener("pointerleave", () => setParallax(0, 0));

  ["dragenter", "dragover"].forEach((t) =>
    els.stage.addEventListener(t, (e) => { e.preventDefault(); els.drop.hidden = false; }));
  ["dragleave", "drop"].forEach((t) =>
    els.stage.addEventListener(t, (e) => { e.preventDefault(); els.drop.hidden = true; }));
  els.stage.addEventListener("drop", (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) useMedia(URL.createObjectURL(f), f.name, true);
  });

  window.addEventListener("keydown", onKey);
}

function setParallax(nx, ny) {
  state.parallaxX = nx * 0.05;
  state.parallaxY = ny * 0.012;
}

function requestGyro() {
  const D = window.DeviceOrientationEvent;
  const attach = () => window.addEventListener("deviceorientation", onOrient);
  if (D && typeof D.requestPermission === "function") {
    D.requestPermission().then((r) => { if (r === "granted") attach(); }).catch(() => {});
  } else if (D) {
    attach();
  }
}

function onOrient(e) {
  if (!state.gyro) return;
  const g = Math.max(-30, Math.min(30, e.gamma || 0)) / 30;
  const b = Math.max(-30, Math.min(30, (e.beta || 0) - 45)) / 30;
  setParallax(g, b);
}

function autoAlign() {
  if (!source) return;
  for (let i = 0; i < 2; i++) {
    const a = analysis.alignment(state, srcTex);
    if (a.confidence < ALIGN_CONFIDENCE) {
      showMsg("<b>Not enough texture to auto-align.</b><br>Try a frame with more detail across the whole image.", 5000);
      return;
    }
    // Trims add twice their value to the relative offset, so halve the fix.
    nudge("s-vert", -a.vert / 2 * 4000);
    nudge("s-roll", -a.roll / (3 * Math.PI / 180) * 100);
  }
  stats.align = analysis.alignment(state, srcTex);
  renderReadout();
  showMsg("<b>Auto-aligned.</b> Residual is in the analysis panel — anything under 0.1% is clean.", 4000);
}

function nudge(id, delta) {
  const el = $(id);
  el.value = String(Math.max(+el.min, Math.min(+el.max, +el.value + delta)));
  el.dispatchEvent(new Event("input"));
}

/* ------------------------------------------------------------------ */
/* transport                                                           */
/* ------------------------------------------------------------------ */

function videoEl() {
  return source && source.kind === "video" ? source.el : null;
}

function togglePlay() {
  const v = videoEl();
  if (!v) return;
  if (v.paused) v.play().catch(() => {});
  else v.pause();
}

function setTransport(playing) {
  els.icPlay.innerHTML = playing
    ? '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>'
    : '<path d="M8 5l11 7-11 7z"/>';
}

function fmtTime(s) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  return m + ":" + String(Math.floor(s % 60)).padStart(2, "0");
}

function updateTransport() {
  const v = videoEl();
  if (!v) {
    els.time.textContent = source && source.kind === "canvas" ? "live" : "—";
    els.scrub.value = 0;
    setTransport(true);
    return;
  }
  setTransport(!v.paused);
  if (v.duration) {
    els.scrub.value = String(Math.round((v.currentTime / v.duration) * 1000));
    els.time.textContent = fmtTime(v.currentTime) + " / " + fmtTime(v.duration);
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else els.stage.requestFullscreen && els.stage.requestFullscreen();
}

/* ------------------------------------------------------------------ */
/* keyboard                                                            */
/* ------------------------------------------------------------------ */

function onKey(e) {
  if (e.target.matches("input, select, textarea")) return;
  const byKey = MODE_LIST.find((m) => m.key === e.key);
  if (byKey) { setMode(byKey.id); return; }
  switch (e.key) {
    case " ": e.preventDefault(); togglePlay(); break;
    case "[": nudge("s-conv", -8); break;
    case "]": nudge("s-conv", 8); break;
    case "s": $("btn-swap").click(); break;
    case "a": autoAlign(); break;
    case "f": toggleFullscreen(); break;
    case "h": $("btn-hud").click(); break;
  }
}
