/* Procedural stereo calibration card.
   Every element is drawn at a *known* screen parallax, expressed as a
   percentage of one eye's width — so if a plaque labelled +2.0% doesn't sit
   2% behind the screen, the fault is in the pipeline, not the footage.

   Renders side-by-side into a 2D canvas, which doubles as the GL texture
   source and (via captureStream) as a real <video> for the XR media path. */

/* Everything below is authored in this logical space, then drawn at SCALE.
   Keeping the drawing in one coordinate system means parallax stays exactly
   the labelled percentage of eye width whatever resolution we render at. */
const EYE_W = 640;
const EYE_H = 360;
const SCALE = 1.5;   // -> 960x540 per eye

/** Plaque parallaxes, in % of eye width. Negative = in front of the screen. */
const RULER = [-3, -2, -1, 0, 1, 2, 3];

export function createTestCard() {
  const canvas = document.createElement("canvas");
  canvas.width = EYE_W * 2 * SCALE;
  canvas.height = EYE_H * SCALE;
  const ctx = canvas.getContext("2d", { alpha: false });

  let stream = null;
  let video = null;

  /** captureStream gives the XR media-binding path a genuine video element. */
  function attachStream() {
    if (video || typeof canvas.captureStream !== "function") return video;
    try {
      stream = canvas.captureStream(30);
      video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.play().catch(() => {});
    } catch {
      video = null;
    }
    return video;
  }

  function draw(t, inject) {
    ctx.fillStyle = "#05080d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawEye(ctx, 0, -1, t, inject, false);
    drawEye(ctx, EYE_W * SCALE, +1, t, inject, true);
  }

  return {
    kind: "canvas",
    el: canvas,
    get width() { return canvas.width; },
    get height() { return canvas.height; },
    layoutHint: "sbs",
    draw,
    attachStream,
    get video() { return video; },
    dispose() {
      if (stream) stream.getTracks().forEach((tr) => tr.stop());
      if (video) { video.srcObject = null; video = null; }
      stream = null;
    },
  };
}

/* --------------------------------------------------------------- */

const lerp = (a, b, x) => a + (b - a) * x;

/** Horizontal offset, in px, for a given parallax (% of eye width). */
function off(pct, eyeSign) {
  return (eyeSign * pct * 0.01 * EYE_W) / 2;
}

function drawEye(ctx, x0, eyeSign, t, inject, isRight) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, 0, EYE_W * SCALE, EYE_H * SCALE);
  ctx.clip();
  ctx.translate(x0, 0);
  ctx.scale(SCALE, SCALE);

  // Deliberate rig faults, injected into the right eye only.
  if (isRight && inject) {
    if (inject.roll) {
      ctx.translate(EYE_W / 2, EYE_H / 2);
      ctx.rotate(inject.roll);
      ctx.translate(-EYE_W / 2, -EYE_H / 2);
    }
    if (inject.vert) ctx.translate(0, inject.vert * EYE_H);
  }

  sky(ctx);
  ground(ctx, eyeSign);
  ruler(ctx, eyeSign);
  orbiter(ctx, eyeSign, t);
  fixation(ctx, eyeSign);
  chrome(ctx, eyeSign, isRight);

  ctx.restore();
}

function sky(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, EYE_H);
  g.addColorStop(0, "#0d2338");
  g.addColorStop(0.55, "#0a1622");
  g.addColorStop(1, "#060d14");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, EYE_W, EYE_H);
}

/** Receding grid: near rows sit in front of the screen, far rows behind. */
function ground(ctx, eyeSign) {
  const horizon = EYE_H * 0.52;
  const ROWS = 13;
  const COLS = 15;

  const rowY = [];
  const rowOff = [];
  for (let i = 0; i < ROWS; i++) {
    const z = i / (ROWS - 1);                       // 0 = near, 1 = far
    rowY.push(EYE_H - (EYE_H - horizon) * Math.pow(z, 0.45));
    rowOff.push(off(lerp(-2.4, 1.5, z), eyeSign));
  }

  ctx.lineWidth = 1;
  for (let i = 0; i < ROWS; i++) {
    const a = 0.06 + 0.16 * (1 - i / (ROWS - 1));
    ctx.strokeStyle = `rgba(120,200,255,${a})`;
    ctx.beginPath();
    ctx.moveTo(rowOff[i], rowY[i]);
    ctx.lineTo(EYE_W + rowOff[i], rowY[i]);
    ctx.stroke();
  }

  for (let c = 0; c <= COLS; c++) {
    const u = c / COLS - 0.5;
    ctx.strokeStyle = "rgba(120,200,255,0.10)";
    ctx.beginPath();
    for (let i = 0; i < ROWS; i++) {
      const spread = lerp(2.6, 0.18, i / (ROWS - 1));
      const x = EYE_W / 2 + u * EYE_W * spread + rowOff[i];
      if (i === 0) ctx.moveTo(x, rowY[i]);
      else ctx.lineTo(x, rowY[i]);
    }
    ctx.stroke();
  }
}

function ruler(ctx, eyeSign) {
  const cx = EYE_W / 2;
  const cy = EYE_H * 0.33;
  const span = EYE_W * 0.78;

  RULER.forEach((p, i) => {
    const u = i / (RULER.length - 1) - 0.5;
    const x = cx + u * span + off(p, eyeSign);
    const y = cy + Math.abs(u) * 26;
    const s = lerp(34, 22, (p + 3) / 6);   // nearer plaques read slightly larger

    const near = p < 0;
    const hue = p === 0 ? "#ffffff" : near ? "#ff6b6b" : "#4ea8ff";

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(6,10,16,0.86)";
    ctx.strokeStyle = hue;
    ctx.lineWidth = p === 0 ? 2 : 1.4;
    roundRect(ctx, -s * 0.95, -s * 0.62, s * 1.9, s * 1.24, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = hue;
    ctx.font = `600 ${Math.round(s * 0.46)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((p > 0 ? "+" : "") + p.toFixed(1) + "%", 0, 0);
    ctx.restore();
  });

  ctx.fillStyle = "rgba(255,255,255,0.34)";
  ctx.font = "600 11px ui-monospace, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.fillText("SCREEN PARALLAX · % OF EYE WIDTH", cx + off(0, eyeSign), cy - 46);
}

function orbiter(ctx, eyeSign, t) {
  const p = 2.6 * Math.sin(t * 0.55);
  const x = EYE_W / 2 + Math.cos(t * 0.55) * EYE_W * 0.3 + off(p, eyeSign);
  const y = EYE_H * 0.72 + Math.sin(t * 1.1) * 16;
  const r = lerp(26, 15, (p + 3) / 6);

  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, p < 0 ? "#ffd7c9" : "#cfe8ff");
  g.addColorStop(1, p < 0 ? "#c0392b" : "#1c5f9e");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "600 10px ui-monospace, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.fillText((p > 0 ? "+" : "") + p.toFixed(1) + "%", x, y + r + 13);
}

/** Zero-parallax cross: this must fuse perfectly, always. */
function fixation(ctx, eyeSign) {
  const x = EYE_W / 2 + off(0, eyeSign);
  const y = EYE_H * 0.52;
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 13, y); ctx.lineTo(x + 13, y);
  ctx.moveTo(x, y - 13); ctx.lineTo(x, y + 13);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.stroke();
}

/** Corner ticks + eye label, all at zero parallax — the alignment reference. */
function chrome(ctx, eyeSign, isRight) {
  const m = 16, len = 22;
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1.5;
  [[m, m, 1, 1], [EYE_W - m, m, -1, 1], [m, EYE_H - m, 1, -1], [EYE_W - m, EYE_H - m, -1, -1]]
    .forEach(([x, y, sx, sy]) => {
      ctx.beginPath();
      ctx.moveTo(x + sx * len, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * len);
      ctx.stroke();
    });

  // Horizontal rules — any vertical misalignment shows up here first.
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1;
  [0.25, 0.5, 0.75].forEach((f) => {
    ctx.beginPath();
    ctx.moveTo(m, EYE_H * f); ctx.lineTo(EYE_W - m, EYE_H * f);
    ctx.stroke();
  });

  ctx.fillStyle = isRight ? "#4ea8ff" : "#ff6b6b";
  ctx.font = "700 13px ui-monospace, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(isRight ? "R" : "L", m + 6, m + 6);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
