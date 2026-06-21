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

  /* ---------- green diagram generator ---------- */
  function greenSVG(h) {
    // organic green shape, high (mountain) side at top, valley low at bottom.
    // break arrow rotates by h.breakDir (180 = straight down toward valley).
    var W = 320, H = 230, cx = 160, cy = 120;
    var rad = (h.breakDir - 90) * Math.PI / 180; // 180 -> points down
    var len = 30 + h.severity * 16;
    var ax = cx + Math.cos(rad) * len, ay = cy + Math.sin(rad) * len;
    // a curved approach to the arrow tip for a "putt path" feel
    var sx = cx - Math.cos(rad) * len, sy = cy - Math.sin(rad) * len;
    var perp = rad + Math.PI / 2;
    var bow = 16 + h.severity * 7;
    var mx = (sx + ax) / 2 + Math.cos(perp) * bow, my = (sy + ay) / 2 + Math.sin(perp) * bow;

    // pin sits high-ish toward the mountain side
    var pinX = cx + (h.n % 3 - 1) * 34;
    var pinY = cy - 30;

    return (
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Top-down green read diagram">' +
      '<defs>' +
        '<radialGradient id="gg" cx="50%" cy="34%" r="72%">' +
          '<stop offset="0%" stop-color="#3aa564"/>' +
          '<stop offset="62%" stop-color="#1f7d43"/>' +
          '<stop offset="100%" stop-color="#0f5a2e"/>' +
        '</radialGradient>' +
        '<linearGradient id="tilt" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.16"/>' +
          '<stop offset="48%" stop-color="#ffffff" stop-opacity="0"/>' +
          '<stop offset="100%" stop-color="#000000" stop-opacity="0.34"/>' +
        '</linearGradient>' +
        '<marker id="ah" markerWidth="9" markerHeight="9" refX="5.5" refY="4.5" orient="auto">' +
          '<path d="M0 0L9 4.5L0 9z" fill="#c6ff32"/>' +
        '</marker>' +
      '</defs>' +
      // green body
      '<path d="M70 96 C72 50 150 36 196 46 C250 58 268 92 262 128 C258 168 206 196 152 192 C96 188 66 152 70 96 Z" fill="url(#gg)" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/>' +
      '<path d="M70 96 C72 50 150 36 196 46 C250 58 268 92 262 128 C258 168 206 196 152 192 C96 188 66 152 70 96 Z" fill="url(#tilt)"/>' +
      // contour hint lines
      '<path d="M84 86 C120 70 200 70 250 96" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1"/>' +
      '<path d="M80 124 C124 112 210 116 256 134" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>' +
      '<path d="M88 158 C128 152 200 158 244 162" fill="none" stroke="rgba(0,0,0,0.16)" stroke-width="1"/>' +
      // bunkers
      '<ellipse cx="58" cy="150" rx="26" ry="15" fill="#e7d9a6" opacity="0.92"/>' +
      '<ellipse cx="58" cy="150" rx="26" ry="15" fill="none" stroke="rgba(0,0,0,0.18)" stroke-width="1"/>' +
      (h.par !== 3 ?
        '<ellipse cx="232" cy="178" rx="22" ry="12" fill="#e7d9a6" opacity="0.9"/>' +
        '<ellipse cx="232" cy="178" rx="22" ry="12" fill="none" stroke="rgba(0,0,0,0.18)" stroke-width="1"/>' : '') +
      // putt path + break arrow
      '<path d="M' + sx + ' ' + sy + ' Q' + mx + ' ' + my + ' ' + ax + ' ' + ay + '" fill="none" stroke="#c6ff32" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 7" marker-end="url(#ah)" opacity="0.95"/>' +
      '<circle cx="' + sx + '" cy="' + sy + '" r="4" fill="#fff"/>' +
      // pin
      '<circle cx="' + pinX + '" cy="' + pinY + '" r="6.5" fill="rgba(0,0,0,0.55)"/>' +
      '<circle cx="' + pinX + '" cy="' + pinY + '" r="3.4" fill="#fff"/>' +
      '<line x1="' + pinX + '" y1="' + pinY + '" x2="' + pinX + '" y2="' + (pinY - 34) + '" stroke="#fff" stroke-width="2"/>' +
      '<path d="M' + pinX + ' ' + (pinY - 34) + ' l16 5 l-16 6 z" fill="#30d158"/>' +
      '</svg>'
    );
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
      '<div class="card"><h3>How To Use This</h3><p>Tap <b style="color:var(--text)">Holes</b> to open the guide for any green. Each card gives you the slope, the dominant break, and a tactical tip — plus a top-down read diagram. Start with <b style="color:var(--text)">Reads</b> for the five habits that unlock the whole course.</p></div>' +
      '<p class="disc"><b>About the data:</b> Par, yardage, handicap index and course ratings are taken from the published scorecard and are accurate. The slope / break / tips are principled reads derived from the course\'s terrain, Nicklaus design tendencies and firm-fast green conditions — not surveyed pin-sheets. Use them as a smart framework and trust your eyes on the day.</p>' +
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
        greenSVG(h) +
        '<div class="legend"><span class="hi">▲ Mountain side · high</span><span>Valley · low ▼</span></div>' +
      '</div>' +
      '<p style="color:var(--muted);font-size:14.5px;line-height:1.6;margin:0 2px 14px">' + h.summary + '</p>' +
      '<div class="guide">' +
        '<div class="gblock slp"><div class="lab">' + IC.slope + 'Slope</div><p>' + h.slope + '</p></div>' +
        '<div class="gblock brk"><div class="lab">' + IC.brk + 'Break</div><p>' + h.break + '</p></div>' +
        '<div class="gblock tip"><div class="lab">' + IC.tip + 'Play It</div><p>' + h.tips + '</p></div>' +
      '</div>' +
      '<p class="disc"><b>Read, not survey.</b> Slope &amp; break are inferred from the property\'s mountain-to-valley tilt, Nicklaus green design and fast bentgrass — confirm with your own read on the day.</p>' +
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

  // tab bar
  var tabbar = el(
    '<nav class="tabbar"><div class="inner">' +
      '<button data-tab="course" class="on">' + IC.course + 'Course</button>' +
      '<button data-tab="holes">' + IC.holes + 'Holes</button>' +
      '<button data-tab="reads">' + IC.reads + 'Reads</button>' +
    '</div></nav>'
  );
  document.body.appendChild(tabbar);

  renderGrid();

  // events
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
