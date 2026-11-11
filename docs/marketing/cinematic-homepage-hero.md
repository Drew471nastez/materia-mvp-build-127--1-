# Cinematic homepage hero

The homepage uses `components/marketing/hero.tsx`. Navigation, marketplace search on `/explore`, authentication, and sections below the hero are unchanged. The screenshot carousel, collage, typewriter, their timers, and unused hero CTA state/geometry modules were removed. `lib/marketing/hero-media.ts` and screenshot assets remain because alternatives pages use them.

## Composition and configuration

- `hero-headline.tsx` renders the exact seven phrases in one grid cell. The widest phrase reserves its width/height in the initial HTML. Only the second line changes, every 2,000 ms, with a 400 ms upward fade/reveal. Screen readers receive one stable H1.
- `hero-video.tsx` maintains one native muted/looping/inline video. It starts only after checking motion/data preferences. The poster remains behind it until the browser produces a decoded frame. Loading, autoplay rejection, and errors do not gate the copy or form.
- `lib/marketing/hero-video.ts` holds the supplied signed Supabase MP4 URL, local poster path, and independent desktop/mobile crop positions. No mobile alternate was supplied; no other video is fetched.
- `--hero-tint-opacity` and `--hero-grain-opacity` are scoped to the hero. Fine, static, original monochrome noise is a local ~19 KB PNG with no external licensing requirement. The bottom fade has no separate black strip.
- The local SVG poster is deliberately neutral. **The provided Supabase host could not be fetched from this execution environment (proxy 403; direct DNS unavailable). An opening-frame poster, the actual file's encoding/fast-start metadata, transfer size, remote playback, and loop edit could not be verified.** Replace `HERO_VIDEO.poster` with an optimized still extracted from the opening frame when that file can be retrieved. This implementation does not claim the neutral poster matches the footage.

## Signup and accessibility

`hero-cta.tsx` submits a native GET to the existing `/signup`, carrying `intent=sell` and an optional email. That page already supports email prefill and seller onboarding. Existing account creation, analytics and consent remain in that flow. Empty email works, invalid email is rejected by native validation with an associated accessible error, Enter submits, and the form works without JavaScript. No marketing opt-in is performed.

Controls have labels, visible focus, appropriate email autocomplete/input mode, and comfortable touch sizes. A small pause/resume control stops both the video and rotating phrases. Reduced motion keeps the initial phrase and poster. Reduced data/save-data/2G connections keep the poster. Background decoding and phrase timers pause while the hero is offscreen or the document is hidden.

Mobile uses stacked full-width signup controls, a fluid headline that fits at 320 px, independent crop position, safe-area spacing and `svh` minimum height. Content can grow on short/landscape screens instead of clipping.

## Verification

Run:

```sh
pnpm install --frozen-lockfile
CHROMIUM_PATH=/usr/bin/chromium PROBE_CSS=source node scripts/check-home-hero.mjs
pnpm test:push
pnpm lint
pnpm typecheck
pnpm build
```

The browser probe renders the actual hero on the server, hydrates it, and replaces only the remote video delivery and signup/marketplace navigation boundaries. It uses a generated H.264 MP4 to exercise native decoding, looping, delayed first frame, and failures; it never creates real accounts or substitutes production footage.

It covers 320, 375, 390, 430, 768, 1024, 1440 and 1920 px; a 375×568 short viewport; and 844×390 landscape. Assertions include the complete phrase cycle, stable heading/description/form rectangles, no overflow or measured layout shift, desktop/mobile form layout, pause/resume, offscreen pause, motion/data preferences, delayed/error/rejected playback, invalid/blank/encoded emails, Enter and no-JavaScript signup. Chromium checks are not a claim of physical Safari/iOS verification.

The focused regression selection also includes `home-hero`, `product-media`, `marketing-image-quality`, `pubperf-r48`, `sell-intent`, `header-buttons`, `header-flex`, and `library-courses-ad5`. See the task report for final command outcomes and environment limitations. No database migration is required.

### Task results

- All eight focused regression suites passed.
- Chromium responsive/media/signup checks passed at all ten viewports listed above, with zero measured CLS or hydration errors. A final run also checks fallback when IntersectionObserver is unavailable and offscreen pause/resume.
- `pnpm lint` passed with one existing unused-disable warning in the vendor fixture `tests/fixtures/materia-live/assets/tingle.min.js`. The repository ESLint configuration covers JavaScript, not TypeScript; TypeScript files are covered by the compiler/regression compilation instead.
- `pnpm typecheck` completed with 372 diagnostics in other existing source files, none in changed/new hero files. The baseline was not changed.
- `pnpm build` reached Turbopack and failed because Google Fonts could not supply Inter and Roboto. No font configuration or unrelated application code was changed to hide the network failure.
- Changes were based on the latest main (`9b3152eff`) in a separate worktree; older uncommitted OnePage work was not included. No SQL, storage policy or payment change is part of this homepage update.
