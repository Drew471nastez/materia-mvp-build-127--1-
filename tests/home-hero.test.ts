/**
 * storelib.com's front page hero (round AA1): who the button is for, the
 * slider's geometry, the one file the pictures live in, and the copy.
 * scripts/check-home-hero.mjs measures the same hero in a browser.
 */
import { readCode, readSource } from "./_source"
import { HERO_CTA, heroCtaState } from "../lib/marketing/hero-cta-state"
import { STEP_NEAR, TURN_DEG, slidePose, wrap } from "../lib/marketing/hero-slider"
import { HERO_BACKDROP, HERO_SLIDES, HERO_SLIDE_RATIO } from "../lib/marketing/hero-media"
import { EMPTY_MS, FADE_MS, HERO_PHRASES, MAX_STEP_MS, letterAlpha, lettersStarted, phraseTimeline, restTime } from "../lib/marketing/hero-typing"
import { existsSync, statSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`) }
}

console.log("\nThe button, by who is looking")
check("signed out: Start Now, to /sell", heroCtaState(null) === "guest" && heroCtaState({ signedIn: false, isSeller: false }) === "guest" && HERO_CTA.guest.label === "Start Now" && HERO_CTA.guest.href === "/sell")
check("a buyer: Start Creating, to seller onboarding (/sell)", heroCtaState({ signedIn: true, isSeller: false }) === "buyer" && HERO_CTA.buyer.label === "Start Creating" && HERO_CTA.buyer.href === "/sell")
check("a creator: Dashboard, to /app", heroCtaState({ signedIn: true, isSeller: true }) === "creator" && HERO_CTA.creator.label === "Dashboard" && HERO_CTA.creator.href === "/app")
check("a stale seller flag without a session is still signed out", heroCtaState({ signedIn: false, isSeller: true }) === "guest")
const cta = readCode("components/marketing/hero-cta.tsx")
check("it reads the header's verified snapshot and follows it when corrected", /readAuthSnapshot\(\)/.test(cta) && /subscribeAuthSnapshot\(read\)/.test(cta) && /useLayoutEffect/.test(cta))
check("every label sits in one grid cell, so a late label moves nothing", /col-start-1 row-start-1/.test(cta) && /"invisible"/.test(cta))
check("the page reads no cookies, so it stays a CDN page", !/cookies\(|headers\(|createClient/.test(readCode("app/(marketing)/page.tsx") + readCode("components/marketing/hero.tsx")))

console.log("\nThe slider's geometry")
const centre = slidePose(0)
check("the centre slide is flat and full size", /rotateY\(0\.000deg\)/.test(centre.transform) && /scale\(1\.0000\)/.test(centre.transform) && centre.opacity === 1)
const left = slidePose(-1)
const right = slidePose(1)
check("neighbours are turned toward the centre: the left one by +, the right one by -", left.transform.includes(`rotateY(${TURN_DEG.toFixed(3)}deg)`) && right.transform.includes(`rotateY(${(-TURN_DEG).toFixed(3)}deg)`), [left.transform, right.transform])
check("and smaller, at the same distance either side", left.transform.includes(`* ${(-STEP_NEAR).toFixed(4)}`) && right.transform.includes(`* ${STEP_NEAR.toFixed(4)}`) && /scale\(0\.8500\)/.test(right.transform))
check("the centre is on top of its neighbours", centre.zIndex > right.zIndex && right.zIndex === left.zIndex)
check("far slides fade out before they wrap around", slidePose(2.3).opacity === 0 && slidePose(-2.3).opacity === 0)
check("only transform and opacity move: no width, left or top in the pose", Object.keys(centre).sort().join(",") === "opacity,transform,zIndex" && /^translate3d\(calc\(var\(--hc-w\)/.test(centre.transform))
check("the loop wraps to the shorter way round", wrap(5, 6) === -1 && wrap(-5, 6) === 1 && Math.abs(wrap(0.4, 6) - 0.4) < 1e-9)
const slider = readCode("components/marketing/hero-carousel.tsx")
check("autoplay stops off screen, in a hidden tab, under a mouse, while held and under reduced motion",
  /IntersectionObserver/.test(slider) && /visibilitychange/.test(slider) && /hovering/.test(slider) && /!drag/.test(slider) && /prefers-reduced-motion: reduce/.test(slider))
check("a drag captures the pointer, lets the page scroll vertically, and lands on a slide",
  /setPointerCapture/.test(slider) && /touch-action: pan-y/.test(readCode("components/marketing/hero.tsx")) && /Math\.round\(pos \+ v \* MOMENTUM_MS\)/.test(slider))
check("the first picture is priority, the others lazy", /priority=\{i === 0\}/.test(slider) && /loading=\{i === 0 \? undefined : "lazy"\}/.test(slider))

console.log("\nThe pictures, in one file")
check("every slide has alt text", HERO_SLIDES.length >= 5 && HERO_SLIDES.every((s) => s.alt.trim().length > 0))
check("a slide with no picture yet is a placeholder, never a broken image", HERO_SLIDES.every((s) => s.src === null || /^(\/|https:\/\/)/.test(s.src)))
check("slides are 16:10", HERO_SLIDE_RATIO === 1.6)
check("the backdrop is decoration: empty alt", HERO_BACKDROP.length > 0 && HERO_BACKDROP.every((t) => t.alt === ""))
check("neither client part lists its own pictures", !/\.webp|\.png|\.jpg/i.test(slider + readCode("components/marketing/hero.tsx")))
/* Round AB1: Storelib's own screens, made by scripts/hero-shots.mjs, every file named here present and small. */
const pictures = [...HERO_SLIDES, ...HERO_BACKDROP].map((s) => s.src).filter((s): s is string => !!s)
const files = [...new Set(pictures)].map((src) => join(process.cwd(), "public", src))
check("every picture named is a file under public/marketing/hero/", pictures.length === HERO_SLIDES.length + HERO_BACKDROP.length && files.every((f) => f.includes("/public/marketing/hero/") && existsSync(f)), files.filter((f) => !existsSync(f)))
const slideKb = HERO_SLIDES.map((s) => statSync(join(process.cwd(), "public", s.src as string)).size / 1024)
const tileKb = [...new Set(HERO_BACKDROP.map((s) => s.src as string))].map((src) => statSync(join(process.cwd(), "public", src)).size / 1024)
check("each slide under 60 KB and each backdrop tile under 16 KB", slideKb.every((k) => k < 60) && tileKb.every((k) => k < 16), { slides: slideKb.map((k) => k.toFixed(1)), tiles: tileKb.map((k) => k.toFixed(1)) })
check("no picture sits beside or above itself in the backdrop (6 and 8 columns)", HERO_BACKDROP.every((t, i) => (i % 8 === 0 || HERO_BACKDROP[i - 1].src !== t.src) && (i < 8 || HERO_BACKDROP[i - 8].src !== t.src) && (i < 6 || HERO_BACKDROP[i - 6].src !== t.src)))
const hero = readCode("components/marketing/hero.tsx")
check("the backdrop's tiles are lazy, low priority, decoded off the main thread", /loading="lazy"/.test(hero) && /fetchPriority="low"/.test(hero) && /decoding="async"/.test(hero))
check("the generator is the one that made them, from demo content only", /Juniper Studio/.test(readSource("scripts/render-hero-shots.tsx")) && /public\/marketing\/hero/.test(readSource("scripts/hero-shots.mjs")) && !/supabase\.co\/storage|storelib\.com\/media/.test(readCode("scripts/render-hero-shots.tsx") + readCode("scripts/hero-shots.mjs")))

console.log("\nThe typing (lib/marketing/hero-typing)")
check("four phrases, the first the one the page is served with", HERO_PHRASES.length === 4 && HERO_PHRASES[0] === "Build a business around your work.")
const tls = HERO_PHRASES.map((p, i) => phraseTimeline(p, i))
check("the cadence is the same on every visit", JSON.stringify(tls) === JSON.stringify(HERO_PHRASES.map((p, i) => phraseTimeline(p, i))))
const gaps = tls.flatMap((tl) => tl.reveal.slice(1).map((r, i) => r - tl.reveal[i]))
check("every letter 40 to 200ms after the one before: never a stall", gaps.every((g) => g >= 40 && g <= 200), { min: Math.min(...gaps), max: Math.max(...gaps) })
check("a letter fades in, from nothing to whole, over its own time", letterAlpha(tls[1], 3, tls[1].reveal[3]) === 0 && letterAlpha(tls[1], 3, tls[1].reveal[3] + FADE_MS / 2) > 0.5 && letterAlpha(tls[1], 3, tls[1].reveal[3] + FADE_MS) === 1)
check("held whole, then out from the last letter back", letterAlpha(tls[1], 0, tls[1].typed + 10) === 1 && letterAlpha(tls[1], tls[1].reveal.length - 1, tls[1].outStart + 120) < letterAlpha(tls[1], 0, tls[1].outStart + 120))
check("out of sight, it stops just before a word, never in one", tls.every((tl, p) => [0.2, 0.4, 0.55, 0.7, 0.9].every((f) => {
  const t = tl.typed * f
  const at = restTime(HERO_PHRASES[p], tl, t)
  const k = lettersStarted(tl, at)
  return at >= t && (k === 0 || k === HERO_PHRASES[p].length || HERO_PHRASES[p][k - 1] === " ")
})))
check("and finishes a fade out before stopping", restTime(HERO_PHRASES[2], tls[2], tls[2].outStart + 20) === tls[2].end - EMPTY_MS)
check("a frame after a long task moves the clock 48ms at most", MAX_STEP_MS === 48)
const typed = readCode("components/marketing/hero-typed-heading.tsx")
check("one requestAnimationFrame clock, no timers", /requestAnimationFrame\(frame\)/.test(typed) && !/setTimeout|setInterval/.test(typed) && /Math\.min\(MAX_STEP_MS/.test(typed))
check("a letter's opacity and blur only: nothing laid out per frame", /s\.opacity = /.test(typed) && /s\.filter = /.test(typed) && !/getBoundingClientRect\(\)[\s\S]{0,80}draw\(/.test(typed))
check("positions are read once per phrase, and again on resize or when the font arrives", /ResizeObserver\(\(\) => measure\(\)\)/.test(typed) && /fonts\?\.ready\.then\(\(\) => measure\(\)\)/.test(typed))
check("reduced motion: nothing runs", /prefers-reduced-motion: reduce\)"\)\.matches\) return/.test(typed))

console.log("\nThe copy")
const copy = [readSource("components/marketing/hero.tsx"), readSource("components/marketing/hero-typed-heading.tsx"), readSource("lib/marketing/hero-typing.ts"), readSource("lib/marketing/hero-cta-state.ts"), readSource("lib/marketing/hero-media.ts")].join("\n")
const badge = (hero.match(/data-hero-badge=""[\s\S]*?\/>\s*([^<{]+?)\s*<\/p>/) ?? [])[1] ?? ""
check("the badge: three words at most, no invented numbers", badge === "Built for creators" && badge.split(/\s+/).length <= 3 && !/Shopify|Powering|\d/.test(badge), badge)
check("none of the banned words", !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform your)\b/i.test(copy))
check("no em dashes", !/—/.test(copy))
check("the search goes to the marketplace's own search", /<form action="\/explore" method="get" role="search"/.test(copy) && /name="q"/.test(copy) && /Search marketplace \.\.\./.test(copy))
check("the heading's first phrase is the one in the server's HTML, and the heading's name", /HERO_PHRASES\[0\]\}<\/span>/.test(readSource("components/marketing/hero-typed-heading.tsx")) && /aria-label=\{HERO_PHRASES\[0\]/.test(hero))

console.log("\nThe owner's round AB1 asks, in the markup")
check("the search field is solid: an opaque background, no white/ alpha", /bg-\[#19191e\]/.test(hero) && !/bg-white\/\[/.test(hero))
check("no full width controls: the button and the search have their own widths", !/w-full max-w-\[340px\]/.test(hero) && /min-w-\[176px\]/.test(hero) && /w-\[272px\]/.test(hero))
check("on a phone the slider leaves the panel: to the screen's edges and across its bottom edge", /max-sm:-mx-2/.test(hero) && /--hc-overlap: calc\(var\(--hc-h\) \* 0\.46\)/.test(hero) && /marginBottom: "calc\(var\(--hc-overlap\) \* -1\)"/.test(hero) && /flow-root/.test(hero))
check("the entrance: CSS only, transform and opacity, under reduced motion none", /@keyframes hero-enter \{ from \{ opacity: 0; transform: translate3d\(0, 10px, 0\); \} \}/.test(hero) && /@media \(prefers-reduced-motion: no-preference\) \{\s*\[data-hero-enter\]/.test(hero))
check("the next section starts close under the hero on a phone", /data-home-after-hero="" className="pt-12 pb-20 sm:py-24/.test(readCode("components/marketing/bento-grid.tsx")))

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
