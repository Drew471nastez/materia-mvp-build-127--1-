/**
 * Landing round 11, rails: the showcase under the hero and the creators rail.
 *
 * The owner, after round 10:
 *   - Showcase cards: Studio Marlow out (a travel creator's website in), The Strength Room as a 4:3 community in
 *     Pinch Grip Club's place, loudlib (their own sample pack store) in The Long Draft's, their own Tideline picture
 *     in Second Shift's, a new OnePage (a podcast, Off the Clock) in Kai Moreno's, the Storelib app photograph in
 *     Seed & Soil's, and Gia Romano on a real OnePage theme with the hero layout (Sunset).
 *   - "On hover over the cards, the text should not be under the card": a bottom fade over the card with the words.
 *   - "On mobile, the OnePages should have the same height as the 4:3 images."
 *   - "The images appear too abruptly and glitchy": decoded further ahead, each eased in.
 *   - Creators rail: images smooth and clean; "with touch, when I put my finger on it, it glitches": a press pauses
 *     the running animation before reading where the rail is, so nothing moves under the finger.
 *
 * Measured in a browser by scripts/check-landing-r11-rails.mjs (iPhone 13 with CDP touches, and 1440 with a mouse).
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { BuildShowcase, SHOWCASE_EXAMPLES } from "@/components/marketing/build-showcase"
import { SHOWCASE_PRELOAD } from "@/components/marketing/use-showcase-motion"
import { CREATORS_CSS, CREATORS_PRELOAD, CreatorsCarousel } from "@/components/marketing/home/creators-carousel"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"

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
/* A webp's own size, from its header (VP8, VP8L or VP8X). */
function webpSize(file: string) {
  const b = readFileSync(file)
  const kind = b.toString("ascii", 12, 16)
  if (kind === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff }
  if (kind === "VP8L") {
    const v = b.readUInt32LE(21)
    return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }
  }
  return { w: (b.readUIntLE(24, 3) & 0xffffff) + 1, h: (b.readUIntLE(27, 3) & 0xffffff) + 1 }
}
const src = read("components/marketing/build-showcase.tsx")
const css = src.slice(src.indexOf("const CSS = `"))
const phone = css.slice(css.indexOf("@media(max-width:767px)"))
const hook = read("components/marketing/use-showcase-motion.ts")
const creators = read("components/marketing/home/creators-carousel.tsx")
const html = renderToStaticMarkup(createElement(BuildShowcase))
const all = SHOWCASE_EXAMPLES.map((e) => `${e.src} ${e.label} ${e.alt}`).join(" ")
const brand = (e: { src: string }) => e.src.match(/a-([a-z]+)\.webp$/)![1]

console.log("\nThe showcase's cards, the owner's picks")
check("twelve cards, wide, OnePage, wide, in four groups", SHOWCASE_EXAMPLES.length === 12 && SHOWCASE_EXAMPLES.every((e, i) => e.format === (i % 3 === 1 ? "portrait" : "wide")))
check("the order", SHOWCASE_EXAMPLES.map(brand).join(",") === "plainspace,satori,app,ines,gia,strength,loud,otc,nightshift,luca,mara,tideline", SHOWCASE_EXAMPLES.map(brand))
check("gone: Studio Marlow, Pinch Grip Club, The Long Draft, Second Shift, Kai Moreno, Seed & Soil (and their files)", !/marlow|pinch grip|pinchgrip|long draft|a-draft|second shift|a-shift|kai moreno|a-kai|seed & soil|seedsoil/i.test(all) && ["marlow", "pinchgrip", "draft", "shift", "kai", "seedsoil"].every((b) => !existsSync(`public/home/showcase/a-${b}.webp`)))
check("none of the round's banned names", !/Nadia Brooks|The Loop|LaSalle|Nails by Bea|Nordline|Charla Circle|Static Bloom|Maren Holt|enthusiasts|ceramics/i.test(all + src))
check("The Strength Room is a wide (4:3 on a phone) card", SHOWCASE_EXAMPLES.some((e) => brand(e) === "strength" && e.format === "wide" && /The Strength Room/.test(e.alt)))
check("loudlib, the owner's sample pack store, is a wide card", SHOWCASE_EXAMPLES.some((e) => brand(e) === "loud" && e.format === "wide" && /loudlib/.test(e.alt) && e.label === "Sell sample packs"))
check("Tideline's merch store, with a caption for what it shows", SHOWCASE_EXAMPLES.some((e) => brand(e) === "tideline" && e.label === "Drop new merch" && /Hoodie/.test(e.alt) && /Cap/.test(e.alt)))
check("a new OnePage, a podcast's, in the photographer's place", SHOWCASE_EXAMPLES.some((e) => brand(e) === "otc" && e.format === "portrait" && /Off the Clock/.test(e.alt) && /Pop theme/.test(e.alt)))
check("the Storelib app photograph (Run your business from anywhere) as a card", SHOWCASE_EXAMPLES.some((e) => brand(e) === "app" && e.label === "The Storelib app"))
const sunset = THEME_TEMPLATES.find((t) => t.id === "sunset") as unknown as { profile_layout?: string; theme_config: { header_layout?: string } } | undefined
check("Gia Romano on a real OnePage theme with a hero layout: Sunset", !!sunset && sunset.profile_layout === "hero" && sunset.theme_config.header_layout === "hero" && SHOWCASE_EXAMPLES.some((e) => brand(e) === "gia" && /Sunset theme/.test(e.alt) && e.tone === "#8f3b28"))
check("captions three words at most, no banned words, no em dash", SHOWCASE_EXAMPLES.every((e) => e.label.split(/\s+/).length <= 3) && !/unlock|elevate|seamless|powerful|effortlessly|supercharge|transform|—/i.test(all))

console.log("\nThe files: the sizes drawn, small")
const wides = SHOWCASE_EXAMPLES.filter((e) => e.format === "wide")
const talls = SHOWCASE_EXAMPLES.filter((e) => e.format === "portrait")
check("desktop 1440 x 990 and 720 x 495", wides.every((e) => { const a = webpSize(`public${e.src}`), b = webpSize(`public/home/showcase/a-${brand(e)}-720.webp`); return a.w === 1440 && a.h === 990 && b.w === 720 && b.h === 495 }))
check("phone 4:3: 960 x 720 and 640 x 480", wides.every((e) => { const a = webpSize(`public/home/showcase/m-${brand(e)}-960.webp`), b = webpSize(`public/home/showcase/m-${brand(e)}-640.webp`); return a.w === 960 && a.h === 720 && b.w === 640 && b.h === 480 }))
check("OnePages 540 x 1056 and 360 x 704", talls.every((e) => { const a = webpSize(`public${e.src}`), b = webpSize(`public/home/showcase/a-${brand(e)}-360.webp`); return a.w === 540 && a.h === 1056 && b.w === 360 && b.h === 704 }))
const files = [...wides.flatMap((e) => [`public${e.src}`, `public/home/showcase/a-${brand(e)}-720.webp`, `public/home/showcase/m-${brand(e)}-960.webp`, `public/home/showcase/m-${brand(e)}-640.webp`]), ...talls.flatMap((e) => [`public${e.src}`, `public/home/showcase/a-${brand(e)}-360.webp`])]
check("every file under 120 KB", files.every((f) => statSync(f).size < 120_000), files.filter((f) => statSync(f).size >= 120_000))
const phoneBytes = [...wides.map((e) => `public/home/showcase/m-${brand(e)}-640.webp`), ...talls.map((e) => `public/home/showcase/a-${brand(e)}-360.webp`)].reduce((s, f) => s + statSync(f).size, 0)
check("a 2x phone fetches the twelve in under 400 KB", phoneBytes < 400_000, phoneBytes)

console.log("\nThe caption: a fade over the bottom of the card")
check("in the figure, after the picture, its words in a span", (html.match(/<\/picture><figcaption><span>[^<]+<\/span><\/figcaption><\/figure>/g) ?? []).length === 12)
check("laid over the picture's bottom with a gradient scrim, taking no room", /\.build-showcase-slide figcaption \{position:absolute;left:0;right:0;bottom:0;z-index:1;[^}]*background:linear-gradient\(to top,rgba\(5,5,6,\.84\)/.test(css))
check("with a mouse: hidden, then on a resting hover it fades in and its words rise (opacity and transform only)", /figcaption \{[^}]*opacity:0;pointer-events:none;transition:opacity 420ms/.test(css) && /figcaption span \{[^}]*transform:translate3d\(0,8px,0\);transition:transform 560ms/.test(css) && /:hover figcaption\{opacity:1;transition-duration:480ms\}[^}]*:hover figcaption span\{transform:none\}/.test(css))
check("never while the rail is dragged", /\.build-showcase-track:not\(\[data-dragging\]\) \.build-showcase-slide:hover figcaption\{/.test(css))
check("on a touch screen it is always there", /@media\(hover:none\),\(pointer:coarse\)\{\.build-showcase-slide figcaption\{opacity:1;transition:none\}/.test(css))
check("nothing under the picture any more: the figure is the picture's height", !/figcaption \{height:44px/.test(css) && !/figcaption\{height:38px/.test(phone))

console.log("\nOn a phone a OnePage is as tall as a 4:3 card")
check("0.75 * 540 / 1056 = 0.3835 of a card's width", Math.abs(0.75 * 540 / 1056 - 0.3835) < 0.0002 && /\.build-showcase-slide\[data-format="portrait"\]\{flex-basis:calc\(var\(--showcase-card\)\*\.3835\);width:calc\(var\(--showcase-card\)\*\.3835\)\}/.test(phone))
check("still the page's own shape", /\.build-showcase-slide\[data-format="portrait"\] \.build-showcase-pic\{aspect-ratio:540\/1056\}/.test(phone))

console.log("\nThe pictures arrive smoothly")
check("showcase: decoded from two screens ahead, three at a time", SHOWCASE_PRELOAD.marginPx >= 1600 && SHOWCASE_PRELOAD.parallel === 3 && /rootMargin: `\$\{SHOWCASE_PRELOAD\.marginPx\}px 0px`/.test(hook))
check("showcase: shown once decoded, opacity and a small zoom settling, inside the card's clip", /img \{opacity:0;transform:scale\(1\.025\);transition:opacity 620ms/.test(css) && /img\[data-shown\] \{opacity:1;transform:none\}/.test(css) && /\.build-showcase-pic \{[^}]*overflow:hidden\}/.test(css))
check("creators: decoded from two screens ahead, three at a time", CREATORS_PRELOAD.marginPx >= 1600 && CREATORS_PRELOAD.parallel === 3)
check("creators: a photo and its copy shown once decoded, easing in; one already there shown at once", /\.cc-track\[data-cc-ready\] \.cc-img\{opacity:0;transform:scale\(1\.025\)/.test(CREATORS_CSS) && /\.cc-img\[data-shown\]\{opacity:1;transform:none\}/.test(CREATORS_CSS) && /twin\.getAttribute\("src"\) === img\.getAttribute\("src"\)/.test(creators) && /if \(img\.complete && img\.naturalWidth > 0\) show\(img, true\)/.test(creators))
check("creators: hidden only once the script is there; reduced motion shows them still", /track\.dataset\.ccReady = ""/.test(creators) && /\.cc-track\[data-cc-ready\] \.cc-img\{opacity:1;transform:none;transition:none\}/.test(CREATORS_CSS))
const rail = renderToStaticMarkup(createElement(CreatorsCarousel))
/* Changed on purpose (landing round 11): 11 kinds, 22 photographs (podcasters are off the rail). */
check("creators: the markup still lazy and sized (22 photos)", (rail.match(/<img class="cc-img"[^>]*loading="lazy"/g) ?? []).length === 22)

console.log("\nA finger on the creators rail freezes it where it is")
const halt = creators.slice(creators.indexOf("const halt = () => {"), creators.indexOf("/* One leg of motion"))
check("the running animation is paused before its place is read", /anim\.pause\(\)\s*const m = getComputedStyle\(track\)\.transform/.test(halt))
check("the place is written as the rail's own transform before the animation is cancelled", halt.indexOf("paint()") > 0 && halt.indexOf("paint()") < halt.indexOf("anim.cancel()"))
check("a press halts first, then holds", /press: \(\) => \{\s*if \(reduce\.matches\) return false\s*halt\(\)/.test(creators))

console.log("\nThe browser check and the suite list")
const probe = read("scripts/check-landing-r11-rails.mjs")
check("CDP touches on an iPhone 13, the rail's transform at the press and after it", /Input\.dispatchTouchEvent/.test(probe) && /"iPhone 13"/.test(probe) && /atPress/.test(probe) && /afterHandlers/.test(probe))
check("hover at 1440 and the caption's place measured", /showcase-1440-hover/.test(probe) && /capBottom/.test(probe))
// Changed on purpose (landing round 11): other round 11 suites sit between the two now, so the check reads the order, not adjacency.
{
  const runner = read("scripts/run-push-tests.mjs")
  const a = runner.indexOf('"tests/home-landing-r10-checkout.test.ts"'), b = runner.indexOf('"tests/home-landing-r11-rails.test.ts"')
  check("this suite runs on push, after round 10's", a > 0 && b > a)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
