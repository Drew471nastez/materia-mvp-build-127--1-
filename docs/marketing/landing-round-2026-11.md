# Home page: the landing round (November 2026)

What the owner asked for on storelib.com's home page, section by section, where each
part lives, and how this round met the wave 14 round that was pushed to main while it
was being built. The page is `app/(storelib)/(marketing)/page.tsx`; every section below
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

## Two rounds at once

Wave 14 (black and purple bands, a new globe, fewer "fans", a desktop checkout picture,
OnePages drawn by the theme picker) reached main while this round was in progress. Both
changed the same files. How they were put together:

- **Kept from wave 14:** the bands (`components/marketing/landing-story.tsx` `StoryBand`
  and `BAND_CSS`) around the business section, analytics with the map, and the app
  section; the globe in "Make the work" (`everything-globe*.ts`), with its pill styles in
  `everything-in-one-place.tsx`.
- **This round's version kept:** analytics (the owner asked here for a smaller structure,
  so the three-card row with captions went), the checkout scene and How it works (they
  tell one e-book's story and carry no Golden Hour presets), the creator stores, the
  OnePage editor preview and the business section.
- **Removed as unused:** `onepage-sample.tsx` (OnePages drawn by the theme picker's
  `ThemePreview`) and `showcase-mocks/checkout-desktop.tsx`. Both are in the history
  (commits `61abdfd24` and `85c80e5e4`) if the real theme renderer is wanted in a tile.
- **Made to fit:** text that sits straight on a band takes the band's colours
  (`var(--band-ink)`, `var(--band-muted)`), so the business list and the analytics column
  read light on dark.

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
