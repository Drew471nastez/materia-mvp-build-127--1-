/**
 * ===========================================================================
 *  HOME, LANDING ROUND 9 (TOP): WHOSE SWIPE IT IS, THE WARM SUPPORT CARD,
 *  A CENTRED, SMALLER, STILL "IDEAS" PICTURE
 * ===========================================================================
 * components/marketing/home/everything-in-one-place.tsx, everything-globe.tsx,
 * ideas-come-to-life.tsx and showcase-mocks/builder-mocks.tsx.
 *
 * The owner, after round 8:
 *   1. the swipe in "Build a store that looks like you" is laggy and must not
 *      mistake scrolling down for scrolling it sideways, on a phone;
 *   2. the globe must understand "when I'm reaching it with touch and when
 *      I'm just scrolling", and not cause lag;
 *   3. the Real support card keeps the pink, orange and red gradient;
 *   4. Kaia Moon's two buttons "more fatty, more hype, a little bit";
 *   5. ideas: the heading, the pill tabs and the line under it centred;
 *   6. ideas: the picture a little smaller on a computer;
 *   7. ideas: the shadow at the foot that came in "stutterish" on a tab change
 *      and was cut by the section's box, gone;
 *   8. Mondo Mango "has too many images"; The Strength Room stays as it is.
 *
 * Measured on the real page in the dev server (Chromium, iPhone 13, CDP touch
 * sequences; before is round 8's code on the same machine):
 *   - the strip under a 160px sideways drag in 4px steps: before it stayed 4px
 *     behind the finger for the whole drag (the 8px spent deciding were never
 *     given back); now it is taken at 6 to 8px and stands under the finger
 *     from there (finger 8, 12, 20, 40, 160px: strip 8.6, 12.6, 20.6, 40.6,
 *     160.6px, the 0.6 being its own drift while it waited).
 *   - the same drag at 4x CPU: frames over 34ms 3 before and 0 now, the
 *     longest frame 66.7ms before and 33.4ms now, one 71ms long task before
 *     and none now. At 1x: one frame over 20ms before, none now.
 *   - a 150px upward swipe starting on the strip scrolled the page 139px and
 *     never took the strip; one going 70 across and 100 up scrolled it 90px.
 *     The same two on the globe: 140px and 88px, the globe never taken. A
 *     180px sideways swipe on the globe turned it and the page stood still.
 *   - the pieces' pictures on the phone: 360 x 450 files drawn at 85 x 106
 *     before, the 240 x 300 ones now (18 files, 95 KB together).
 *   - playwright.webkit (iPhone 13, pointer events dispatched to the element,
 *     since its pan cannot be driven from a script): a sideways drag takes
 *     the strip and the globe, an upward and a slanted one take neither, and
 *     no attribute changes on the strip. Its frame times on this machine say
 *     nothing (a software renderer on a dev build: 40 to 70ms a frame with
 *     nothing dragged).
 *   - ideas: the heading, line and tabs centred on 195 of 390, 720 of 1440,
 *     960 of 1920. The picture 1292px wide before and 1135px now at 1440,
 *     1752 and 1540 at 1920, 350 and 348 at 390. The section 1178px before
 *     and 1088px now at 1440, 1449 and 1326 at 1920, 522 and 523 at 390.
 *   - the everything section's height did not change: 2048px at 390, 1502px
 *     at 1440, 1791px at 1920.
 */
import { createHash } from "node:crypto"
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EverythingInOnePlace, EVERYTHING_STORES, EVERYTHING_STYLES, PIECE_SIZES } from "@/components/marketing/home/everything-in-one-place"
import { SWIPE_CLEAR, SWIPE_SLOP, swipeAxis } from "@/components/marketing/home/everything-globe"
import { IDEAS_STYLES, IDEAS_TABS, IdeasComeToLife } from "@/components/marketing/home/ideas-come-to-life"
import { BUILDER_CSS, CommunityMock, LoudlibSite, WebsiteBuilderMock } from "@/components/marketing/home/showcase-mocks/builder-mocks"

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
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const F = {
  ev: "components/marketing/home/everything-in-one-place.tsx",
  globe: "components/marketing/home/everything-globe.tsx",
  ideas: "components/marketing/home/ideas-come-to-life.tsx",
  builders: "components/marketing/home/showcase-mocks/builder-mocks.tsx",
}
const src = read(F.ev)
const globe = read(F.globe)
const css = EVERYTHING_STYLES.map((s) => s.css).join("\n")
const ideasCss = IDEAS_STYLES.find((s) => s.href === "w12-ideas")?.css ?? ""
const rule = (sheet: string, selector: string) => {
  const at = sheet.indexOf(`${selector}{`)
  return at < 0 ? "" : sheet.slice(at, sheet.indexOf("}", at) + 1)
}
const html = renderToStaticMarkup(createElement(EverythingInOnePlace))

console.log("\n── 1 and 2. Whose swipe it is ──")
check("nothing is decided in the first pixels", swipeAxis(0, 0) === null && swipeAxis(5, -5) === null && swipeAxis(-5.9, 3) === null && SWIPE_SLOP === 6)
check("a finger going down or up is the page's", swipeAxis(0, -10) === "y" && swipeAxis(6, -150) === "y" && swipeAxis(3, 7) === "y")
check("as far down as across is still the page's", swipeAxis(10, -10) === "y" && swipeAxis(-70, -100) === "y" && swipeAxis(70, 100) === "y")
check("clearly sideways is taken, either way", swipeAxis(-12, 4) === "x" && swipeAxis(9, 0) === "x" && swipeAxis(6, 4) === "x" && swipeAxis(-160, 6) === "x")
check("a slanted start is watched, not taken, until it has gone 20px across", swipeAxis(10, 8) === null && swipeAxis(-15, 12) === null && swipeAxis(SWIPE_CLEAR, 16) === "x" && SWIPE_CLEAR === 20)
check("a slant that turns down is given to the page while it was being watched", swipeAxis(12, 13) === "y")
const move = code(src).slice(code(src).lastIndexOf("const move = (e: PointerEvent)"), code(src).indexOf("const setLive"))
check("the strip asks swipeAxis for a finger, and lets go at once when it is the page's", /const axis = drag\.touch \? swipeAxis\(dx, dy\) : Math\.hypot\(dx, dy\) >= 3 \? "x" : null/.test(move) && /if \(axis === "y"\) \{\s*drag = null\s*return/.test(move))
check("the pointer is captured only once the strip has the gesture", move.indexOf("vp.setPointerCapture") > move.indexOf('if (axis === "y")'))
check("taken, it stands under the finger as if held from the first pixel", /drag\.at = x \+ dx - Math\.max\(-SWIPE_SLOP, Math\.min\(SWIPE_SLOP, dx\)\)/.test(move) && /x = drag\.at - dx/.test(move))
check("written once a frame however many moves arrive", /if \(!frame\) frame = requestAnimationFrame\(flush\)/.test(move) && !/\n\s*paint\(\)\n\s*\}\n\s*const up/.test(move) && /const flush = \(\) => \{\s*frame = 0\s*paint\(\)/.test(code(src)))
check("no layout is read while it is dragged or let go", !/getBoundingClientRect|offsetWidth|offsetLeft|clientWidth|getComputedStyle/.test(move))
check("a finger changes no attribute on the strip (that restyled every page in it)", /if \(!drag\.touch\) vp\.dataset\.dragging = ""/.test(move) && /if \(!d\.touch\) delete vp\.dataset\.dragging/.test(move))
check("the last move is drawn before the strip coasts", /if \(frame\) \{\s*cancelAnimationFrame\(frame\)\s*flush\(\)\s*\}/.test(move))
check("vertical pans are the browser's on both", /touch-action:pan-y/.test(rule(css, ".ev-s")) && /touch-action:pan-y/.test(rule(css, ".ev-globe")))
const onMove = code(globe).slice(code(globe).indexOf("const onMove"), code(globe).indexOf("const onUp"))
check("the globe asks the same question and never moves for the page's swipe", /const axis = swipeAxis\(dx, dy\)\s*if \(!axis\) return\s*if \(axis === "y"\) \{\s*touch = null\s*return/.test(onMove))
check("taken, the globe turns as if held from the first pixel, about its axis only", /take\(e, touch\.y0, e\.clientX - Math\.max\(-SWIPE_SLOP, Math\.min\(SWIPE_SLOP, dx\)\)\)\s*driver\.pointer\(\{ kind: "move", x: e\.clientX, y: touch\.y0, t: e\.timeStamp \}\)/.test(onMove))
check("a drag on the globe reads no layout", !/getBoundingClientRect/.test(onMove.slice(0, onMove.indexOf('if (e.pointerType !== "mouse"'))))

console.log("\n── 1. The size drawn ──")
const pieces = EVERYTHING_STORES.flatMap((s) => (s.kind === "merch" ? s.products.map((p) => p.src) : s.kind === "link" ? [...s.products] : []))
check("every piece in the strip has a 240px picture, small", pieces.length === 18 && pieces.every((p) => existsSync(join(root, "public", p.replace(/\.webp$/, "-240.webp"))) && statSync(join(root, "public", p.replace(/\.webp$/, "-240.webp"))).size < 12 * 1024))
check("a phone is offered the 240px one, a 2x computer the 360px one", (html.match(/srcSet="[^"]*-240\.webp 240w, [^"]*\.webp 360w" sizes="\(max-width:767px\) 80px, 150px"/g) ?? []).length === pieces.length * 2 && PIECE_SIZES === "(max-width:767px) 80px, 150px")
check("every picture in the strip keeps its width and height, so nothing shifts when it arrives", [...html.slice(html.indexOf("data-ev-strip"), html.indexOf("ev-globe")).matchAll(/<img [^>]*>/g)].every((m) => /width="\d+" height="\d+"/.test(m[0]) && /decoding="async"/.test(m[0])))

console.log("\n── 3. Real support: pink, orange and red again ──")
const ground = rule(css, ".ev-c")
check("round 7's raspberry to peach gradient", /linear-gradient\(168deg,#9d1640 0%,#c03560 36%,#dc6476 64%,#f1a283 100%\)/.test(ground) && /radial-gradient\(70% 60% at 88% 8%,rgba\(255,170,180,\.32\) 0%,rgba\(255,170,180,0\) 100%\)/.test(ground))
check("the teal is gone, nothing purple, nothing moving", !/#053c4a|#0a6b78|#12999b|#5fd6c2|160,246,232/.test(css) && !/#8b5cf6|#7c3aed|violet|purple/i.test(ground) && !/animation/.test(ground))
check("the thread's shadow is warm again", /box-shadow:0 30px 60px -34px rgba\(80,8,30,\.55\)/.test(rule(css, ".ev-c-thread")))

console.log("\n── 4. Kaia Moon's buttons ──")
const kaiaAt = html.indexOf('class="ev-lp-ground" src="/home/everything/stores/kaia-bg.webp"')
const kaia = html.slice(html.lastIndexOf('<div class="ev-st ev-lp"', kaiaAt), html.indexOf('src="/home/everything/stores/kaia-tape.webp"', kaiaAt))
check("only her page is marked", (html.match(/data-hype="true"/g) ?? []).length === 2 && /class="ev-st ev-lp" data-hype="true"/.test(kaia) && EVERYTHING_STORES.filter((s) => s.kind === "link" && s.hype).length === 1)
check("Shop merch and Tour dates, as before", /<span class="ev-lp-btn">Shop merch<\/span><span class="ev-lp-btn">Tour dates<\/span>/.test(kaia))
const hype = rule(css, ".ev-lp[data-hype] .ev-lp-btn")
check("fatter: taller, fully round, set heavy, never squeezed by the column", /^\.ev-lp\[data-hype\] \.ev-lp-btn\{flex:none;/.test(hype) && /height:calc\(66 \* var\(--r\)\)/.test(hype) && /border-radius:calc\(33 \* var\(--r\)\)/.test(hype) && /font-weight:800/.test(hype) && /font-size:calc\(19 \* var\(--r\)\)/.test(hype))
check("the first is filled in her mint with dark words", /background:var\(--accent\);color:#0b1b26/.test(rule(css, ".ev-lp[data-hype] .ev-lp-social + .ev-lp-btn")))
check("the other pages' buttons are as they were", /\.ev-lp-btn\{display:flex;align-items:center;justify-content:center;height:calc\(58 \* var\(--r\)\);[^}]*background:rgba\(255,255,255,\.14\);font-size:calc\(17 \* var\(--r\)\);font-weight:500\}/.test(css))
check("no frosted glass", !/backdrop-filter|filter:blur/.test(css))

console.log("\n── 5. Ideas: centred ──")
const ideas = renderToStaticMarkup(createElement(IdeasComeToLife))
check("the heading and its line are centred, in the shared box", /\.ideas-head\{[^}]*padding:0 calc\(var\(--home-edge,[^}]*text-align:center\}/.test(ideasCss) && /\.ideas \.ideas-h\{margin-inline:auto;/.test(ideasCss))
// Changed on purpose (landing round 10): the owner: "Get rid of the subheading"; the line under the heading is gone (tests/home-landing-r10-top.test.ts).
check("no line under it any more", !/\.ideas-sub\{/.test(ideasCss) && !/class="ideas-sub"/.test(ideas))
check("the pill tabs are centred", /\.ideas-tabs-row\{box-sizing:border-box;display:flex;justify-content:center;/.test(ideasCss))
check("on a phone too: nothing sets them left again", !/text-align:left|justify-content:flex-start/.test(ideasCss))

console.log("\n── 6 and 7. Ideas: a smaller picture in one still frame ──")
const frame = rule(ideasCss, ".ideas-frame")
check("every panel stands in one frame", /<div class="ideas-stage"><div class="ideas-frame"><div id="ideas-panel-website" role="tabpanel"/.test(ideas) && (ideas.match(/class="ideas-frame"/g) ?? []).length === 1)
// Changed on purpose (landing round 11): "a little more depth, just a little": one soft layered shadow on the frame, which never changes, so a switch still only cross fades what is inside it.
check("the frame has the corners and a hairline, and one still shadow", /border:1px solid #e3e3e6;border-radius:clamp\(9px,1\.3vw,17px\);overflow:hidden;background:#fff;box-shadow:0 1px 2px/.test(frame))
check("no panel has a shadow, a radius or a clip of its own", /\.ideas-panel\{grid-area:1\/1;background:#fff;transition:opacity \.55s cubic-bezier\(\.2,\.7,\.2,1\)\}/.test(ideasCss) && !/\.ideas-panel[^{]*\{[^}]*box-shadow/.test(ideasCss))
// Changed on purpose (landing round 11): the frame's shadow reaches 22px down, inside the section's own padding (80px under the frame at 1440x800), so the lazy box never cuts it.
check("nothing in the section has a shadow but the chosen tab's 2px and the frame's", (ideasCss.match(/box-shadow:/g) ?? []).length === 2 && /\.ideas-tab::before\{[^}]*box-shadow:0 1px 2px/.test(ideasCss) && /0 22px 44px -22px/.test(frame))
check("a switch only cross fades: the new panel over the old, both on white", /\.ideas-panel\[data-pane="active"\]\{z-index:2;animation:ideas-in \.55s/.test(ideasCss) && /\.ideas-panel\[data-pane="leaving"\]\{z-index:1\}/.test(ideasCss) && /@keyframes ideas-in\{from\{opacity:0\}\}/.test(ideasCss))
// Changed on purpose (landing round 10): the owner: still "too big", "reduce it a little more"; 78% of the shared width, capped by the screen's height (tests/home-landing-r10-top.test.ts).
check("from 768px the picture is smaller than the shared width, centred", /@media\(min-width:768px\)\{\.ideas-frame\{width:min\(78%,/.test(ideasCss) && /justify-self:center/.test(frame))
check("a phone keeps the full width", /width:100%/.test(frame) && !/@media\(max-width:767px\)\{[^}]*\.ideas-frame/.test(ideasCss))
check("the picture keeps its shape", /\.ideas-mock\{aspect-ratio:1280\/752;/.test(ideasCss))

console.log("\n── 8. The builder's store: one picture in the hero ──")
// Changed on purpose (wave 18): the owner does not like Mondo Mango at all; it is gone with its pictures and the builder shows loudlib alone (tests/home-landing-r11-top.test.ts).
const site = renderToStaticMarkup(createElement(LoudlibSite))
const hero = site.slice(site.indexOf('class="ll-hero"'), site.indexOf('class="ll-shop"'))
check("the hero has one picture", (hero.match(/<img /g) ?? []).length === 1 && /src="\/home\/showcase\/ll-hero\.webp"[^>]*width="1600" height="370"/.test(hero))
check("the whole store: one hero picture and four products", (site.match(/<img /g) ?? []).length === 5)
check("the rings are as they were (one site, so two)", (renderToStaticMarkup(createElement(WebsiteBuilderMock)).match(/<em>Selected<\/em>/g) ?? []).length === 2)
check("nothing new moves", !/\.ll[^{]*\{[^}]*(animation|transition)/.test(BUILDER_CSS))

console.log("\n── 8. The Strength Room is intact ──")
const cm = renderToStaticMarkup(createElement(CommunityMock))
check("its markup is what round 8 drew, to the byte", createHash("sha256").update(cm).digest("hex") === "8774fce177ad3c3da91226068e54ba4916f973accb30e9089f39713e84f0cb8f", createHash("sha256").update(cm).digest("hex"))
const cx = BUILDER_CSS.slice(BUILDER_CSS.indexOf(".cx{"))
check("its styles are what round 8 drew", createHash("sha256").update(cx).digest("hex") === "f8aee363c14a9b53af8b57b1eb559827dab709087e343398b8b0f76e3aadd50c", createHash("sha256").update(cx).digest("hex"))

console.log("\n── Copy ──")
const all = code(src) + code(globe) + code(read(F.ideas)) + code(read(F.builders))
check("no em dashes, no banned words", !/—/.test(all) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|fans?|enthusiasts?)\b/i.test(all.replace(/transform[:(=][^;}\n]*/g, "")))
check("none of the banned samples", !/Nadia Brooks|The Loop\b|LaSalle|Nails by Bea|Nordline|Charla Circle|Static Bloom|Maren Holt|Harbor yarn|Weeknight Pasta|sourdough|Golden Hour|Elena Ruiz/i.test(all))
check("this suite runs with the push tests, after round 8's", /"tests\/home-landing-r8-frame\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r9-top\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
