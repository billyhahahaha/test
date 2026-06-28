const fs = require('fs'), path = require('path');
const { PNG } = require('pngjs'); const jpeg = require('jpeg-js');
const SRC = '/root/.claude/uploads/007903de-7ce8-5e5c-ad6d-b2e57369dd50';
const OUT = '/home/user/test/public/greens';
const MAP = { IMG_2021:12, IMG_2034:6, IMG_1999:1, IMG_2019:11, IMG_2029:16, IMG_2023:13, IMG_2003:2, IMG_2009:5, IMG_2035:7, IMG_2015:9, IMG_2031:17, IMG_2005:3, IMG_2033:18, IMG_2025:14, IMG_2027:15, IMG_2017:10, IMG_2007:4, IMG_2013:8 };
const OW = 560;
function sv(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return [mx === 0 ? 0 : (mx - mn) / mx, mx / 255]; }
const files = fs.readdirSync(SRC).filter(f => f.endsWith('.png'));
const meta = {};
for (const f of files) {
  const id = f.match(/IMG_\d+/)[0], hole = MAP[id]; if (!hole) continue;
  const png = PNG.sync.read(fs.readFileSync(path.join(SRC, f)));
  const W = png.width, H = png.height, d = png.data;
  const step = 2, cols = (W / step) | 0, rows = (H / step) | 0;
  const b0 = (rows * 0.20) | 0, b1 = (rows * 0.90) | 0;
  let m = new Uint8Array(cols * rows);
  for (let cy = b0; cy < b1; cy++) for (let cx = 0; cx < cols; cx++) { const i = ((cy * step) * W + cx * step) * 4, [s, v] = sv(d[i], d[i + 1], d[i + 2]); if (s > 0.42 && v > 0.46) m[cy * cols + cx] = 1; }
  const mf = (src, R, mode) => { const t = new Uint8Array(src.length), o = new Uint8Array(src.length), init = mode ? 0 : 1; for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { let a = init; for (let k = -R; k <= R; k++) { const xx = x + k; if (xx < 0 || xx >= cols) continue; a = mode ? (a | src[y * cols + xx]) : (a & src[y * cols + xx]); } t[y * cols + x] = a; } for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { let a = init; for (let k = -R; k <= R; k++) { const yy = y + k; if (yy < 0 || yy >= rows) continue; a = mode ? (a | t[yy * cols + x]) : (a & t[yy * cols + x]); } o[y * cols + x] = a; } return o; };
  m = mf(m, 7, 1); m = mf(m, 7, 0);
  const lab = new Int32Array(cols * rows); let cur = 0, best = 0, bid = 0, bb = null;
  for (let p0 = 0; p0 < m.length; p0++) { if (!m[p0] || lab[p0]) continue; cur++; let cnt = 0, mnx = 9e9, mny = 9e9, mxx = -9e9, mxy = -9e9; const st = [p0]; lab[p0] = cur; while (st.length) { const p = st.pop(); cnt++; const px = p % cols, py = (p / cols) | 0; if (px < mnx) mnx = px; if (px > mxx) mxx = px; if (py < mny) mny = py; if (py > mxy) mxy = py; const nb = [p - 1, p + 1, p - cols, p + cols]; for (const q of nb) { if (q < 0 || q >= m.length) continue; if (Math.abs((q % cols) - px) > 1) continue; if (m[q] && !lab[q]) { lab[q] = cur; st.push(q); } } } if (cnt > best) { best = cnt; bid = cur; bb = { mnx, mny, mxx, mxy }; } }
  // bbox -> full res with margin
  const mgx = (bb.mxx - bb.mnx) * 0.05, mgy = (bb.mxy - bb.mny) * 0.05;
  let x0 = Math.max(0, (bb.mnx - mgx) * step), y0 = Math.max(0, (bb.mny - mgy) * step);
  let x1 = Math.min(W, (bb.mxx + mgx) * step), y1 = Math.min(H, (bb.mxy + mgy) * step);
  const cw = x1 - x0, ch = y1 - y0, OH = Math.round(ch * OW / cw);
  // box-average downscale to OW x OH (opaque RGBA for jpeg)
  const buf = Buffer.alloc(OW * OH * 4);
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
    const fx0 = x0 + x / OW * cw, fx1 = x0 + (x + 1) / OW * cw, fy0 = y0 + y / OH * ch, fy1 = y0 + (y + 1) / OH * ch;
    let r = 0, g = 0, b = 0, n = 0;
    for (let sy = fy0 | 0; sy < Math.max((fy0 | 0) + 1, fy1); sy++) for (let sx = fx0 | 0; sx < Math.max((fx0 | 0) + 1, fx1); sx++) {
      if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue; const si = (sy * W + sx) * 4; r += d[si]; g += d[si + 1]; b += d[si + 2]; n++;
    }
    const di = (y * OW + x) * 4; buf[di] = r / n; buf[di + 1] = g / n; buf[di + 2] = b / n; buf[di + 3] = 255;
  }
  const enc = jpeg.encode({ data: buf, width: OW, height: OH }, 82);
  fs.writeFileSync(path.join(OUT, 'hole' + hole + '.jpg'), enc.data);
  meta[hole] = { w: OW, h: OH };
  console.log('hole' + hole, OW + 'x' + OH, (enc.data.length / 1024 | 0) + 'KB');
}
console.log('META=' + JSON.stringify(meta));
