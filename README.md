# Angeles National · Green Guide ⛳️

An iOS-style web app — Apple precision, Nike attitude — that gives you a
green-by-green guide to **Angeles National Golf Club** in Sunland, California
(the only Jack Nicklaus design in Los Angeles County). For every one of the 18
greens you get the **slope**, the dominant **break**, a tactical **tip**, and a
top-down read diagram.

## Features

- **Course** — overview with verified stats (par 72 · 7,141 yds · rating 74.7 ·
  slope 143 from the Black tees), the setting, and the one golden rule of the
  property.
- **Holes** — Front / Back segmented control and a card grid for all 18 holes.
  Tap any hole for a full green guide: par / yardage / handicap, a generated
  read diagram (mountain-high → valley-low) with a break arrow and severity
  meter, and Slope / Break / Play-It blocks.
- **Reads** — "Green Reading 101": the five habits that unlock the whole course.

Pure static front-end. No build step, no framework, no data leaves the device.

## Data accuracy

This matters, so it's worth being precise about what's what:

- **Verified & accurate** — par, yardage, handicap (stroke) index, course rating
  and slope come from the published Black-tee scorecard. Front nine totals 3,699
  (par 36) and the back nine 3,442 (par 36) → 7,141 yards, par 72.
- **Principled reads, not surveys** — the club does not publish per-green contour
  surveys, so the slope / break / tips are *informed reads*, not measured
  pin-sheets. They are built from three things that **are** known:
  1. **Terrain** — the property falls from the San Gabriel Mountains (NE, high
     side) toward Big Tujunga Wash and the valley floor (SW, low side). Putts
     drift toward the valley. This is the app's anchoring "golden rule."
  2. **Design** — Jack Nicklaus greens: bunker-framed, gently tiered, with firm
     fronts and run-off edges.
  3. **Conditions** — firm bentgrass greens that run fast (~12 stimp), which
     amplifies every slope.

  The app states this clearly in-product. Treat the reads as a smart framework
  and trust your own eyes on the day.

### Sources

- [Angeles National — official scorecard](https://www.angelesnational.com/aboutus/scorecard/)
- [Course profile · BlueGolf](https://course.bluegolf.com/bluegolf/course/course/angelesnationalgc/)
- [Scorecard · Greenskeeper.org](https://www.greenskeeper.org/southern_california/los_angeles/Angeles_National_Golf_Club/scorecard.cfm)
- [Course overview · GolfPass](https://www.golfpass.com/travel-advisor/courses/15122-angeles-national-golf-club)
- [Nicklaus Design — Angeles National](https://nicklausdesign.com/course/angeles/)

## Run it

```bash
npm install
npm run dev      # serves public/ on localhost
```

Then open the printed local URL on a phone (or a narrow browser window) for the
full iOS feel.

## Project structure

```
public/
  index.html    app shell (top bar, sheet, tab bar mount points)
  styles.css    the whole design system
  data.js       course + 18-hole green data and reading principles
  app.js        rendering, green-diagram generator, navigation
vercel.json     static deploy config (no build step)
```

## Deploy

Fully static — the contents of `public/` deploy to any static host. `vercel.json`
is preconfigured (no build step; `public/` is the output directory).
