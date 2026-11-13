# OnePage production audit

November 2026. Covers the OnePage editor (`/app/onepage`), its save and publish routes, the public page (`storelib.me/<name>`, `/l/<slug>`, `<domain>/links`, and `storelib.com/<name>/links` inside the native app), and the routes the public page calls.

## How the audit was done

Six read-only reviews ran in parallel: security and tenant isolation; save, publish and data integrity; public rendering, routing and SEO; Design tab controls; block editing controls; commerce, lead capture and analytics. Their findings, plus the ones found while mapping the system, were each traced through the code before they were accepted. A finding that could not be supported from the code was dropped. There are 82 findings below, not 100: the remaining audit time went into fixing them rather than looking for more.

Every fix is pinned in `tests/onepage-production-audit.test.ts`. Where it can, the suite drives the real route handlers through the journey harness (`tests/_journey`). Otherwise it calls the pure functions, and it reads source only for wiring that only a component shows.

Status values:
- **Fixed**: fixed and verified by a test.
- **Fixed, untested**: fixed and reviewed in code, with no test of its own.
- **Partly fixed**: some of it fixed; what is left is in the issue.
- **Backlog**: verified but not fixed in this round.

## A. Issue inventory

### P0: critical

| ID | Area | Where | Finding | Fix | Status |
| --- | --- | --- | --- | --- | --- |
| XSS-1 | Public page | `components/onepage/public-onepage.tsx` (booking and PDF blocks); `app/api/onepage/route.ts`; `app/api/onepage/publish/route.ts` | The booking button fell back to the raw `calendly_url` when it was not a Calendly or Cal.com address, then ran `window.open(url)`. A saved `javascript:` address therefore ran in the page's origin when clicked. The PDF and menu blocks opened `pdf_file_url` the same way. In the native app, OnePages are served on storelib.com, beside the visitor's session. React 19 blocks `javascript:` in JSX attributes, but not in `window.open`. | `lib/onepage/safe-urls.ts`. `openableUrl` checks every `window.open` target (http(s) or a same-site path only). `withSafeUrls` and `withSafeLinkValues` empty `javascript:`, `vbscript:`, `file:` and non-raster `data:` addresses in blocks, the archive and social links on PUT and on publish. | Fixed |
| C1 | Lead magnet download | `app/api/onepage/email-capture/route.ts` | The route took the product id from the request body and treated `price_cents` alone as "free". Anyone could therefore collect the files of a pay-what-you-want product saved at 0, or a product with a paid option, by sending its id with any page of the same creator. On a page with no `seller_id`, any creator's products were exposed. | The route reads the published `lead_magnet` block (switched on, in schedule, kind `download`) and ignores the body. The product must be on sale and belong to the page owner's store. "Free" is decided the way quick-free decides it (`baseFor` plus no paid variant). The editor's product picker and `/api/onepage/free-products` apply the same rule. | Fixed |
| SEC1 | Tenant isolation | Every public route that acts for a creator: leads, lead-magnet, rsvp, tip, access, poll, track, stats, and the live page itself | The page's store was read from the row's own `seller_id`/`creator_id`, which the owner can write. A page could name another creator's store and then hand out that creator's paid files as signup gifts, fill that creator's subscriber list, welcome flow and integrations, show their private counts and products, and fire their pixels. | `lib/onepage/page-store.ts`. The store is always the owner's, read as `creators.user_id = owner_id`. It is applied in `readLivePage`, leads, lead-magnet, email-capture, track, `creatorOfPage`, and inside the held address read (cache key bumped to v2). `pageOfAccount` finds a username's page by `owner_id` only. | Fixed |
| SEC2 | Data exposure | `onepages` table policy; `lib/onepage/paid-access.ts` | A published page's row can be read with the public anon key. The public signup route depended on that read on storelib.me. A Paid access block's locked text and link (what buyers pay for) were stored in plain block JSON, so they were one request away. | `lib/onepage/locked-seal.ts` seals the locked text, URL and label with AES-256-GCM (`lib/physical/secrets`) whenever blocks are stored (PUT, the archive, publish). Only the owner's editor and `/api/onepage/access` can open them. The signup route now reads with the server client. Existing rows are sealed on their next save. **Still open:** drafts and the archive of published pages remain readable with the anon key until the table policy is tightened (I. Remaining). | Partly fixed |
| B1 | Block editor | `components/onepage/tabs/links-tab.tsx` (`updateBlockDeep`, the upload and remove handlers) | An upload that finished after other edits wrote back the block as it was when the upload started, undoing a typed title. For a block inside a group, it wrote back the whole group from then: a link moved out during an upload came back in, leaving two blocks with one id. | `updateBlockDeep` reads the page at write time (`getLatestOnePage`) and merges a data patch over the latest block. The handlers re-read the block and pass only their own fields. | Fixed |

### P1: high

| ID | Area | Where | Finding | Fix | Status |
| --- | --- | --- | --- | --- | --- |
| HOST-1 | Live page | `lib/onepage/host-route.ts` | storelib.me answers only allowlisted APIs. The poll (GET and POST), RSVP, Paid access check, tip (start and confirm), and lead magnet download and code routes were not on the list, so they returned 404 on the live page while working in the editor preview on storelib.com. | Added the six guest routes, each with its methods. None reads a session. A test scans every live block's `fetch` and fails if any route is missing from the list. | Fixed |
| S1 | Save | `lib/onepage/context.tsx`; `lib/onepage/editor-state.ts`; `app/api/onepage/route.ts`; `lib/onepage/local-draft.ts` | Every save wrote the whole name, address, settings, social links and share picture from the editor's own copy. These fields are outside the version check because other screens write them too. An editor left open therefore restored yesterday's Instagram (and pushed it back onto the creator page), an old name, or old settings. A restored device draft did the same. | `saveRequestBody` sends those fields only when this editor changed them since its last save; settings and social links are sent key by key and merged on the server (`social_links_patch`). A device draft remembers what it was made against and restores only fields changed on that device. | Fixed |
| S2 | Save | same | Save was a PUT followed by a separate publish request. If the second request failed, the draft was saved but the page did not go live, and the reopened editor said Saved with nothing to press. | PUT with `publish: true` writes the draft and the live copy in one checked update, then runs the publish side effects: purge, creator-page link sync, IndexNow. `/api/onepage/publish` is kept for older cached editors, and a fallback calls it if a server answers without publishing. | Fixed |
| S3 | Save | `lib/onepage/context.tsx` | A quiet automatic retry that got a 409 showed nothing, yet armed the next Save to overwrite the other device's page. | A failure that will not be retried is always shown, even from a quiet retry. | Fixed |
| S4 | Save | `app/api/onepage/route.ts`; `lib/onepage/context.tsx` | A top-level `avatar_video_crop` sent with the page took priority over the settings' own crop, so a stale null could erase the crop on save. | The settings crop wins. The editor no longer sends the top-level field. | Fixed, untested |
| F1 | Lead magnet download | `app/api/onepage/email-capture/route.ts` | The download email was sent before the lead was saved. A failed save returned an error to a visitor who already had the email, and every retry sent another. `delivery_status` read "sent" even when sending failed. | The lead is saved first (shared `saveLead`, which tolerates older schemas). The email goes in `after()`, and its real result is written back. | Fixed |
| ONB-1 | Welcome wizard | `components/onepage/onboarding-modal.tsx` | The wizard wrote the bio straight to the row and then saved through the version-checked route, so anyone who typed a bio got a 409. The theme and blocks they had picked were neither saved nor published. | The direct write now carries only completion and the social columns. The name and bio go with the save. | Fixed (a control test shows the old 409) |
| B2 | Block editor | `links-tab.tsx` (group child editor) | Inside a group, every file and thumbnail button opened the photo picker, because the field type was dropped, so a PDF could get an `image_url`. | The callback is passed through unchanged. | Fixed |
| B3 | Block editor | `components/onepage/upload-progress.tsx` | An upload was cancelled silently when its field unmounted (switching the block's tabs, closing the card). | The upload carries on and is written by block id when it ends. Only Stop or a new file cancels it. | Fixed |
| B4 | Block editor | `links-tab.tsx` | The group child editor had no `key`, so switching child mid-upload saved the picture to the wrong child. | Keyed by child id. | Fixed |
| P-F11 | Live page | `lib/forms/actions.ts` | `decodeURIComponent` on a Telegram path with a stray `%` threw during server render, so one such link sent every visitor to the error screen. | Guarded: the value is treated as no link. | Fixed |
| P-F2 | Addresses | `lib/profile/ensure-username.ts` | A username could be registered over another creator's OnePage address. | `handleAvailable` refuses another owner's page slug. | Fixed |
| P-F1 | Paid access | `components/onepage/data-blocks.tsx`; `app/api/onepage/access/route.ts` | On storelib.me, a buyer cannot open a Paid access block: the session and the signed `sl_owned` grant are storelib.com cookies. | Needs a designed handoff: either a storelib.com access page linked from the block, or a short-lived signed grant handed to storelib.me. | Backlog |
| SEC3 | Addresses | `lib/onepage/resolve-address.ts` | A direct table write can set a page's slug to another user's username, and the slug is matched first. A resolver-side fix was tried, but it turned P-F2 into an address takeover, so it was reverted. | Needs a database trigger that refuses such slugs (I. Remaining). | Backlog |

### P2: medium

| ID | Where | Finding | Fix | Status |
| --- | --- | --- | --- | --- |
| F2 | email-capture | An expired or used-up download link was emailed again unchanged. | The record gets a new token, its count reset and a new expiry. | Fixed, untested |
| F3 | `app/api/onepage/leads/route.ts`, email-capture | An address already on the page (an RSVP, or someone who unsubscribed) was told "Already subscribed" and never reached the subscriber step. | The lead is not duplicated, but the list step always runs. | Fixed |
| LEAD-1 | leads | With no `seller_id`/`creator_id`, the subscriber was filed under `owner_id`, which is a user id and not a store. | Now uses the owner's store (SEC1). | Fixed |
| F4 | `public-onepage.tsx` | A browser-wide "3 subscriptions in 3 days" counter, shared by every creator's page on storelib.me, blocked real signups with an alert. | Removed; the server limits by address and by email. | Fixed |
| F5 | `lib/onepage/paid-access.ts` | An email signup's gated file address was in every visitor's page source. | Stripped at render; the client uses only the server's link. | Fixed |
| P-F3 | `lib/onepage/public-shape.ts`, `schedule-clock.ts` | Switched-off blocks, and group children outside their schedule, were sent to every visitor and hidden only in the browser. Group children's schedules never triggered a refresh. | Dropped on the server for the published page. `nextScheduleChange` now walks groups. | Fixed |
| P-F6 / B6 | `public-shape.ts` | A picture's link typed without a scheme opened as a 404 under storelib.me. | `linkHref` is now applied to image links too. | Fixed |
| P-F7 | `lib/onepage/page-presence.ts` | An untouched new page (name plus the default signup form) was indexed and listed in the sitemap. | A signup form on its own no longer counts as content. | Fixed |
| A1 | `lib/onepage/poll-server.ts` | Poll totals came from row reads capped at 1,000. | One exact count per answer. **Still open:** tips and RSVP figures. | Partly fixed |
| ED-1 | `onepage-editor.tsx` | When the plan request failed or was slow, a paying creator with Pro settings was asked to upgrade on every Save. | Only a confirmed free plan blocks Save; the server still checks the plan. | Fixed |
| SEC6 | `lib/onepage/published-page.ts` | The verified badge and hidden branding were drawn for any plan once written to the row, including lapsed or directly written ones. | The live page drops both when the owner's plan is known not to pay; an unknown plan changes nothing. | Fixed |
| SEC7 | old onboarding rows | Rows created by the old onboarding have `seller_id` = the user id, so signups went nowhere. | Covered by SEC1: the store is read from the owner. | Fixed |
| S5 | `context.tsx`, `onepage-editor.tsx` | Choosing Discard on the way out kept the device draft, so the discarded work came back on the next open. | `discardUnsaved()` clears it. | Fixed |
| S6 | `onepage-editor.tsx` | On a free plan, "Upgrade to Pro" never reached pricing: it saved first, and the save was refused. | It goes to pricing past that refusal; the work stays as the device draft. | Fixed |
| B5 | `lib/onepage/extra-blocks.ts` | Clearing an image block's first picture hid every picture in the block. | Shown while any picture exists. | Fixed |
| B9 | `links-tab.tsx`, `context.tsx` | Move up, drag and the arrow keys could put a block above the profile header. | Moves are clamped below the header. | Fixed |
| D1 | `design-tab.tsx`, `lib/onepage/theme-layout.ts` | On the 15 themes with 3 or 4 gradient stops, any edit rebuilt the gradient with 2 stops, and "End" showed the middle stop. | `editLinearGradient` changes only the angle, the first stop or the last stop. The strip draws the real gradient. | Fixed |
| D2 | `public-onepage.tsx`, `hero-scroll.tsx` | The paid verified badge was missing when the title was a logo. | Drawn beside the logo in both layouts and in the scrolled bar. | Fixed |
| D5 | `design-tab.tsx` | Picking an icon colour did nothing while icons used brand discs (the default). | The pick switches the icons to one colour. | Fixed |
| DB-1 | SQL | `onepages.archived_blocks` (written by every save) is in no SQL file in the repository, so a database built from the repo fails every editor save. | Needs an idempotent SQL part added to the run-now ledger (I. Remaining). | Backlog |
| F6 | `onepage_leads` | There is no unique key, so the `already`/`fresh` checks never fire and RSVP counts and integration pushes can repeat. | The email signup and the download form now look for an existing lead first, so a repeat is one lead and is not pushed again. **Still open:** RSVP and the lead magnet's code and waitlist forms; the real fix is a deduplication pass plus a unique index scoped by block (SQL). | Partly fixed |
| B7 | `links-tab.tsx` | Typing a new link address cleared an uploaded thumbnail and a chosen icon at the first keystroke. | | Backlog |
| B8 | `links-tab.tsx` | Adding a streaming service from the fallback list was discarded without a message. | | Backlog |
| B10 | `links-tab.tsx` | Social icons can only be reordered with HTML5 drag, which phones in the app do not support. | | Backlog |
| D3 | `header-cover-editor.tsx`, `theme-apply.ts` | A theme's stock cover is treated as the creator's own (`cover_profile_layout`). | | Backlog |
| D4 | `theme-skins.css`, `skin-own.ts` | The profile image shape is ignored on six skinned themes. | | Backlog |
| P-F4 | `paid-access.ts` | An email signup's "after they join" link is in the page source before signup. | | Backlog |
| P-F5 | `lib/forms/actions.ts` | "Page on this site" actions on storelib.me go to other creators' addresses. | | Backlog |
| P-F8 | `data-blocks.tsx`, `public-onepage.tsx` | Hydration mismatches: event times in the server's time zone, product descriptions stripped two different ways, `Date.now()` during render. | | Backlog |

### P3: low

| ID | Finding | Status |
| --- | --- | --- |
| F7 | A network or non-JSON failure in the email signup was only logged; it is now shown under the form. | Fixed, untested |
| S7 | The edit version is now also sent as `X-OnePage-Edit-Version`, so a cut-off response body no longer turns the conflict check off. | Fixed |
| SEC8-track | Clicks were counted for unpublished pages; they now count for published pages only, for the owner's store. | Fixed, untested |
| SEC8-json | An unreadable JSON body on leads, track or publish now gets a 400 instead of a 500. | Fixed (publish tested) |
| PUB-strip | Publish now strips resolved shelf and posts items, as PUT does. | Fixed |
| P-F10 | Long names and bios now wrap on narrow phones. The text block's paragraph is still open. | Partly fixed |
| D6 | The Corners slider now reaches a theme's own 28px. | Fixed |
| D7 | Duotone at 0% now draws nothing (it used to draw full strength). | Fixed |
| B15 | An older header's switches now show what the page draws. | Fixed |
| C2 | The tip idempotency key is built from the IP hash, so two visitors behind one IP can share a checkout. | Backlog |
| S8 | Deleting a product causes a false "saved somewhere else". | Backlog |
| B11 to B14, B16 to B18 | Group link previews; schedules hidden inside groups; archive copy and restore position; two undo steps on add; followers refresh; Products tab resets a block; dead code. | Backlog |
| D8 to D13 | `title_size` default, the Air swipe side effect, the size of PDF, menu and booking buttons, hidden controls, untyped theme keys, dead code. | Backlog |
| P-F9, P-F12, P-F13 | Custom-domain sitemap rules, phone formatting, double media load. | Backlog |
| SEC8-other | `blocks-live` fetch amplification, unauthenticated music lookups, the "already subscribed" membership oracle. | Backlog |

## B. Editor functionality matrix

| Feature | State |
| --- | --- |
| Open the editor (owner and team member) | Unchanged. Paid blocks' locked parts are now opened for the editor. Verified by the team-areas and audit suites. |
| Save (one request, checked, publishes) | Rebuilt (S1, S2). Verified by journey tests: the draft and the live copy are written together, and unchanged fields are not sent. |
| Conflict with another tab or device | The 409 is always announced (S3). The edit version comes in a header (S7). |
| Device draft (offline, crash) | Restores only fields changed on the device (S1). Discard clears it (S5). |
| Undo and redo | Unchanged. |
| Add, remove, archive and restore blocks | Unchanged. |
| Reorder | Blocks stay below the header (B9). |
| Uploads (thumbnail, file, PDF, image) | Write by id over the latest block (B1). An upload survives unmounting (B3). Group children are keyed and open the right sheet (B2, B4). |
| Design: gradient | Every stop kept (D1). |
| Design: social icon colour | Takes effect (D5). |
| Design: corners, duotone | Full range (D6, D7). |
| Pro gates | Block only on a confirmed free plan (ED-1). Upgrade reaches pricing (S6). |
| Welcome wizard | Its save is no longer refused (ONB-1). |

## C. Public OnePage matrix

| Block or interaction | State on storelib.me |
| --- | --- |
| Links, buttons, socials | Unsafe schemes are emptied, and every `window.open` is checked (XSS-1). Image links get a scheme (B6). |
| Email signup | Works. Signups go to the owner's store (SEC1). The per-device limit is gone (F4). Errors are shown (F7). The file address is no longer in the source (F5). |
| Lead magnet (download, code, waitlist) | Reachable (HOST-1). Only the block's own free product is given (C1). |
| Poll | Reachable (HOST-1), with exact totals (A1). |
| RSVP, tips | Reachable (HOST-1). |
| Paid access | The check route is reachable (HOST-1) and the content is sealed at rest (SEC2). A buyer on storelib.me still cannot open it (P-F1, backlog). |
| Switched-off and scheduled blocks | Not sent (P-F3). The page refreshes when a group child's schedule starts or ends. |
| Telegram actions | No crash on a malformed address (P-F11). |
| Verified badge and branding | Drawn only for a paying plan (SEC6), and next to a logo title (D2). |
| SEO and sitemap | A new untouched page is not listed (P-F7). |

## D. Changes made

New modules:
- `lib/onepage/safe-urls.ts`
- `lib/onepage/page-store.ts`
- `lib/onepage/locked-seal.ts`

Routes:
- `app/api/onepage/route.ts`: patches, publish in the same write, sealing, the edit-version header, crop priority
- `publish/route.ts`: cleaning, sealing, JSON guard
- `email-capture/route.ts`: rewritten
- `leads/route.ts`
- `lead-magnet/route.ts`
- `track/route.ts`
- `access/route.ts`
- `free-products/route.ts`

Libraries:
- `lib/onepage/context.tsx`
- `editor-state.ts`
- `local-draft.ts`
- `host-route.ts`
- `public-shape.ts`
- `published-page.ts`
- `address-lookup.ts`
- `paid-access.ts`
- `poll-server.ts`
- `tips-server.ts`
- `link-stats-server.ts`
- `extra-blocks.ts`
- `page-presence.ts`
- `schedule-clock.ts`
- `theme-layout.ts`
- `wallpaper.ts`
- `lib/forms/actions.ts`
- `lib/profile/ensure-username.ts`

Components:
- `public-onepage.tsx`
- `onepage-editor.tsx`
- `onboarding-modal.tsx`
- `tabs/links-tab.tsx`
- `tabs/design-tab.tsx`
- `storelib-blocks.tsx`
- `hero-scroll.tsx`
- `upload-progress.tsx`
- `app/(storelib)/app/onepage/page.tsx`

Tests:
- New: `tests/onepage-production-audit.test.ts` (strict list). The journey harness learned the email-capture route. `scripts/check-onepage-avatar-routes.mjs` stubs the save route's two new server modules.
- Updated: fourteen existing suites whose source assertions or module stubs described behaviour that changed on purpose. Each changed assertion carries a "Changed on purpose (OnePage production audit, …)" note.

## E. Performance

- The poll tally uses one exact count per answer instead of up to 50,000 rows.
- Save is one request instead of two.
- The owner's store is resolved inside the held (cached) address read, so it adds nothing per visitor. Visitor POST routes make one indexed `creators` lookup each.
- The live page payload no longer carries switched-off blocks or the gated file address.

## F. Test results

All runs are on this branch merged with `main` at `5f1db86b`.

- **Full suite** (`node scripts/run-push-tests.mjs`, 1,100 suites, with `NODE_OPTIONS=--max-old-space-size=10240`, since the runner's compile ran out of Node's default heap on this machine): 1,096 suites passed. Four did not, all because of this work: two assertions pinned to the old shape of code that changed on purpose (`page-seo`, `public-delivery`), and two suites whose module stubs lacked names the save route's new publish path imports (`onepage-search-share`, `onepage-share-image`). All four were updated and pass when re-run on their own, as does every suite that reads the files changed afterwards (the email-capture duplicate check, the lazy imports).
- **`tests/onepage-production-audit.test.ts`**: 118 of 118 checks pass, including journey-harness runs of PUT `/api/onepage`, POST `/api/onepage/publish`, `/api/onepage/leads` and `/api/onepage/email-capture`.
- **`scripts/check-onepage-avatar-routes.mjs`** (the save and publish routes bundled with stubs): passes.
- **Type ratchet** (`node scripts/ci/typecheck-ratchet.mjs`): fails, but it fails identically on unmodified `main`. The "more errors than the baseline" file list is the same with and without this work (373 errors on `main`, 370 with it). The only difference is `components/onepage/tabs/links-tab.tsx`, which goes from 30 errors to 27. This work adds no type error.
- **ESLint**: the repository's config covers only `.js`, `.mjs` and `.cjs` files, so it checks nothing in the TypeScript files changed here.
- **Not done**: a browser run of the editor and the live page (no Supabase project or test accounts were available in this environment, so creator sign-in, uploads and Stripe could not be exercised). Every route-level claim above comes from the journey harness, which runs the real route handlers against an in-memory PostgREST model.

## G. Build results

`pnpm build` with placeholder environment variables, on a 4 CPU, 16 GB machine. Peak memory is the summed resident memory of the whole build process tree, sampled every 200 ms. The sum counts shared pages more than once, so it overstates the real peak a little.

| Run | Result | Time | Peak memory |
| --- | --- | ---: | ---: |
| Before (HEAD `c51a69cc`) | success | 206 s | 7,967 MB |
| After (this work merged with `main` at `5f1db86b`) | success | 205 s | 7,886 MB |
| After, final tree (with the last test and email-capture fixes) | success | 198 s | 7,889 MB |

Both runs are under 8 GB. The repository's own budget in `docs/reliability/PERFORMANCE.md` is 7,600 MB, and both runs were over it before and after this work. This round did not try to cut build memory. Which build phase reaches the peak was not measured, and the changes here add only a few small modules.

Warnings: the same five as before (`lib/api/public-fetch.ts` reaching the Edge instrumentation through `node:dns`, `node:http`, `node:https` and `node:net`). This work adds none.

## H. Deployment results

_Filled in after the push._

## I. Remaining issues and recommended actions

1. **Tighten `onepages` read access (SEC2, database).** The anon key can read every published row, including drafts and the archive. The app no longer depends on that read: the public signup reads with the server client, and the live page reads with the service role. Before dropping the dashboard's public-read policy, check the browser-side slug checks in the two onboarding modals, which read other users' rows. Then replace the policy with owner-only reads.
2. **Database guards (SEC1, SEC3).** Add a `BEFORE INSERT OR UPDATE` trigger on `onepages` that sets `seller_id` and `creator_id` from `owner_id`, and refuses a slug equal to another profile's username. The app is now safe without the trigger (SEC1), but other readers of those columns are not.
3. **Seal existing paid content (SEC2).** Rows saved before this deploy keep plain locked text until their next save. A one-off script, using the same `sealLocked` and the service key, can seal them now.
4. **DB-1 and F6.** Add `archived_blocks` to the repository's SQL, and a unique index on `onepage_leads (onepage_id, coalesce(block_id,''), lower(email))` after a deduplication pass.
5. **P-F1.** Paid access on storelib.me needs a storelib.com access page, or a signed grant handoff.
6. The remaining backlog items above, in order of severity.
