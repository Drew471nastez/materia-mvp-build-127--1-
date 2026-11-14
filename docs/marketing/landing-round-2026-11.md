# Home page: the landing round (November 2026)

What the owner asked for on storelib.com's home page, section by section, where each
part lives, and how this round met the two other rounds pushed to main while it was
being built. The page is `app/(storelib)/(marketing)/page.tsx`; every section below
the hero is in `components/marketing/home/`.

## What changed, top to bottom

| Section | File | What changed |
| --- | --- | --- |
| Showcase under the hero | `build-showcase.tsx`, `use-showcase-motion.ts`, `lib/ui/rail-motion.ts` | Drag and swipe follow the hand and glide on release. |
| Make the work. Skip the busywork. | `everything-in-one-place.tsx` | The product card leans under the mouse. New merch, guide, course and community slides (no purple Inner Circle, no Golden Hour presets). Creator stores drawn as real Storelib creator pages, drifting without a stop. The support card is the Support page as it reads, three requests taking turns. Corners one pixel smaller. |
| See your ideas come to life | `ideas-come-to-life.tsx`, `showcase-mocks/builder-mocks.tsx` | A flipping heading and a carousel that plays by itself and can be dragged. Desktop previews on a phone too. The website builder, community editor and OnePage editor redrawn from the real ones, with new sample brands. Previews a little shorter. |
| Unlimited possibilities | `product-marquee.tsx` | Two rows. |
| One store for everything you sell | `business-carousel.tsx`, `showcase-mocks/business-mocks.tsx` | Replaces "Every business, one home": five kinds of product in a list, the matching product page beside it. |
| Storelib is for creators | `creators-carousel.tsx` | No hover bump, no "New sale" pop, new photographs, a purple button. |
| How it works | `how-it-works.tsx`, `ebook-cover.tsx` | Physical and digital products in one tile, one shop's story across all five. No small print under the section. |
| Checkout | `checkout-scene.tsx` | The scroll scene is shorter and steadier (a track of 100svh + 150vh). |
| Your audience belongs to you | `audience-ownership.tsx` | Fewer tabs, a smaller "Write once" picture, real avatars, the header's Storelib logo. "Download every contact" kept as it was. |
| Know what's working | `analytics-showcase.tsx`, `analytics-globe.tsx`, `engine-marks.tsx` | Smaller: a globe card with a profile and top places, an SEO, GEO and AEO card, and a switcher that plays through Google, ChatGPT, Claude, Perplexity and Gemini. |
| Your store never closes | `sell-everywhere-map.tsx` | Less tall, plainer words, no overlapping dots, the Buy button is not translated, an "Example" tag in place of the footnote. |
| Connect your favorite apps | `integrations-section.tsx`, `integration-marks.tsx` | Two rows, icons 20% smaller, accurate Apple Pay, Google Pay, TikTok and Stripe marks, no doubles, a soft fade at both ends. |
| Your AI tools work here too | `ai-tools-section.tsx` | New: Claude Code, Codex and Cursor connected to a site, with a terminal that types. |
| See what your work could earn | `earnings-calculator.tsx` | A flash photograph beside the calculator. |
| Run your business from anywhere | `app-anywhere.tsx` | A shorter line under the heading. |
| Pricing | `components/marketing/pricing-section.tsx`, `pricing-lines.ts`, `components/billing/plan-cards.tsx` | Plain feature lines and a simple tick. |

The word "fans" is gone from the page's words.

## Three rounds at once: read this before resolving a conflict here

Three sessions changed the home page's sections on the same day, each from the owner's
notes: this round, wave 14 (bands, a new globe, lazy sections that arrive drawn, a
checkout rework, new showcase cards) and landing round 2 (the examples as captures of
the real OnePage, creator page, website and community). They met in the same files.
How they were put together, so the next merge does not undo the owner's list:

- **From wave 14, kept:** the bands (`components/marketing/landing-story.tsx`
  `StoryBand` and `BAND_CSS`) around the business section, analytics with the map, and
  the app section (round 3 turned these into sheets, see below); the globe in "Make the work" (`everything-globe*.ts`), with its pill
  styles in `everything-in-one-place.tsx`; all of `lazy-section.tsx` (mounting further
  ahead, drawing ahead, layout in slices); the picture warm-up in
  `use-showcase-motion.ts`.
- **From landing round 2, kept:** the twelve pictures under the hero
  (`build-showcase.tsx`, captured from the real renderers) and every capture it added
  under `public/home/onepage` and `public/home/showcase`.
- **This round's version kept** wherever two rounds rebuilt the same section, because
  these carry things the owner asked for by name that the other versions did not have:
  - `everything-in-one-place.tsx`: no purple Inner Circle card, no Golden Hour presets,
    the tee on a light grey card, stores drifting without a stop, the support card with
    three requests, the card that leans under the mouse.
  - `ideas-come-to-life.tsx`, `showcase-mocks/builder-mocks.tsx`: the flipping heading,
    the carousel that plays and drags, desktop previews on a phone, no florals in the
    website builder.
  - `business-carousel.tsx`, `showcase-mocks/business-mocks.tsx`: "Every business, one
    home" replaced (the owner: "look at something else").
  - `how-it-works.tsx`, `checkout-scene.tsx`: physical and digital in one tile, one
    e-book's story, no small print, no Golden Hour presets; the checkout scene has no
    scroll scrubbing and draws its headline and phone from the first pixel.
  - `creators-carousel.tsx`: no hover bump, no "New sale" notices
    (`motion/sale-pop.tsx` is gone), new photographs.
  - `analytics-showcase.tsx`: the smaller structure with the SEO, GEO and AEO card.
- **Removed as unused here:** `onepage-sample.tsx` and
  `showcase-mocks/checkout-desktop.tsx`. They are in the history. Round 2's captures of
  live OnePages and communities fit these sections' frames (the OnePage editor's phone,
  the checkout tile, the stores strip) and can be placed there without bringing the old
  section structures back.
- **Made to fit:** text that sits straight on a band takes the band's colours
  (`var(--band-ink)`, `var(--band-muted)`), so the business list and the analytics column
  read light on dark.

If you change one of these sections from another branch: build on the version here, and
check the table above still holds (no Golden Hour presets, no Inner Circle card, no sale
notices, two rows of possibilities and of apps, plain pricing lines, the AI tools
section, the SEO card).

## Round 3: the frame (dark base, sheets)

The owner asked for the light sections to rise over a dark page as rounded sheets, the
way the large commerce sites do it, with a purple one for variety. This replaced wave
14's bands (`StoryBand` is gone; `BAND_CSS` only recolours sections on purple now).

- `components/marketing/scroll-reveal-panel.tsx`: `ScrollRevealPanel` (tone `white` or
  `purple`, `radius`, `padding`, `hold`, `className`) and `ScrollRevealBackdrop` for a
  dark stretch. No script and no animation: a sheet is an ordinary block, so it moves
  with the page's own scroll. `hold` keeps a block still for its last screen while the
  next one slides over it, with `position: sticky` alone (the block sits in a box one
  screen taller, and the next block starts one screen higher, so the page is no
  longer). Not held for reduced motion, on a window taller than 1400px, or (the hero
  and showcase) on a phone, where the showcase is dragged.
- The grounds, in `app/(storelib)/(marketing)/page.tsx`: dark hero and showcase; white
  (Make the work to How it works, with One store on white); the dark checkout; white
  (audience, apps, AI tools); purple (analytics, the map); white (earnings, pricing,
  questions; not held, so `#faq` lands on the questions); purple (the app and the
  closing call); the black footer.
- On dark or purple, cards are dark surfaces; on white, the soft greys of Make the
  work. A section that sits on purple reads `var(--band-ink)`, `var(--band-muted)` and
  `var(--band-line)`, and can be recoloured from `BAND_CSS` under `[data-band]`.
- The footer has no newsletter box: the logo with the app badges, four link columns, a
  hairline, then the language and the legal links.
- On a phone the home page's bar has a white Start now pill beside the menu, or the
  signed in person's photo (`data-home-phone-actions` in `platform-header-client.tsx`).
- Pinned by `tests/home-landing-frame3.test.ts`.

## Round 4 (the owner's long list of 14 November)

What changed, so a later round builds on it instead of undoing it:

- Sheets rise like a phone's sheet: a small side inset that settles to full width while the block behind shrinks a little and dims (scroll-driven CSS, `components/marketing/scroll-reveal-panel.tsx`). "Make the work" does not arrive as a sheet. The close (Run your business from anywhere, the final call) is dark, not purple, with a dot grid (`components/marketing/home/dot-field.tsx`). FAQ: plain rows, a plus that turns into a minus.
- The globe in "Make the work": the order pill glides on the compositor instead of being moved every frame, so dragging no longer floods the page with style work.
- Showcase under the hero: new captures of real OnePages (Gia Romano, Nails by Bea, Kai Moreno, Northline Coffee); a short flick moves a card.
- Make the work: heading "Sell anything, anywhere. Support included.", bright crossfading gradients behind the product card, a knitting course and a book club community, wider draggable store cards (stores, OnePages, a community), the wave 13 support card without a selector and without a payout request.
- Ideas: thin pill tabs again, a heading that changes by itself, desktop editors on phones, a merch store (Field Day), a LUT seller's OnePage (Ember theme), one community (Crema Club).
- One store for everything you sell: pins while the scroll steps through five kinds, then releases.
- How it works and the checkout: one shop (Nadia Brooks), colourful changing grounds; the checkout phone rises with products orbiting in 3D, the four tab cards rise over it, the desktop checkout is back in Built to convert.
- Lower: lighter audience, LUT pack search in the SEO card, clickable engine switcher, the map changes product and button language per country, softer apps fade with no hover lift, earnings without the plan switch or the black card, the AI terminal starts part written next to a page preview.
- Banned sample content (the owner): Weeknight Pasta, the blue heavyweight tee, sourdough, Golden Hour presets, wheel throwing, Drawing Basics, Saturday Run Club, Dust & Tape Drums, Elena Ruiz's Spanish course, a payout or bank support request, anything about "fans".

Two lazy sections now grow with the screen's height (pinned tracks): checkout and business. `scripts/measure-home-lazy-heights.mjs` lists them in `TRACKS`, per range of widths, and stops with a message if one changes.

## The boxes that hold each section's place

A lazy section is an empty box until its code arrives. `LAZY_SECTION_HEIGHTS_CSS`
(`lazy-sections.tsx`) gives each box its section's height per screen width, so the page
does not change length as sections mount. It is written by a script, from a real browser
on a production build, at 18 widths (the usual phones and laptops and both sides of every
layout change):

```
pnpm build && pnpm start -p 3215
node scripts/measure-home-lazy-heights.mjs http://localhost:3215            # how far off each box is now
node scripts/measure-home-lazy-heights.mjs http://localhost:3215 --write    # write the measured rules
```

Run it whenever a section's height changes, build, and run it once more without
`--write`: every box should be within 2px of its section.

## Checked

- `node scripts/run-push-tests.mjs` (the round's own suites are `tests/home-landing-*.test.ts`).
- A production build, then the home page in Chromium at 1440 and 390 wide: no failed
  picture, no page error, no sideways scroll, every section looked at.
