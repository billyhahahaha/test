# MASTER BRIEF — SITE

> Snapshot of Drive doc `BRIEFmastersite.md` (doc id 1-KRyzOxeWXUOo29o_an748gu6vyliz7rODJ-ZMzxvB4), taken 15 Aug 2026.
> The Drive doc is the living original; this copy exists so every session on this branch reads the same brief.

Working document. **OPEN** marks a slot only Luke fills. Everything else is derived from the style frames or the copy, and stated as a number, not a mood.

## 0 — HOW FABLE READS THIS

Fable 5 will work from this across many sessions with long autonomous runs. Six rules make that survivable. They are the operating contract, not style notes.

- Effort high by default, xhigh for anything with taste in it.
- **Declare before coding.** Every pass states its choices in plain language and stops.
- **Three variants, then a pick.** Never one direction iterated into mush.
- **One element per pass.** Never two.
- **Nothing ships unverified.** Screenshot it, measure it, prove the claim.
- **If it isn't in a style frame, in the copy, or derived from one, it's a question.**

## 1 — SPINE

**Job:** land the next role. **Audience:** hiring at Apple, Meta, Google, Niantic — principal IC or director with headcount. **Read time:** under a minute before they decide to keep going.

Proposed sentence — yours to cut:

A hiring manager should conclude, in under a minute, that he has already done the job they're posting — and that the medium is native to him, not a specialty he picked up.

**Corollary that governs everything:** a site about immersive work that is itself flat argues against itself. It has to demonstrate, not describe.

*OPEN — approve or rewrite.*

## 2 — DOCTRINE

Law, not preference. Short on purpose — Fable follows six lines of law better than forty lines of prohibition.

- Brutalist, Swiss, minimal vector line work.
- Two inks: off-white #F2EFE7, off-black #121211. Nothing else.
- No type inside interface elements. Marks are drawn paths.
- Every element alpha. Nothing paints its own background.
- One motion moment per element — orchestrated, not scattered.
- Negative space is structural, not leftover.
- No AI slop: no Inter, no purple gradient, no cookie-cutter layout, no stock easing.

## 3 — EVIDENCE

The style frames are the source of truth, not a mood reference. Every value gets *derived* and written as a number — the way the dial's ellipse came off the placement frame at 0.45R wide × 0.30R tall rather than "an oval, roughly."

On hand: the Z—B spindle mark · the tick-stack · the grey placement frame · the emissive pixel lattice.

*OPEN — the rest of the frames. Block 4 can't be finished without them.*

## 4 — SYSTEM

Written once, inherited by every pass, never re-argued.

| | |
| :-- | :-- |
| **Ink** | Two values, one CSS variable. |
| **Field** | Mid-grey #8B8B87 + grain. Emissive orange lattice as the alternate register. |
| **Type** | Bold grotesk, justified, ~52ch measure, tight leading, negative tracking. **OPEN — the actual face.** |
| **Grid** | Single left column against a wide void. Controls on the right edge. |
| **Motion law** | ω ≈ 15 rad/s, ζ ≈ 0.55 — one overshoot. *Every* settle in the site uses these constants, so the whole thing feels like one object rather than a collection. |
| **Vocabulary** | The spindle (built) · the lattice (built) · the bracket rule · the drawn arrow. |

## 5 — THE COPY — 1,898 words, four chapters

Already written. Fable structures it; Fable never authors it.

```
LUKE ACRET / Emerging Media / Immersive Creative Director · LA · 2026

I    Introduction ......... the thesis. pre-grammar phase. two kinds of earning.
II   The First Kind ....... Metallica. 26 min, M72 final show, 65,000, Mexico City.
III  Story Factory ........ Madefire. creator-first, worlds-first, publishing to thin air.
IV   Fast Forward ......... the lab. five R&D lines, 01–05.
```

**Structural components the copy demands — these are the design inventory:**

- **Chapter marks.** Four. Numeral + title. The spine's only hard divisions.
- **Run-in heads.** Ch III and IV carry bolded lead-ins — *Creator first. The Studio. Worlds first. Proven on the page. Then sent everywhere. And fed back into the tools.* A real component, not bold text.
- **The R&D card.** Ch IV runs a fixed shape five times: R&D 0n — title → Question: → answer → Status: / Early answer:. One component, five instances.
- **Pull quotes.** Two, and they behave differently. Lars Ulrich — *"Game-changing is putting it lightly."* — is a hammer, seven words, wants to be enormous. Dave Gibbons is a paragraph of explanation and wants to sit in the column, not shout.
- **The bookend.** Ch I closes *"That's the work I lead."* Ch IV closes *"That's the work ahead."* Same shape, past and future. Whatever treatment the first gets, the second must rhyme with it. This is the site's last line — it carries the ask.

## 6 — MEDIA — the payload

The immersive work is the *argument*, not decoration. Mapped to where the copy actually puts it:

| **Chapter** | **The piece** | **Likely form** |
| :-- | :-- | :-- |
| II | 14 cameras on a circular stage | Vector diagram — line work, not a photo |
| II | Full 3D stadium recreation, virtual scout | Splat or real-time scene |
| II | The Steadicam / wire-cam firsts | Immersive stills or short loops |
| II | World's largest spatial recording studio | Audio-led, spatial mix |
| III | Motion books — 2.5D layered parallax | **Parallax layers in the page itself.** The medium he invented is the obvious treatment for his own chapter about it. |
| III | Mono: Blackwater, SXSW VR Selection | Video or entered scene |
| III | Magic Leap — panels with depth in a room | Depth/parallax treatment |
| IV | R&D 01 — a flat frame becomes a place | Splat |
| IV | R&D 02 — lens-to-headset capture, *"light enough to ship"* | **Splats. This line says they're already delivery-weight.** |
| IV | R&D 03 — synthesized worlds | Panorama |
| IV | R&D 04 — virtual production replica | Real-time or video |
| IV | R&D 05 — live. The destination. | *Open — no artefact yet, and that may be the point.* |

**Constraints, all of them design decisions:**

- Weight is a design decision. A splat runs 5–150 MB depending on compression. A hiring manager on a phone on LTE is the real case, not the edge case.
- Heavy pieces are **entered deliberately** — never autoloaded behind a scroll.
- Every piece needs a static poster that reads fully before anything streams.
- Never autoplay with sound. Never block first paint on a viewer.
- No-WebGL, low-power and reduced-motion each get a real answer, not a blank box.

*OPEN — the manifest. How many splats, what format (PLY / SPZ / SOGS), what weight after compression. How many panoramas, what resolution. What video, what length, hosted where.*

## 7 — ARCHITECTURE — resolved

You said not sure. The copy answers it, and it moved my recommendation.

**The copy is one linear argument in four chapters.** It opens a thesis, proves it twice — the two kinds of earning — and turns forward. Cutting it into separate case-study pages breaks the argument into a portfolio index, which is the one thing it deliberately isn't.

**Recommendation: a single chaptered spine, with entered moments.**

- One continuous scroll. Four chapters. The argument stays whole.
- Heavy media doesn't get its own page — it gets a **takeover**: full viewport, loaded on demand, entered on purpose, exited back to the exact same place in the spine. You keep the linear read *and* the media gets its full budget.
- **The dial's detents are the chapter marks.** It already lands on a notch and never between — that mechanic was built before the copy arrived and it fits it exactly. Four chapters, four hard stops, free scroll in between.

**What would flip it:** if the R&D lines need to be linkable and sendable on their own — a URL you can put in an application. Then 01–05 become real routes and the spine links out. Worth deciding early; it's cheap now and expensive later.

*OPEN — confirm, and answer the linkable-R&D question.*

## 8 — INVENTORY

One element per pass, ordered by what unblocks what.

**Done**

- Spindle scroll dial — three variants, vector + pixel surfaces, alpha GIFs.

**Foundation — blocks everything**

1. Type system — the face, the scale, the 52ch measure, the justified setting.
2. Page shell — the void, the column, the right-edge rail, the grain.
3. Motion primitives — the shared settle, the shared reveal, both on the block-4 constants.

**Spine**

4. Opening move — the first eight seconds. Title card, the mark, the thesis.
5. Chapter mark — one component, four instances. Wire the dial's detents to it.
6. Body setting — justified column, run-in heads, the two quote treatments.
7. The R&D card — one component, five instances.
8. The bookend — *work I lead* / *work ahead*, and the ask.

**Media**

9. Takeover shell — how a heavy piece is offered, entered, exited. Built once, reused.
10. Panorama viewer.
11. Splat viewer — loading, budget, fallback, controls.
12. Parallax treatment for Ch III — the motion-book homage.
13. Vector diagram — the 14-camera stage.

**Close**

14. Contact / the ask.
15. Performance pass — measured on a real phone against the budget in block 9.

## 9 — BOUNDARIES

The block people skip, and the one that matters most on long autonomous runs.

- **Never** add a typeface, colour, or easing curve not in block 4.
- **Never** restructure a section that isn't the current pass.
- **Never** ship a media piece without a poster, a fallback, and a measured weight.
- **Never** author or rewrite copy. It's written. Structure it.
- **Never** silently drop scope — say what was cut and why.
- **Ask, don't guess** on anything factual: dates, credits, roles, client names, what shipped and what didn't. A wrong credit on a site aimed at hiring is fatal.
- **Performance budget:** *OPEN — a hard number for first paint and total transfer on the spine. It belongs in this document as a number, not a vibe.*

**Clearance — flagging, not advising.** The copy names Marvel, Paramount, Fox, Bad Robot, Technicolor, Magic Leap, Metallica, and quotes Lars Ulrich and Dave Gibbons. Naming credits on a portfolio is ordinary. Publishing *converted Kill Bill frames* (R&D 01) is a different question, and so is publishing unreleased Apple production detail — the Steadicam prototype, the Spydercam rig, the virtual scout. Worth a decision before it's public, and it's yours to make, not mine. I've marked it so it isn't discovered late.

## 10 — LEDGER

Appended every pass: what was chosen, what was rejected, the one-line reason. Pass 14 needs to know why pass 3 chose what it did without re-litigating it.

```
[pass] decision — rejected alternative — reason

04  ellipses not stadiums   — rounded rects    — curved edge is the depth cue, per frame 4
04  rings over rules        — hairlines        — must read as graspable object, not decoration
07  chaptered spine         — case-study pages — copy is one linear argument; pages break it
```

## WHAT UNBLOCKS THIS

1. **The media manifest** (block 6). Decides the stack and the performance budget. Nothing large should start before it.
2. **The rest of the style frames** (block 3). Finishes block 4.
3. **The typeface** (block 4). Every layout pass is guessing until this is named.

Decisions on the table: **the spine sentence** · **linkable R&D routes, yes or no** · **the clearance call**.
