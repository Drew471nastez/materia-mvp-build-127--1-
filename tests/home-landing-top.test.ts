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
/* Changed on purpose (landing round 3): the owner did not want a cover with a photograph for the digital product; it is a LUT pack, shown as its frame and looks (tests/home-landing-top3). */
/* Changed on purpose (landing round 6): the pack is named without a count (the owner: "just LUT pack"). */
check("the digital product is a real one: a LUT pack with its looks", digital?.kind === "luts" && /class="ev-lut"/.test(html) && digital.name === "Cine Tones LUT Pack")
const course = EVERYTHING_SLIDES.find((s) => s.tab === "Course")
check("the course is a lesson on its video, not a camera", course?.kind === "course" && !/camera|manual/i.test(course.name) && /class="ev-p-lesson"/.test(html))
const community = EVERYTHING_SLIDES.find((s) => s.tab === "Community")
/* Changed on purpose (landing round 2): the community is its Storelib community page (components/community/member), not a photo. */
/* Changed on purpose (landing round 4): the owner asked for "a real looking community card", so the community is the card a Storelib community shows at the top of its left column (cover, name, address, Members, Online, Admins, faces). */
check("the community is a Storelib community card: cover, name, address, the three counts and faces", community?.kind === "community" && !/Inner Circle/.test(all) && /class="ev-cm-cover"/.test(html) && /class="ev-cm-stats"/.test(html) && /class="ev-cm-faces"/.test(html) && /\.ev-p-community\{[^}]*background:#fff\}/.test(css))
for (const s of EVERYTHING_SLIDES) check(`${s.tab}: its picture exists and is small`, existsSync(join(root, "public", s.img)) && statSync(join(root, "public", s.img)).size < 120 * 1024)
check("no purple gradients behind the products or the support thread", !/#a947a8|#7c3aed|#5b21b6|#c2417a|#a8326a|#7b3fc4|#4a3fbf/.test(css))

console.log("\n── make the work: the card leans when pressed ──")
check("under a mouse the white card leans with the pointer, on a spring, springing back on leave", /usePressTilt\(card\)/.test(src) && /ref=\{card\} className="ev-p-card"/.test(src) && /el\.addEventListener\("pointerenter", enter\)/.test(src) && /el\.addEventListener\("pointerleave", leave\)/.test(src) && /target\[0\] = target\[1\] = target\[2\] = 0/.test(src))
check("never on a touch screen or a pen without hover, never under reduced motion", /if \(e\.pointerType !== "mouse" \|\| !fine\.matches \|\| reduce\.matches\) return/.test(src) && /matchMedia\("\(hover: hover\) and \(pointer: fine\)"\)/.test(src) && /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/.test(src))
check("transform only, written once a frame, the frames stop when it settles, and nothing left behind", /el\.style\.transform = `rotateX\(/.test(src) && !/el\.style\.(?!transform|willChange)\w+ =/.test(src) && /raf = moving \? requestAnimationFrame\(step\) : 0/.test(src) && /el\.style\.transform = ""/.test(src) && !/addEventListener\(\s*["']scroll/.test(src))
check("the stage holds the centring and the perspective, the card only leans", /\.ev-p-stage\{[^}]*transform:translate\(-50%,-50%\);perspective:\d+px\}/.test(css) && !/\.ev-p-card\{[^}]*translate/.test(css))

console.log("\n── make the work: a store that looks like you ──")
/* Changed on purpose (landing round 6): the owner's reference picture replaced the creator pages, OnePages and community in the strip with merch stores and creators' link pages taking turns, tall cards that run off the picture's foot (tests/home-landing-r6-everything pins them). */
check("merch stores and link pages, each drawn whole in the markup, twice over", EVERYTHING_STORES.length >= 6 && (html.match(/class="ev-st ev-mc"/g) ?? []).length === EVERYTHING_STORES.filter((s) => s.kind === "merch").length * 2 && (html.match(/class="ev-st ev-lp"/g) ?? []).length === EVERYTHING_STORES.filter((s) => s.kind === "link").length * 2)
check("drawn at a phone's 390px and scaled", /--r:calc\(var\(--card-w\) \/ 390\)/.test(css))
check("every store picture is local, exists and is small", EVERYTHING_STORES.flatMap((st) => (st.kind === "merch" ? st.products.map((p) => p.src) : [st.ground, ...st.products])).every((u) => u.startsWith("/home/") && existsSync(join(root, "public", u)) && statSync(join(root, "public", u)).size < 120 * 1024))
/* Changed on purpose (landing round 4): the owner wants to drag the strip, so its drift is a Web Animation from script that a hand can take over (tests/home-landing-topa4). */
check("it drifts without a stop, on the compositor: one linear loop of transform", /el\.animate\(\[\{ transform: `translate3d/.test(src) && /iterations: Infinity, easing: "linear"/.test(src) && /class="ev-s-track"/.test(html))
check("it pauses off screen and stands still under reduced motion", /drift\.pause\(\)/.test(src) && /if \(drift \|\| drag \|\| loop <= 0 \|\| reduce\.matches\) return/.test(src))

console.log("\n── make the work: real support ──")
/* Changed on purpose (landing round 4): the owner wants the support card's UI as it was before round 2, without the From buyers / Storelib switch and its status pills: one thread at a time, photos and Storelib's mark. tests/home-landing-topa4 pins it. */
/* Changed on purpose (landing round 5): the owner asked to "get rid of the creators and Storelib" labels; a thread is headed by its subject alone. */
check("three requests: two to support, one from a buyer", EVERYTHING_SUPPORT.length === 3 && EVERYTHING_SUPPORT.filter((x) => x.replyAv === null).length === 2 && EVERYTHING_SUPPORT.filter((x) => x.replyAv !== null).length === 1)
check("no inbox switch", !/class="ev-c-tab/.test(html))
check("Storelib answers with its mark, the creator in the dark bubble", /StorelibLogo size=\{96\} alt="" fluid className="ev-c-av ev-c-logo"/.test(src) && /\.ev-c-dark\{background:#111113;color:#fff\}/.test(css))
check("the requests take turns by themselves on one CSS clock, paused off screen", /\.ev-c-thread\{[^}]*animation:ev-thread 30s/.test(css) && /\.ev\[data-platform-live="false"\] \.ev-loop/.test(css))
check("the thread compacts wherever the card is narrow, so it always fits", /\.ev-c\{[^}]*container-type:inline-size\}/.test(css) && /@container \(max-width:480px\)\{/.test(css))

console.log("\n── corners and small print ──")
/* Changed on purpose (landing round 4): the support thread is the card of before, at 16px. */
check("the section's cards and models are about a pixel tighter", /\.ev-vis\{[^}]*border-radius:17px/.test(css) && /\.ev-vis\{height:clamp\(320px,32vw,440px\);border-radius:19px\}/.test(css) && /\.ev-p-card\{[^}]*border-radius:17px/.test(css) && /\.ev-c-thread\{[^}]*border-radius:16px/.test(css))
check("the showcase's pictures too", /margin:0;border-radius:7px;contain:paint/.test(showcase) && /aspect-ratio:4\/3;border-radius:8px[;}]/.test(showcase)) /* Changed on purpose (landing round 6): the phone card is 4:3 with an 8px radius. */ /* Changed on purpose (landing round 5): the phone card also snaps (scroll-snap-align after the radius). */
check("no small print under the section: the grid is the last thing in it", /<\/article><\/div><\/div><\/section>$/.test(html) && !/<small/.test(html))

console.log("\n── words ──")
check("no fans in the section's words", !/\bfans?\b/i.test(text(html)) && EVERYTHING_CARDS.every((c) => !/\bfans?\b/i.test(c.lead + c.rest)))
check("no em dash and no banned words", !/—|\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(text(html)))

console.log("\n── the globe in development ──")
/* Changed on purpose (landing integration): the globe is the land-globe round's, which swaps a canvas already handed to a worker for a fresh one (its own way of doing what this round did with data-offscreen). */
check("a second effect run on the same canvas draws on a fresh one instead of throwing", /handedOver\.add\(canvas\)/.test(globe) && /if \(handedOver\.has\(canvas\)\) \{/.test(globe) && /canvas\.replaceWith\(fresh\)/.test(globe))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
