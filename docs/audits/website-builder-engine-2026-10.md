# Website builder engine audit, October 2026 (W4b)

What was measured in the builder, the imported-theme canvas and the live
storefront, what was changed, and what is left. Every number below comes
from a browser or Node measurement named next to it; where a number moved
between runs on a shared, loaded machine, the range is given.

## How the engine is built today

Storelib already has most of the shapes Shopify's editor is known for. The
audit started by mapping them, so that nothing here rebuilds what works.

| Shopify idea | Storelib today |
| --- | --- |
| JSON templates, sections with schemas | `.storelib` files (`<template>`, `<style>`, `<script>`, `<schema>`), pages hold `{ id, type, settings, blocks }` |
| Section Rendering API | Native: the editor renders one section in the browser (`components/website-builder/sections/storelib-live.tsx`); imported: `drawSection` per section (`lib/storelib-theme/compat/page.ts`) |
| DOM morphing, keep component state | `lib/website-builder/morph-html.ts` (native), `morph` in `lib/storelib-theme/compat/canvas-bridge.ts` (imported), `stable-html.ts` for React props |
| `shopify:section:load/unload/select` | Sent by the canvas bridge around swaps and selections |
| Instant slider preview | `lib/website-builder/live-settings.ts`: a gesture is drawn live by its section and committed once on release |
| CSS variable fast path | `patchCanvasThemeVars` writes theme variables straight onto the canvas root (`app/(storelib)/website-builder/editor/[installId]/page.tsx:10021`) |
| Per-frame coalescing | `components/website-builder/editor/use-frame-commit.ts` (cost-adaptive), rAF section sync in `compat-canvas.tsx` |
| Edge caching of storefront pages | ISR (`app/(site)/w/[username]/page.tsx:39`, `revalidate = 60` with an empty `generateStaticParams`), `unstable_cache` with creator tags, immutable theme assets (`app/api/site-theme/assets/.../route.ts:79`) |
| Instant page changes | Speculation rules and cross-document view transitions (`app/(site)/layout.tsx:53`, `lib/website-builder/live-navigation.ts`) |

The native canvas renders sections inline in the editor's own document
(not an iframe); an imported Shopify theme renders in a sandboxed `srcdoc`
frame and talks to the editor by `postMessage`.

## Findings and what was done

Priorities: **P0** costs every user on every interaction or every visitor
on every page; **P1** a common interaction; **P2** a smaller or rarer cost.

### E1 (P0, fixed). Every press, release, hover and focus change restyled the whole document

Traced in the real editor (`scripts/check-slider-latency.mjs`,
`DIAG_MOVE=1`, Chromium invalidation tracking): pressing a slider thumb
restyled **1,346 elements (the whole editor) in 36 to 120ms** at full CPU,
and releasing it did the same. Bisected by deleting stylesheet rules in the
live page: the cause was seven rules, none of them on the builder's screen.

- A pointer or focus state inside `:has()`: `has-[a:active]` (coupons rows,
  `app/(storelib)/app/coupons/coupons-client.tsx:313`), `has-[a[data-row-link]:active]`
  (`app/(storelib)/app/products/products-client.tsx:1513`),
  `has-[button[data-row-open]:active]` (collections), `has-[.rich-text-content:focus]`
  (`components/app/rich-text-editor.tsx:1014`) and `[&:has(a:hover)]`
  (the header's fade siblings, `components/website-builder/sections/renderers/HeaderSection.tsx:2877`).
  With any such rule in the stylesheet, Chromium re-checks every `:has()`
  anchor above an element whose state changes, and `<html>` is one (the
  shell's `html:has(...)` rules).
- A bare `:active` after a descendant combinator in the touch-screen card
  rule (`app/globals.css`, "NEVER A VEIL OVER A CARD"): `[data-card] :active`.
  The same rule with the inner element named by kind restyles a handful.

Changed: rows grey from a press mark their covering link sets
(`lib/press-mark.ts`), the rich text halo follows `focus-within`, the nav
fades on its own `:hover`, and the card rule names the pressed element.
After: the same press and release restyle no more than a few elements
(`tests/editor-engine-w4b.test.ts` keeps all of these out of the code).
This was global: the same rules were in every page of the app and every
published website, so every tap on a phone paid it.

### N2 (P0, fixed). Typing did not reach the canvas on a phone until the typing stopped

The canvas draws from `useDeferredValue` copies of the editor's state
(`page.tsx:5585`, `:5599`). The deferred pass renders the whole editor
component again, and every key restarts it. At a phone's CPU it never
finished while somebody typed.

Measured with a real-editor probe (scratch script, the harness of
`scripts/editor-probe-harness.mjs`): 24 keys typed 60ms apart into the
hero heading.

| | canvas draws | key to canvas p50 | p95 |
| --- | --- | --- | --- |
| 4x CPU, before | 1 of 24 (after the last key) | 1,374ms | 2,336ms |
| 4x CPU, after | 23 of 24 | 19 to 24ms | 29 to 329ms (one long task) |
| 1x, before | 20 to 22 of 24 | 46ms | 173 to 184ms |
| 1x, after | 23 of 24 | 11 to 12ms | 13 to 50ms |

Changed: every committed section or block setting is also echoed through
the live layer (`echoSectionSetting`, `lib/website-builder/live-settings.ts:177`),
so its own section draws it at once and the deferred canvas catches up
behind. An echo is dropped once the canvas's copy has it, and the editor
reconciles every echo against its own state after each render, so an Undo
is never drawn over: checked by Undo 30ms after typing at 4x, and Redo.

### S1 (P0, fixed). Every published website shipped the theme engine to visitors

The section registry (`components/website-builder/sections/registry.ts`)
imported its list of section types from `lib/website-builder/storelib-schemas.ts`,
which parses and validates every section's schema when it loads
(`STORELIB_SCHEMAS`). In the main checkout's production build, the site
route's client manifest references one chunk of **1.3MB (288KB gzipped)**
holding the default theme's sources, the schema parser, the validator and
postcss. Zod came along through `block-tree.ts` and `controls/registry.ts`.

Changed: a generated names-only list (`themes/default/section-types.generated.ts`,
written by `scripts/emit-theme-sources.ts`, checked by
`tests/storelib-theme.test.ts`); control names split from their zod checks
(`lib/storelib-theme/controls/types.ts`, re-exported); the block tree's save
schema marked pure.

Measured with a storefront probe (scratch: the live page's client tree,
`ThemePage` plus the site layout's client components, prerendered as the
route does, hydrated, bundled with esbuild, served gzipped; phone is 390px,
4x CPU, 150ms RTT and 1.6Mbps; desktop is unthrottled). See "Storefront
numbers" below for the full table.

| client JS of a home page | raw | gzipped |
| --- | --- | --- |
| before | 1,581KB | 366KB |
| after | 785KB | 229KB |

### C1 (P0 for imported themes, fixed). Every theme object parsed every file again

A `CompatTheme` is made for every settings change (the canvas makes one per
value of a colour or slider; the live site per settings change). Each one
split, lexed and parsed every file again, and `stylesheetBundle()` ran the
CSS fixes on the whole bundle on every page draw, even for the same theme
object (`lib/storelib-theme/compat/theme.ts:367`).

Measured in Node, home page, 25 runs after warm-up, two rounds:

| | Dawn, new theme object | Horizon, new theme object | Horizon, same object |
| --- | --- | --- | --- |
| before (median) | 60 to 65ms | 212 to 369ms | 70 to 128ms |
| after (median) | 11 to 21ms | 55 to 76ms | 49 to 64ms |
| before (min) | 31 to 33ms | 137 to 239ms | 40 to 44ms |
| after (min) | 7ms | 29 to 30ms | 16 to 21ms |

Changed: split files, parsed trees and the fixed bundle are held by the
text they come from (bounded maps, oldest out first). Same text, same
answer, so nothing can go stale; a schema is still a new object per read.
The live route draws every imported-theme page per request
(`app/api/site-theme/site/[username]/[[...path]]/route.ts`), so the same
saving applies there.

### C2 (P1, fixed). Imported themes did not preview a theme setting while dragging

Only the native canvas read the live layer's theme. On Dawn, dragging
Layout › Page width: **11 values, the frame changed for none, the first
change 826 to 949ms after release** (264ms on a quieter run). After: 10 of
11 values drawn during the drag. During a gesture the whole-page redraw is
newest-first, at most once a frame and no sooner than the last draw took
(`compat-canvas.tsx:300`), so a large theme cannot queue redraws behind
the finger.

### C3 (P1, fixed). The imported canvas's outlines kept the editor busy during drags

Every value of a section slider morphed the section, the bridge's
MutationObserver read that as the page moving and redrew the selection
outlines (dozens of `elementsFromPoint` hit tests) every 80ms for 700ms,
and the toolbar box was read by a second pass of the same hit tests in the
same frame. The morph now takes its own records off the observer
(`canvas-bridge.ts:604`), and outline and toolbar box share one reading.
Dawn section slider (Overlay opacity), same machine, alternating runs:
editor long tasks during the drag 1,333 to 1,671ms before, 148 to 417ms
after; key-to-frame p50 106 to 107ms before, 75 to 100ms after. The rest of
that wait is the chain slider, frame commit, `postMessage`, morph, next
frame, and the probe's own frame of observation.

A "draw the first change at once" variant of the section sync was tried and
dropped: it saved about a frame, and it coincided with a probe failure that
turned out to be a race in the probe (below), but it was not worth keeping
unproven.

### C4 (P1, fixed). The live site could serve an imported theme's old colours

`holdTheme` keyed its in-memory theme by the length of the settings JSON
(`lib/website-builder/compat-site.ts:127`), so a colour changed for one of
the same length (`#111111` to `#222222`) kept the old theme on that server
until it was pushed out. Keyed by a hash of the whole text now.

## Measured and left as they are

- **N1, theme sliders on native themes (P2).** A theme value is patched
  onto the canvas root at once, then every section renders again as a
  transition. The render is not the cost: about 7ms per value for all
  sections at 4x (CPU profile). The cost is the style recalculation every
  inherited CSS variable causes (351 elements, about 15ms, per value), which
  no render can avoid. Skipping sections whose output cannot change was
  checked and is not possible from the raw theme: every section's render
  reads 73 of 79 theme keys through `themeTokens`
  (`lib/storelib-theme/resolve.ts:607`). Doing it would mean tracking which
  token paths a template reads.
- **N3, the first press in the editor creates an AudioContext (P2).** The
  Ask sounds create it inside the first `pointerdown`
  (`lib/website-builder/ask-sounds.ts:718`). In headless Chromium that took
  437ms; on real devices it is usually far less, and moving it out of the
  gesture can break iOS, so it was left.
- **Native section sliders.** Already drawn by the one section, morphed,
  committed once. 1x: p50 1 to 32ms, p95 66 to 121ms; 4x: p50 31 to 75ms.
  The run-to-run spread on this machine was larger than any change made.
- **S2, the rest of the site bundle (P1 opportunity).** Every built-in React
  section renderer is in the registry and so in every site's JavaScript
  (HeaderSection alone is 42KB minified), plus `tailwind-merge` (24KB) and
  the section sandbox's guest source (12KB). Loading renderers per section
  type would need Suspense boundaries around hydration; not attempted.
- **S3, fonts.** The root layout already preconnects to Google Fonts. The
  theme's font stylesheet is a `<link>` in the body
  (`components/website-builder/theme/ThemePage.tsx:562`), which holds back
  the paint of what follows it until it loads. Hoisting it with React's
  `precedence` would move it into the head; not changed, because it could
  not be measured here (the font host is unreachable from this machine).
- **C5, a theme setting on a large imported theme still draws the whole
  page.** Horizon's warm page draw is still about 50ms. Most settings only
  change the `{% style %}` blocks in the layout; drawing only those for a
  settings-only change is the next step for the imported canvas.
- **Server caching.** Native pages: ISR plus `unstable_cache` under creator
  tags, and `generateMetadata` reads the same cached lookups as the page.
  Imported-theme pages are dynamic (a cart cookie) and draw per request;
  C1 is what made that cheaper. Theme assets are immutable per version.

## Storefront numbers

Native home pages, `storelib-default` and `studio-noir` with a photographic
hero, 5 runs each, median. Phone: 390x844, DPR 2, 4x CPU, 150ms RTT, 1.6Mbps
down. Desktop: 1350x940, no throttling. LCP element: the hero picture in
every run. CLS was 0 in every run, before and after.

| page, phone | FCP | LCP | TBT | hydrated at | JS transferred |
| --- | --- | --- | --- | --- | --- |
| storelib-default, before | 1,272ms | 1,324ms | 684ms | 3,524ms | 367KB |
| storelib-default, after | 1,360ms | 1,460ms | 353ms | 2,577ms | 229KB |
| studio-noir, before | 1,372ms | 1,480ms | 721ms | 3,670ms | 367KB |
| studio-noir, after | 1,308ms | 1,320ms | 384ms | 2,545ms | 229KB |

On a desktop with no throttling all four are under half a second either
way (FCP and LCP 384 to 440ms, TBT 0, hydrated by 415 to 507ms).

What moved is what the change touched: about half the blocking time and a
second off the moment the page answers a tap on a phone, and 138KB less
JavaScript. First paint and the largest paint did not move beyond the run
to run spread, because they depend on the HTML, the stylesheet and the hero
picture, which are the same before and after.

The probe measures the page's own client tree, not Next's runtime and RSC
payload, which add the same bytes before and after.

## Probes and tests

- `tests/editor-engine-w4b.test.ts` holds E1, C1 to C3, S1 and N2.
- `tests/storelib-theme.test.ts` holds the generated section-type list to
  its generator.
- The browser probes used are in the scratchpad of this round, not the
  repo: a typing probe, a compat slider probe, a stylesheet bisector and the
  storefront probe. They reuse `scripts/editor-probe-harness.mjs` and the
  prerender approach of `scripts/check-site-accounts.mjs`.
- `scripts/check-compat-editor.ts` passes on Dawn and Horizon apart from
  checks that fail the same way on `main` without these changes: "Add
  section's cards are the theme's sections, drawn" is a race in the probe
  (it reads the cards the moment the sixth frame appears; `main` failed it
  2 of 3 runs), and the save problem banner checks on Dawn. After merging
  `main` (round 19's "one selection at a time"), "the selection is one
  unbroken ring over the section" fails on Horizon on `main` itself as well
  (the probe selects a block, whose section ring is now hidden).
- Suites that fail on `main` before and after this work:
  `storelib-hardening` (2), `products-area` (the app stage landing regex),
  `site-resilience` (uses `__dirname` under ESM).
