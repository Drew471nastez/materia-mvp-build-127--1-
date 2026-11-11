# Cinematic homepage and showcase

The homepage keeps its existing navigation, marketplace and authentication routes, Bento grid and remaining sections. The white build showcase sits between the hero and Bento grid. No database, checkout or storage-policy change is required.

## Hero styling

`components/marketing/hero.tsx` owns scoped styling: fine grain (`--hero-grain-opacity: .03675`, 5% above the previous .035), a restrained creator badge, fluid white headlines with a matching white full stop, the subheading “Everything you need to create, sell, and grow your business. All in one place”, glass inputs with 16 px backdrop blur, and purple primary actions. Primary actions and inputs share one 12 px corner variable; input focus uses a subtle border/depth change rather than an outline. Desktop text is 5% smaller and hero minimum height 3% larger; mobile height remains content-driven. The reassurance line was removed. The homepage dark header overlays the video transparently at the top, then transitions to solid near-black over 320 ms as scrolling starts; Sell on Storelib remains available, while its vertical divider is hidden on the homepage. Desktop video tint is slightly lighter (.57 versus .60 on mobile). Header background/shadow adjustments apply only while this homepage hero is present, preserving other pages and the light header setting.

`hero-headline.tsx` keeps “Build your” fixed and rotates the seven phrases every 2,000 ms. All phrases reserve one grid cell. A 500 ms upward reveal with a small scale/rotation provides subtle emphasis without bouncing or changing layout. Screen readers receive one stable H1. Motion stops offscreen, when hidden, under reduced motion, or through the pause control.

The mobile hero is content-driven with fixed vertical padding; it does not use `vh`, `dvh` or `svh` to determine its height. Browser toolbar expansion/collapse therefore cannot stretch it. Desktop copy is anchored to responsive padding rather than vertically recentered as streamed content arrives. Responsive safe-area padding remains. The pause control sits above the following showcase and appears only once its interaction handlers are mounted.

## Signup and authenticated controls

`hero-cta.tsx` subscribes to the existing header-verified auth snapshot, without another authentication request:

- Mobile guest: optional email and purple “Start for free”, followed by the marketplace link.
- Desktop guest: purple “Start for free” beside marketplace search.
- Buyer: Account and marketplace search; no visible email input.
- Creator: Dashboard and marketplace search; no visible email input.

On phones the subheading uses two explicit centered lines with a 14–15 px fluid font and a 36–48 px gap beneath the headline. The mobile headline is slightly larger, while the showcase heading is modestly smaller on phones and desktop. Input border alpha is reduced at rest and focus.

Mobile signup retains the existing native `/signup` GET, email prefill, `intent=sell`, Enter submission, native validation and accessible error message. Desktop links use the same seller signup intent. Search submits to the existing `/explore?q=…`. Control space is reserved so an auth-state update does not change hero height. No account or marketing consent is created by the hero itself.

## Media loading and recovery

`lib/marketing/hero-video.ts` contains the replacement MP4 ending `1794404095596918.mp4`, local poster path and desktop/mobile object positions. Only the supplied source is loaded; no alternate files were invented or substituted.

`hero-startup.ts` is a small inline bootstrap, emitted after the complete hero copy. It checks reduced-motion, reduced-data and save-data/2G settings before assigning the source, and starts the single native video while HTML parses, before the React bundle arrives. Preconnect establishes the supplied CDN connection early. `hero-video.tsx` adopts that same native element/frame during hydration without reloading it. The video starts at the beginning on a fresh page load. No clip sequencing is performed in JavaScript.

A decoded-frame callback reveals the video immediately, without an additional opacity fade delaying its first visible frame. Offscreen/hidden media pauses. Brief buffering keeps the current frame; a stall lasting four seconds restores the poster. Network/source failures receive at most two recovery attempts with delays, respecting visibility, motion/data settings and manual pause. An online event can resume an eligible pending recovery. Rejected autoplay and decoding failures do not loop retries. Timers/listeners are cleaned up; page controls never wait for media.

**The Supabase asset host is blocked from this execution environment (proxy 403).** Its actual transfer size, codecs, fast-start metadata, loop edit and playback could not be inspected, and no transcode was performed. The local neutral poster is still a fallback, not a claimed opening-frame still. A matching poster and mobile-specific encode require access to the supplied file. No implementation can guarantee a remote video's first decoded frame in the first millisecond on every network/device; this change removes the React startup wait and artificial opacity fade while preserving usable initial HTML and reduced-data safeguards.

## White showcase

`components/marketing/build-showcase.tsx` renders “Build anything. Make it yours.” (five words), progressively filling its words as the section enters view. Passive scroll events schedule one animation frame to update only the showcase; they do not rerender the page. The heading and carousel rise slightly through compositor transforms, with no hidden server-rendered content.

The normal white section has no rounded outer card or negative overlap. Its heading and carousel share responsive side gutters (22 px on phones), so the default rail does not touch the viewport edges. The carousel reuses real, optimized Storelib demo screenshots for websites, OnePages, communities, the website builder and creator pages. Visible arrow/play/pause controls were removed.

`use-showcase-motion.ts` removes snap points that fought pointer movement. Mouse down captures the pointer and prevents native text dragging; frame-batched scroll writes follow it, with grab/grabbing cursor feedback. A 160 ms motion window, retaining samples by elapsed time rather than event count, determines release velocity, followed by time-based exponential deceleration. New input, capture cancellation, blur and hidden pages cancel momentum safely. Three copies support bidirectional wrapping without extra image downloads. Touch and trackpads retain native scrolling/inertia. Automatic movement pauses during interaction and resumes after eight seconds of inactivity (on the next four-second tick), including when pointer focus or hover remains on the rail. Keyboard focus after keyboard interaction, explicit Space pause, hidden/offscreen state and reduced motion still suppress autoplay; keyboard arrows browse and Space toggles automatic movement, with screen-reader instructions. Images are lazy, decoded asynchronously and reserve their dimensions.

Header marketing links now transition between text tones without pill/border backgrounds on Home and other marketing pages. Explore's header search separator and category/clear hover colors follow the dark search surface while preserving the light variant. These changes use the existing header/category components and routes.

The video also handles focus, pageshow/BFCache and page-resume events. It recalculates visibility, retries transient autoplay-policy rejection and ignores play promises rejected after the page was backgrounded. Intentional manual pause is preserved; a healthy source is not reloaded on tab return.

## Verification

```sh
CHROMIUM_PATH=/usr/bin/chromium PROBE_CSS=source node scripts/check-home-hero.mjs
pnpm test:push
pnpm lint
pnpm typecheck
pnpm build
```

The browser probe uses real server-rendered components and hydration. Only remote video delivery, viewer identity and navigation boundaries are fixtures; no real accounts or payments are created. A generated H.264 clip exercises native playback independently of the inaccessible production footage.

Coverage includes 320, 375, 390, 430, 768, 1024, 1440 and 1920 px, short mobile and landscape; the complete phrase cycle; stable heading/form rectangles; no horizontal overflow or measured CLS; native signup with/without JavaScript; desktop marketplace search; live guest/buyer/creator changes; repeated mobile viewport-height changes; glass input/header styling; scroll-filled words; carousel autoplay, dragging and pause; media buffering/recovery, data/motion preferences, rejected autoplay, and playback while the React bundle is blocked. Chromium checks do not imply physical Safari/iOS or Google-app verification.

The focused eight-suite selection includes home-hero, product-media, marketing-image-quality, pubperf-r48, sell-intent, header-buttons, header-flex and library-courses-ad5. The raw-HTML surface regression also passed. Lint retains one existing vendor-fixture warning. Full compiler/build outcomes and any production verification limits are stated in the task report; the TypeScript baseline is not changed.

Final task results: all ten viewport checks and the touch/coarse-pointer, auth, showcase and media-failure checks passed; all eight focused suites and the raw-HTML regression passed. Lint passed with the existing vendor warning. The full compiler reported 372 source diagnostics, the same as before this refinement, with no increases and none in the new hero/showcase modules. The homepage retains its existing PricingSection typing diagnostic. The production build failed only on Inter/Roboto Google Fonts downloads. The inaccessible supplied clip itself and physical Google-app/Safari playback remain unverified.

Latest refinement verification: ten responsive/short/landscape viewports passed, including full-width layout, input corners/focus, inertia/settling, native touch, dark search colors, and simulated tab restoration. Real header hover-in/out checks passed with `HEADER_ONLY=marketing` (the probe explicitly enables desktop mouse media capabilities). The eight focused suites passed; TypeScript remained at the same 372 existing diagnostics with no increases. The full legacy header fixture has older logo/auth assumptions and is not used as the authority for the new marketing hover checks. Production footage/poster access remains blocked as described above.

## Mobile scroll and playback recovery

The homepage's redundant `overflow-x-hidden` wrapper was removed. The hero uses `overflow: clip`, which does not create a nested scrolling container, and media/tint/grain/copy use nonnegative stacking levels. This reduces the conditions that cause stale compositor tiles and sticky-header/scroll-container problems in mobile WebKit. No viewport-height units determine mobile hero height.

The player resumes unsolicited native pauses and has a lightweight foreground watchdog. It samples playback progress every two seconds and attempts bounded recovery only when buffered data exists but the clock has stalled for at least 6.5 seconds. Slow buffering is not repeatedly reloaded. Manual pause, reduced motion/data, offscreen playback, and autoplay-policy restrictions remain respected; a later user gesture can retry a policy-blocked player. This does not promise uninterrupted playback without network/decoder support or claim physical-device verification.

The existing `BodyScrollRestorer` now distinguishes genuinely open/positioning overlays and finite exit animations from kept, closed/hidden portals. Infinite child spinners cannot keep a closed portal's orphaned lock alive. Recovery detects class-only interaction locks, preserves the current offset during in-place fixed-body cleanup, and leaves route-entry scroll restoration to navigation. It removes only recognized lock-only stylesheets: shared application styles that mention lock attributes survive cleanup. Focus/pageshow and overlay-state changes trigger guarded recovery; healthy pages receive no synthetic resize.

Verification added real mobile-header scroll-up/down and toolbar-height checks, menu open/close, two-line text/no-clipping at 320–430 px, open/positioning Select protection, closed portals with spinning children, exit-animation protection, class-only locks, stylesheet preservation, fixed-body offset restoration, native upward swiping, and unsolicited media-pause recovery. The expanded 12-suite selection passed. Full TypeScript diagnostics stayed at the same 372 existing errors; focused strict compilation covers the changed components. Supplied-media access and physical Safari/Google-app testing remain unavailable in this environment.

## White section and transparent header refinement

The final section direction replaces the earlier black rounded card: a normal white section follows the hero, with inset screenshots and independent scroll-driven heading/rail transforms. This removes the white corner wedges rather than hiding them with another overlapping panel. Headline punctuation inherits the surrounding text color. The desktop tint drops from .60 to .57; mobile readability remains unchanged. The existing header height is reserved inside the hero so its video extends behind the transparent dark header without moving the copy. Existing `data-scrolled` handling drives a 320 ms transition to solid, with reduced-motion transitions disabled. Other routes and the configured light header remain unchanged.

Regression coverage includes timed one- and two-second drags, release momentum across loop boundaries, automatic movement resuming while the pointer/focus remains on the rail, explicit Space pause, the white section and 22 px mobile rail inset, inherited punctuation color, and real desktop/mobile header overlay geometry, solid scroll state, seller link/divider, menu and bidirectional scrolling. The 12 focused suites, scoped strict compilation and lint passed (lint retains its existing vendor warning). Media checks use the generated local H.264 fixture; the original video still cannot be retrieved here for an opening-frame poster or encoding audit.

The final browser run passed all ten responsive/short/landscape viewports and the interaction, auth, touch, media-policy/failure, no-hydration, tab-return and signup checks. Real desktop marketing hover/header and mobile toolbar/menu/scroll checks also passed.
