/**
 * Landing round 9, rails: the showcase under the hero and the creators rail.
 *
 * The owner, after round 8:
 *   - "When I swipe through it, it lags a lot", "I have to pull, press and swipe much longer to initialize the swipe",
 *     "it must not mistake scrolling down for swiping": one gesture file for both rails. A finger is read from touch
 *     events, the way is decided after 4px, across only when clearly more across than down, and a gesture going down
 *     is never cancelled.
 *   - "As I scroll down on mobile, the images appear very stutterish and too direct": files the size they are drawn
 *     at, two decoded at a time before the section arrives, each faded in once decoded, nothing shifting.
 *   - "Do not show OnePages as 4:3. Keep OnePages as they are and adapt all the stores and websites to fit a 4:3
 *     ratio": the phone's OnePage card is the page's own shape; every store, website and community has a 4:3 file.
 *   - The strength coach's picture replaced by something cleaner; Luca Brandt made again as a website, for 4:3 too.
 *   - A dot field on the dark ground that follows the mouse, at no cost when the mouse rests or the section is away.
 *   - Creators rail: the owner's photos for musicians, photographers and fitness, a very subtle grain on every card,
 *     a smooth swipe on a phone.
 *
 * Measured in a browser by scripts/check-landing-r9-rails.mjs (iPhone 13 in Chromium at 4x CPU and in WebKit).
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { BuildShowcase, SHOWCASE_EXAMPLES } from "@/components/marketing/build-showcase"
import { SHOWCASE_GESTURE } from "@/components/marketing/use-showcase-motion"
import { RAIL_AXIS, railAxis } from "@/components/marketing/rail-gesture"
import { SHOWCASE_FIELD } from "@/components/marketing/showcase-field"
import { AXIS_SLOP, CREATORS, CREATORS_CSS, CreatorsCarousel } from "@/components/marketing/home/creators-carousel"

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
/** A webp's own width and height, from its header. */
function webpSize(file: string) {
  const b = readFileSync(file)
  const kind = b.toString("ascii", 12, 16)
  if (kind === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) }
  if (kind === "VP8L") {
    const bits = b.readUInt32LE(21)
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 }
  }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff }
}
const gesture = code("components/marketing/rail-gesture.ts")
const hook = code("components/marketing/use-showcase-motion.ts")
const field = code("components/marketing/showcase-field.ts")
const showcase = read("components/marketing/build-showcase.tsx")
const css = showcase.slice(showcase.indexOf("const CSS = `"))
const phone = css.slice(css.indexOf("@media(max-width:767px)"))
const creators = code("components/marketing/home/creators-carousel.tsx")
const html = renderToStaticMarkup(createElement(BuildShowcase))

console.log("\nWhose a gesture is: the rail's or the page's")
check("the way is read after 4px, the same number for both rails", RAIL_AXIS.slop === 4 && SHOWCASE_GESTURE.axisSlop === RAIL_AXIS.slop && AXIS_SLOP === RAIL_AXIS.slop)
check("under 4px nothing is decided", railAxis(3, 0) === null && railAxis(2, 2) === null && railAxis(0, 3.9) === null)
check("level, and up to about 40 degrees from level, is the rail's", railAxis(4, 0) === "x" && railAxis(-9, 3) === "x" && railAxis(Math.cos((35 * Math.PI) / 180) * 10, Math.sin((35 * Math.PI) / 180) * 10) === "x")
check("a diagonal is the page's: across needs |dx| > |dy| * 1.2", RAIL_AXIS.ratio === 1.2 && railAxis(6, 6) === "y" && railAxis(6, 5.1) === "y" && railAxis(-7, 6) === "y" && railAxis(7.3, 6) === "x")
check("down is the page's", railAxis(0, 5) === "y" && railAxis(1, -12) === "y" && railAxis(Math.cos((60 * Math.PI) / 180) * 10, Math.sin((60 * Math.PI) / 180) * 10) === "y")
check("a finger is read from touch events: touchstart passive, touchmove not", /el\.addEventListener\("touchstart", onTouchStart, \{ passive: true \}\)/.test(gesture) && /el\.addEventListener\("touchmove", onTouchMove, \{ passive: false \}\)/.test(gesture))
// Changed on purpose (landing round 12): the touch road is named (rail-gesture.ts).
check("a touchmove is cancelled only once the gesture is the rail's, and only if it can be", /if \(travel\(t\.clientX, t\.clientY, e\.timeStamp, "touch"\) && e\.cancelable\) e\.preventDefault\(\)/.test(gesture) && (gesture.match(/preventDefault\(\)/g) ?? []).length === 3)
check("a gesture going down ends at once and travel says it is not the rail's (so nothing is cancelled)", /if \(d\.axis === "y"\) \{\s*end\(t, false\)\s*return false\s*\}/.test(gesture))
check("one decision a gesture: the axis is set once", (gesture.match(/d\.axis = /g) ?? []).length === 1 && /if \(!d\.axis\) \{\s*d\.axis = railAxis\(x - d\.startX, y - d\.startY\)/.test(gesture))
check("the rail follows from the point of the decision: no jump for the slop", /d\.startX = x\s*d\.samples = \[\{ t, cx: x \}\]\s*h\.start\(\)/.test(gesture) && /h\.move\(x - d\.startX\)/.test(gesture))
check("a finger is read by both roads, touch and pointer events, as one gesture: whichever moves first moves the rail (Chrome holds touchmoves for 15px, Safari can hold pointer events)", /if \(finger && held\.finger && held\.pointerId === null\) held\.pointerId = e\.pointerId/.test(gesture) && /const d = held && held\.finger && held\.touchId === null \? held : held \? null : begin\(true, t\.clientX, t\.clientY, e\.timeStamp\)/.test(gesture) && /if \(last && last\.cx === x && t - last\.t < 8\) return true/.test(gesture) && /if \(held\.finger && touchEvents && e\.type === "pointercancel"\) return/.test(gesture))
check("a second finger (a pinch) lets the rail go", /if \(e\.touches\.length > 1\) return held \? end\(e\.timeStamp, true\) : undefined/.test(gesture))
// Changed on purpose (landing round 12): travel() says which road a move came by ("pointer" or "touch"): a finger is read from one road at a time (rail-gesture.ts).
check("a mouse keeps the drag outside the rail (pointer capture), after the decision; a finger needs none", /if \(travel\(e\.clientX, e\.clientY, e\.timeStamp, "pointer"\) && !was && !held\?\.finger\) \{\s*try \{\s*el\.setPointerCapture\(e\.pointerId\)/.test(gesture))
check("the release speed is the pointer's over its last 90ms; one that rested 70ms throws nothing", RAIL_AXIS.velocityWindowMs === 90 && RAIL_AXIS.restMs === 70 && /t - b\.t <= RAIL_AXIS\.restMs/.test(gesture))
check("a click after a drag is swallowed", /if \(dragged\) suppressClick = true/.test(gesture) && /el\.addEventListener\("click", onClick, true\)/.test(gesture))
check("nothing in the gesture reads layout", !/getBoundingClientRect|offsetLeft|offsetWidth|getComputedStyle|clientWidth/.test(gesture))
check("both rails use it", /const gesture = bindRailGesture\(el, \{/.test(hook) && /const gesture = bindRailGesture\(viewport, \{/.test(creators) && (hook.match(/gesture\.destroy\(\)/g) ?? []).length === 1 && (creators.match(/gesture\.destroy\(\)/g) ?? []).length === 1)
check("and neither has pointer or touch listeners of its own", !/"pointerdown"|"pointermove"|"touchstart"|"touchmove"/.test(hook) && !/"pointerdown"|"pointermove"|"touchstart"|"touchmove"/.test(creators))
check("touch-action: pan-y on both rails", /\.build-showcase-track\[data-rail-ready\] \{overflow:visible;touch-action:pan-y pinch-zoom/.test(css) && /\.cc-viewport\{[^}]*touch-action:pan-y/.test(CREATORS_CSS))

console.log("\nWhat a drag costs on the showcase")
check("no mask over the moving rail", !/mask-image/.test(css))
check("no standing layer for each caption", !/figcaption\{will-change/.test(css) && (css.match(/will-change/g) ?? []).length === 1)
check("the rail no longer fades as a whole", !/\.build-showcase-track\[data-rail-ready\] \{opacity:0/.test(css))
check("one transform a frame, only in a frame the pointer moved", /x = resist\(drag\.fromX - dx\)\s*schedulePaint\(\)/.test(hook) && /if \(!paintFrame\) paintFrame = requestAnimationFrame\(paint\)/.test(hook))
/* Changed on purpose (landing round 11): the caption is a fade over the card's bottom (the owner), still shown only on a resting mouse, never while dragging. */
check("the hover caption: a scrim over the card's bottom, never while dragging", /@media\(hover:hover\) and \(pointer:fine\)\{\.build-showcase-track:not\(\[data-dragging\]\) \.build-showcase-slide:hover figcaption\{opacity:1;transition-duration:480ms\}/.test(css) && /\.build-showcase-slide figcaption \{position:absolute;[^}]*opacity:0;pointer-events:none;transition:opacity 420ms cubic-bezier\(\.33,0,\.2,1\)\}/.test(css))

console.log("\nThe showcase's pictures: the size drawn, decoded ahead, faded in")
const figures = html.match(/<figure[\s\S]*?<\/figure>/g) ?? []
const wides = SHOWCASE_EXAMPLES.filter((e) => e.format === "wide")
const talls = SHOWCASE_EXAMPLES.filter((e) => e.format === "portrait")
check("twelve cards: eight wide, four OnePages", figures.length === 12 && wides.length === 8 && talls.length === 4)
check("every picture has its size, decodes off the main thread and cannot be dragged", figures.every((f) => /<img [^>]*width="\d+"[^>]*height="\d+"/.test(f) && /decoding="async"/.test(f) && /draggable="false"/.test(f)))
check("the first two are in the first load at high priority, the other ten lazy", figures.slice(0, 2).every((f) => /loading="eager"/.test(f) && /fetchPriority="high"/i.test(f)) && figures.slice(2).every((f) => /loading="lazy"/.test(f) && !/fetchPriority="high"/i.test(f)))
check("a wide card: a 720 and a 1440 file for desktops", wides.every((e) => e.srcSet === `${e.src.replace(".webp", "-720.webp")} 720w, ${e.src} 1440w`) && (html.match(/sizes="\(min-width: 2020px\) 780px, 39vw"/g) ?? []).length === 8)
check("and for a phone its own 4:3 source, 640 and 960 wide, at 78vw", (html.match(/<source media="\(max-width: 767px\)" srcSet="\/home\/showcase\/m-[a-z]+-640\.webp 640w, \/home\/showcase\/m-[a-z]+-960\.webp 960w" sizes="78vw"/g) ?? []).length === 8)
check("a OnePage card: a 360 and a 540 file, and no phone source (one shape everywhere)", talls.every((e) => e.srcSet === `${e.src.replace(".webp", "-360.webp")} 360w, ${e.src} 540w` && !e.phoneSrcSet))
{
  const sizes: Record<string, { w: number; h: number }> = {}
  const size = (f: string) => (sizes[f] ??= existsSync(f) ? webpSize(f) : { w: 0, h: 0 })
  const brand = (e: { src: string }) => e.src.match(/a-([a-z]+)\.webp$/)![1]
  check("the desktop files are 1440 x 990 and 720 x 495", wides.every((e) => size(`public${e.src}`).w === 1440 && size(`public${e.src}`).h === 990 && size(`public/home/showcase/a-${brand(e)}-720.webp`).w === 720 && size(`public/home/showcase/a-${brand(e)}-720.webp`).h === 495))
  check("the phone files are 4:3 exactly: 960 x 720 and 640 x 480", wides.every((e) => size(`public/home/showcase/m-${brand(e)}-960.webp`).w === 960 && size(`public/home/showcase/m-${brand(e)}-960.webp`).h === 720 && size(`public/home/showcase/m-${brand(e)}-640.webp`).w === 640 && size(`public/home/showcase/m-${brand(e)}-640.webp`).h === 480))
  check("the OnePage files are 540 x 1056 and 360 x 704", talls.every((e) => size(`public${e.src}`).w === 540 && size(`public${e.src}`).h === 1056 && size(`public/home/showcase/a-${brand(e)}-360.webp`).w === 360 && size(`public/home/showcase/a-${brand(e)}-360.webp`).h === 704))
  const phoneBytes = [...wides.map((e) => `public/home/showcase/m-${brand(e)}-960.webp`), ...talls.map((e) => `public${e.src}`)].reduce((sum, f) => sum + statSync(f).size, 0)
  const before = SHOWCASE_EXAMPLES.reduce((sum, e) => sum + (existsSync(`public${e.src}`) ? statSync(`public${e.src}`).size : 0), 0)
  check("a 3x phone downloads under 520 KB for the twelve (it was the desktop files)", phoneBytes < 520_000 && phoneBytes < before * 0.75, { phoneBytes, before })
  /* 8 x 960 x 720 + 4 x 540 x 1056, against 8 x 1440 x 990 + 4 x 540 x 1056 */
  check("and decodes under 60% of the pixels", (8 * 960 * 720 + 4 * 540 * 1056) / (8 * 1440 * 990 + 4 * 540 * 1056) < 0.6)
  check("every file is under 120 KB", SHOWCASE_EXAMPLES.every((e) => statSync(`public${e.src}`).size < 120_000) && wides.every((e) => statSync(`public/home/showcase/m-${brand(e)}-960.webp`).size < 120_000))
}
/* Changed on purpose (landing round 11): "the images appear too abruptly": three at a time, from two screens ahead (SHOWCASE_PRELOAD). */
check("fetched and decoded three at a time, from two screens before the section arrives", /rootMargin: `\$\{SHOWCASE_PRELOAD\.marginPx\}px 0px`/.test(hook) && /SHOWCASE_PRELOAD = \{ marginPx: 1600, parallel: 3 \}/.test(hook) && /for \(let i = 0; i < SHOWCASE_PRELOAD\.parallel; i\+\+\) next\(\)/.test(hook) && /img\.decode\(\)\.then\(shown, shown\)/.test(hook))
check("not all twelve at once any more", !/for \(const img of el\.querySelectorAll<HTMLImageElement>\("img"\)\) \{\s*img\.loading = "eager"/.test(hook))
check("a picture is shown once decoded; one already there, without a fade", /img\.setAttribute\("data-shown", ""\)/.test(hook) && /if \(img\.complete && img\.naturalWidth > 0\) img\.setAttribute\("data-shown", "now"\)/.test(hook))
/* Changed on purpose (landing round 11): the arrival is an opacity and a 2.5% zoom settling (a transform inside the card's clip), slower, so nothing pops. */
check("the arrival is opacity and a small zoom settling, only once the script is there to show the picture", /\.build-showcase-track\[data-rail-ready\] \.build-showcase-pic img \{opacity:0;transform:scale\(1\.025\);transition:opacity 620ms cubic-bezier\(\.33,0,\.2,1\),transform 1100ms cubic-bezier\(\.22,1,\.36,1\)\}/.test(css) && /\.build-showcase-pic img\[data-shown\] \{opacity:1;transform:none\}/.test(css) && /img\[data-shown="now"\] \{transition:none\}/.test(css))
check("the card holds its shape and its ground meanwhile: nothing shifts", /\.build-showcase-pic \{display:block;position:relative;width:100%;aspect-ratio:1440\/990;[^}]*background:var\(--showcase-tone,#151517\);overflow:hidden\}/.test(css))
/* Changed on purpose (landing round 11): no zoom either. */
check("reduced motion: shown at once", /@media\(prefers-reduced-motion:reduce\)\{\.build-showcase-track\[data-rail-ready\] \.build-showcase-pic img\{opacity:1;transform:none;transition:none\}/.test(css))

console.log("\nShapes on a phone, and the two new pages")
check("a OnePage keeps the page's own shape, 540 x 1056, as on a desktop", /\.build-showcase-slide\[data-format="portrait"\] \.build-showcase-pic\{aspect-ratio:540\/1056\}/.test(phone) && !/9\/16/.test(css))
check("a store, website or community is 4:3", /\.build-showcase-pic\{aspect-ratio:4\/3;border-radius:8px\}/.test(phone))
check("the strength coach is gone, file too", !/hale|get strong|training program/i.test(SHOWCASE_EXAMPLES.map((e) => `${e.src} ${e.label} ${e.alt}`).join(" ")) && !existsSync("public/home/showcase/a-hale.webp"))
/* Changed on purpose (landing round 11): the owner did not like Studio Marlow; a travel creator's website in its place. */
// Changed on purpose (landing round 12): Ines Duarte moved to the last card, where Tideline was.
check("the interior stylist is gone; Ines Duarte, a travel creator's website, in its place", SHOWCASE_EXAMPLES[11].src === "/home/showcase/a-ines.webp" && SHOWCASE_EXAMPLES[11].label === "Sell travel guides" && !/marlow/i.test(SHOWCASE_EXAMPLES.map((e) => e.src + e.alt).join(" ")))
check("Luca Brandt is a website now, not a OnePage on a wide screen, with the shared LUT pack", SHOWCASE_EXAMPLES.some((e) => e.src === "/home/showcase/a-luca.webp" && e.format === "wide" && /website/.test(e.alt) && !/OnePage/.test(e.alt) && /Cine Tones LUT Pack/.test(e.alt) && /\$9 a month/.test(e.alt)))
check("captions three words at most, twelve different pictures", SHOWCASE_EXAMPLES.every((e) => e.label.split(/\s+/).length <= 3) && new Set(SHOWCASE_EXAMPLES.map((e) => e.src)).size === 12)
{
  const all = SHOWCASE_EXAMPLES.map((e) => `${e.label} ${e.alt}`).join(" ") + CREATORS.map((c) => `${c.name} ${c.kind} ${c.sells} ${c.alt}`).join(" ")
  check("no banned names, words or em dashes", !/nadia brooks|the loop\b|lasalle|nails by bea|nordline|charla|static bloom|maren holt|enthusiasts|\bfans?\b/i.test(all) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(all) && !/—/.test(all))
}

console.log("\nThe dot field behind the rail")
check("the still dots are one CSS background on the section, 5% white, every 28px", /\.build-showcase::before \{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background-image:radial-gradient\(circle at 1px 1px,rgba\(255,255,255,\.05\)[^}]*background-size:28px 28px\}/.test(css) && SHOWCASE_FIELD.gap === 28)
check("the content sits above them", /\.build-showcase-card \{position:relative;z-index:1;/.test(css) && /\.build-showcase-field \{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none\}/.test(css))
check("a canvas for the light under a mouse, hidden from readers", /<div class="build-showcase-field" aria-hidden="true"><canvas><\/canvas><\/div>/.test(html))
check("almost invisible: a lit dot is at most a fifth white", SHOWCASE_FIELD.peak <= 0.2 && /ctx\.globalAlpha = f\.peak \* lit \* near/.test(field))
check("only a mouse or a trackpad: a touch screen never sizes the canvas", /const hover = matchMedia\("\(hover: hover\) and \(pointer: fine\)"\)/.test(field) && /if \(!ctx \|\| !hover\.matches\) return/.test(field) && field.indexOf("if (!ctx || !hover.matches) return") < field.indexOf("canvas.width =") && /@media\(hover:none\),\(pointer:coarse\),\(prefers-reduced-motion:reduce\)\{\.build-showcase-field\{display:none\}\}/.test(css))
check("a small canvas moved by a transform, its pixel ratio capped at 2", SHOWCASE_FIELD.radius * 2 === 380 && /\.build-showcase-field canvas \{position:absolute;left:0;top:0;width:380px;height:380px\}/.test(css) && SHOWCASE_FIELD.maxDpr === 2 && /Math\.min\(window\.devicePixelRatio \|\| 1, f\.maxDpr\)/.test(field) && /canvas\.style\.transform = `translate3d\(/.test(field))
check("frames only while the light is catching up: a mouse at rest costs nothing", /if \(!settled && visible\) frame = requestAnimationFrame\(tick\)/.test(field) && /if \(!frame && visible && !reduce\.matches\) frame = requestAnimationFrame\(tick\)/.test(field))
check("off screen: no frames, the light out", /visible = entry\.isIntersecting\s*if \(visible\) return\s*cancelAnimationFrame\(frame\)/.test(field))
check("the section's place is read on entering and on resize, never per move", (field.match(/getBoundingClientRect/g) ?? []).length === 1 && /const onEnter = \(\) => place\(\)/.test(field) && /new ResizeObserver\(place\)/.test(field) && !/onMove[\s\S]{0,260}getBoundingClientRect/.test(field))
check("the mouse is listened to passively", /section\.addEventListener\("pointermove", onMove, \{ passive: true \}\)/.test(field))

console.log("\nStorelib is for creators")
const rail = renderToStaticMarkup(createElement(CreatorsCarousel))
const creator = (slug: string) => CREATORS.find((c) => c.slug === slug)!
check("the owner's photos: a man's portrait on orange, a photographer in silhouette, dumbbells in black and white", /orange/.test(creator("musicians").alt) && /silhouette/.test(creator("photographers").alt) && /dumbbell/.test(creator("fitness").alt) && /black and white/.test(creator("fitness").alt))
check("their names changed with them", creator("musicians").name === "Jules Arden" && creator("photographers").name === "Noa Price" && creator("fitness").name === "Cole Whitaker")
check("each at the sizes the card draws: 400 x 500 and 720 x 900 webp", ["musicians", "photographers", "fitness"].every((s) => webpSize(`public/home/creators/${s}-400.webp`).w === 400 && webpSize(`public/home/creators/${s}-400.webp`).h === 500 && webpSize(`public/home/creators/${s}-720.webp`).w === 720 && webpSize(`public/home/creators/${s}-720.webp`).h === 900 && statSync(`public/home/creators/${s}-720.webp`).size < 90_000))
check("a very subtle grain on every card: one shared tile, no filter, no blend mode", /\.cc-photo::after\{content:"";position:absolute;inset:0;background:url\(\/home\/creators\/grain\.webp\) 0 0\/96px 96px;opacity:\.55;pointer-events:none\}/.test(CREATORS_CSS) && !/filter:|mix-blend-mode|feTurbulence/.test(CREATORS_CSS))
check("the tile is 192px (two device px a grain on a 2x screen) and under 20 KB", webpSize("public/home/creators/grain.webp").w === 192 && statSync("public/home/creators/grain.webp").size < 20_000)
check("the shade and the words sit over the grain", /\.cc-shade,\.cc-meta\{z-index:1\}/.test(CREATORS_CSS))
/* Changed on purpose (landing round 11): "make sure the images are smooth and clean": three at a time from two screens ahead (CREATORS_PRELOAD), each shown once decoded. */
check("the photos are decoded ahead, three at a time, from two screens before the rail arrives", /track\.querySelectorAll<HTMLImageElement>\("li:not\(\[aria-hidden\]\) img"\)/.test(creators) && /img\.decode\(\)\.then\(done, done\)/.test(creators) && /\{ rootMargin: `\$\{CREATORS_PRELOAD\.marginPx\}px 0px` \}/.test(creators))
check("still lazy and sized in the markup", (rail.match(/<img class="cc-img"[^>]*loading="lazy"[^>]*>/g) ?? []).length === 24 && (rail.match(/width="400" height="500"/g) ?? []).length === 24)
check("on a phone only five of the second copy are kept: a third less to draw", /@media\(max-width:767px\)\{\.cc-card\[aria-hidden="true"\]:nth-child\(n\+18\)\{display:none\}\}/.test(CREATORS_CSS) && CREATORS.length === 12)
check("the finger leads 1:1, drawn once a frame", /x = drag\.fromX - dx\s*if \(!paintFrame\) paintFrame = requestAnimationFrame\(paint\)/.test(creators))
check("a throw coasts; a finger that only rested holds the rail a moment; the page's scroll holds nothing", /const heldStill = !dragged && axis === null && finger && !cancelled/.test(creators) && /holdUntil = dragged \|\| heldStill \? performance\.now\(\) \+ RESUME_AFTER_MS : performance\.now\(\)/.test(creators) && /if \(dragged && Math\.abs\(throwSpeed\) > 40 && live\(\)\) coast\(throwSpeed\)/.test(creators))

console.log("\nThe browser check and the suite list")
const probe = read("scripts/check-landing-r9-rails.mjs")
check("iPhone 13 in Chromium at 4x CPU with real touches, and in WebKit", /Input\.dispatchTouchEvent/.test(probe) && /setCPUThrottlingRate", \{ rate: 4 \}/.test(probe) && /pw\[engine\]\.launch\(\)/.test(probe) && /\["chromium", "webkit"\]/.test(probe) && /"iPhone 13"/.test(probe))
check("it measures the start, six angles, a long drag and the scroll in", /for \(const deg of \[0, 20, 35, 45, 60, 90\]\)/.test(probe) && /out\.startPx = first/.test(probe) && /layout-shift/.test(probe) && /window\.__prevented/.test(probe))
check("this suite runs on push, after round 8's", /"tests\/home-landing-r8-rails\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r9-rails\.test\.ts",/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
