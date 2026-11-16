/**
 * Landing round 8, rails: the showcase under the hero and the creators rail.
 *
 * The owner, after round 7:
 *   - The showcase's pull to swipe "doesn't initialize", on a phone and on a desktop, and needs "the whole drag too
 *     long". Make it like the creators rail: one engine for touch and mouse, a short flick is a card.
 *   - Keep the caption on hover exactly as it is.
 *   - On a phone a OnePage is a tall 9:16 card, like a short video; stores and websites stay 4:3.
 *   - A bolder, cleaner cover for Plainspace; the nail artist, the coffee subscription and the language club replaced.
 *   - "Storelib is for creators": full width, no fade, and smoother under the finger and the mouse.
 *
 * Measured in a browser by scripts/check-landing-r8-rails.mjs (CDP touch and mouse at 390 and 1440, 4x CPU).
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { BuildShowcase, SHOWCASE_EXAMPLES } from "@/components/marketing/build-showcase"
import { chooseShowcaseStop, glideEasing, SHOWCASE_AUTOPLAY, SHOWCASE_GESTURE } from "@/components/marketing/use-showcase-motion"
import { AXIS_SLOP, CREATORS_CSS } from "@/components/marketing/home/creators-carousel"

let failed = 0
let passed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `  (${JSON.stringify(detail)})`}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
/** The source without its comments: what runs. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const hook = code("components/marketing/use-showcase-motion.ts")
const showcase = read("components/marketing/build-showcase.tsx")
const css = showcase.slice(showcase.indexOf("const CSS = `"))
const phone = css.slice(css.indexOf("@media(max-width:767px)"))
const creators = code("components/marketing/home/creators-carousel.tsx")
/* Landing round 9: whose a gesture is (the rail's or the page's) moved to one file both rails share. */
const gesture = code("components/marketing/rail-gesture.ts")

console.log("\nThe showcase: one engine, touch and mouse, the creators rail's gesture")
check("no native scroller rail and no lib/ui/rail-motion: one startRail for every screen", !/startNative|RailMotion|scrollTo\(/.test(hook) && /const stop = startRail\(el, viewport, hooks\)/.test(hook))
/* Changed on purpose (landing round 9): the owner had to "pull, press and swipe much longer to initialize the swipe". 4px, and across only when clearly more across than down (1.2 times), in rail-gesture.ts. */
check("the axis is decided after 4px, across only when clearly more across than down, the same as the creators rail", (SHOWCASE_GESTURE.axisSlop as number) === 4 && SHOWCASE_GESTURE.axisSlop === AXIS_SLOP && /bindRailGesture\(el, \{/.test(hook) && /if \(Math\.hypot\(dx, dy\) < RAIL_AXIS\.slop\) return null/.test(gesture) && /Math\.abs\(dx\) > Math\.abs\(dy\) \* RAIL_AXIS\.ratio \? "x" : "y"/.test(gesture))
/* Changed on purpose (landing round 9): the same rule, in rail-gesture.ts. */
check("down is the page's: the rail lets go at once, and vertical pans are the browser's", /if \(d\.axis === "y"\) \{\s*end\(t, false\)\s*return false/.test(gesture) && /\.build-showcase-track\[data-rail-ready\] \{overflow:visible;touch-action:pan-y pinch-zoom/.test(css))
/* Changed on purpose (landing round 9): in rail-gesture.ts, for a mouse or a pen (a finger's touch events need no capture). */
// Changed on purpose (landing round 12): travel() says which road a move came by ("pointer" or "touch"): a finger is read from one road at a time (rail-gesture.ts).
check("pointer capture only once the rail has the gesture", /if \(travel\(e\.clientX, e\.clientY, e\.timeStamp, "pointer"\) && !was && !held\?\.finger\) \{\s*try \{\s*el\.setPointerCapture\(e\.pointerId\)/.test(gesture) && !/setPointerCapture/.test(hook))
/* Changed on purpose (landing round 9): the gesture hands the rail its dx from the point the axis was decided. */
check("1:1 from where the axis was decided, no jump for the slop", /d\.startX = x\s*d\.samples = \[\{ t, cx: x \}\]\s*h\.start\(\)/.test(gesture) && /h\.move\(x - d\.startX\)/.test(gesture) && /if \(drag\) drag\.fromX = x/.test(hook) && /x = resist\(drag\.fromX - dx\)/.test(hook))
check("drawn once a frame, only in a frame the pointer moved, as a transform", /if \(!paintFrame\) paintFrame = requestAnimationFrame\(paint\)/.test(hook) && /el\.style\.transform = `translate3d\(/.test(hook))
check("nothing reads layout while the rail moves: card places once per resize", (hook.match(/offsetLeft/g) ?? []).length === 2 && /resize\?\.observe\(viewport\)/.test(hook) && !/getBoundingClientRect/.test(hook))
/* Changed on purpose (landing round 9): on an iPhone a touch's pointer events come late and are cancelled when Safari thinks of scrolling, so a finger is read from touch and pointer events alike, whichever arrives first (the first move decides, an across move is cancelled, a down move never), a mouse from pointer events; the rail sees one gesture either way. */
check("the touch and the mouse end in the same path: one gesture, a finger from touch and pointer events, a mouse from pointer events", /el\.addEventListener\("touchstart", onTouchStart, \{ passive: true \}\)/.test(gesture) && /el\.addEventListener\("touchmove", onTouchMove, \{ passive: false \}\)/.test(gesture) && /el\.addEventListener\("pointerdown", onPointerDown\)/.test(gesture) && !/"touchstart"|"touchmove"|"mousedown"|"pointerdown"/.test(hook))
{
  const phoneStops = [0, 314, 520, 834, 1040, 1354]
  const desk = [0, 1296, 2592, 3888]
  check("a 60px flick moves one card on a phone", chooseShowcaseStop(60, 60, 900, phoneStops, 0) === 1)
  check("and one page of three from 768px", chooseShowcaseStop(60, 60, 900, desk, 0, 1) === 1)
  check("a slow pull of 20px is enough on a phone, 28px on a desktop", chooseShowcaseStop(20, 20, 0, phoneStops, 0) === 1 && chooseShowcaseStop(28, 28, 0, desk, 0, 1) === 1)
  check("a nudge settles back", chooseShowcaseStop(9, 9, 40, phoneStops, 0) === 0 && chooseShowcaseStop(10, 10, 0, desk, 0, 1) === 0)
  check("backwards the same", chooseShowcaseStop(254, -60, -900, phoneStops, 1) === 0)
  check("a hard throw on a phone carries through up to three cards, no further", chooseShowcaseStop(80, 80, 4000, phoneStops, 0) === 3)
  check("never past either end", chooseShowcaseStop(1400, 60, 4000, phoneStops, 5) === 5 && chooseShowcaseStop(-40, -40, -900, phoneStops, 0) === 0)
}
{
  const bez = (e: string) => e.match(/cubic-bezier\(([^)]+)\)/)![1].split(",").map(Number)
  const [x1, y1, , y2] = bez(glideEasing(254, 900, 440))
  check("the glide leaves at the hand's own speed and ends at rest, never past its card", Math.abs((y1 / x1) * (254 / 0.44) - 900) < 1 && y1 <= 1 && y2 === 1, { x1, y1 })
  check("the glide plays on the compositor (a Web Animation), its end written first so nothing flashes", /el\.animate\(\[\{ transform: `translate3d\(/.test(hook) && /x = to\s*paint\(\)\s*anim\.onfinish/.test(hook))
}
check("a sideways trackpad swipe or wheel moves it too, and is not the back gesture", /el\.addEventListener\("wheel", onWheel, \{ passive: false \}\)/.test(hook) && /if \(Math\.abs\(e\.deltaX\) <= Math\.abs\(e\.deltaY\)\) return\s*e\.preventDefault\(\)/.test(hook))
check("autoplay: a card every 4.2s, 5s after the reader's last input, a slow soft step, never into a held or moving rail", SHOWCASE_AUTOPLAY.intervalMs === 4200 && SHOWCASE_AUTOPLAY.idleMs === 5000 && SHOWCASE_AUTOPLAY.stepMs >= 800 && /if \(holding \|\| drag \|\| moving\(\) \|\| due > now\) return schedule/.test(hook))
check("autoplay only on screen, in a visible tab, with motion allowed", /const canPlay = \(\) => visible && !paused && !document\.hidden && !reduce\.matches/.test(hook))
check("arrow keys, Home and End move it; Space pauses autoplay", /e\.key === "ArrowRight" \? index \+ 1/.test(hook) && /e\.key === "Home" \? 0/.test(hook) && /if \(e\.key === " "\)/.test(hook))

console.log("\nThe showcase: the caption on hover, as it was")
/* Changed on purpose (landing round 11): the caption is a scrim over the card's bottom; on hover it fades in and its words rise. */
check("a mouse shows it on hover, never while dragging", /@media\(hover:hover\) and \(pointer:fine\)\{\.build-showcase-track:not\(\[data-dragging\]\) \.build-showcase-slide:hover figcaption\{opacity:1;transition-duration:480ms\}/.test(css))
/* Changed on purpose (landing round 11): no line under the picture any more; the caption is a fade over its bottom. */
check("the caption is laid over the picture's bottom, hidden until a hover", /\.build-showcase-slide figcaption \{position:absolute;[^}]*opacity:0;pointer-events:none;transition:opacity 420ms/.test(css))
check("dragging marks the rail, so the caption stays away under a moving pointer", /el\.dataset\.dragging = "true"/.test(hook) && /delete el\.dataset\.dragging/.test(hook))

console.log("\nThe showcase on a phone: OnePages their own shape, stores 4:3")
check("a store or website card is 4:3", /\.build-showcase-pic\{aspect-ratio:4\/3;border-radius:8px\}/.test(phone))
/* Changed on purpose (landing round 9): the owner: "Keep OnePages as they are". The card is the page's own 540 x 1056, as on a desktop, not cut to 9:16. */
/* Changed on purpose (landing round 11): "the OnePages should have the same height as the 4:3 images": still the page's own shape, 0.3835 of a 4:3 card's width, so as tall as one. */
check("a OnePage card is the page's own shape (540 x 1056), as tall as a 4:3 card", /\.build-showcase-slide\[data-format="portrait"\]\{flex-basis:calc\(var\(--showcase-card\)\*\.3835\);width:calc\(var\(--showcase-card\)\*\.3835\)\}/.test(phone) && /\.build-showcase-slide\[data-format="portrait"\] \.build-showcase-pic\{aspect-ratio:540\/1056\}/.test(phone) && !/aspect-ratio:9\/16/.test(css))
check("the cards stand on one top line", /\.build-showcase-track\{--showcase-gap:10px;gap:var\(--showcase-gap\);align-items:flex-start;/.test(phone))
check("the page fills its card from the top, no phone screen stood inside a card", /\.build-showcase-pic img\{object-position:50% 0\}/.test(phone) && !/left:27%;top:9%;width:46%/.test(phone))
check("desktop keeps its groups", /grid-template-columns:256fr 90fr 256fr/.test(css) && /\.build-showcase-slide\[data-format="portrait"\] \.build-showcase-pic \{aspect-ratio:540\/1056\}/.test(css))

console.log("\nThe showcase's pages")
const all = SHOWCASE_EXAMPLES.map((e) => `${e.src} ${e.label} ${e.alt}`).join(" ")
const html = renderToStaticMarkup(createElement(BuildShowcase))
check("the nail artist, the coffee subscription and the language club are gone, pictures too", !/nails by bea|northline|nordline|charla/i.test(all + showcase + html) && ["bea", "northline", "charla"].every((k) => !existsSync(`public/home/showcase/a-${k}.webp`)))
// Changed on purpose (landing round 12): the owner disliked Mara Lind; the bookings are Dami Okoro's, a barber, on the Night theme.
check("bookings, a 9:16 OnePage (Dami Okoro since round 12)", SHOWCASE_EXAMPLES.some((e) => e.src === "/home/showcase/a-dami.webp" && e.format === "portrait" && e.label === "Fill your bookings") && !SHOWCASE_EXAMPLES.some((e) => /mara/i.test(e.src + e.alt)))
check("Luca Brandt's Grade Club subscription with the Cine Tones LUT Pack", SHOWCASE_EXAMPLES.some((e) => e.src === "/home/showcase/a-luca.webp" && e.label === "Sell subscriptions" && /Cine Tones LUT Pack/.test(e.alt)))
/* Changed on purpose (landing round 11): the owner asked for the Storelib app photograph in Seed & Soil's place. */
check("the Storelib app photograph in the gardening community's place", SHOWCASE_EXAMPLES.some((e) => e.src === "/home/showcase/a-app.webp" && e.label === "The Storelib app") && !SHOWCASE_EXAMPLES.some((e) => /seedsoil/.test(e.src)))
// Changed on purpose (landing round 12): the owner disliked the black cover with its words; a photograph of a calm desk.
check("Plainspace's store under its cover photo", SHOWCASE_EXAMPLES.some((e) => e.src === "/home/showcase/a-plainspace.webp" && /cover photo of a calm desk/.test(e.alt) && !/black cover|One calm page/.test(e.alt)))
check("every picture is a webp at its size, under 120 KB", SHOWCASE_EXAMPLES.every((e) => existsSync(`public${e.src}`) && e.src.endsWith(".webp") && statSync(`public${e.src}`).size < 120_000))
check("twelve different pictures, captions three words at most", new Set(SHOWCASE_EXAMPLES.map((e) => e.src)).size === 12 && SHOWCASE_EXAMPLES.every((e) => e.label.split(/\s+/).length <= 3))
check("no banned names, words or em dashes", !/nadia brooks|the loop\b|lasalle|static bloom|wildcamp|enthusiasts|\bfans?\b/i.test(all) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(all) && !/—/.test(all))

console.log("\nStorelib is for creators: full width, no fade, nothing per frame")
check("the rail runs edge to edge at every width, with no mask", !/mask-image/.test(CREATORS_CSS) && !/\.cc-viewport,\.cc-viewport\{margin-inline/.test(CREATORS_CSS))
check("at rest its first card is on the content edge (the shared box's gutter)", /--cc-start:max\(var\(--cc-gutter\),calc\(\(100% - var\(--home-max,2020px\)\) \/ 2 \+ var\(--cc-gutter\)\)\)/.test(CREATORS_CSS) && /\.cc-track\{[^}]*padding:10px var\(--cc-start\) 8px/.test(CREATORS_CSS))
check("no frame loop: every leg of motion is a Web Animation (in, cruise, out, a throw, a nudge)", !/const frame = \(t: number\)/.test(creators) && ["in", "cruise", "out", "coast", "nudge"].every((k) => creators.includes(`play("${k}"`)) && /track\.animate\(/.test(creators))
check("the speeds join: in leaves at 0 and arrives at cruising, out the other way, a throw leaves at the finger's speed", /"cubic-bezier\(\.5,0,\.75,\.5\)"/.test(creators) && /"cubic-bezier\(\.25,\.5,\.5,1\)"/.test(creators) && /const x1 = Math\.min\(0\.33, 1 \/ slope\)/.test(creators))
check("the rail's place is read once when motion is taken back, never per frame", (creators.match(/getComputedStyle\(track\)/g) ?? []).length === 1 && /const halt = \(\) => \{/.test(creators))
check("the finger is drawn once a frame, only when it moved", /if \(!paintFrame\) paintFrame = requestAnimationFrame\(paint\)/.test(creators))
/* Changed on purpose (landing round 9): the lock is rail-gesture.ts's, 4px and a clear angle. */
check("round 7's axis lock is kept", (AXIS_SLOP as number) === 4 && /bindRailGesture\(viewport, \{/.test(creators) && /if \(d\.axis === "y"\)/.test(gesture) && CREATORS_CSS.includes("touch-action:pan-y"))
check("off screen or in a hidden tab whatever moves pauses", /if \(live\(\)\) motion\.anim\.play\(\)\s*else motion\.anim\.pause\(\)/.test(creators) && /document\.addEventListener\("visibilitychange", resume\)/.test(creators))

console.log("\nThe browser check")
const probe = read("scripts/check-landing-r8-rails.mjs")
check("touch and mouse, 390 and 1440, 4x CPU, vertical swipes", /Input\.dispatchTouchEvent/.test(probe) && /page\.mouse\.down/.test(probe) && /setCPUThrottlingRate", \{ rate: 4 \}/.test(probe) && /devices\["iPhone 13"\]/.test(probe) && /width: 1440/.test(probe))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
