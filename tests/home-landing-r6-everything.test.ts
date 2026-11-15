/**
 * ===========================================================================
 *  HOME, LANDING ROUND 6 (EVERYTHING): "SELL WHAT YOU MAKE. GET PAID WORLDWIDE."
 * ===========================================================================
 * components/marketing/home/everything-in-one-place.tsx and its pictures
 * under public/home/everything (the globe files belong to another track).
 *
 * The owner, round 6:
 *   - The LUT pack: "without the 12, just LUT pack", and its cover "more
 *     realistic, more clean and smooth, more bold, black, modern".
 *   - Build a store that looks like you: the cards like his reference
 *     picture, "positioning and spacing and all, and bottom padding": tall
 *     rounded cards on a light grey picture, the middle one whole and its
 *     neighbours cut by the sides, a fixed inset from the top and running
 *     off the foot; merch stores like "Signal Drop" and link pages like
 *     "Zach Dagger", with other names, colours, photos and words.
 *   - As he scrolls down the cards should "come in smooth and clean":
 *     "normal, natural, buttery, not so heavy, not so subtle, not
 *     attention grabby".
 *
 * Measured in a browser (dev server, iPhone 13 emulation and 1440x900) when
 * this was written: every card stood at opacity 0 and 24px down until it
 * came on screen, and mid entry the first two read opacity .92 to 1 and
 * 0 to 2px while the next two still waited; the strip showed a 192px card
 * whole in a 343px picture on a phone (270px in 553px on a laptop), tops
 * 27px and 34px down, the neighbours cut by both sides; a horizontal touch
 * swipe moved the strip and left the page where it was, a vertical one
 * scrolled the page 287px. The section is 2048px tall on a phone and 1431px
 * at 1440 (the captions sit 6px lower than before).
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EverythingInOnePlace, EVERYTHING_SLIDES, EVERYTHING_STORES, EVERYTHING_STYLES } from "@/components/marketing/home/everything-in-one-place"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const src = readFileSync(join(root, "components/marketing/home/everything-in-one-place.tsx"), "utf8")
const html = renderToStaticMarkup(createElement(EverythingInOnePlace))
const css = EVERYTHING_STYLES[0]?.css ?? ""
const rule = (sel: string) => css.match(new RegExp(`(^|\\n|\\})${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{[^}]*\\}`))?.[0] ?? ""
const small = (u: string) => existsSync(join(root, "public", u)) && statSync(join(root, "public", u)).size < 120_000

console.log("\n── 1. The LUT pack ──")
const luts = EVERYTHING_SLIDES.find((s) => s.kind === "luts")
check("named \"Cine Tones LUT Pack\", no number in its name", luts?.name === "Cine Tones LUT Pack" && !/\d/.test(luts.name))
const cover = html.slice(html.indexOf('class="ev-lut"'), html.indexOf("</span></span>", html.indexOf('class="ev-lut-name"')))
check("the cover is a still, \"LUT Pack\" and the name over two lines, and no number on it", /<img class="ev-lut-still"[^>]*src="\/home\/everything\/lut-still\.webp"/.test(cover) && /<span class="ev-lut-tag">LUT Pack<\/span>/.test(cover) && /<span class="ev-lut-name"><span>Cine<\/span><span>Tones/.test(cover) && !/\d+ ?LUTs|ev-lut-count/.test(html), cover)
check("no flat half, no split line left from round 5", !/ev-lut-flat|ev-lut-split/.test(html + css))
check("black, the still fading into it, the name big and heavy", /background:#0a0a0b/.test(rule(".ev-lut")) && /linear-gradient\(rgba\(10,10,11,0\)/.test(rule(".ev-lut::after")) && /font-size:21cqw;font-weight:800/.test(rule(".ev-lut-name")))
check("the still exists, is a real webp and small", small("/home/everything/lut-still.webp") && readFileSync(join(root, "public/home/everything/lut-still.webp")).subarray(8, 12).toString() === "WEBP")
check("the round 5 cover picture is gone", !existsSync(join(root, "public/home/everything/lut-cover.webp")))

console.log("\n── 2. Build a store that looks like you ──")
const merch = EVERYTHING_STORES.filter((s) => s.kind === "merch")
const links = EVERYTHING_STORES.filter((s) => s.kind === "link")
/* Changed on purpose (landing round 8): the owner asked for another OnePage beside the three link pages, so seven pages; no two stores ever stand side by side, round the loop too. */
check("three merch stores, three link pages and a profile OnePage, no two stores side by side", merch.length === 3 && links.length === 3 && EVERYTHING_STORES.filter((s) => s.kind === "profile").length === 1 && EVERYTHING_STORES.every((s, i) => !(s.kind === "merch" && EVERYTHING_STORES[(i + 1) % EVERYTHING_STORES.length].kind === "merch")))
check("no Signal Drop, Zach Dagger or Post Trend themselves", !/signal drop|zach dagger|post trend/i.test(JSON.stringify(EVERYTHING_STORES)))
check("every name is different", new Set(EVERYTHING_STORES.map((s) => (s.kind === "merch" ? s.title.join(" ") : s.name))).size === EVERYTHING_STORES.length)
/* Changed on purpose (landing round 8): one store (Fieldwork) is laid out like a real Storelib store instead (tests/home-landing-r8-everything.test.ts). */
// Changed on purpose (landing round 11): Soft Ground became Noor Haddad's digital store with its own dark band (and one price struck through), tests/home-landing-r11-top.test.ts.
const merchBig = merch.filter((s) => s.kind === "merch" && !s.hero && !s.digital)
check("a merch store: brand and Cart with a menu, the drop's name over two lines, four pieces with a name and a price", (html.match(/<span class="ev-mc-top"><span>[^<]+<\/span><span class="ev-mc-cart">Cart<span class="ev-mc-menu"><\/span><\/span><\/span><span class="ev-mc-title"><span>[^<]+<\/span><span>[^<]+<\/span><\/span>/g) ?? []).length === merchBig.length * 2 && (html.match(/<span class="ev-mc-name">[^<]+<\/span><span class="ev-mc-price">(<s>\$\d+<\/s>)?\$\d+<\/span>/g) ?? []).length === merch.length * 2 * 4)
check("the name airy, its second line pushed right; a two column grid of 4:5 photos", /font-weight:400/.test(rule(".ev-mc-title")) && /align-self:flex-end/.test(rule(".ev-mc-title span + span")) && /grid-template-columns:1fr 1fr/.test(rule(".ev-mc-grid")) && /aspect-ratio:4\/5/.test(rule(".ev-mc-img")))
check("a link page: a blurred photo, the name big and bold in its colour, four icons, two buttons, two product photos", /* Changed on purpose (landing round 9): Kaia Moon's page carries data-hype for her fatter buttons. */ (html.match(/class="ev-st ev-lp"(?: data-hype="true")? style="background:#[0-9a-f]{6};--accent:#[0-9a-f]{6}"><img class="ev-lp-ground"/g) ?? []).length === links.length * 2 && /font-weight:800/.test(rule(".ev-lp-name")) && /color:var\(--accent\)/.test(rule(".ev-lp-name")) && (html.match(/<span class="ev-lp-social">(<svg[\s\S]*?<\/svg>){4}<\/span>/g) ?? []).length === links.length * 2 && (html.match(/class="ev-lp-btn"/g) ?? []).length === links.length * 4 && (html.match(/class="ev-lp-img"/g) ?? []).length === links.length * 4)
check("each link page in its own colour, warm or bright", new Set(links.map((l) => l.kind === "link" && l.accent)).size === 3)
check("no frosted glass: the buttons are a plain tint", !/backdrop-filter|filter:blur/.test(css) && /background:rgba\(255,255,255,\.14\)/.test(rule(".ev-lp-btn")))
/* Changed on purpose (landing round 8): link pages carry their creator's photo, and the strip has a OnePage of a third kind (a profile with one photo). */
check("every strip picture is local under stores/, a real webp, small", EVERYTHING_STORES.flatMap((s) => (s.kind === "merch" ? s.products.map((p) => p.src) : s.kind === "link" ? [s.ground, s.avatar, ...s.products] : [s.photo])).every((u) => u.startsWith("/home/everything/stores/") && small(u) && readFileSync(join(root, "public", u)).subarray(8, 12).toString() === "WEBP"))
check("the old creator pages and OnePage captures are gone", !existsSync(join(root, "public/home/everything/strip")) && !/ev-st-bar|ev-op-img|EVERYTHING_SHOTS/.test(src))
/* Changed on purpose (landing round 7): the inset grows to 42px with the wider picture. */
check("a light grey picture, cards a fixed inset from its top, as tall as it, so they run off its foot", /background:#ebebeb/.test(rule(".ev-s")) && /--top:clamp\(24px,8cqw,42px\)/.test(rule(".ev-s")) && /top:var\(--top\)/.test(rule(".ev-s-track")) && /height:100cqh/.test(rule(".ev-s-track")))
/* Changed on purpose (landing round 7): the cap grows with a taller picture, 58% of its height once over 270px. */
check("a card is 56% of the picture's width (170px up to 270px or 58% of its height): one whole and two cut on a phone and a laptop", /--card-w:clamp\(170px,56cqw,max\(270px,58cqh\)\)/.test(rule(".ev-s")) && /--r:calc\(var\(--card-w\) \/ 390\)/.test(rule(".ev-st")))
/* Changed on purpose (landing round 7): read from the boxes, offsetLeft rounds a fractional card width. */
/* Changed on purpose (landing round 8): each page wraps round on its own, one compositor loop a page from one offset on the document's clock (tests/home-landing-r8-everything). */
check("it starts with the first page in the middle, read once", /if \(!placed\) \{\s*placed = true\s*x = pitch \/ 2 - vp\.clientWidth \/ 2/.test(src))
/* Changed on purpose (landing round 7): the drift runs from 0 to one set, entered where the strip stands, so it never runs past the copy. */
/* Changed on purpose (landing round 8): each page wraps round on its own, one compositor loop a page from one offset on the document's clock (tests/home-landing-r8-everything). */
check("the drift is still Web Animations of transform, stopped off screen and in a hidden tab", /slot\.animate\(\s*\[\{ transform: `translate3d/.test(src) && /else stopDrift\(\)/.test(src) && /visibilitychange/.test(src))
/* Changed on purpose (landing round 9): the axis is read by swipeAxis (everything-globe.tsx; tests/home-landing-r9-top). */
check("a finger: vertical swipes stay the page's, the axis decided in the first pixels, capture only after", /touch-action:pan-y/.test(rule(".ev-s")) && /swipeAxis\(dx, dy\)/.test(src) && /if \(axis === "y"\) \{\s*drag = null/.test(src) && src.indexOf("vp.setPointerCapture") > src.indexOf("swipeAxis(dx, dy)"))
check("nothing in the strip takes the pointer or focus", /pointer-events:none/.test(rule(".ev-s-slot")) && /class="ev-vis ev-s" aria-hidden="true"/.test(html))
check("more room under every picture before its caption (24px)", /margin:24px 0 0/.test(rule(".ev-cap")))

console.log("\n── 3. The cards come in as the page scrolls ──")
check("one IntersectionObserver, each card once, a tenth of the screen in", /function useCardReveal\(/.test(src) && /new IntersectionObserver\(/.test(src) && /io\.unobserve\(e\.target\)/.test(src) && /rootMargin: "0px 0px -10% 0px"/.test(src) && /useCardReveal\(grid\)/.test(src))
check("from 24px down and clear, 700ms on the section's ease, opacity and transform only", /opacity:0;transform:translate\(0,24px\);transition:opacity \.7s \$\{EASE\},transform \.7s \$\{EASE\}/.test(src) && /\.ev-card\[data-in\]\{opacity:1;transform:none\}/.test(css) && /const EASE = "cubic-bezier\(\.22,1,\.36,1\)"/.test(src))
check("the second card of a row follows 110ms later, on a wide screen only", /@media\(min-width:768px\)\{\.ev-card:nth-child\(even\)\{--d:110ms\}\}/.test(css) && /transition-delay:var\(--d,0ms\)/.test(rule(".ev-card")))
check("no scroll listener, no layout read for it, no section wide reveal left", !/addEventListener\(\s*["']scroll/.test(src) && !/\.ev\[data-platform-in\] \.ev-card/.test(css) && !/getBoundingClientRect\(\)[^\n]*ev-card/.test(src))
check("it stands without script, under reduced motion and without IntersectionObserver", /@media\(scripting:none\)\{\.ev-card\{opacity:1;transform:none\}\}/.test(css) && /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*\.ev-card\{opacity:1;transform:none\}/.test(css) && /typeof IntersectionObserver !== "function" \|\| matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/.test(src))
check("server markup leaves every card to the observer (no data-in baked in)", (html.match(/<article class="ev-card/g) ?? []).length === 4 && !/<article[^>]*data-in/.test(html))

console.log("\n── The words ──")
const words = [JSON.stringify(EVERYTHING_STORES), ...EVERYTHING_SLIDES.map((s) => s.name), html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")].join(" ")
check("no em dashes, no banned words, no fans", !/—/.test(words) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform|fans?)\b/i.test(words))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
