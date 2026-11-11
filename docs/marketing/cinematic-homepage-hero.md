# Cinematic homepage and showcase

The homepage keeps its existing navigation, marketplace and authentication routes, Bento grid and remaining sections. The rounded build showcase sits between the hero and Bento grid. No database, checkout or storage-policy change is required.

## Hero styling

`components/marketing/hero.tsx` owns scoped styling: smaller grain (`--hero-grain-opacity: .035`), a restrained creator badge, larger white headlines with a purple full stop, the previous e-commerce subheading, glass inputs with 16 px backdrop blur, and purple primary actions. The reassurance line was removed. Header background/shadow adjustments apply only while this homepage hero is present, preserving other pages and the light header setting.

`hero-headline.tsx` keeps “Build your” fixed and rotates the seven phrases every 2,000 ms. All phrases reserve one grid cell. A 460 ms upward reveal with a small scale/rotation provides subtle emphasis without bouncing or changing layout. Screen readers receive one stable H1. Motion stops offscreen, when hidden, under reduced motion, or through the pause control.

The mobile hero is content-driven with fixed vertical padding; it does not use `vh`, `dvh` or `svh` to determine its height. Browser toolbar expansion/collapse therefore cannot stretch it. Desktop copy is anchored to responsive padding rather than vertically recentered as streamed content arrives. Responsive safe-area padding remains. The pause control sits above the overlapping showcase and appears only once its interaction handlers are mounted.

## Signup and authenticated controls

`hero-cta.tsx` subscribes to the existing header-verified auth snapshot, without another authentication request:

- Mobile guest: optional email and purple “Start for free”, followed by the marketplace link.
- Desktop guest: purple “Start for free” beside marketplace search.
- Buyer: Account and marketplace search; no visible email input.
- Creator: Dashboard and marketplace search; no visible email input.

Mobile signup retains the existing native `/signup` GET, email prefill, `intent=sell`, Enter submission, native validation and accessible error message. Desktop links use the same seller signup intent. Search submits to the existing `/explore?q=…`. Control space is reserved so an auth-state update does not change hero height. No account or marketing consent is created by the hero itself.

## Media loading and recovery

`lib/marketing/hero-video.ts` contains the replacement MP4 ending `1794404095596918.mp4`, local poster path and desktop/mobile object positions. Only the supplied source is loaded; no alternate files were invented or substituted.

`hero-startup.ts` is a small inline bootstrap, emitted after the complete hero copy. It checks reduced-motion, reduced-data and save-data/2G settings before assigning the source, and starts the single native video while HTML parses, before the React bundle arrives. Preconnect establishes the supplied CDN connection early. `hero-video.tsx` adopts that same native element/frame during hydration without reloading it. The video starts at the beginning on a fresh page load. No clip sequencing is performed in JavaScript.

A decoded-frame callback reveals the video with a short 240 ms fade. Offscreen/hidden media pauses. Brief buffering keeps the current frame; a stall lasting four seconds restores the poster. Network/source failures receive at most two recovery attempts with delays, respecting visibility, motion/data settings and manual pause. An online event can resume an eligible pending recovery. Rejected autoplay and decoding failures do not loop retries. Timers/listeners are cleaned up; page controls never wait for media.

**The Supabase asset host is blocked from this execution environment (proxy 403).** Its actual transfer size, codecs, fast-start metadata, loop edit and playback could not be inspected, and no transcode was performed. The local neutral poster is still a fallback, not a claimed opening-frame still. A matching poster and mobile-specific encode require access to the supplied file. No implementation can guarantee a remote video's first decoded frame in the first millisecond on every network/device; this change removes the React startup wait and artificial long fade while preserving usable initial HTML and reduced-data safeguards.

## Rounded showcase

`components/marketing/build-showcase.tsx` renders “Build anything. Make it yours.” (five words), progressively filling its words as the card enters view. Passive scroll events schedule one animation frame to update only the showcase; they do not rerender the page. The rounded card rises slightly through a compositor transform, with no hidden server-rendered content.

The autoplay carousel reuses real, optimized Storelib demo screenshots for websites, OnePages, communities, the website builder and creator pages. Native horizontal scrolling supports touch swiping, trackpads and keyboard scrolling; pointer capture supports mouse dragging. Previous/next and pause controls are accessible. Duplicate decorative slides support continuous wrapping without duplicate network files. Images are lazy, decoded asynchronously, and reserve their dimensions. Autoplay pauses for mouse hover, focus, interaction, hidden/offscreen pages and reduced motion. Touch interactions cannot leave the carousel stuck in a synthetic hover state.

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
