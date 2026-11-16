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
import { chooseShowcaseStop, glideEasing } from "@/components/marketing/use-showcase-motion"
import { SHOWCASE_MOTION } from "@/lib/ui/rail-motion"

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
/*
  Changed on purpose (landing round 8): the owner still found the showcase's swipe slow to start and long to drag, so it no
  longer runs on lib/ui/rail-motion: one engine in use-showcase-motion.ts, the creators rail's, for touch and mouse alike
  (tests/home-landing-r8-rails.test.ts). What this round asked for still holds: the hand holds the rail exactly, the glide
  leaves at the hand's speed and never passes its place, and a hard flick on a phone carries through up to three cards.
*/
check("the shared tuning is untouched: no glide, one step a gesture (the possibilities rail reads it)", SHOWCASE_MOTION.glideSettle === undefined && SHOWCASE_MOTION.swipeMaxSteps === undefined && SHOWCASE_MOTION.dragThreshold === 6 && SHOWCASE_MOTION.maxFlickVelocity === 6000)
/* Changed on purpose (landing round 9): the pointer is read in rail-gesture.ts, which hands the rail its dx. */
check("the hand holds the rail exactly, and autoplay is kept", /x = resist\(drag\.fromX - dx\)/.test(hook) && /SHOWCASE_AUTOPLAY\.intervalMs/.test(hook))
check("vertical swipes stay the page's, and the rail has the pointer events", /\.build-showcase-track\[data-rail-ready\] \{overflow:visible;touch-action:pan-y pinch-zoom/.test(showcase) && /bindRailGesture\(el, \{/.test(hook) && /"pointerdown", onPointerDown/.test(read("components/marketing/rail-gesture.ts")) && /setPointerCapture/.test(read("components/marketing/rail-gesture.ts")))
{
  const bez = (e: string) => e.match(/cubic-bezier\(([^)]+)\)/)![1].split(",").map(Number)
  const [x1, y1, , y2] = bez(glideEasing(1016, 400, 600))
  check("the glide leaves at the hand's own speed", Math.abs((y1 / x1) * (1016 / 0.6) - 400) < 1, { x1, y1 })
  check("and ends at rest on its place, never past it", y2 === 1 && y1 <= 1)
  const [hx1, hy1] = bez(glideEasing(300, 6000, 500))
  check("a very hard flick is matched without overshooting", hy1 <= 1 && hx1 > 0)
}
{
  const snaps = [0, 286, 392, 678, 784, 1070]
  const many = chooseShowcaseStop(60, 60, 3000, snaps, 0)
  const soft = chooseShowcaseStop(60, 60, 300, snaps, 0)
  const one = chooseShowcaseStop(60, 60, 3000, snaps, 0, 1)
  check("a hard flick on a phone carries through up to three cards, and no further", many > 1 && many <= 3, many)
  check("a soft swipe is one card", soft === 1, soft)
  check("from 768px a flick is one page", one === 1, one)
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
/* Changed on purpose (landing round 7): the AI Builders Masterclass card shows the next live session in place of the three counts. */
check("the community is a Storelib community card: cover, name, address, the next session and faces", community?.kind === "community" && !/Inner Circle/.test(all) && /class="ev-cm-cover"/.test(html) && /class="ev-cm-next"/.test(html) && /class="ev-cm-faces"/.test(html) && /\.ev-p-community\{[^}]*background:#fff\}/.test(css))
for (const s of EVERYTHING_SLIDES) check(`${s.tab}: its picture exists and is small`, existsSync(join(root, "public", s.img)) && statSync(join(root, "public", s.img)).size < 120 * 1024)
check("no purple gradients behind the products or the support thread", !/#a947a8|#7c3aed|#5b21b6|#c2417a|#a8326a|#7b3fc4|#4a3fbf/.test(css))

console.log("\n── make the work: the card leans when pressed ──")
check("under a mouse the white card leans with the pointer, on a spring, springing back on leave", /usePressTilt\(card\)/.test(src) && /ref=\{card\} className="ev-p-card"/.test(src) && /el\.addEventListener\("pointerenter", enter\)/.test(src) && /el\.addEventListener\("pointerleave", leave\)/.test(src) && /target\[0\] = target\[1\] = target\[2\] = 0/.test(src))
check("never on a touch screen or a pen without hover, never under reduced motion", /if \(e\.pointerType !== "mouse" \|\| !fine\.matches \|\| reduce\.matches\) return/.test(src) && /matchMedia\("\(hover: hover\) and \(pointer: fine\)"\)/.test(src) && /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/.test(src))
check("transform only, written once a frame, the frames stop when it settles, and nothing left behind", /el\.style\.transform = `rotateX\(/.test(src) && !/el\.style\.(?!transform|willChange)\w+ =/.test(src) && /raf = moving \? requestAnimationFrame\(step\) : 0/.test(src) && /el\.style\.transform = ""/.test(src) && !/addEventListener\(\s*["']scroll/.test(src))
/* Changed on purpose (landing round 7): the stage is also the card's size container. */
check("the stage holds the centring and the perspective, the card only leans", /\.ev-p-stage\{[^}]*transform:translate\(-50%,-50%\);perspective:\d+px;container-type:inline-size\}/.test(css) && !/\.ev-p-card\{[^}]*translate/.test(css))

console.log("\n── make the work: a store that looks like you ──")
/* Changed on purpose (landing round 6): the owner's reference picture replaced the creator pages, OnePages and community in the strip with merch stores and creators' link pages taking turns, tall cards that run off the picture's foot (tests/home-landing-r6-everything pins them). */
// Changed on purpose (landing round 14): each page is drawn once in the strip (it was twice over).
check("merch stores and link pages, each drawn whole in the markup, once", EVERYTHING_STORES.length >= 6 && (html.match(/class="ev-st ev-mc"/g) ?? []).length === EVERYTHING_STORES.filter((s) => s.kind === "merch").length && (html.match(/class="ev-st ev-lp"/g) ?? []).length === EVERYTHING_STORES.filter((s) => s.kind === "link").length)
check("drawn at a phone's 390px and scaled", /--r:calc\(var\(--card-w\) \/ 390\)/.test(css))
/* Changed on purpose (landing round 8): link pages carry their creator's photo, and a profile OnePage has one photo. */
check("every store picture is local, exists and is small", EVERYTHING_STORES.flatMap((st) => (st.kind === "merch" ? st.products.map((p) => p.src) : st.kind === "link" ? [st.ground, st.avatar, ...st.products] : st.kind === "product" ? [st.avatar, st.cover] : [])) /* Changed on purpose (landing round 14): Liam Bailey's product page brings his photo and cover; Satori Studio's picture is the showcase's own. */.every((u) => u.startsWith("/home/") && existsSync(join(root, "public", u)) && statSync(join(root, "public", u)).size < 120 * 1024))
/* Changed on purpose (landing round 4): the owner wants to drag the strip, so its drift is a Web Animation from script that a hand can take over (tests/home-landing-topa4). */
/* Changed on purpose (landing round 7): the keyframes are a plain string from 0. */
/* Changed on purpose (landing round 8): each page wraps round on its own, one compositor loop a page from one offset on the document's clock (tests/home-landing-r8-everything). */
check("it drifts without a stop, on the compositor: one linear loop of transform", /slot\.animate\(\s*\[\{ transform: `translate3d/.test(src) && /iterations: Infinity, easing: "linear"/.test(src) && /class="ev-s-track"/.test(html))
/* Changed on purpose (landing round 8): each page wraps round on its own, one compositor loop a page from one offset on the document's clock (tests/home-landing-r8-everything). */
check("it pauses off screen and stands still under reduced motion", /else stopDrift\(\)/.test(src) && /if \(drifting\(\) \|\| drag \|\| raf \|\| turn <= 0 \|\| reduce\.matches/.test(src))

console.log("\n── make the work: real support ──")
/* Changed on purpose (landing round 4): the owner wants the support card's UI as it was before round 2, without the From buyers / Storelib switch and its status pills: one thread at a time, photos and Storelib's mark. tests/home-landing-topa4 pins it. */
/* Changed on purpose (landing round 5): the owner asked to "get rid of the creators and Storelib" labels; a thread is headed by its subject alone. */
check("three requests: two to support, one from a buyer", EVERYTHING_SUPPORT.length === 3 && EVERYTHING_SUPPORT.filter((x) => x.replyAv === null).length === 2 && EVERYTHING_SUPPORT.filter((x) => x.replyAv !== null).length === 1)
check("no inbox switch", !/class="ev-c-tab/.test(html))
check("Storelib answers with its mark, the creator in the dark bubble", /StorelibLogo size=\{96\} alt="" fluid className="ev-c-av ev-c-logo"/.test(src) && /\.ev-c-dark\{background:#111113;color:#fff\}/.test(css))
// Changed on purpose (landing round 14): one thread plays at a time, moved on by Support's timer every 10s near the screen; each part plays once (tests/home-landing-r14-everything.test.ts).
check("the requests take turns by themselves, one at a time, paused off screen", /\.ev-c\[data-turning\] \.ev-c-thread\[data-on\]\{animation:ev-c-in/.test(css) && /\.ev\[data-platform-live="false"\] \.ev-loop/.test(css))
check("the thread compacts wherever the card is narrow, so it always fits", /\.ev-c\{[^}]*container-type:inline-size\}/.test(css) && /@container \(max-width:480px\)\{/.test(css))

console.log("\n── corners and small print ──")
/* Changed on purpose (landing round 4): the support thread is the card of before, at 16px. */
/* Changed on purpose (landing round 7): the pictures grow with the wider section (up to 620px tall) and the support thread is rounder on its new ground. */
check("the section's cards and models are about a pixel tighter", /\.ev-vis\{[^}]*border-radius:17px/.test(css) && /\.ev-vis\{height:clamp\(300px,min\(33vw,58svh\),620px\);border-radius:19px\}/.test(css) /* Changed on purpose (landing round 10): capped by the screen's height too. */ && /\.ev-p-card\{[^}]*border-radius:17px/.test(css) && /\.ev-c-thread\{[^}]*border-radius:18px/.test(css))
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
