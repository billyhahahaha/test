/* Angeles National — Green Guide · app logic */
(function () {
  "use strict";

  var app = document.getElementById("app");
  var sheet = document.getElementById("sheet");
  var activeSide = "front";

  /* ---------- small helpers ---------- */
  function el(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
  function parClass(p) { return p === 3 ? "par3" : p === 5 ? "par5" : "par4"; }

  /* ---------- icons ---------- */
  var IC = {
    course: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4l9 2.5L5 9"/><circle cx="5" cy="21" r="1.4" fill="currentColor"/></svg>',
    holes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="17" rx="7" ry="3.2"/><path d="M12 14V4"/><path d="M12 4l5 1.8L12 7.6"/></svg>',
    reads: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18c4-7 12-7 16 0"/><circle cx="12" cy="9" r="2"/><path d="M12 18v-4"/></svg>',
    slope: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><path d="M4 20L20 6"/></svg>',
    brk: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5c0 8 6 6 6 11"/><path d="M11 16l-2.5-2M11 16l2.5-2"/></svg>',
    tip: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10c1 1 1 2 1 3h6c0-1 0-2 1-3a6 6 0 0 0-4-10z"/></svg>',
  };

  /* ================================================================
     TOPOGRAPHIC GREEN MODEL  (schematic, not surveyed)
     ----------------------------------------------------------------
     Each green gets a distinct outline (sized by hole type) and a
     modelled elevation field built from the verified property tilt
     (mountain high -> valley low) plus the documented character of
     each green. Contour lines + fall-line arrows are computed from
     that field via marching squares. Swap greenGeom()/elevation()
     for real OSM polygons + a DEM when network access is available.
     ================================================================ */

  // per-hole green character: shape + interior features
  var FEAT = {
    1:  { shape: "round",   feat: "" },
    2:  { shape: "big",     feat: "crown" },
    3:  { shape: "long",    feat: "spine" },
    4:  { shape: "round",   feat: "bowl" },
    5:  { shape: "kidney",  feat: "" },        // strong single tilt
    6:  { shape: "long",    feat: "falsefront" },
    7:  { shape: "small",   feat: "crown" },
    8:  { shape: "angled",  feat: "falsefront" },
    9:  { shape: "big",     feat: "tier" },
    10: { shape: "round",   feat: "" },
    11: { shape: "small",   feat: "crown" },
    12: { shape: "small",   feat: "bowl" },
    13: { shape: "big",     feat: "saddle" },
    14: { shape: "long",    feat: "spine" },
    15: { shape: "big",     feat: "tier" },
    16: { shape: "big",     feat: "backshelf" },
    17: { shape: "kidney",  feat: "" },
    18: { shape: "angled",  feat: "backshelf" },
  };

  function rng(seed) { // mulberry32 — deterministic per hole
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function downhill(h) {
    var rad = (h.breakDir - 90) * Math.PI / 180; // 180 -> +y (down/valley)
    return { ux: Math.cos(rad), uy: Math.sin(rad) };
  }

  // distinct outline per green
  function greenGeom(h) {
    var f = FEAT[h.n] || { shape: "round" };
    var cx = 160, cy = 116;
    var base = { small: 50, round: 62, long: 60, kidney: 60, angled: 62, big: 74 }[f.shape] || 62;
    var rnd = rng(h.n * 131 + 7);
    var d = downhill(h);
    var N = 22, pts = [];
    for (var i = 0; i < N; i++) {
      var a = (i / N) * Math.PI * 2;
      var r = base * (0.86 + 0.26 * rnd());
      var along = Math.cos(a - (h.breakDir - 90) * Math.PI / 180);    // 1 toward valley
      var perp = Math.sin(a - (h.breakDir - 90) * Math.PI / 180);
      if (f.shape === "long")   r *= 1 + 0.30 * Math.abs(along) - 0.18 * Math.abs(perp);
      if (f.shape === "small")  r *= 1;
      if (f.shape === "big")    r *= 1 + 0.08 * Math.abs(along);
      if (f.shape === "kidney") r *= 1 - 0.34 * Math.max(0, Math.cos(a - 1.2)); // pinch one flank
      if (f.shape === "angled") r *= 1 + 0.22 * Math.cos(a - 0.7);              // skew long axis
      var x = cx + Math.cos(a) * r * 1.16;
      var y = cy + Math.sin(a) * r * 0.82;
      pts.push([x, y]);
    }
    var bx0 = 9e9, by0 = 9e9, bx1 = -9e9, by1 = -9e9;
    for (var k = 0; k < pts.length; k++) {
      bx0 = Math.min(bx0, pts[k][0]); by0 = Math.min(by0, pts[k][1]);
      bx1 = Math.max(bx1, pts[k][0]); by1 = Math.max(by1, pts[k][1]);
    }
    return { cx: cx, cy: cy, pts: pts, d: smoothPath(pts), dir: d, bbox: [bx0, by0, bx1, by1] };
  }

  // closed cardinal-spline path through points
  function smoothPath(p) {
    var n = p.length, d = "M" + p[0][0].toFixed(1) + " " + p[0][1].toFixed(1);
    for (var i = 0; i < n; i++) {
      var p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += "C" + c1x.toFixed(1) + " " + c1y.toFixed(1) + " " + c2x.toFixed(1) + " " + c2y.toFixed(1) +
        " " + p2[0].toFixed(1) + " " + p2[1].toFixed(1);
    }
    return d + "Z";
  }

  // modelled elevation at (x,y): tilt + documented feature
  function elevation(h, g, x, y) {
    var ux = g.dir.ux, uy = g.dir.uy;
    var s = (x - g.cx) * ux + (y - g.cy) * uy;        // + = downhill / valley
    var perp = -(x - g.cx) * uy + (y - g.cy) * ux;
    var tilt = 0.95 + h.severity * 0.6;
    var z = -s * tilt;                                 // high on mountain side
    var amp = 60 * tilt;
    var r2 = (x - g.cx) * (x - g.cx) + (y - g.cy) * (y - g.cy);
    function gauss(dd, sig) { return Math.exp(-dd / (2 * sig * sig)); }
    switch ((FEAT[h.n] || {}).feat) {
      case "crown":      z += amp * 0.55 * gauss(r2, 34); break;
      case "bowl":       z -= amp * 0.55 * gauss(r2, 38); break;
      case "tier":       z += amp * 0.70 * Math.tanh(-s / 13); break;   // upper shelf
      case "spine":      z += amp * 0.50 * gauss(perp * perp, 14); break;
      case "falsefront": z += amp * 0.55 * gauss((s - 42) * (s - 42), 16); break;
      case "backshelf":  z += amp * 0.55 * gauss((s + 42) * (s + 42), 18); break;
      case "saddle":     z -= amp * 0.45 * gauss(perp * perp, 16); break;
    }
    return z;
  }

  function edgePt(ax, ay, bx, by, za, zb, lvl) {
    var t = (lvl - za) / (zb - za);
    return [ax + (bx - ax) * t, ay + (by - ay) * t];
  }

  // marching-squares contour path 'd' for one level over sampled grid
  function contourD(Z, x0, y0, step, lvl) {
    var d = "", rows = Z.length - 1, cols = Z[0].length - 1;
    for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) {
      var tl = Z[j][i], tr = Z[j][i + 1], br = Z[j + 1][i + 1], bl = Z[j + 1][i];
      var idx = (tl > lvl ? 8 : 0) | (tr > lvl ? 4 : 0) | (br > lvl ? 2 : 0) | (bl > lvl ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      var xL = x0 + i * step, xR = xL + step, yT = y0 + j * step, yB = yT + step;
      var T = function () { return edgePt(xL, yT, xR, yT, tl, tr, lvl); };
      var R = function () { return edgePt(xR, yT, xR, yB, tr, br, lvl); };
      var B = function () { return edgePt(xL, yB, xR, yB, bl, br, lvl); };
      var L = function () { return edgePt(xL, yT, xL, yB, tl, bl, lvl); };
      var segs = [];
      switch (idx) {
        case 1: segs = [[L(), B()]]; break;
        case 2: segs = [[B(), R()]]; break;
        case 3: segs = [[L(), R()]]; break;
        case 4: segs = [[T(), R()]]; break;
        case 5: segs = [[L(), T()], [B(), R()]]; break;
        case 6: segs = [[T(), B()]]; break;
        case 7: segs = [[L(), T()]]; break;
        case 8: segs = [[T(), L()]]; break;
        case 9: segs = [[T(), B()]]; break;
        case 10: segs = [[T(), R()], [L(), B()]]; break;
        case 11: segs = [[T(), R()]]; break;
        case 12: segs = [[L(), R()]]; break;
        case 13: segs = [[B(), R()]]; break;
        case 14: segs = [[L(), B()]]; break;
      }
      for (var s = 0; s < segs.length; s++) {
        var a = segs[s][0], b = segs[s][1];
        d += "M" + a[0].toFixed(1) + " " + a[1].toFixed(1) + "L" + b[0].toFixed(1) + " " + b[1].toFixed(1);
      }
    }
    return d;
  }

  // full topographic diagram
  function topoSVG(h) {
    var W = 320, H = 224, g = greenGeom(h), ux = g.dir.ux, uy = g.dir.uy;
    var bb = g.bbox, step = 6;
    var x0 = bb[0] - step, y0 = bb[1] - step;
    var cols = Math.ceil((bb[2] - bb[0]) / step) + 2, rows = Math.ceil((bb[3] - bb[1]) / step) + 2;
    var Z = [], minz = 9e9, maxz = -9e9;
    for (var j = 0; j <= rows; j++) {
      var row = [];
      for (var i = 0; i <= cols; i++) {
        var z = elevation(h, g, x0 + i * step, y0 + j * step);
        row.push(z); if (z < minz) minz = z; if (z > maxz) maxz = z;
      }
      Z.push(row);
    }
    // contour lines
    var nL = 9, contours = "";
    for (var k = 1; k < nL; k++) {
      var lvl = minz + (maxz - minz) * k / nL;
      var dd = contourD(Z, x0, y0, step, lvl);
      var major = (k % 2 === 0);
      contours += '<path d="' + dd + '" fill="none" stroke="rgba(255,255,255,' +
        (major ? 0.34 : 0.18) + ')" stroke-width="' + (major ? 1.3 : 0.9) + '"/>';
    }
    // fall-line arrows (downhill = -grad), sampled inside the green
    var arrows = "", samp = [[0, 0], [-30, -16], [30, -16], [-30, 18], [30, 18], [0, 30]];
    for (var a = 0; a < samp.length; a++) {
      var px = g.cx + samp[a][0], py = g.cy + samp[a][1];
      if (!inPoly(px, py, g.pts)) continue;
      var dzx = elevation(h, g, px + 2, py) - elevation(h, g, px - 2, py);
      var dzy = elevation(h, g, px, py + 2) - elevation(h, g, px, py - 2);
      var m = Math.hypot(dzx, dzy) || 1;
      var dx = -dzx / m, dy = -dzy / m, L = 13;
      arrows += '<line x1="' + px.toFixed(1) + '" y1="' + py.toFixed(1) + '" x2="' +
        (px + dx * L).toFixed(1) + '" y2="' + (py + dy * L).toFixed(1) +
        '" stroke="#c6ff32" stroke-width="2" stroke-linecap="round" marker-end="url(#fa)"/>';
    }
    // pin toward the high (mountain) side
    var pinX = g.cx - ux * 24 + uy * 10, pinY = g.cy - uy * 24 - ux * 10;
    // gradient vector (light high -> dark low)
    var gx1 = g.cx - ux * 70, gy1 = g.cy - uy * 70, gx2 = g.cx + ux * 70, gy2 = g.cy + uy * 70;
    var water = "";
    if (h.n === 17 || h.n === 18) {
      var wx = g.cx + ux * 78, wy = g.cy + uy * 78;
      water = '<ellipse cx="' + wx.toFixed(0) + '" cy="' + wy.toFixed(0) + '" rx="64" ry="30" fill="#2aa6ff" opacity="0.30"/>' +
        '<ellipse cx="' + wx.toFixed(0) + '" cy="' + wy.toFixed(0) + '" rx="64" ry="30" fill="none" stroke="#2aa6ff" stroke-opacity="0.5" stroke-width="1.5"/>';
    }
    var cid = "clip" + h.n;
    return (
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Topographic model of the green for hole ' + h.n + '">' +
      '<defs>' +
        '<linearGradient id="el' + h.n + '" gradientUnits="userSpaceOnUse" x1="' + gx1.toFixed(0) + '" y1="' + gy1.toFixed(0) + '" x2="' + gx2.toFixed(0) + '" y2="' + gy2.toFixed(0) + '">' +
          '<stop offset="0%" stop-color="#46b06e"/>' +
          '<stop offset="55%" stop-color="#1f7d43"/>' +
          '<stop offset="100%" stop-color="#0c5028"/>' +
        '</linearGradient>' +
        '<clipPath id="' + cid + '"><path d="' + g.d + '"/></clipPath>' +
        '<marker id="fa" markerWidth="8" markerHeight="8" refX="5" refY="4" orient="auto"><path d="M0 0L8 4L0 8z" fill="#c6ff32"/></marker>' +
      '</defs>' +
      water +
      '<path d="' + g.d + '" fill="url(#el' + h.n + ')" stroke="rgba(255,255,255,0.28)" stroke-width="1.5"/>' +
      '<g clip-path="url(#' + cid + ')">' + contours + arrows + '</g>' +
      // pin
      '<circle cx="' + pinX.toFixed(1) + '" cy="' + pinY.toFixed(1) + '" r="6" fill="rgba(0,0,0,0.5)"/>' +
      '<circle cx="' + pinX.toFixed(1) + '" cy="' + pinY.toFixed(1) + '" r="3.2" fill="#fff"/>' +
      '<line x1="' + pinX.toFixed(1) + '" y1="' + pinY.toFixed(1) + '" x2="' + pinX.toFixed(1) + '" y2="' + (pinY - 30).toFixed(1) + '" stroke="#fff" stroke-width="2"/>' +
      '<path d="M' + pinX.toFixed(1) + ' ' + (pinY - 30).toFixed(1) + ' l15 5 l-15 5 z" fill="#30d158"/>' +
      '</svg>'
    );
  }

  function inPoly(x, y, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  /* ---------- views ---------- */
  function statStrip() {
    var s = [
      ["72", "Par"], [COURSE.yards.toLocaleString(), "Yards"],
      [COURSE.rating, "Rating"], [COURSE.slope, "Slope"],
    ];
    return '<div class="stats">' + s.map(function (x) {
      return '<div class="stat"><b>' + x[0] + '</b><span>' + x[1] + '</span></div>';
    }).join("") + '</div>';
  }

  function courseView() {
    return '<section class="view active" id="v-course">' +
      '<div class="hero">' +
        '<div class="eyebrow">Green Guide ’26</div>' +
        '<h1><span class="out">Angeles</span><span class="thin">National</span></h1>' +
        '<p class="sub">Every green, read and ready. A Jack Nicklaus design draped across the San Gabriel foothills — fast bentgrass, bold contours, one golden rule.</p>' +
      '</div>' +
      statStrip() +
      '<div class="card note"><h3>The Golden Rule</h3><p>' + READING.principle + '</p></div>' +
      '<div class="card"><h3>The Setting</h3><p>' + COURSE.setting + '</p>' +
        '<div class="meta">' +
          '<span class="chip green">' + COURSE.designer + '</span>' +
          '<span class="chip">' + COURSE.greens + '</span>' +
          '<span class="chip">Black tees · ' + COURSE.yards.toLocaleString() + ' yds</span>' +
          '<span class="chip">' + COURSE.location + '</span>' +
        '</div></div>' +
      '<div class="card"><h3>How To Use This</h3><p>Tap <b style="color:var(--text)">Holes</b> to open the guide for any green. Each card gives you a <b style="color:var(--text)">topographic model</b> — contour lines and downhill fall-lines — plus the slope, dominant break and a tactical tip. Start with <b style="color:var(--text)">Reads</b> for the five habits that unlock the whole course.</p></div>' +
      '<p class="disc"><b>About the data:</b> Par, yardage, handicap index and course ratings are taken from the published scorecard and are accurate. The green <b>shapes and topographic contours are a schematic model</b> — built from the course\'s mountain-to-valley terrain, Nicklaus design tendencies and firm-fast green conditions, not a surveyed contour map. Use them as a smart framework and trust your eyes on the day.</p>' +
      '<p class="footer-credit">Built for the player who wants <b>par from below the hole.</b></p>' +
    '</section>';
  }

  function holesView() {
    return '<section class="view" id="v-holes">' +
      '<div class="sec-head"><h2>The Greens</h2><span class="count">18 holes · par 72</span></div>' +
      '<div class="segmented" id="seg">' +
        '<button data-side="front" class="on">Front Nine</button>' +
        '<button data-side="back">Back Nine</button>' +
      '</div>' +
      '<div class="grid" id="grid"></div>' +
    '</section>';
  }

  function readsView() {
    var items = READING.points.map(function (p, i) {
      return '<div class="read-item"><div class="n">' + (i + 1) + '</div><div><h4>' + p.h + '</h4><p>' + p.t + '</p></div></div>';
    }).join("");
    return '<section class="view" id="v-reads">' +
      '<div class="hero" style="padding-bottom:0">' +
        '<div class="eyebrow">Green Reading 101</div>' +
        '<h1 style="font-size:clamp(34px,11vw,50px)"><span class="thin">Read it</span><span class="out">Like a Local</span></h1>' +
      '</div>' +
      '<div class="card note"><h3>One Rule To Remember</h3><p>' + READING.principle + '</p></div>' +
      '<div class="card">' + items + '</div>' +
      '<p class="footer-credit"><b>Fast greens break more.</b> Borrow extra, putt softer.</p>' +
    '</section>';
  }

  function renderGrid() {
    var grid = document.getElementById("grid");
    var rows = HOLES.filter(function (h) { return h.side === activeSide; });
    grid.innerHTML = rows.map(function (h, i) {
      return '<button class="hole-card ' + parClass(h.par) + '" data-n="' + h.n + '" style="animation-delay:' + (i * 45) + 'ms">' +
        '<span class="par-tag">Par ' + h.par + '</span>' +
        '<div class="num">' + h.n + '</div>' +
        '<div class="t">' + h.title + '</div>' +
        '<div class="d"><span><b>' + h.yds + '</b> yds</span><span>HCP <b>' + h.hcp + '</b></span></div>' +
        '<div class="bar"></div>' +
      '</button>';
    }).join("");
  }

  /* ---------- detail sheet ---------- */
  function openHole(n) {
    var h = HOLES.find(function (x) { return x.n === n; });
    if (!h) return;
    var sev = "";
    for (var i = 1; i <= 3; i++) sev += '<i class="' + (i <= h.severity ? "on" : "") + '"></i>';

    document.getElementById("sheet-inner").innerHTML =
      '<div class="sheet-bar">' +
        '<button class="back-btn" id="closeSheet">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg> Holes</button>' +
        '<span class="ix">Hole ' + h.n + ' / 18</span>' +
      '</div>' +
      '<div class="detail-head">' +
        '<div class="kicker">Par ' + h.par + ' · ' + h.title + '</div>' +
        '<h2>Hole ' + h.n + '</h2>' +
        '<div class="hd-stats">' +
          '<div class="hd-stat"><b>' + h.par + '</b><span>Par</span></div>' +
          '<div class="hd-stat"><b>' + h.yds + '</b><span>Yards</span></div>' +
          '<div class="hd-stat"><b>' + h.hcp + '</b><span>Hcp Index</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="green-wrap">' +
        '<div class="sev">' + sev + '<span>Break</span></div>' +
        topoSVG(h) +
        '<div class="legend"><span class="hi">▲ Mountain · high</span><span>◷ contours · ⬇ fall-line</span><span>Valley · low ▼</span></div>' +
      '</div>' +
      '<p style="color:var(--muted);font-size:14.5px;line-height:1.6;margin:0 2px 14px">' + h.summary + '</p>' +
      '<div class="guide">' +
        '<div class="gblock slp"><div class="lab">' + IC.slope + 'Slope</div><p>' + h.slope + '</p></div>' +
        '<div class="gblock brk"><div class="lab">' + IC.brk + 'Break</div><p>' + h.break + '</p></div>' +
        '<div class="gblock tip"><div class="lab">' + IC.tip + 'Play It</div><p>' + h.tips + '</p></div>' +
      '</div>' +
      '<p class="disc"><b>Topographic model — schematic.</b> The outline and contour lines are modelled from the property\'s mountain-to-valley tilt, Nicklaus green design and fast bentgrass — not a surveyed map. Fall-line arrows point downhill. Confirm with your own read on the day.</p>' +
      navPrevNext(h.n);

    sheet.classList.add("open");
    sheet.scrollTop = 0;
    document.body.style.overflow = "hidden";
    document.getElementById("closeSheet").onclick = closeHole;
    var pv = document.getElementById("dPrev"), nx = document.getElementById("dNext");
    if (pv) pv.onclick = function () { openHole(n - 1); };
    if (nx) nx.onclick = function () { openHole(n + 1); };
  }

  function navPrevNext(n) {
    var prev = n > 1 ? '<button class="back-btn" id="dPrev"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg> Hole ' + (n - 1) + '</button>' : '<span></span>';
    var next = n < 18 ? '<button class="back-btn" id="dNext">Hole ' + (n + 1) + ' <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button>' : '<span></span>';
    return '<div style="display:flex;justify-content:space-between;gap:10px;margin-top:22px">' + prev + next + '</div>';
  }

  function closeHole() {
    sheet.classList.remove("open");
    document.body.style.overflow = "";
  }

  /* ---------- tab switching ---------- */
  function switchTab(name) {
    document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("active"); });
    document.getElementById("v-" + name).classList.add("active");
    document.querySelectorAll(".tabbar button").forEach(function (b) {
      b.classList.toggle("on", b.dataset.tab === name);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- mount ---------- */
  app.innerHTML = courseView() + holesView() + readsView();

  var tabbar = el(
    '<nav class="tabbar"><div class="inner">' +
      '<button data-tab="course" class="on">' + IC.course + 'Course</button>' +
      '<button data-tab="holes">' + IC.holes + 'Holes</button>' +
      '<button data-tab="reads">' + IC.reads + 'Reads</button>' +
    '</div></nav>'
  );
  document.body.appendChild(tabbar);

  renderGrid();

  tabbar.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (b) switchTab(b.dataset.tab);
  });
  document.getElementById("seg").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    activeSide = b.dataset.side;
    document.querySelectorAll("#seg button").forEach(function (x) { x.classList.toggle("on", x === b); });
    renderGrid();
  });
  document.getElementById("grid").addEventListener("click", function (e) {
    var c = e.target.closest(".hole-card"); if (c) openHole(parseInt(c.dataset.n, 10));
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeHole(); });
})();
