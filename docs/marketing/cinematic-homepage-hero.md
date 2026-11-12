# Cinematic homepage and editorial sections

The homepage retains its navigation, auth/search/signup routes, actual product sections, plan cards, FAQ interactions, and footer subscriptions. No database, checkout, or storage-policy change is required.

## Hero and header

`hero.tsx` owns scoped styling: fine grain (.03675), a small creator badge, a stable rotating white headline, the approved subheading, glass inputs, purple actions, and matching 12 px action/input corners. The hero now clips the video to rounded bottom corners (28–64 px). Desktop video tint is .57; mobile remains .60. Input focus uses subtle depth; keyboard buttons keep accessible focus indicators.

The dark homepage header overlays the video transparently at the top and transitions to solid near-black over 320 ms on scroll. The existing header height is reserved in hero padding, so copy does not jump under it. “Sell on Storelib” and its divider are visible. Other routes and the configured light header remain unchanged.

Mobile height is content-driven, with fixed padding and safe areas rather than viewport-height units or height-based breakpoints. The centered subheading occupies two lines on phones. Positive media stacking, the removed redundant scrolling wrapper, and guarded orphaned-overlay repair preserve bidirectional mobile scrolling and menu behavior.

`hero-headline.tsx` rotates seven phrases every two seconds in a reserved grid cell, with one stable accessible H1. It pauses offscreen, in background tabs, under reduced motion, and on intentional pause.

`hero-cta.tsx` subscribes to the existing header-verified auth snapshot:

- Mobile guest: optional email, purple signup button, marketplace link.
- Desktop guest: signup beside native marketplace search.
- Buyer: Account and search; creator: Dashboard and search.

Native signup keeps seller intent, email prefill, Enter submission, validation, and no-JavaScript GET behavior. Space is reserved for auth changes. The hero creates no account or marketing consent itself.

## Editorial story

`StoryHeading` supplies common typography and word-by-word scroll filling for the showcase, Everything in one place, business dashboard, product categories, OnePage/store features, tools, pricing, FAQ, and final CTA. The showcase headline has 15 words and names websites, products, and community. Selected words fill purple; dark surfaces use lighter purple and white ink. Copy remains server-rendered and readable before JavaScript, with a single accessible heading label.

All headings share one passive scroll listener, one scheduled animation frame, and one IntersectionObserver. Only visible headings perform scroll work; geometry reads precede writes. Reduced motion immediately fills text and removes translations. Forced-colors mode uses system text colors.

Homepage sections share responsive gutters, larger editorial type, restrained badges, and coordinated white, pale gray, lavender, and dark violet surfaces. The footer uses a light treatment only when this homepage story exists. Pricing amounts, plan benefits, actions, and subscription controls retain their existing sources and behavior. Shared tools/FAQ/CTA components have an opt-in editorial prop, preserving their pricing-page presentation.

`LandingStory` observes section visibility, including dynamically imported sections, and pauses marked decorative loops offscreen and while the document is hidden. Existing globe visibility suspension remains in place. Reveal wrappers retain readable SSR content, animate upcoming sections once, and disconnect their observers after entering. Homepage reveals move vertically: offscreen horizontal translations previously widened the document at 320 px. Native page scrolling is preserved; no wheel interception or continuous page-scroll engine is introduced.

## Mixed showcase cards

The white showcase alternates six real Storelib examples: wide store, portrait OnePage, wide community, portrait OnePage, wide editor, portrait OnePage. Wide media uses 16:10 framing and portrait media 9:16. Screenshots use `object-fit: contain`, retaining their complete source image; portrait source screenshots have padding within their taller frames. Three complete wide–portrait–wide cards fit on large desktops. Phones display a complete wide card and a neighboring preview. Images are local, lazy, async, and dimensioned.

`use-showcase-motion.ts` supports native touch/trackpad scrolling and pointer-captured mouse dragging. A 160 ms time-based sample determines release velocity, followed by exponential deceleration. The repeated group's actual offsets determine its length and next/previous card destinations; first-card width times count would misalign variable-width cards. Three repeated groups wrap bidirectionally. Cancellation, blur, resizing, visibility changes, and cleanup stop pending work safely.

Autoplay advances every four seconds when eligible and resumes after eight seconds of interaction inactivity on a subsequent tick. Hover or pointer focus cannot disable it indefinitely. Active gestures, intentional Space pause, keyboard interaction/focus, reduced motion, and hidden/offscreen state remain respected. Arrow keys browse and Space toggles autoplay, with accessible instructions.

## Media limitations and recovery

`hero-video.ts` names the supplied replacement MP4 ending `1794404095596918.mp4`. A tiny parsing-time bootstrap starts the one muted native video before React, honoring data/motion preferences. Hydration adopts its source/frame instead of restarting it. The first decoded frame is shown without an additional opacity fade.

Short buffering retains the current frame. Bounded network recovery and foreground buffered-clock stall detection recover eligible playback; manual pause, offscreen state, backgrounding, and autoplay policy remain respected. Focus/pageshow/BFCache handling retries transient policy rejection without restarting healthy playback.

The supplied asset host remains inaccessible from this environment (previous proxy 403; the latest request also could not connect). Its real codec, file size, fast-start metadata, loop edit, and playback cannot be audited here. The neutral local poster is not an opening-frame still. A matching poster and alternate encodes require the actual video. No remote video can be guaranteed to decode in the first millisecond on every network.

## Verification

```sh
CHROMIUM_PATH=/usr/bin/chromium PROBE_CSS=source node scripts/check-home-hero.mjs
CHROMIUM_PATH=/usr/bin/chromium PROBE_CSS=source node scripts/check-landing-story.mjs
CHROMIUM_PATH=/usr/bin/chromium PROBE_CSS=source HEADER_ONLY=marketing node scripts/check-header-states.mjs
CHROMIUM_PATH=/usr/bin/chromium PROBE_CSS=source HEADER_ONLY=mobile-scroll node scripts/check-header-states.mjs
pnpm lint
pnpm typecheck
```

The hero probe uses actual SSR/hydration and generated H.264 delivery fixtures, testing ten responsive/short/landscape viewports, stable copy/auth layout, native signup/search, variable-width dragging and momentum, resumed autoplay, touch, media failure/policy recovery, tab return, and scroll-lock cleanup.

The story probe uses the real lower sections, SSR/hydration, FAQ, plan links, and footer at 320, 390, 768, 1440, and 1920 px. It checks complete desktop cards, contained screenshots, all shared headings, horizontal overflow throughout the page, offscreen motion, and reduced motion. Remote media delivery and WebGL are explicit fixture boundaries. The measured scroll fixture's median/p95 frame interval was 16.7 ms; this does not benchmark production GPUs, physical Safari/Google apps, or promise 200 FPS. Performance depends on display refresh rate, hardware, and media.

The homepage dynamic-component props resolve the existing PricingSection JSX typing error. Before incorporating concurrent main changes, the full-project comparison went from 372 diagnostics to 371. After integrating current main, the full compiler reports 376 repository diagnostics, with none in the files changed by this homepage work; the focused new-component strict check passes. The 12 focused regression suites and the repeated post-merge browser checks pass. Lint passes with the existing vendor-fixture warning. Previous production builds were blocked by Google Fonts downloads. A push to main does not independently confirm production deployment.
