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

  /* ---------- green map (real surveyed GPS slope data) ---------- */
  function greenMap(h) {
    return '<img class="greenmap" src="/greens/hole' + h.n + '.jpg" loading="lazy" ' +
      'alt="Surveyed slope and fall-line map of the hole ' + h.n + ' green">';
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
      '<div class="green-wrap">' +
        '<div class="map-head"><span class="ttl">Surveyed Green Data</span><div class="sev">' + sev + '<span>Break</span></div></div>' +
        greenMap(h) +
        '<div class="legend"><span class="hi">● warm = steeper</span><span>arrows = downhill fall-line</span><span>cooler = flatter ●</span></div>' +
      '</div>' +
      '<p style="color:var(--muted);font-size:14.5px;line-height:1.6;margin:0 2px 14px">' + h.summary + '</p>' +
      '<div class="guide">' +
        '<div class="gblock slp"><div class="lab">' + IC.slope + 'Slope</div><p>' + h.slope + '</p></div>' +
        '<div class="gblock brk"><div class="lab">' + IC.brk + 'Break</div><p>' + h.break + '</p></div>' +
        '<div class="gblock tip"><div class="lab">' + IC.tip + 'Play It</div><p>' + h.tips + '</p></div>' +
      '</div>' +
      '<p class="disc"><b>Real surveyed green data.</b> Shape, slope shading and fall-line arrows are from on-course GPS green mapping — warmer colours are steeper, arrows point downhill. The Slope / Break / Play-It notes interpret that data with local knowledge. Confirm with your own read on the day.</p>' +
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
