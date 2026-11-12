# Cinematic homepage and editorial sections

The homepage retains its navigation, auth/search/signup routes, actual product sections, plan cards, FAQ interactions, and footer subscriptions. No database, checkout, or storage-policy change is required.

## Hero and header

`hero.tsx` owns scoped styling: fine grain (.03675), a small creator badge, a stable rotating white headline, the approved subheading, glass inputs, purple actions, and matching 12 px action/input corners. The hero has square bottom corners and a 5% larger desktop minimum height, with 32 px more vertical room in the content-driven mobile layout. Desktop video tint is .57; mobile remains .60. Input focus uses subtle depth; keyboard buttons keep accessible focus indicators.

The dark homepage header overlays the video transparently at the top and transitions to solid near-black over 320 ms on scroll. The existing header height is reserved in hero padding, so copy does not jump under it. “Sell on Storelib” and its divider are visible. Other routes and the configured light header remain unchanged.

Mobile height is content-driven, with fixed padding and safe areas rather than viewport-height units or height-based breakpoints. The centered subheading occupies two lines on phones. Positive media stacking, the removed redundant scrolling wrapper, and guarded orphaned-overlay repair preserve bidirectional mobile scrolling and menu behavior.

`hero-headline.tsx` rotates seven phrases every two seconds in a reserved grid cell, with one stable accessible H1. It pauses offscreen, in background tabs, under reduced motion, and on intentional pause.

`hero-cta.tsx` subscribes to the existing header-verified auth snapshot:

- Mobile guest: optional email, purple signup button, marketplace link.
- Desktop guest: signup beside native marketplace search.
- Buyer: Account and search; creator: Dashboard and search.

Native signup keeps seller intent, email prefill, Enter submission, validation, and no-JavaScript GET behavior. Space is reserved for auth changes. The hero creates no account or marketing consent itself.

## Editorial story

`StoryHeading` supplies common typography and word-by-word scroll filling for the showcase, Everything in one place, business dashboard, product categories, OnePage/store features, tools, pricing, FAQ, and final CTA. The showcase headline is “Everything you need to create, sell, and manage your business online.” It breaks after six words on desktop for two lines, and wraps naturally across up to four lines on narrow phones. This headline uses neutral gray and white, without purple accents. Browsing the gallery temporarily softens it to gray. Its badge is removed. Selected words fill purple; dark surfaces use lighter purple and white ink. Copy remains server-rendered and readable before JavaScript, with a single accessible heading label.

All headings share one passive scroll listener, one scheduled animation frame, and one IntersectionObserver. Only visible headings perform scroll work; geometry reads precede writes. Reduced motion immediately fills text and removes translations. Forced-colors mode uses system text colors.

Homepage sections share responsive gutters, larger editorial type, restrained badges, and coordinated white, pale gray, lavender, and dark violet surfaces. The footer uses a light treatment only when this homepage story exists. Pricing amounts, plan benefits, actions, and subscription controls retain their existing sources and behavior. Shared tools/FAQ/CTA components have an opt-in editorial prop, preserving their pricing-page presentation.

`LandingStory` observes section visibility, including dynamically imported sections, and pauses marked decorative loops offscreen and while the document is hidden. Existing globe visibility suspension remains in place. Reveal wrappers retain readable SSR content, animate upcoming sections once, and disconnect their observers after entering. Homepage reveals move vertically: offscreen horizontal translations previously widened the document at 320 px. Native page scrolling is preserved; no wheel interception or continuous page-scroll engine is introduced.

## Rounded showcase and settled Keen slides

The neutral black rounded section overlaps the square hero by just 12 px on phones and 20 px on desktop, with a fine border and subtle depth. It stays in normal page flow and does not create a modal focus trap. Increased top and bottom padding give the heading and gallery more space. Three desktop pages each contain a complete desktop–OnePage–desktop composition (nine real Storelib examples in total). All cards share the same height. OnePage frames retain their narrower portrait proportions. Within each desktop row, gaps are 16 px; mobile gaps are 12 px. On phones, the rail fills the viewport without inset gutters; wide frames are 1.6 times their height and portrait frames 0.63 times their height, preserving the same proportions as desktop. Adjacent cards remain visible. The landing container has a matching black backing behind the rounded top corners, preventing white wedges. Soft masks fade the rail edges; desktop row padding keeps resting screenshots clear of the fades.

All screenshots use `object-fit: contain` to preserve their full contents. Cards/images have 5 px corners and white captions over a bottom gradient instead of a gray caption bar. Content width is bounded on very large screens. The heading rises as it enters view; the gallery has a staggered card entrance using opacity, translation, and scale, without changing layout height. The gallery also follows scroll progress through the shared passive heading listener, rising and brightening as it enters. Reduced motion suppresses these entrances.

`use-showcase-motion.ts` uses Keen Slider 6.8.6, `useKeenSlider` with `mode: "snap"`, looping, and precision rendering. Desktop slides are whole three-card groups; mobile slides retain distinct wide/portrait widths at a common height. Dragging follows the pointer directly at sensitivity 1. Keen owns snapping and measured release velocity. The previous 8% release override, queued stop/restart, and long cosine slow-start curve are removed; native snapping decelerates immediately. Programmatic navigation uses a 600 ms cubic ease-out. Horizontal trackpad/Shift-wheel input advances one slide per gesture; vertical wheel and finger scrolling remain native, and pinch zoom is allowed. Native gallery scrolling remains available before hydration.

Autoplay rests on each slide for five seconds while at least half of the gallery is visible, then advances one complete slide. Interaction pauses autoplay, which resumes after at least eight seconds of inactivity. Explicit Space pause, keyboard interaction/focus, reduced motion, hidden documents, and offscreen state suppress autoplay. Arrow keys/Home browse. Clicking during a transition or returning after an offscreen interruption settles the gallery to a complete slide. Autoplay still rests for five seconds between transitions. No React state updates run on animation frames.

Playback updates now avoid redundant `play()` promises while already playing. The stall watchdog reuses IntersectionObserver visibility instead of forcing layout every two seconds; geometry is measured only when that observer is unavailable. Existing data/motion preferences, offscreen pause, retry limits, and mobile resume behavior remain. The signed video host still returns HTTP 403 from this workspace, preventing source inspection or re-encoding; no claim is made that its bytes or codec were optimized.

## Mobile geometry

`hero-geometry.ts` captures safe-area values while the server HTML parses, before media policy checks. Phone header padding and hero safe-area spacing stay fixed through toolbar/keyboard height-only changes. A real layout-width change rebuilds the snapshot; background tabs wait for visibility. Resize, focus, pageshow and visibility events adopt or refresh the snapshot. Owned CSS values and listeners are cleaned up. Native Capacitor header rules remain untouched.

The heading fill also retains a stable mobile viewport reference until width changes. Gallery height derives from width, captions are overlays, and Keen ignores window-height-only changes when its horizontal size stays unchanged. These avoid reflow/animation resets on a first browser-toolbar scroll. Mobile content height remains independent of viewport-height units.

## Media limitations and recovery

`hero-video.ts` names the supplied replacement MP4 ending `1794426925775466.mp4`. A tiny parsing-time bootstrap starts the one muted native video before React, honoring data/motion preferences. Hydration adopts its source/frame instead of restarting it. The first available decoded frame is revealed on loadeddata without waiting for playback or another frame callback. Autoplay policy rejection can retain an available still while leaving the video paused.

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

The hero probe uses actual SSR/hydration and generated H.264 delivery fixtures, testing ten responsive/short/landscape viewports, stable copy/auth layout, native signup/search, settled Keen group navigation, restrained mouse/touch dragging, resumed slide autoplay, horizontal wheel direction, native vertical wheel/finger scrolling, toolbar/safe-area changes, touch, media failure/policy recovery, tab return, and scroll-lock cleanup.

The story probe uses the real lower sections, SSR/hydration, FAQ, plan links, and footer at 320, 390, 768, 1440, and 1920 px. It checks complete desktop cards, contained screenshots, all shared headings, horizontal overflow throughout the page, offscreen motion, and reduced motion. Remote media delivery and WebGL are explicit fixture boundaries. Layout screenshots pause gallery movement through the public keyboard controls. Scroll fixture timings remain device-dependent; this does not benchmark production GPUs, physical Safari/Google apps, or promise 200 FPS. Performance depends on display refresh rate, hardware, and media.

The homepage dynamic-component props resolve the existing PricingSection JSX typing error. Before incorporating concurrent main changes, the full-project comparison went from 372 diagnostics to 371. A previous full-project check reported 376 repository diagnostics, with none in the files changed by that homepage work. This update passes the focused strict component check; it does not claim a clean full-project typecheck. The 12 focused regression suites and the repeated post-merge browser checks pass. Lint passes with the existing vendor-fixture warning. Previous production builds were blocked by Google Fonts downloads. A push to main does not independently confirm production deployment.
