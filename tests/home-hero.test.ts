/**
 * storelib.com's front page hero (round AA1): who the button is for, the
 * slider's geometry, the one file the pictures live in, and the copy.
 * scripts/check-home-hero.mjs measures the same hero in a browser.
 */
import { readCode, readSource } from "./_source"
import { HERO_CTA, heroCtaState } from "../lib/marketing/hero-cta-state"
import { STEP_NEAR, TURN_DEG, slidePose, wrap } from "../lib/marketing/hero-slider"
import { HERO_BACKDROP, HERO_SLIDES, HERO_SLIDE_RATIO } from "../lib/marketing/hero-media"

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

console.log("\nThe copy")
const copy = [readSource("components/marketing/hero.tsx"), readSource("components/marketing/hero-typed-heading.tsx"), readSource("lib/marketing/hero-cta-state.ts"), readSource("lib/marketing/hero-media.ts")].join("\n")
check("no Shopify, no Powering, no invented numbers in the badge", !/Shopify|Powering|1,550/i.test(copy) && /Websites, stores and communities/.test(copy))
check("none of the banned words", !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform your)\b/i.test(copy))
check("no em dashes", !/—/.test(copy))
check("the search goes to the marketplace's own search", /<form action="\/explore" method="get" role="search"/.test(copy) && /name="q"/.test(copy) && /Search marketplace \.\.\./.test(copy))
check("the heading's first phrase is the one in the server's HTML", /HERO_PHRASES\[0\]\}<\/span>/.test(readSource("components/marketing/hero-typed-heading.tsx")) && /"Build a business around what you create\."/.test(copy))

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
