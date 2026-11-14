/**
 * ===========================================================================
 *  HOME, LANDING ROUND: THE SHOWCASE UNDER THE HERO AND "MAKE THE WORK"
 * ===========================================================================
 * components/marketing/build-showcase.tsx (+ use-showcase-motion.ts, the
 * optional glide and momentum in lib/ui/rail-motion.ts) and
 * components/marketing/home/everything-in-one-place.tsx.
 *
 * The owner: pull to drag and swipe the showcase with the mouse and the
 * finger, butter smooth, autoplay kept; a calm community picture; the
 * Midnight Studio Tee on a light grey, rounded tile; a realistic digital
 * product instead of the Golden Hour preset box, and no Golden Hour preset
 * anywhere; a course picture that is not the camera; "Build a store that
 * looks like you" as a continuous carousel of real looking stores; less
 * "fans" in the copy.
 *
 * Second pass (the owner's second message): the stores drawn as real
 * Storelib creator pages in Storelib's own colour schemes, not invented
 * ones; the community as a calm Storelib community page; the white product
 * card leaning under the mouse as if pressed, springing back, never on a
 * touch screen or under reduced motion; the support card as the real
 * Support page, with a third request and the requests taking turns by
 * themselves (paused off screen); corners about a pixel tighter; no small
 * print under the section.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EverythingInOnePlace, EVERYTHING_CARDS, EVERYTHING_SLIDES, EVERYTHING_STORES, EVERYTHING_STYLES, EVERYTHING_SUPPORT } from "@/components/marketing/home/everything-in-one-place"
import { themePresets } from "@/lib/store-builder/defaults"
import { SHOWCASE_EXAMPLES } from "@/components/marketing/build-showcase"
import { SHOWCASE_RAIL } from "@/components/marketing/use-showcase-motion"
import { SHOWCASE_MOTION, chooseSwipeTarget, glideCurve } from "@/lib/ui/rail-motion"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ")
const showcase = read("components/marketing/build-showcase.tsx")
const hook = read("components/marketing/use-showcase-motion.ts")
const rail = read("lib/ui/rail-motion.ts")
const src = read("components/marketing/home/everything-in-one-place.tsx")
const globe = read("components/marketing/home/everything-globe.tsx")
const html = renderToStaticMarkup(createElement(EverythingInOnePlace))
const css = EVERYTHING_STYLES[0]?.css ?? ""

console.log("\n── the showcase: pull to drag and swipe, butter smooth ──")
check("the showcase rail runs on its own tuning, with the glide and momentum", /new RailMotion\(el, items, snaps, SHOWCASE_RAIL,/.test(hook) && !!SHOWCASE_RAIL.glideSettle && SHOWCASE_RAIL.swipeMaxSteps === 3)
check("the shared tuning is untouched: no glide, one step a gesture (the possibilities rail reads it)", SHOWCASE_MOTION.glideSettle === undefined && SHOWCASE_MOTION.swipeMaxSteps === undefined && SHOWCASE_MOTION.dragThreshold === 6 && SHOWCASE_MOTION.maxFlickVelocity === 6000)
check("the hand still holds the rail exactly, and autoplay is kept", SHOWCASE_RAIL.dragSensitivity === 1 && SHOWCASE_RAIL.autoplayStepMs > 0 && SHOWCASE_RAIL.autoplayIntervalMs > 0 && SHOWCASE_RAIL.compositor === true)
check("a release settles on the glide when it is configured", /if \(this\.config\.glideSettle\) \{\s*const g = glideCurve\(this\.x, to, limited, this\.config\.glideSettle\)/.test(rail))
check("vertical swipes stay the page's on a phone, and the rail has the pointer events", /\.build-showcase-track\[data-rail-ready\] \{overflow:visible;touch-action:pan-y pinch-zoom/.test(showcase) && /"pointerdown"/.test(rail) && /setPointerCapture/.test(rail))
{
  const g = SHOWCASE_RAIL.glideSettle!
  /* A whole desktop group (1316px) after a 300px pull released at 400px/s. */
  const from = 300
  const to = 1316
  const curve = glideCurve(from, to, 400, g)
  const xs: number[] = []
  for (let t = 0; t <= curve.duration; t += 1000 / 120) xs.push(curve.at(t))
  check("the glide starts where the hand let go and ends on the group", Math.abs(curve.at(0) - from) < 1e-9 && Math.abs(curve.at(curve.duration) - to) < 1e-9)
  check("it only ever moves forward and never passes its place (no overshoot, no bounce)", xs.every((x, i) => i === 0 || x >= xs[i - 1] - 1e-9) && Math.max(...xs) <= to + 1e-9)
  check("a whole group takes about half a second, not a long float", curve.duration >= 400 && curve.duration <= 560, curve.duration)
  const slope0 = (curve.at(1) - curve.at(0)) * 1000
  check("it leaves without a jolt: far under the old launch of half the spring's top speed", slope0 < 0.5 * Math.sqrt(360) * (to - from) * 0.4, Math.round(slope0))
  const fast = glideCurve(0, 900, 2400, g)
  const fastStart = (fast.at(0.5) - fast.at(0)) * 2000
  check("a flick is carried on at the hand's own speed (no jump either way)", Math.abs(fastStart - 2400) < 60, Math.round(fastStart))
  const huge = glideCurve(0, 300, 6000, g)
  const hugeXs = Array.from({ length: 200 }, (_, i) => huge.at((huge.duration * i) / 199))
  check("a very hard flick shortens the glide rather than passing its place", huge.duration < g.maxMs && Math.max(...hugeXs) <= 300 + 1e-9, huge.duration)
  const at60 = Array.from({ length: 30 }, (_, i) => curve.at(i * (1000 / 60)))
  const at120 = Array.from({ length: 30 }, (_, i) => curve.at(2 * i * (1000 / 120)))
  check("a function of time, the same at 60 and 120Hz", at60.every((x, i) => Math.abs(x - at120[i]) < 1e-9))
}
{
  const snaps = [0, 286, 392, 678, 784, 1070]
  const one = chooseSwipeTarget(0, 60, 3000, snaps, 0, SHOWCASE_MOTION)
  const many = chooseSwipeTarget(0, 60, 3000, snaps, 0, SHOWCASE_RAIL)
  const soft = chooseSwipeTarget(0, 60, 300, snaps, 0, SHOWCASE_RAIL)
  check("without momentum a flick is one step, as before", one === 286, one)
  check("with it a hard flick on a phone carries through up to three cards, and no further", many > 286 && many <= 678, many)
  check("a soft swipe is still one card", soft === 286, soft)
}
check("no showcase caption leans on fans", SHOWCASE_EXAMPLES.every((e) => !/\bfans?\b/i.test(e.label + " " + e.alt)))

console.log("\n── make the work: the four products ──")
const all = src + html
check("no Golden Hour preset anywhere in the section", !/golden hour/i.test(all) && !/presets\.webp/.test(all) && !existsSync(join(root, "public/home/everything/presets.webp")))
check("no preset box, gradient membership card or camera picture left behind", !/store-cam|store-album|ev-p-cut/.test(all) && !existsSync(join(root, "public/home/everything/store-cam.webp")))
const tee = EVERYTHING_SLIDES.find((s) => s.tab === "Merch")
/* Changed on purpose (landing round 2): every corner of the section about a pixel tighter, the tile 12px to 11px. */
check("the Midnight Studio Tee sits on a light grey, rounded tile", tee?.name === "Midnight Studio Tee" && tee.kind === "tee" && /\.ev-p-media\{[^}]*border-radius:11px;[^}]*background:#ededed[;}]/.test(css))
const digital = EVERYTHING_SLIDES.find((s) => s.tab === "Digital")
check("the digital product is a real one: a PDF guide with its cover", digital?.kind === "guide" && /class="ev-p-book"/.test(html) && /class="ev-p-book-title">Sourdough at Home</.test(html))
const course = EVERYTHING_SLIDES.find((s) => s.tab === "Course")
check("the course is a lesson on its video, not a camera", course?.kind === "course" && !/camera|manual/i.test(course.name) && /class="ev-p-lesson"/.test(html))
const community = EVERYTHING_SLIDES.find((s) => s.tab === "Community")
/* Changed on purpose (landing round 2): the community is its Storelib community page (components/community/member), not a photo. */
check("the community is a calm Storelib community page: top bar, places, composer and a post", community?.kind === "community" && !/Inner Circle/.test(all) && /<span class="ev-cm-tabs"><span data-on="">Community<\/span><span>Calendar<\/span><span>Members<\/span><span>About<\/span><\/span>/.test(html) && /Share something\.\.\./.test(html) && /class="ev-cm-post"/.test(html) && /\.ev-p-community\{[^}]*background:#f8f9fa\}/.test(css))
for (const s of EVERYTHING_SLIDES) check(`${s.tab}: its picture exists and is small`, existsSync(join(root, "public", s.img)) && statSync(join(root, "public", s.img)).size < 120 * 1024)
check("no purple gradients behind the products or the support thread", !/#a947a8|#7c3aed|#5b21b6|#c2417a|#a8326a|#7b3fc4|#4a3fbf/.test(css))

console.log("\n── make the work: the card leans when pressed ──")
check("under a mouse the white card leans with the pointer, on a spring, springing back on leave", /usePressTilt\(card\)/.test(src) && /ref=\{card\} className="ev-p-card"/.test(src) && /el\.addEventListener\("pointerenter", enter\)/.test(src) && /el\.addEventListener\("pointerleave", leave\)/.test(src) && /target\[0\] = target\[1\] = target\[2\] = 0/.test(src))
check("never on a touch screen or a pen without hover, never under reduced motion", /if \(e\.pointerType !== "mouse" \|\| !fine\.matches \|\| reduce\.matches\) return/.test(src) && /matchMedia\("\(hover: hover\) and \(pointer: fine\)"\)/.test(src) && /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/.test(src))
check("transform only, written once a frame, the frames stop when it settles, and nothing left behind", /el\.style\.transform = `rotateX\(/.test(src) && !/el\.style\.(?!transform|willChange)\w+ =/.test(src) && /raf = moving \? requestAnimationFrame\(step\) : 0/.test(src) && /el\.style\.transform = ""/.test(src) && !/addEventListener\(\s*["']scroll/.test(src))
check("the stage holds the centring and the perspective, the card only leans", /\.ev-p-stage\{[^}]*transform:translate\(-50%,-50%\);perspective:\d+px\}/.test(css) && !/\.ev-p-card\{[^}]*translate/.test(css))

console.log("\n── make the work: a store that looks like you ──")
const storeCss = (scheme: string) => (scheme === "default" ? css.match(/\.ev-st\{[^}]*\}/)?.[0] : css.match(new RegExp(`\\.ev-st-${scheme}\\{[^}]*\\}`))?.[0]) ?? ""
check("six stores, each a real Storelib creator page's layout (subscribe bar, cover, photo, name, handle, bio, social, tabs, Featured)", EVERYTHING_STORES.length >= 5 && (html.match(/class="ev-st ev-st-/g) ?? []).length === EVERYTHING_STORES.length * 2 && /<span class="ev-st-tabs"><span data-on="">Home<\/span><span>Products<\/span><span>Communities<\/span><\/span>/.test(html) && /<span class="ev-st-bar"><img class="ev-st-bar-av"[^>]*><span class="ev-st-email">Your email<\/span><span class="ev-st-sub">Subscribe<\/span><\/span><img class="ev-st-cover"[^>]*><img class="ev-st-av"[^>]*><span class="ev-st-name">/.test(html) && (html.match(/class="ev-st-social"/g) ?? []).length === EVERYTHING_STORES.length * 2 && (html.match(/<span class="ev-st-h">Featured<\/span>/g) ?? []).length === EVERYTHING_STORES.length * 2)
check("in Storelib's own colour schemes: each store's ground is its themePresets background", EVERYTHING_STORES.every((st) => { const bg = themePresets[st.scheme].colors.background.toLowerCase(); return storeCss(st.scheme).toLowerCase().includes(`--bg:${bg}`) }), EVERYTHING_STORES.map((st) => [st.scheme, themePresets[st.scheme].colors.background]))
check("at least four different schemes, light and dark", new Set(EVERYTHING_STORES.map((st) => st.scheme)).size >= 4 && EVERYTHING_STORES.some((st) => st.scheme === "astrid"))
check("the product card is the explore card: a 16:9 cover, the title with its category badge, the price", /\.ev-st-img\{[^}]*aspect-ratio:16\/9/.test(css) && (html.match(/<span class="ev-st-row"><span class="ev-st-pn">[^<]+<\/span><span class="ev-st-badge">(Physical|Digital|Course|Community)<\/span><\/span><span class="ev-st-pp">\$[\d.,]+(\/month)?<\/span>/g) ?? []).length === EVERYTHING_STORES.length * 4 && /\.ev-st-grid\{[^}]*grid-template-columns:1fr 1fr/.test(css))
check("drawn at a phone's 390px and scaled: the photo is the small size (124px) straddling the cover", /--r:calc\(\(var\(--slot\) - 12px\) \/ 390\)/.test(css) && /\.ev-st-av\{width:calc\(124 \* var\(--r\)\);height:calc\(124 \* var\(--r\)\);margin-top:calc\(-62 \* var\(--r\)\)/.test(css))
check("every store picture is local, exists and is small", EVERYTHING_STORES.every((st) => [st.cover, st.avatar, ...st.products.map((p) => p.src)].every((u) => u.startsWith("/home/") && existsSync(join(root, "public", u)) && statSync(join(root, "public", u)).size < 120 * 1024)))
check("it drifts without a stop, on the compositor: one linear loop of transform", /\.ev-s-track\{[^}]*animation:ev-stores \d+s linear infinite\}/.test(css) && /@keyframes ev-stores\{from\{transform:translate3d\(0,0,0\)\}to\{transform:translate3d\(-50%,0,0\)\}\}/.test(css) && /class="ev-s-track ev-loop"/.test(html))
check("it pauses off screen and stands still under reduced motion", /\.ev\[data-platform-live="false"\] \.ev-loop/.test(css) && /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*\.ev-loop,[^{]*\{animation:none !important\}/.test(css))

console.log("\n── make the work: real support ──")
const realStatuses = [...read("lib/support/tickets.ts").matchAll(/return tt\("([^"]+)"\)/g), ...read("lib/support/cases.ts").matchAll(/return tt\("([^"]+)"\)/g)].map((m) => m[1])
check("three requests: two to Storelib, one from a buyer (one more than before)", EVERYTHING_SUPPORT.length === 3 && EVERYTHING_SUPPORT.filter((x) => x.inbox === "storelib").length === 2 && EVERYTHING_SUPPORT.filter((x) => x.inbox === "buyers").length === 1)
check("the Support page's two inboxes, as buttons that work", /<button type="button" class="ev-c-tab" aria-pressed="false"><span>From buyers<\/span><\/button><button type="button" class="ev-c-tab" aria-pressed="true" data-on="">/.test(html) || /class="ev-c-tab"[^>]*><span>From buyers<\/span>/.test(html) && /class="ev-c-tab"[^>]*><span>Storelib<\/span>/.test(html))
check("every status pill is one the Support page really shows", EVERYTHING_SUPPORT.every((x) => x.pill.every((p) => realStatuses.includes(p.label))), EVERYTHING_SUPPORT.map((x) => x.pill.map((p) => p.label)))
check("the creator is \"You\" in the dark bubble on the right, Storelib is \"Storelib support\"", EVERYTHING_SUPPORT.every((x) => [x.ask, x.answer].every((m) => (m.who === "You") === m.mine)) && /Storelib support/.test(html) && /\.ev-c-mine \.ev-c-b\{[^}]*background:#1a1a2e/.test(css))
check("the requests take turns by themselves: a CSS clock, paused off screen, never under reduced motion", /<span class="ev-c-clock ev-loop" aria-hidden="true"><\/span>/.test(html) && /key=\{active\} className="ev-c-clock ev-loop" aria-hidden="true" onAnimationEnd=\{next\}/.test(src) && /\.ev-c-clock\{[^}]*animation:ev-clock \d+s linear both\}/.test(css))
check("one thread at a time, stacked in one cell (the box never changes height), the leaving one gone before the next rises", /\.ev-c-stack\{display:grid/.test(css) && /\.ev-c-thread\{grid-area:1\/1;/.test(css) && /\.ev-c-thread\[data-on\]\{opacity:1;transform:none;transition:opacity \.6s ease \.3s/.test(css))
check("the thread compacts wherever the card is narrow, so it always fits", /\.ev-c\{[^}]*container-type:inline-size\}/.test(css) && /@container \(max-width:560px\)\{/.test(css))

console.log("\n── corners and small print ──")
check("the section's cards and models are about a pixel tighter", /\.ev-vis\{[^}]*border-radius:17px/.test(css) && /\.ev-vis\{height:clamp\(320px,32vw,440px\);border-radius:19px\}/.test(css) && /\.ev-p-card\{[^}]*border-radius:17px/.test(css) && /\.ev-c-thread\{[^}]*border-radius:15px/.test(css))
check("the showcase's pictures too", /margin:0;border-radius:7px;contain:paint/.test(showcase) && /aspect-ratio:auto;border-radius:5px\}/.test(showcase))
check("no small print under the section: the grid is the last thing in it", /<\/article><\/div><\/div><\/section>$/.test(html) && !/<small/.test(html))

console.log("\n── words ──")
check("no fans in the section's words", !/\bfans?\b/i.test(text(html)) && EVERYTHING_CARDS.every((c) => !/\bfans?\b/i.test(c.lead + c.rest)))
check("no em dash and no banned words", !/—|\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(text(html)))

console.log("\n── the globe in development ──")
/* Changed on purpose (landing integration): the globe is the land-globe round's, which swaps a canvas already handed to a worker for a fresh one (its own way of doing what this round did with data-offscreen). */
check("a second effect run on the same canvas draws on a fresh one instead of throwing", /handedOver\.add\(canvas\)/.test(globe) && /if \(handedOver\.has\(canvas\)\) \{/.test(globe) && /canvas\.replaceWith\(fresh\)/.test(globe))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
