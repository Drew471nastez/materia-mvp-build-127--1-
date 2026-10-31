# Live theme updates in the website editor

The editor follows the authenticated `agent-activity` cursor while visible, even if no connection existed when it opened. Connected writers are checked about once a second; an editor without a known connection checks every five seconds. Focus, reconnecting to the network, and returning to a hidden tab wake the channel. A short tab switch must restart a cleared timer even inside the wake throttle.

A read drains up to six pages of activity before applying one batch. It acknowledges that batch only after application or an awaited authoritative refresh succeeds. In-flight responses from an old install are ignored. Failed source reads return 503 rather than a partial theme or a fallback that would acknowledge stale code. Source caches reject patches to invalidated generations.

The editor prepares files in the background and applies remote state in a React transition after canvas scrolling stops. Imported themes report the known scroll offset at a bounded 60ms cadence; the parent waits 120ms after the last message. This cadence must stay shorter than the rest interval. Expensive Liquid rendering and iframe promotion also check for scrolling, since a gesture can begin while a file or frame loads. An incoming frame restores the latest offset and acknowledges it before promotion. Storelib AI's streamed source writes are folded while scrolling, and its completed run refreshes code and settings together.

A GitHub push is written to the log one row per saved file, and the link's `sync_at` moves once the whole push is in (`lib/github-sync/sync.ts` `finish`). While the rows of a push are still arriving, the editor holds them (`holdForPush` in `lib/website-builder/live-follow.ts`): it reads every 500ms, does not acknowledge the held rows, and applies them in one pass when `sync_at` moves, when no new row has come for 2s, or 10s after the first, whichever is first. Before this, a push of a few hundred files was applied once per poll while it was being written: a full theme read, a redraw of every section and a fresh canvas document each time. An agent's own edits are not held. More than eight theme sources in one pass are one `?sources=1` read, never a request per file.

The library's section sheet for an imported theme lets go of its frame's document when a newer sheet replaces it (`PreviewSheet.release`). Before, React's previous ref callback kept the old sheet, and its document, alive: two more documents after every push.

Section-only changes can leave the library iframe's `srcDoc` unchanged. The outgoing sheet removes its own card elements before paint, so reusing that document cannot leave old previews behind or duplicate them after each update. Font listeners are released with the sheet. Card positions use the iframe's actual painted origin and scale rather than rounded layout widths; section measurements include child margins, and a replacement sheet keeps existing card heights while awaiting its measurements.

The cards' document is their coordinate space, so nothing in a theme may move it: its lock on `html` and `body` (no margin, padding, position, zoom, transform or scroll) is in the cards' first cascade layer, where a theme's stronger `!important` cannot beat it. A theme stylesheet a section links is put in the head once and kept to the cards that link it (`hoistSheets`), so one section pack's page rules no longer restyle and cut every other card. A newer sheet attaches only to a document known to have loaded its own srcdoc, never to the one the frame is about to replace. An open library takes a burst of changes once (`LIVE_ADOPT_QUIET_MS`, at most `LIVE_ADOPT_CAP_MS` after the first), and a section drawn the same as before a push is shown again at once rather than faded in. After a section is first put in, its height comes from a ResizeObserver on its box (the browser's own layout, nothing forced). A section skipped by content-visibility whose picture, stylesheet or font arrived, or that is shown again after a category hid it, is let out for one frame, six a frame, nearest first, never while the list scrolls, and its height is read in the next frame, after the browser laid it out. A card coming on screen (an IntersectionObserver), leaving content-visibility's skip, or whose picture lands while it is on screen is read the same way at once. A fresh ResizeObserver observation was tried for this and is not enough: a section laid out again inside a skipped card can be reported at its old size. A measured section grows its card even in sight, so a picture is never cut at its foot. The page is `position: relative` at no offset so the body holds the cards; with the viewport holding them, every section's layout cost every card's and the list scrolled at 23ms a frame. Heights are remembered only once a section's pictures and the fonts have loaded. `PROFILE=1` on the stress probe prints the main thread's time while scrolling, by event and function.

On an imported theme, an agent's saved section file (Storelib AI, MCP, the agent API) draws only the sections of that type on the page and swaps them in place (`syncFileChange` in `compat-canvas.tsx`), the same way a section setting is applied. It does this only when nothing else changed: not a snippet, layout, asset, setting or the page's sections, and not the theme's stylesheet or script bundles. It also needs a page that is not a product page, not loading behind, not asking for a fresh document, not having most of its sections swapped at once, and not worn by many swaps. Any of those draws the whole page as before. While a page loads behind the one on screen, files saved meanwhile are not each a new page behind: they are drawn into it once it comes forward (`behindStale`). A change to the theme's files is drawn in one task and parsed in the next (`prepareDraw`). The editor waits out a scroll between them. A closed library takes such changes 10s after the last one (`CLOSED_ADOPT_MS`), and an open library takes them at once. After the first warm-up, a closed Storelib library draws again only the first 12 cards still to draw (`REWARM_FIRST`). It draws the rest when opened.

A section picked in Add a section lands in one piece on both kinds of theme. On a computer the dialog is marked closed on its own element in the click, so its exit starts in the next frame; the editor hears of the close and the add together, one render on the next frame, and the new section is picked at once (the pick store) while its settings panel follows in a transition, as a click on a section already did. On an imported theme the patch that adds a section carries the text of the stylesheets it links, read from the theme's files and passed through the asset route's own `fixThemeCss` (`linkedSheets` in `lib/storelib-theme/compat/preview-styles.ts`); the frame writes them as `<style>` and only then puts the section in, and waits for any stylesheet it was not handed. A draft asset is never cached in the editor, so before this every new section's stylesheet was a round trip with the section already on screen unstyled. The frame then plays the same arrival a Storelib theme's canvas plays (`section-arrival.ts` times and curve): the sections below slide from where they were by transform, the new one fades up, and the page scrolls once, smoothly, only when the section's top is not already on screen. A sticky header counts only when it is a painted bar, so a hidden drawer fixed over the window no longer sends the glide 850px above the section.

`scripts/big-theme-kit.mjs` builds the store-size fixture these were measured on, from a Shopify theme zip (`BIG_THEME_ZIP`; Dawn made 156 sections with a 39 section home page). Each probe below takes it the same way.

Regression checks (no live account, GitHub, or AI credentials required):

```sh
node scripts/check-editor-activity-channel.mjs
node scripts/check-editor-theme-reads.mjs
# Actual imported preview components: fractional widths, filtering, title resize,
# dialog scaling, reopening, and three section-only updates in the same document.
CHROMIUM=/path/to/chromium node scripts/check-section-preview-layout.mjs
# The real Add a section dialog on a 157 section theme built to break it, driven by seeded random
# runs (categories, search, flings, resize, zoom, slowed CPU, pushes and AI edits while open and closed).
# Fails on any picture over another card, off its card by more than 1px, cut, stale after a push, or doubled.
# PREVIEW_MODULE=/path/to/older/compat-section-preview.tsx measures a before over the same dialog.
RUNS=50 npx tsx scripts/check-section-preview-stress.mjs
# Uses the repository's existing real-editor harness and imported theme fixture.
# Set CHROMIUM to an installed Chromium binary, as for the other editor probes.
pnpm dlx tsx@4.20.6 scripts/check-editor-push-scroll.mjs
# Pushes of 50 to 270 files streamed and at once, five pushes in a row, an agent writing for a minute,
# a Push echo and a Storelib theme of 200 files, scrolled throughout; budgets on reloads, reads, commits and documents left alive.
pnpm dlx tsx@4.20.6 scripts/check-editor-push-lag.mjs
# What still holds a canvas document after a push, from a heap snapshot.
pnpm dlx tsx@4.20.6 scripts/editor-push-retainers.mjs
# On a store theme: the same pushes, with budgets on long tasks and scroll frames at a quarter speed.
BIG_THEME_ZIP=/path/to/dawn.zip CPU=4 pnpm dlx tsx@4.20.6 scripts/check-editor-push-lag.mjs
# Section files saved one by one (and while a page loads behind) end as the page drawn whole shows them.
pnpm dlx tsx@4.20.6 scripts/check-editor-section-file-sync.mjs
CHROMIUM=/path/to/chromium N=4 EDITS=0 pnpm dlx tsx@4.20.6 scripts/check-wb-stability-r13.mjs
# A section picked in Add a section, frame by frame from the click, on a Storelib and an imported theme:
# first pixel, unstyled and resized frames, sections above and below, scrolls, inserts, long tasks, the ring.
# Randomised CPU, slow stylesheets, an agent's edit, two picks in a row, reduced motion. EDITOR_BUNDLE= for a before.
RUNS=30 npx tsx scripts/check-section-insert-smooth.mjs
pnpm test:push
pnpm lint
pnpm typecheck:ratchet
```

The first browser check launches the packaged Chromium when CHROMIUM is unset. The scroll probe verifies a push during continuous scrolling, the final offset, the new stylesheet and JavaScript, hero visibility afterward, one remaining iframe, and browser errors. The activity check covers a writer connected after opening, a 45-event burst, application and recovery failures, navigation during an in-flight request, hidden tabs, and rapid repeated tab switches. The read check executes the real GET handler with database failures, including failure on the second page of a large theme.

Measure browser timing without a production build or TypeScript compilation competing for the same CPUs. Inspect actual screenshots and failed budgets; do not treat merely receiving an event as a working canvas update. Fixture checks do not establish delivery of a live GitHub webhook or availability of production services.
