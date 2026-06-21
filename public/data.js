/*
 * Angeles National Golf Club — Green Guide data
 * ------------------------------------------------------------------
 * VERIFIED data (par, yardage, handicap/stroke index, course ratings)
 * is sourced from published scorecards (see README for citations).
 *
 * GREEN READS (slope / break / tips) are NOT surveyed pin-sheet data —
 * the club does not publish per-green contour surveys. They are
 * principled reads built from three things that ARE known and verified:
 *   1. The site's terrain: the property falls from the San Gabriel
 *      Mountains (NE, the HIGH side) toward Big Tujunga Wash and the
 *      valley floor (SW, the LOW side). Putts drift toward the valley.
 *   2. Jack Nicklaus design tendencies: bunker-framed, gently tiered
 *      greens with run-offs and defended front edges.
 *   3. Surface conditions: firm bentgrass greens that run fast
 *      (reported ~12 on the stimp). Speed amplifies every slope.
 * Treat the reads as a smart starting framework, not gospel. Always
 * trust your own eyes and a plumb-read on the day.
 */

const COURSE = {
  name: "Angeles National",
  location: "Sunland, California",
  designer: "Jack Nicklaus (Nicklaus Design)",
  par: 72,
  yards: 7141,
  rating: 74.7,
  slope: 143,
  tees: "Black",
  greens: "Bentgrass · firm & fast (~12 stimp)",
  setting:
    "Carved into the foothills of the San Gabriel Mountains on the old Big Tujunga Wash. The whole property tilts down and away from the mountains toward the valley.",
};

// breakDir: compass-style angle in degrees for the dominant putt break
// arrow. 180 = straight toward the valley/front (down the screen),
// values rotate clockwise. severity: 1 subtle · 2 moderate · 3 strong.
const HOLES = [
  {
    n: 1, par: 4, yds: 402, hcp: 15, side: "front",
    title: "Opening Drift",
    summary: "A friendly opener to find your rhythm before the course bares its teeth.",
    slope: "Mild back-to-front green with a gentle overall tilt toward the valley (front-left). Nothing severe — a true, fair first surface.",
    break: "Most putts ease left and toward you. Anything from above the hole tracks back to the front.",
    tips: "Take one extra club on the approach and stay below the hole. A flat-stick from the front third is a stress-free way to open with par.",
    breakDir: 200, severity: 1,
  },
  {
    n: 2, par: 5, yds: 585, hcp: 5, side: "front",
    title: "The Long Haul",
    summary: "A genuine three-shot par 5 — the green is a target, not a bailout.",
    slope: "Large, mildly crowned green that sheds balls off the back and sides. High shoulder on the mountain (back) side, falling toward the valley front.",
    break: "Lag putts from long range will pick up valley-ward speed in the last few feet. Back-pin putts are quick and break toward the front.",
    tips: "Lay your third shot back to a full wedge number. Pin-high or below is everything here — long leaves a slippery downhiller you can't stop.",
    breakDir: 185, severity: 2,
  },
  {
    n: 3, par: 3, yds: 212, hcp: 7, side: "front",
    title: "Long Iron Test",
    summary: "A demanding long par 3 where the green does the defending.",
    slope: "Deep green running away from front to back with a subtle spine through the middle, all leaning toward the valley side.",
    break: "Reads change across the spine — left of center feeds left/valley, right of center holds straighter. Downhill from the back.",
    tips: "Favor the front-center and let firm turf release. Two-putting from below the spine is a win; above it, lag with the brakes on.",
    breakDir: 170, severity: 2,
  },
  {
    n: 4, par: 4, yds: 427, hcp: 17, side: "front",
    title: "Quiet Birdie",
    summary: "The lowest-stress par 4 on the card if you're in the fairway.",
    slope: "Compact, gently bowled green that gathers toward the middle, with the back-right shoulder (mountain side) the clear high point.",
    break: "Putts from the back-right release down-and-left toward the valley; everything tends to settle toward the center.",
    tips: "Be aggressive with the approach — this green is receptive. Putts from above the hole are the only ones that get away from you.",
    breakDir: 215, severity: 1,
  },
  {
    n: 5, par: 4, yds: 422, hcp: 9, side: "front",
    title: "Tilted Table",
    summary: "A mid-length par 4 with one of the more noticeably canted greens.",
    slope: "Clear right-to-left tilt that matches the property's fall toward the valley, plus a touch of back-to-front.",
    break: "Almost everything breaks left. Right-edge pins are sucker pins — the slope walks the ball away from the hole.",
    tips: "Aim for the fat center-right of the green and let the slope feed it. Below and right of the hole leaves the truest uphill putt.",
    breakDir: 230, severity: 3,
  },
  {
    n: 6, par: 4, yds: 459, hcp: 3, side: "front",
    title: "The Brute",
    summary: "A long, stout par 4 — the #3 handicap and a real card-wrecker.",
    slope: "Long green guarded short; firm front shoulder that repels weak approaches, falling away gently to the valley side.",
    break: "Front pins putt slightly uphill and straighter; back pins are downhill and drift valley-ward. Grain follows the slope, adding pace.",
    tips: "Par is a great score. Club up, take your medicine to the center, and two-putt. Never short-side yourself here.",
    breakDir: 195, severity: 2,
  },
  {
    n: 7, par: 3, yds: 176, hcp: 13, side: "front",
    title: "Pure Wedge",
    summary: "The shortest one-shotter on the front — a real birdie chance.",
    slope: "Small, gently domed green with run-offs on the low (valley) sides. Subtle back-to-front fall.",
    break: "Short putts are honest; longer ones bend toward the valley low side. Pace matters more than line on this quick surface.",
    tips: "Fly it pin-high to the heart of the green. Anything that leaks to the low side trickles off — aim for the middle and putt for two, hole for one.",
    breakDir: 180, severity: 1,
  },
  {
    n: 8, par: 5, yds: 530, hcp: 11, side: "front",
    title: "Reachable Risk",
    summary: "A par 5 the longer hitter can get home — but the green punishes greed.",
    slope: "Green angled across the line of play with a false front and a high mountain-side shoulder feeding toward the valley front-left.",
    break: "Going-in putts from the back are fast and break front-left. The false front rejects anything short into a tricky chip.",
    tips: "If you go for it, miss long-safe is a myth here — favor the center. Laying up to a stock wedge often yields the better birdie look.",
    breakDir: 205, severity: 2,
  },
  {
    n: 9, par: 4, yds: 486, hcp: 1, side: "front",
    title: "Number One",
    summary: "The hardest hole on the course — a long par 4 that plays every inch.",
    slope: "Big, multi-paddock green with a defined tier; upper (mountain) shelf drains hard toward the lower valley front.",
    break: "Wrong-tier putts are treacherous — over the tier they accelerate toward the valley. On-tier reads are far calmer.",
    tips: "Match your club to the pin's tier, not just the flag. Being on the correct level is worth more than being close on the wrong one.",
    breakDir: 190, severity: 3,
  },
  {
    n: 10, par: 4, yds: 459, hcp: 12, side: "back",
    title: "Fresh Start",
    summary: "A long two-shotter to reopen the round after the turn.",
    slope: "Green that sits slightly above the fairway with a firm front and a steady fall to the valley on the left.",
    break: "Approach putts feed left and toward the front. Right-side pins ask for a confident hold against the slope.",
    tips: "Commit to enough club to carry the front shoulder. Stay under the hole and left-to-right putts will be your friend.",
    breakDir: 210, severity: 2,
  },
  {
    n: 11, par: 4, yds: 310, hcp: 18, side: "back",
    title: "Little Tempter",
    summary: "The shortest par 4 and the #18 handicap — but a small, well-defended green.",
    slope: "Small, quick green perched with bunkers tight; subtle crown shedding to every low side, dominant fall toward the valley.",
    break: "On a green this size and speed, everything looks like it breaks valley-ward. Short putts still move — never careless.",
    tips: "Lay back to a full wedge rather than chasing the green; spin and a steep angle hold this surface far better than a chip from the rough.",
    breakDir: 180, severity: 2,
  },
  {
    n: 12, par: 3, yds: 130, hcp: 16, side: "back",
    title: "Pitch & Putt",
    summary: "A short, scenic par 3 — pure scoring hole if you respect the speed.",
    slope: "Petite green with a soft back-to-front bowl; the mountain backdrop sits high, valley falls away in front.",
    break: "Straighter than it looks up close, but downhill putts run on for days. Below-hole putts are dead-center honest.",
    tips: "Take dead aim but spin it back below the hole. The big mistake is long — a downhiller here is a genuine three-jack risk.",
    breakDir: 178, severity: 1,
  },
  {
    n: 13, par: 5, yds: 494, hcp: 14, side: "back",
    title: "Go Time",
    summary: "A shorter par 5 — the clearest eagle/birdie opportunity on the back.",
    slope: "Receptive green with a gentle saddle; high points front-right (mountain) and back, low gather toward the valley center-left.",
    break: "Putts converge toward the center-left low. Eagle putts from the fringe will swing more than you expect at the end.",
    tips: "Pick your spot and go. A center-left miss gives the easiest uphill chip; short-right brings the bunker fully into play.",
    breakDir: 200, severity: 2,
  },
  {
    n: 14, par: 3, yds: 218, hcp: 8, side: "back",
    title: "Long & Loaded",
    summary: "The longest par 3 — a brawny one-shotter the green keeps honest.",
    slope: "Deep, narrow green running away to the back with a firm valley-side edge that rejects pushed shots.",
    break: "Front-to-back downhill once you're past the middle; lateral break leans steadily toward the valley side.",
    tips: "Treat it like a par 4 — a long iron to the front-center and a two-putt is a quiet win. Bail away from the low valley edge.",
    breakDir: 168, severity: 2,
  },
  {
    n: 15, par: 4, yds: 472, hcp: 2, side: "back",
    title: "The Beast",
    summary: "The #2 handicap — a long, exacting par 4 that takes no prisoners.",
    slope: "Large green defended front and short; pronounced tilt down the valley line with a back shelf that drains hard forward.",
    break: "Long putts gather pace toward the valley front. The back shelf is the fastest read on the back nine — die it in.",
    tips: "Aim for the middle and accept par all day. Above-hole and short-sided are the two scores-killers; favor the low, uphill side.",
    breakDir: 188, severity: 3,
  },
  {
    n: 16, par: 5, yds: 537, hcp: 6, side: "back",
    title: "Momentum Builder",
    summary: "A reachable par 5 to make a move before the watery finish.",
    slope: "Broad green with a soft front-to-back rise then a fall-off; valley side low and quick, mountain side the high shoulder.",
    break: "Lag putts read toward the valley low side. The fall-off behind means long is dead — keep everything below the flag.",
    tips: "Going for it? Favor the front and let it release uphill. Laying up, leave a full wedge and attack from below the hole.",
    breakDir: 198, severity: 2,
  },
  {
    n: 17, par: 4, yds: 406, hcp: 10, side: "back",
    title: "Water's Edge",
    summary: "Water enters the picture — the first half of a nervy closing duo.",
    slope: "Green pushed toward the lake with the hazard on the low valley side; surface tilts subtly toward the water.",
    break: "Every putt leans toward the water/valley side — borrow more on water-side pins, less on the safe high side.",
    tips: "Aim your approach at the center, away from the water edge. A two-putt par from the dry, high side is worth its weight in gold.",
    breakDir: 215, severity: 2,
  },
  {
    n: 18, par: 4, yds: 416, hcp: 4, side: "back",
    title: "The Closer",
    summary: "A stout finishing par 4 where water is in play off the tee and on the approach — almost every shot is a forced carry.",
    slope: "Green framed by water on the low side; firm and tilted away from the hazard toward the valley front, falling off the back.",
    break: "Putts break toward the water-fronted low side and quicken downhill. Back-pin putts are the slickest on the course.",
    tips: "Take enough club to clear the water with margin and aim for the center-back of the green. Two-putt from below the hole and walk off proud.",
    breakDir: 205, severity: 3,
  },
];

const READING = {
  principle:
    "The single most reliable read at Angeles National: putts break away from the San Gabriel Mountains and toward the valley floor. The mountains sit to the northeast — that's the HIGH side. Big Tujunga Wash and the valley fall away to the southwest — that's the LOW side.",
  points: [
    {
      h: "Find the mountains",
      t: "Before you read a single break, locate the highest peaks. That direction is uphill. When a putt looks dead flat, give it a touch of valley-ward break and you'll be right more often than not.",
    },
    {
      h: "Speed is the slope",
      t: "These bentgrass greens run firm and fast (~12 stimp). Fast greens break more. A read that's right on a soft course will under-borrow here — play more break and softer pace.",
    },
    {
      h: "Stay below the hole",
      t: "Nicklaus greens tilt back-to-front and run off at the edges. An uphill putt is always easier to control than a downhiller racing toward the valley. Position your approaches below the flag.",
    },
    {
      h: "Respect the run-offs",
      t: "Miss in the wrong spot and firm shoulders feed your ball well off the green. Favor the fat center of every green; short-siding yourself near a run-off turns par into a scramble.",
    },
    {
      h: "Trust the last few feet",
      t: "On fast greens the ball takes the most break as it dies. Pick a high entry point and let gravity — toward the valley — do the final work.",
    },
  ],
};
