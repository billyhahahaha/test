// Vectorise each green from the surveyed green-view captures:
//   - smooth OUTLINE (flood-from-exterior, blocked by the bold outline)
//   - topographic CONTOUR lines derived from the real slope colours
//     (rainbow heat -> scalar -> iso-contours), so the line-art view still
//     features the real topography in the neon style.
// Output: public/greens/outlines.js  -> { hole: { d, h, c:[..] } }
const fs = require('fs'), path = require('path');
const { PNG } = require('pngjs');
const SRC = '/root/.claude/uploads/007903de-7ce8-5e5c-ad6d-b2e57369dd50';
const OUTJS = '/home/user/test/public/greens/outlines.js';
const MAP = { IMG_2021:12, IMG_2034:6, IMG_1999:1, IMG_2019:11, IMG_2029:16, IMG_2023:13, IMG_2003:2, IMG_2009:5, IMG_2035:7, IMG_2015:9, IMG_2031:17, IMG_2005:3, IMG_2033:18, IMG_2025:14, IMG_2027:15, IMG_2017:10, IMG_2007:4, IMG_2013:8 };
const STEP = 3, NLEV = 6;

function val(r, g, b) { return Math.max(r, g, b) / 255; }
function sat(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; }
function hue(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn; if (dd === 0) return -1; let h; if (mx === r) h = ((g - b) / dd) % 6; else if (mx === g) h = (b - r) / dd + 2; else h = (r - g) / dd + 4; h *= 60; if (h < 0) h += 360; return h; }

function build(png) {
  const W = png.width, H = png.height, d = png.data;
  const cols = (W / STEP) | 0, rows = (H / STEP) | 0;
  // ---- dark outline mask ----
  let dark = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const i = ((y * STEP) * W + x * STEP) * 4; if (val(d[i], d[i + 1], d[i + 2]) < 0.34) dark[y * cols + x] = 1; }
  const dil2 = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { let m = 0; for (let dy = -1; dy <= 1 && !m; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue; if (dark[yy * cols + xx]) { m = 1; break; } } dil2[y * cols + x] = m; }
  dark = dil2;
  // ---- flood exterior ----
  const ext = new Uint8Array(cols * rows), st = [];
  const seed = p => { if (p >= 0 && p < ext.length && !ext[p] && !dark[p]) { ext[p] = 1; st.push(p); } };
  for (let x = 0; x < cols; x++) { seed(x); seed((rows - 1) * cols + x); }
  for (let y = 0; y < rows; y++) { seed(y * cols); seed(y * cols + cols - 1); }
  while (st.length) { const p = st.pop(), px = p % cols; for (const q of [p - 1, p + 1, p - cols, p + cols]) { if (q < 0 || q >= ext.length) continue; if (Math.abs((q % cols) - px) > 1) continue; if (!ext[q] && !dark[q]) { ext[q] = 1; st.push(q); } } }
  const b0 = (rows * 0.20) | 0, b1 = (rows * 0.90) | 0;
  let cand = new Uint8Array(cols * rows);
  for (let y = b0; y < b1; y++) for (let x = 0; x < cols; x++) if (!ext[y * cols + x]) cand[y * cols + x] = 1;
  const mf = (src, R, mode) => { const t = new Uint8Array(src.length), o = new Uint8Array(src.length), init = mode ? 0 : 1; for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { let a = init; for (let k = -R; k <= R; k++) { const xx = x + k; if (xx < 0 || xx >= cols) continue; a = mode ? (a | src[y * cols + xx]) : (a & src[y * cols + xx]); } t[y * cols + x] = a; } for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { let a = init; for (let k = -R; k <= R; k++) { const yy = y + k; if (yy < 0 || yy >= rows) continue; a = mode ? (a | t[yy * cols + x]) : (a & t[yy * cols + x]); } o[y * cols + x] = a; } return o; };
  const lcc = src => { const l = new Int32Array(src.length); let cc = 0, bb = 0, bi = 0; for (let p0 = 0; p0 < src.length; p0++) { if (!src[p0] || l[p0]) continue; cc++; let cnt = 0; const s3 = [p0]; l[p0] = cc; while (s3.length) { const p = s3.pop(); cnt++; const px = p % cols; for (const q of [p - 1, p + 1, p - cols, p + cols]) { if (q < 0 || q >= src.length) continue; if (Math.abs((q % cols) - px) > 1) continue; if (src[q] && !l[q]) { l[q] = cc; s3.push(q); } } } if (cnt > bb) { bb = cnt; bi = cc; } } const o = new Uint8Array(src.length); for (let p = 0; p < o.length; p++) o[p] = l[p] === bi ? 1 : 0; return o; };
  let m = lcc(cand);
  m = mf(m, 5, 0); m = mf(m, 5, 1); m = lcc(m);   // open R5: sever GPS rings/tags, keep green
  m = mf(m, 4, 1); m = mf(m, 4, 0);               // close R4: smooth/fill
  m = mf(m, 2, 0); m = mf(m, 2, 1);               // open R2: shave outline spurs/ticks
  const me = mf(m, 3, 0);                          // eroded domain for contours (off the edge)
  // ---- scalar field from slope colours, inpainted + blurred ----
  const scal = new Float32Array(cols * rows).fill(NaN);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { if (!m[y * cols + x]) continue; const i = ((y * STEP) * W + x * STEP) * 4, r = d[i], g = d[i + 1], b = d[i + 2]; if (sat(r, g, b) > 0.3 && val(r, g, b) > 0.3) { let hh = hue(r, g, b); if (hh < 0) continue; if (hh > 250) hh = 250; scal[y * cols + x] = 250 - hh; } }
  for (let it = 0; it < 40; it++) { let changed = 0; const nx = scal.slice(); for (let y = b0; y < b1; y++) for (let x = 0; x < cols; x++) { const p = y * cols + x; if (!m[p] || !Number.isNaN(scal[p])) continue; let s = 0, n = 0; for (const q of [p - 1, p + 1, p - cols, p + cols]) if (q >= 0 && q < scal.length && !Number.isNaN(scal[q])) { s += scal[q]; n++; } if (n) { nx[p] = s / n; changed++; } } scal.set(nx); if (!changed) break; }
  for (let pass = 0; pass < 7; pass++) { const nx = scal.slice(); for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) { const p = y * cols + x; if (!m[p] || Number.isNaN(scal[p])) continue; let s = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = p + dy * cols + dx; if (!Number.isNaN(scal[q]) && m[q]) { s += scal[q]; n++; } } nx[p] = s / n; } scal.set(nx); }
  return { m, me, scal, cols, rows };
}

// boundary trace (binary marching squares -> longest loop)
function traceMask(m, cols, rows) {
  const at = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows) ? 0 : m[r * cols + c];
  const segs = [];
  for (let r = -1; r < rows; r++) for (let c = -1; c < cols; c++) {
    const tl = at(c, r), tr = at(c + 1, r), br = at(c + 1, r + 1), bl = at(c, r + 1);
    const idx = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const T = [c + 0.5, r], R = [c + 1, r + 0.5], B = [c + 0.5, r + 1], L = [c, r + 0.5], pu = (a, b) => segs.push([a, b]);
    switch (idx) { case 1: pu(L, B); break; case 2: pu(B, R); break; case 3: pu(L, R); break; case 4: pu(T, R); break; case 5: pu(L, T); pu(B, R); break; case 6: pu(T, B); break; case 7: pu(L, T); break; case 8: pu(T, L); break; case 9: pu(T, B); break; case 10: pu(T, R); pu(L, B); break; case 11: pu(T, R); break; case 12: pu(L, R); break; case 13: pu(B, R); break; case 14: pu(L, B); break; }
  }
  const K = (x, y) => x + ',' + y, adj = new Map(), link = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
  for (const [a, b] of segs) { const ka = K(a[0], a[1]), kb = K(b[0], b[1]); link(ka, kb); link(kb, ka); }
  const used = new Set(); let best = [];
  for (const s of adj.keys()) { if (used.has(s)) continue; const loop = []; let cur = s, prev = null; while (cur && !used.has(cur)) { used.add(cur); loop.push(cur.split(',').map(Number)); const ns = adj.get(cur) || []; let nx = null; for (const nn of ns) if (nn !== prev && !used.has(nn)) { nx = nn; break; } prev = cur; cur = nx; } if (loop.length > best.length) best = loop; }
  return best;
}

// iso-contours of scalar inside mask (interpolated)
function isoLines(scal, m, cols, rows, lvl) {
  const at = (c, r) => scal[r * cols + c];
  const ok = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && m[r * cols + c] && !Number.isNaN(scal[r * cols + c]);
  const segs = [];
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    if (!ok(c, r) || !ok(c + 1, r) || !ok(c + 1, r + 1) || !ok(c, r + 1)) continue;
    const tl = at(c, r), tr = at(c + 1, r), br = at(c + 1, r + 1), bl = at(c, r + 1);
    const idx = (tl > lvl ? 8 : 0) | (tr > lvl ? 4 : 0) | (br > lvl ? 2 : 0) | (bl > lvl ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const ip = (a, b, va, vb) => { const t = (lvl - va) / (vb - va); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
    const TL = [c, r], TR = [c + 1, r], BR = [c + 1, r + 1], BL = [c, r + 1];
    const T = () => ip(TL, TR, tl, tr), R = () => ip(TR, BR, tr, br), B = () => ip(BL, BR, bl, br), L = () => ip(TL, BL, tl, bl), pu = (a, b) => segs.push([a, b]);
    switch (idx) { case 1: case 14: pu(L(), B()); break; case 2: case 13: pu(B(), R()); break; case 3: case 12: pu(L(), R()); break; case 4: case 11: pu(T(), R()); break; case 6: case 9: pu(T(), B()); break; case 7: case 8: pu(L(), T()); break; case 5: pu(L(), T()); pu(B(), R()); break; case 10: pu(T(), R()); pu(L(), B()); break; }
  }
  return segs;
}

function despike(pts, closed) {
  let res = pts.slice(), changed = true, guard = 0;
  while (changed && guard++ < 6) {
    changed = false; const out = [], n = res.length;
    for (let i = 0; i < n; i++) {
      if (!closed && (i === 0 || i === n - 1)) { out.push(res[i]); continue; }
      const a = res[(i - 1 + n) % n], p = res[i], b = res[(i + 1) % n];
      const v1 = [p[0] - a[0], p[1] - a[1]], v2 = [b[0] - p[0], b[1] - p[1]];
      const l1 = Math.hypot(v1[0], v1[1]), l2 = Math.hypot(v2[0], v2[1]);
      if (l1 < 1e-6 || l2 < 1e-6) { changed = true; continue; }
      const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2);
      if (cos < -0.45 && Math.min(l1, l2) < 4.5) { changed = true; continue; } // sharp short reversal = spur tip
      out.push(p);
    }
    if (out.length >= 4) res = out; else break;
  }
  return res;
}
function chaikin(pts, it, closed) { for (let k = 0; k < it; k++) { const o = [], n = pts.length; const lim = closed ? n : n - 1; if (!closed) o.push(pts[0]); for (let i = 0; i < lim; i++) { const a = pts[i], b = pts[(i + 1) % n]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]); o.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } if (!closed) o.push(pts[n - 1]); pts = o; } return pts; }
function dp(pts, eps) { if (pts.length < 4) return pts; const d2 = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2; t = Math.max(0, Math.min(1, t)); return (p[0] - (a[0] + t * dx)) ** 2 + (p[1] - (a[1] + t * dy)) ** 2; }; const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const stk = [[0, pts.length - 1]]; while (stk.length) { const [s, e] = stk.pop(); let md = 0, mi = -1; for (let i = s + 1; i < e; i++) { const dd = d2(pts[i], pts[s], pts[e]); if (dd > md) { md = dd; mi = i; } } if (md > eps * eps && mi > 0) { keep[mi] = 1; stk.push([s, mi], [mi, e]); } } return pts.filter((_, i) => keep[i]); }

function cubic(P, closed) { const n = P.length, f = v => v.toFixed(1); if (n < 2) return ''; let d = 'M' + f(P[0][0]) + ' ' + f(P[0][1]); const lim = closed ? n : n - 1; for (let i = 0; i < lim; i++) { const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n]; const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6, c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6; d += 'C' + f(c1x) + ' ' + f(c1y) + ' ' + f(c2x) + ' ' + f(c2y) + ' ' + f(p2[0]) + ' ' + f(p2[1]); } return d + (closed ? 'Z' : ''); }

// chain iso segments into polylines for smoothing
function chain(segs) {
  const K = (p) => p[0].toFixed(2) + ',' + p[1].toFixed(2), adj = new Map();
  const add = (k, seg, end) => { if (!adj.has(k)) adj.set(k, []); adj.get(k).push({ seg, end }); };
  segs.forEach((s, i) => { add(K(s[0]), i, 0); add(K(s[1]), i, 1); });
  const used = new Array(segs.length).fill(false), lines = [];
  for (let i = 0; i < segs.length; i++) { if (used[i]) continue; used[i] = true; let line = [segs[i][0], segs[i][1]]; // extend forward
    let grow = true; while (grow) { grow = false; const tail = line[line.length - 1], cand = adj.get(K(tail)) || []; for (const c of cand) { if (used[c.seg]) continue; const other = segs[c.seg][c.end ? 0 : 1]; line.push(other); used[c.seg] = true; grow = true; break; } }
    grow = true; while (grow) { grow = false; const head = line[0], cand = adj.get(K(head)) || []; for (const c of cand) { if (used[c.seg]) continue; const other = segs[c.seg][c.end ? 0 : 1]; line.unshift(other); used[c.seg] = true; grow = true; break; } }
    if (line.length >= 3) lines.push(line);
  }
  return lines;
}

const result = {};
for (const f of fs.readdirSync(SRC).filter(x => x.endsWith('.png'))) {
  const id = f.match(/IMG_\d+/)[0], hole = MAP[id]; if (!hole) continue;
  const png = PNG.sync.read(fs.readFileSync(path.join(SRC, f)));
  const { m, me, scal, cols, rows } = build(png);
  // bbox from mask
  let minx = 9e9, miny = 9e9, maxx = -9e9, maxy = -9e9;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (m[y * cols + x]) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  const sc = 100 / (maxx - minx), h = +((maxy - miny) * sc).toFixed(2);
  const norm = p => [(p[0] - minx) * sc, (p[1] - miny) * sc];
  // outline
  let loop = traceMask(m, cols, rows); loop = dp(loop, 1.4); loop = despike(loop, true); loop = chaikin(loop, 3, true); loop = dp(loop, 0.35);
  const dPath = cubic(loop.map(norm), true);
  // contours
  let mn = 9e9, mx = -9e9; for (let p = 0; p < scal.length; p++) if (m[p] && !Number.isNaN(scal[p])) { if (scal[p] < mn) mn = scal[p]; if (scal[p] > mx) mx = scal[p]; }
  const contours = [];
  const extent = pts => { let a = 9e9, b = 9e9, c = -9e9, e = -9e9; for (const p of pts) { if (p[0] < a) a = p[0]; if (p[1] < b) b = p[1]; if (p[0] > c) c = p[0]; if (p[1] > e) e = p[1]; } return Math.hypot(c - a, e - b); };
  for (let i = 1; i < NLEV; i++) {
    const lvl = mn + (mx - mn) * i / NLEV;
    const lines = chain(isoLines(scal, me, cols, rows, lvl));   // eroded domain -> off the edge
    for (let line of lines) {
      line = dp(line, 0.8);
      if (line.length > 6) line = line.slice(1, -1);            // trim ends so they don't poke the outline
      if (line.length < 4) continue;
      const np = line.map(norm);
      if (extent(np) < 12) continue;                            // drop arrow-stipple / tiny noise loops
      let sm = despike(line, false); sm = chaikin(sm, 2, false); sm = dp(sm, 0.3);
      const cd = cubic(sm.map(norm), false); if (cd) contours.push(cd);
    }
  }
  result[hole] = { d: dPath, h, c: contours };
  console.log('hole' + hole, 'outline pts', loop.length, 'contours', contours.length, 'h', h);
}
fs.writeFileSync(OUTJS, 'var GREEN_OUTLINES = ' + JSON.stringify(result) + ';\n');
console.log('wrote', OUTJS, (fs.statSync(OUTJS).size / 1024).toFixed(1) + 'KB');
