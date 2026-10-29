# Live theme updates in the website editor

The editor follows the authenticated `agent-activity` cursor while visible, even if no connection existed when it opened. Connected writers are checked about once a second; an editor without a known connection checks every five seconds. Focus, reconnecting to the network, and returning to a hidden tab wake the channel. A short tab switch must restart a cleared timer even inside the wake throttle.

A read drains up to six pages of activity before applying one batch. It acknowledges that batch only after application or an awaited authoritative refresh succeeds. In-flight responses from an old install are ignored. Failed source reads return 503 rather than a partial theme or a fallback that would acknowledge stale code. Source caches reject patches to invalidated generations.

The editor prepares files in the background and applies remote state in a React transition after canvas scrolling stops. Imported themes report the known scroll offset at a bounded 60ms cadence; the parent waits 120ms after the last message. This cadence must stay shorter than the rest interval. Expensive Liquid rendering and iframe promotion also check for scrolling, since a gesture can begin while a file or frame loads. An incoming frame restores the latest offset and acknowledges it before promotion. Storelib AI's streamed source writes are folded while scrolling, and its completed run refreshes code and settings together.

A GitHub push is written to the log one row per saved file, and the link's `sync_at` moves once the whole push is in (`lib/github-sync/sync.ts` `finish`). While the rows of a push are still arriving, the editor holds them (`holdForPush` in `lib/website-builder/live-follow.ts`): it reads every 500ms, does not acknowledge the held rows, and applies them in one pass when `sync_at` moves, when no new row has come for 2s, or 10s after the first, whichever is first. Before this, a push of a few hundred files was applied once per poll while it was being written: a full theme read, a redraw of every section and a fresh canvas document each time. An agent's own edits are not held. More than eight theme sources in one pass are one `?sources=1` read, never a request per file.

The library's section sheet for an imported theme lets go of its frame's document when a newer sheet replaces it (`PreviewSheet.release`). Before, React's previous ref callback kept the old sheet, and its document, alive: two more documents after every push.

On an imported theme, an agent's saved section file (Storelib AI, MCP, the agent API) draws only the sections of that type on the page and swaps them in place (`syncFileChange` in `compat-canvas.tsx`), the same way a section setting is applied. It does this only when nothing else changed: not a snippet, layout, asset, setting or the page's sections, and not the theme's stylesheet or script bundles. It also needs a page that is not a product page, not loading behind, not asking for a fresh document, not having most of its sections swapped at once, and not worn by many swaps. Any of those draws the whole page as before. While a page loads behind the one on screen, files saved meanwhile are not each a new page behind: they are drawn into it once it comes forward (`behindStale`). A change to the theme's files is drawn in one task and parsed in the next (`prepareDraw`). The editor waits out a scroll between them. A closed library takes such changes 10s after the last one (`CLOSED_ADOPT_MS`), and an open library takes them at once. After the first warm-up, a closed Storelib library draws again only the first 12 cards still to draw (`REWARM_FIRST`). It draws the rest when opened.

`scripts/big-theme-kit.mjs` builds the store-size fixture these were measured on, from a Shopify theme zip (`BIG_THEME_ZIP`; Dawn made 156 sections with a 39 section home page). Each probe below takes it the same way.

Regression checks (no live account, GitHub, or AI credentials required):

```sh
node scripts/check-editor-activity-channel.mjs
node scripts/check-editor-theme-reads.mjs
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
pnpm test:push
pnpm lint
pnpm typecheck:ratchet
```

The first browser check launches the packaged Chromium when CHROMIUM is unset. The scroll probe verifies a push during continuous scrolling, the final offset, the new stylesheet and JavaScript, hero visibility afterward, one remaining iframe, and browser errors. The activity check covers a writer connected after opening, a 45-event burst, application and recovery failures, navigation during an in-flight request, hidden tabs, and rapid repeated tab switches. The read check executes the real GET handler with database failures, including failure on the second page of a large theme.

Measure browser timing without a production build or TypeScript compilation competing for the same CPUs. Inspect actual screenshots and failed budgets; do not treat merely receiving an event as a working canvas update. Fixture checks do not establish delivery of a live GitHub webhook or availability of production services.
