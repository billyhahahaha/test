/* Angeles National — Green Guide · app logic */
(function () {
  "use strict";

  var app = document.getElementById("app");
  var sheet = document.getElementById("sheet");
  var activeSide = "front";
  var greenMode = "outline"; // "outline" | "heat"

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

  /* ---------- halftone heat map (dot-screen from the slope grid) ---------- */
  // exact tones from the reference: steep=red, mid=green, flat=blue
  var HEAT = { red: [229, 24, 29], green: [90, 193, 61], blue: [35, 123, 200], bg: [10, 20, 23] };
  function greenMap(h) {
    return '<canvas class="greenmap" id="heatcv" aria-label="Halftone slope heat map of the hole ' + h.n + ' green"></canvas>';
  }
  function decodeGrid(b64) { var s = atob(b64), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function hash(i, j) { var n = (i * 374761393 + j * 668265263) | 0; n = n ^ (n >>> 13); n = Math.imul(n, 1274126177); n = n ^ (n >>> 16); return ((n >>> 0) % 1000) / 1000; }
  function sampleGrid(g, gw, gh, fx, fy) {
    var ix = Math.max(0, Math.min(gw - 1, Math.floor(fx))), iy = Math.max(0, Math.min(gh - 1, Math.floor(fy)));
    var nv = g[iy * gw + ix]; if (nv === 255) return -1;
    var x1 = Math.min(gw - 1, ix + 1), y1 = Math.min(gh - 1, iy + 1), tx = fx - ix, ty = fy - iy;
    function v(i, j) { var q = g[j * gw + i]; return q === 255 ? nv : q; }
    var a = v(ix, iy), b = v(x1, iy), c = v(ix, y1), d = v(x1, y1);
    var top = a + (b - a) * tx, bot = c + (d - c) * tx; return (top + (bot - top) * ty) / 254;
  }
  function drawHeat(h) {
    var o = (typeof GREEN_OUTLINES !== "undefined") && GREEN_OUTLINES[h.n];
    var cv = document.getElementById("heatcv"); if (!o || !o.hg || !cv) return;
    var g = decodeGrid(o.hg), gw = o.hw, gh = o.hh;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var cssW = Math.min(340, (sheet.clientWidth || 360) - 36), cssH = Math.round(cssW * gh / gw);
    cv.style.width = cssW + "px"; cv.style.height = cssH + "px";
    var W = Math.round(cssW * dpr), H = Math.round(cssH * dpr);
    cv.width = W; cv.height = H;
    var ctx = cv.getContext("2d"), img = ctx.createImageData(W, H), D = img.data;
    var P = 3.5 * dpr, maxR = P * 0.86;
    function cl(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    var ch = [
      { c: HEAT.blue,  cs: Math.cos(0.26), sn: Math.sin(0.26), amt: function (t) { return cl(1 - 2 * t); } },
      { c: HEAT.green, cs: Math.cos(0.79), sn: Math.sin(0.79), amt: function (t) { return cl(1 - Math.abs(t - 0.5) * 2); } },
      { c: HEAT.red,   cs: Math.cos(1.31), sn: Math.sin(1.31), amt: function (t) { return cl(2 * t - 1); } }
    ];
    for (var y = 0; y < H; y++) {
      var fy = y / H * gh;
      for (var x = 0; x < W; x++) {
        var t = sampleGrid(g, gw, gh, x / W * gw, fy), di = (y * W + x) * 4;
        if (t < 0) { D[di + 3] = 0; continue; }
        var r = HEAT.bg[0], gr = HEAT.bg[1], b = HEAT.bg[2];
        for (var c = 0; c < 3; c++) {
          var a = ch[c].amt(t); if (a <= 0.002) continue;
          var u = x * ch[c].cs + y * ch[c].sn, w = -x * ch[c].sn + y * ch[c].cs;
          var du = u - Math.round(u / P) * P, dv = w - Math.round(w / P) * P;
          var cov = maxR * Math.sqrt(a) - Math.sqrt(du * du + dv * dv) + 0.5;
          if (cov <= 0) continue; if (cov > 1) cov = 1;
          var col = ch[c].c; r = r * (1 - cov) + col[0] * cov; gr = gr * (1 - cov) + col[1] * cov; b = b * (1 - cov) + col[2] * cov;
        }
        // cream speckle (#d6d8c8), denser in the mid zones — reference grain
        var Pc = 2.6 * dpr, cu = x * 0.8776 + y * 0.4794, cw = -x * 0.4794 + y * 0.8776;
        var ci = Math.round(cu / Pc), cj = Math.round(cw / Pc);
        if (hash(ci, cj) < 0.26 + 0.30 * ch[1].amt(t)) {
          var ddu = cu - ci * Pc, ddv = cw - cj * Pc, crad = Pc * 0.40 * (0.45 + hash(ci + 7, cj - 3));
          var ccov = crad - Math.sqrt(ddu * ddu + ddv * ddv) + 0.5;
          if (ccov > 0) { if (ccov > 1) ccov = 1; r = r * (1 - ccov) + 214 * ccov; gr = gr * (1 - ccov) + 216 * ccov; b = b * (1 - ccov) + 200 * ccov; }
        }
        D[di] = r; D[di + 1] = gr; D[di + 2] = b; D[di + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // neon outline + topographic contour lines, traced from the surveyed data
  function greenOutline(h) {
    var o = (typeof GREEN_OUTLINES !== "undefined") && GREEN_OUTLINES[h.n];
    if (!o) return '<div class="no-outline">outline unavailable</div>';
    var cont = (o.c || []).map(function (d) { return '<path d="' + d + '" class="cont"/>'; }).join("");
    return '<svg class="greensvg" viewBox="-3 -3 106 ' + (o.h + 6) + '" preserveAspectRatio="xMidYMid meet" aria-label="Outline and slope contours of the hole ' + h.n + ' green">' +
      '<g class="contours">' + cont + '</g>' +
      '<path d="' + o.d + '" class="gline"/>' +
    '</svg>';
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
      '<div class="card"><h3>How To Use This</h3><p>Tap <b style="color:var(--text)">Holes</b> to open the guide for any green. Each one shows the <b style="color:var(--text)">surveyed green map</b> — real slope shading and downhill fall-line arrows — plus the slope, dominant break and a tactical tip. Start with <b style="color:var(--text)">Reads</b> for the five habits that unlock the whole course.</p></div>' +
      '<p class="disc"><b>About the data:</b> Par, yardage, handicap index and course ratings are from the published scorecard. The <b>green maps are real surveyed slope data</b> captured from on-course GPS green mapping — accurate shapes, slope shading and break/fall-line arrows. The written Slope / Break / Play-It notes interpret that data with local knowledge. Trust your eyes on the day.</p>' +
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
      '<div class="green-wrap' + (greenMode === "heat" ? " show-heat" : "") + '" id="greenWrap">' +
        '<div class="map-head">' +
          '<div class="seg2" id="greenToggle">' +
            '<button data-mode="outline" class="' + (greenMode === "outline" ? "on" : "") + '">Outline</button>' +
            '<button data-mode="heat" class="' + (greenMode === "heat" ? "on" : "") + '">Heat</button>' +
          '</div>' +
          '<div class="sev">' + sev + '<span>Break</span></div>' +
        '</div>' +
        '<div class="green-stage">' + greenOutline(h) + greenMap(h) + '</div>' +
        '<div class="legend">' +
          '<span class="l-out"><span class="hi">● outline</span><span>· slope contours ·</span><span>steeper = tighter lines</span></span>' +
          '<span class="l-heat"><span class="hi">● red = steep</span><span>green = mid</span><span>blue = flat ●</span></span>' +
        '</div>' +
      '</div>' +
      '<p style="color:var(--muted);font-size:14.5px;line-height:1.6;margin:0 2px 14px">' + h.summary + '</p>' +
      '<div class="guide">' +
        '<div class="gblock slp"><div class="lab">' + IC.slope + 'Slope</div><p>' + h.slope + '</p></div>' +
        '<div class="gblock brk"><div class="lab">' + IC.brk + 'Break</div><p>' + h.break + '</p></div>' +
        '<div class="gblock tip"><div class="lab">' + IC.tip + 'Play It</div><p>' + h.tips + '</p></div>' +
      '</div>' +
      '<p class="disc"><b>Real surveyed green data.</b> The outline and topographic contour lines are traced from on-course GPS green mapping; toggle <b>Heat</b> for the halftone slope map — red is steepest, green mid, blue flattest. The Slope / Break / Play-It notes interpret that data with local knowledge. Confirm with your own read on the day.</p>' +
      navPrevNext(h.n);

    sheet.classList.add("open");
    sheet.scrollTop = 0;
    document.body.style.overflow = "hidden";
    document.getElementById("closeSheet").onclick = closeHole;
    drawHeat(h);
    var gt = document.getElementById("greenToggle");
    if (gt) gt.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      greenMode = b.dataset.mode;
      document.getElementById("greenWrap").classList.toggle("show-heat", greenMode === "heat");
      gt.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); });
    });
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
