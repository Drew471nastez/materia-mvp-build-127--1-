/**
 * LANDING ROUND 11, THE CHECKOUT SECTION (storelib.com home, the dark "Checkout that turns a tap into a sale")
 *
 * The owner, after round 10:
 *   1. the products on the ring "should be more blurred as they disappear (go behind), the orbit wider, they
 *      should fly smooth and clean, and they should not overlap the phone mockup"
 *   2. the phone "should be bigger as I reach the section" (a big phone rising from the bottom centre with
 *      products round it), "and as I scroll it should become smaller and reveal the heading on 2 rows"
 *   3. bring back "Bring back the ones who almost bought" with the Recovered chart, and make it fit
 *   4. in "Apple Pay and Google Pay, built in", the modal checkout (the in-page one), dark, not the checkout page
 *   5. on a phone the pictures were broken and cut, and the cards "should not be a carousel: just normal
 *      stacked cards on phones"
 *   6. the cards and the facts row "should not be see-through"
 *   7. keep "Local in 7 currencies", and the orbs subtle
 *
 *   the ring          its own 3D space (cmc-ring, z 2) drawn under the phone (z 3), set back by its radius so its
 *                     nearest point is level with the phone: a product swings out beside the phone and passes
 *                     behind it, never across its screen. Wider: 44vw (up to 880px) on a computer, 64vw on a
 *                     phone. Each face cross fades its sharp object (cmc-near) to its blurred copy (cmc-far) as
 *                     it goes round the back, on the ring's own clock; opacity only. The copies are blurred
 *                     harder (scripts/bake-checkout-soft.mjs, 0.085 of the width)
 *   the phone         --pe is the settled phone (the room one screen leaves under a two row headline), --pw the
 *                     big phone it starts as (1.72x on a computer, 1.24x on a phone); one scroll timeline
 *                     transform takes the world from big and low (its top at 40svh) to settled, as the words
 *                     rise in on two rows
 *   One-tap           a creator's dark page, Buy now, and instant-checkout.tsx's window over it in
 *                     app/theme-dark.css's colours; the loop starts and ends with the window open
 *   on a phone        one card under another, each picture a whole square (32 x 32 em); Built to convert is the
 *                     website checkout's window whole in it, laid out at 380 with the order above the form
 *   solid             the cards and a strip under the facts in #111113
 *
 * Measured on the dev server (scratch Playwright scripts, numbers in the round's report).
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { CheckoutScene, CHECKOUT_HEADING, CHECKOUT_STYLES, FLOATS, SOFT } from "../components/marketing/home/checkout-scene"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const CO = "components/marketing/home/checkout-scene.tsx"
const src = read(CO)
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const co = renderToString(createElement(CheckoutScene))
const css = CHECKOUT_STYLES.map((s) => s.css).join("\n")
const keyframes = (name: string) => css.match(new RegExp(`@keyframes ${name}\\{([\\s\\S]*?\\})\\}`))?.[1] ?? ""
const onlyCompositor = (body: string) => body.length > 0 && [...body.matchAll(/[{;]([a-z-]+):/g)].map((x) => x[1]).every((p) => p === "transform" || p === "opacity" || p === "animation-timing-function")
const words = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!-- -->/g, "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ")
const card = (id: string) => co.slice(co.indexOf(`data-k="${id}"`), co.indexOf("</article>", co.indexOf(`data-k="${id}"`)))
const stage = co.slice(co.indexOf('class="cmc-stage"'), co.indexOf('class="cmc-cards"'))
const tl = css.slice(css.indexOf("@supports (animation-timeline:view()){"), css.indexOf(" * The cards: no ground of their own"))
const desk = css.slice(css.indexOf("@media (min-width:900px){\n  .cmc-stage{"))
const phoneCss = css.slice(css.lastIndexOf("@media (max-width:899px){", css.indexOf(".cmc-bento{grid-template-columns:minmax(0,1fr)")), css.indexOf("@keyframes cdx-scroll"))
const em = (prop: string, rule: string) => Number(rule.match(new RegExp(`${prop}:(-?[\\d.]+)em`))?.[1] ?? NaN)
const ruleIn = (sheet: string, sel: string) => sheet.match(new RegExp(`(?:^|[\\n{}])\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{([^}]*)\\}`))?.[1] ?? ""

console.log("\n1. The ring: wider, under the phone, soft round the back")
// Changed on purpose (wave 18): the ring's layer also carries the products' dimming (opacity 0.88, the owner: a little lower in brightness).
check("the ring is its own 3D space, drawn before the phone and under it (z 2 to the phone's 3)", /^class="cmc-stage"><div class="cmc-copy">[\s\S]*?<\/div><div class="cmc-ring" aria-hidden="true"><div class="cmc-orbit">[\s\S]*<div class="cmc-phone-wrap"><div class="cmc-world"><div class="cmc-rise">/.test(stage) && /\.cmc-ring\{position:absolute;z-index:2;inset:0;pointer-events:none;perspective:var\(--pp\);perspective-origin:50% var\(--cy\);opacity:0\.88\}/.test(css) && /\.cmc-phone-wrap\{position:absolute;z-index:3;/.test(css))
// Changed on purpose (landing round 11, the ring fix): the shade was a twin box beside the phone running copies of its animations, and a product showed through the fading phone (1440 x 800, "Shoot Planner" over the screen). It is in the phone's own box now; the wrap only steps back.
// Changed on purpose (landing round 12): the shade now fades too, but only after the phone has gone (80 to 86svh after the phone's 48 to 80), so it still never lets a product through a fading phone.
check("  under the phone, its shape in solid black, in the phone's own box under it, fading only once the phone is gone", /<div class="cmc-phone-wrap"><div class="cmc-world"><div class="cmc-rise"><span class="cmc-shade" aria-hidden="true"><\/span><div class="cmc-phone"/.test(stage) && (stage.match(/cmc-shade/g) ?? []).length === 1 && /\.cmc-shade\{position:absolute;inset:0;display:block;border-radius:calc\(var\(--pw\) \* \.178\);background:#000;pointer-events:none\}/.test(css) && /\.cmc-shade\{animation:cmc-out linear both;animation-timeline:--cmc-t;animation-range:contain 80svh contain 86svh\}/.test(css))
check("  the phone's world holds no products and no 3D: nothing can be sorted in front of its screen", !/class="cmc-world">[^]*?class="cmc-o"/.test(stage.slice(stage.indexOf('class="cmc-phone-wrap"'))) && !/\.cmc-world\{[^}]*preserve-3d/.test(css))
check("  set back by its radius, so its nearest point is level with the phone, then leaning and turning", /\.cmc-orbit\{position:absolute;left:50%;top:var\(--cy\);width:0;height:0;transform-style:preserve-3d;transform:translate3d\(0,0,calc\(var\(--r\) \* -1\)\) rotateX\(var\(--tilt\)\) rotateY\(0deg\)\}/.test(css))
// Changed on purpose (wave 18): on a phone the ring is 50vw (up to 300px) with larger products, so they float round the phone on screen instead of off its edges (the reference).
check("wider: 44vw (up to 880px) on a computer, 50vw (up to 300px) on a phone, the perspective three radii", /--r:min\(44vw,880px\)/.test(desk) && /--r:min\(50vw,300px\);--pp:calc\(var\(--r\) \* 3\)/.test(css))
check("each face: the sharp object, its blurred copy for depth, its blurred copy for the cards", FLOATS.every((f) => new RegExp(`data-f="${f.id}"[^>]*><span class="cmc-face"><span class="cmc-sharp"><span class="cmc-near">[\\s\\S]*?</span></span><img class="cmc-far" src="/home/commerce/soft-${f.id}\\.webp"[^>]*><img class="cmc-soft" src="/home/commerce/soft-${f.id}\\.webp"`).test(stage)))
// Changed on purpose (wave 18): the sharp stretch is narrower (12%, soft from 30%): the products float out of focus round the phone as in the reference, soft round the back as before.
check("  sharp coming out from behind the phone, soft round the back: one cross fade over the turn, opacity only", /^0%,12%,88%,100%\{opacity:1\}30%,70%\{opacity:0\}$/.test(keyframes("cmc-near")) && /^0%,12%,88%,100%\{opacity:0\}30%,70%\{opacity:1\}$/.test(keyframes("cmc-far")) && onlyCompositor(keyframes("cmc-near")) && onlyCompositor(keyframes("cmc-far")))
check("  on the ring's own clock, from each object's place, linear, paused off screen", ["near", "far"].every((k) => new RegExp(`\\.cmc-${k}\\{animation:cmc-${k} 44s linear infinite;animation-delay:calc\\(var\\(--p\\) \\* -44s\\);animation-play-state:paused\\}`).test(css)) && /\.cmc-stage\[data-commerce-live\] :is\(\.cmc-face,\.cmc-near,\.cmc-far\)\{animation-play-state:running\}/.test(css))
// Changed on purpose (wave 18): in step with the narrower sharp stretch.
check("  dimmer round the back too (half), full beside the phone", /^0%,12%,88%,100%\{opacity:1\}50%\{opacity:0\.5\}$/.test(keyframes("cmc-depth")))
// Changed on purpose (landing round 12): SIGMA has only the objects now (no phone copy).
check("the copies are blurred harder now (0.085 of the width), small webp files with alpha", /const SIGMA = \{ object: 0\.085 \}/.test(read("scripts/bake-checkout-soft.mjs")) && Object.keys(SOFT).every((k) => existsSync(`public/home/commerce/soft-${k}.webp`) && statSync(`public/home/commerce/soft-${k}.webp`).size < 4 * 1024))
check("  the bake script knows the new parts (the depth copy hidden, the sharp layer flat)", /\.cmc-soft,\.cmc-far\{display:none!important\}/.test(read("scripts/bake-checkout-soft.mjs")) && /\.cmc-near,/.test(read("scripts/bake-checkout-soft.mjs")))

console.log("\n1b. The ring fix: no product ever over the phone's screen")
/*
 * The owner's rule. Measured on the dev server (scratchpad cs-ring/probe.mjs and live.mjs, Playwright Chromium):
 * 24 places on the ring x 12 scroll stops (big phone at entry, shrinking, settled, cards arriving and over) at
 * 390 x 844, 1440 x 800 and 1920 x 1080. Every product box that meets the screen's box was hit-tested
 * (elementsFromPoint: the phone before any product, 9 points each), and the screen's pixels compared with the ring
 * drawn and hidden, frozen and with the ring running on the compositor. Numbers in the round's report.
 */
const ringAt = stage.indexOf('class="cmc-ring"')
const phoneAt = stage.indexOf('class="cmc-phone-wrap"')
check("the ring comes before the phone in the stage, outside the phone's box, and no product is inside the phone's box", ringAt > 0 && phoneAt > ringAt && !/class="cmc-o"/.test(stage.slice(phoneAt)) && !/class="cmc-phone-wrap"/.test(stage.slice(ringAt, stage.indexOf('class="cmc-orbit"'))))
check("  the ring's layer is below the phone's (z 2 to 3) and neither shares a 3D space with the other", /\.cmc-ring\{position:absolute;z-index:2;/.test(css) && /\.cmc-phone-wrap\{position:absolute;z-index:3;/.test(css) && !/\.cmc-(ring|phone-wrap|world|rise)\{[^}]*preserve-3d/.test(css))
// Changed on purpose (landing round 12): the shade has one animation, its fade after the phone; still no transform or z-index of its own.
check("  the shade moves only with the phone: no transform or z-index of its own, its only animation the fade after the phone", !/\.cmc-shade[^{]*\{[^}]*(transform|z-index)/.test(css) && (css.match(/\.cmc-shade\{animation:/g) ?? []).length === 1 && /class="cmc-rise"><span class="cmc-shade"/.test(stage))
check("  the ring is set back by its radius: every product is behind the phone's plane", /\.cmc-orbit\{[^}]*transform:translate3d\(0,0,calc\(var\(--r\) \* -1\)\) rotateX/.test(css) && /^from\{transform:translate3d\(0,0,calc\(var\(--r\) \* -1\)\) rotateX\(var\(--tilt\)\) rotateY\(-26deg\)\}to\{transform:translate3d\(0,0,calc\(var\(--r\) \* -1\)\) rotateX\(var\(--tilt\)\) rotateY\(26deg\)\}$/.test(keyframes("cmc-spin")))
// Changed on purpose (landing round 12): the phone has its own fade rule now (48 to 80svh).
check("  nothing that sits over the shade fades but the phone: the wrap, the world and the rise keep full opacity", !/\.cmc-(phone-wrap|world|rise)\{[^}]*animation:cmc-(recede|out|in)\b/.test(tl) && /\.cmc-rise > \.cmc-phone\{animation:cmc-out/.test(tl))
// Changed on purpose (landing round 12): the owner found the phone too visible behind the cards; its blurred copy is gone.
check("  the phone has no blurred copy behind the cards", !/cmc-in-half|cmc-phone-soft/.test(css))

console.log("\n2. The phone: big as the section arrives, smaller under a two row headline")
check("the settled phone is the room one screen leaves under the headline; the big one a multiple of it", /--pe:min\(68vw,300px,calc\(\(100svh - var\(--hd\) - var\(--tt\) - var\(--fs\) \* 2\.1 - var\(--gap\) - var\(--pb\)\) \/ 2\.07\)\)/.test(css) && /--pw:calc\(var\(--pe\) \* var\(--big\)\)/.test(css) && /--big:1\.72;--ps:0\.581;--y0:40svh/.test(desk) && /--big:1\.24;--ps:0\.806;/.test(css))
check("  the phone's box is the big phone's; the world carries it from big and low to settled, one transform", /\.cmc-phone-wrap\{position:absolute;z-index:3;left:50%;top:0;width:var\(--pw\);height:calc\(var\(--pw\) \* 2\.07\);margin-left:calc\(var\(--pw\) \/ -2\)\}/.test(css) && /\.cmc-world\{position:relative;width:100%;height:100%;transform-origin:50% 0;transform:translate3d\(0,var\(--y1\),0\) scale\(var\(--ps\)\)\}/.test(css) && /^from\{transform:translate3d\(0,var\(--y0\),0\) scale\(1\)\}to\{transform:translate3d\(0,var\(--y1\),0\) scale\(var\(--ps\)\)\}$/.test(keyframes("cmc-settle")))
check("  on the scroll timeline over the first 44svh of the hold, eased", /\.cmc-world\{animation:cmc-settle cubic-bezier\(\.4,0,\.2,1\) both;animation-timeline:--cmc-t;animation-range:contain 0svh contain 44svh\}/.test(tl))
check("  it settles with its top under the headline's two rows (and so its foot on the stage's)", /--y1:calc\(var\(--hd\) \+ var\(--tt\) \+ var\(--fs\) \* 2\.1 \+ var\(--gap\)\)/.test(css) && /\.cmc-title\{margin:0 auto;font-size:var\(--fs\);font-weight:300;line-height:1\.04;/.test(css))
const rows = [...co.matchAll(/<span class="cmc-row">([\s\S]*?)<\/span>(?= ?<span class="cmc-row">|<\/h2>)/g)].map((m) => words(m[1]).trim())
check("the headline is two rows, each kept whole: \"Checkout that turns\" / \"a tap into a sale\"", rows.length === 2 && rows[0] === "Checkout that turns" && rows[1] === "a tap into a sale" && words(co.slice(co.indexOf("<h2"), co.indexOf("</h2>"))).replace(/\s+/g, " ").trim() === CHECKOUT_HEADING && /\.cmc-row\{display:block;white-space:nowrap\}/.test(css))
check("  each word still rises in on the timeline, in order", (co.match(/class="cmc-w" data-w="\d"/g) ?? []).length === 8 && /\.cmc-w\[data-w="7"\]\{animation-range:contain 23\.2svh contain 44svh\}/.test(tl))

console.log("\n3. Bring back the ones who almost bought: the email (round 12: the Recovered chart gone)")
const rec = card("recover")
// Changed on purpose (landing round 12): the owner: "get rid of the recovered chart/stats entirely".
check("the reminder email, and no Recovered tile", /class="cmv-mail"/.test(rec) && /Still thinking it over\?/.test(words(rec)) && !/Recovered|\$384\.00|\$416\.00|cmv-chart|came back/.test(words(rec) + rec))
// Changed on purpose (landing round 12): no chart; the email still comes up after the rail.
check("  the email comes up after the rail, and no chart is drawn", !/@keyframes cmv-wipe/.test(css) && /^0%,8%\{opacity:0;/.test(keyframes("cmv-mail")))
const mail = ruleIn(phoneCss, ".cmv-mail")
const got = ruleIn(phoneCss, ".cmv-got")
// Changed on purpose (landing round 12): no tile; the email runs across the square.
/* Changed on purpose (landing round 13, the owner: "like it's on desktop, but on mobile"): the computer's picture, only smaller, no layout of its own on a phone. */
check("  on a phone the email is placed as on a computer", !mail && !got && !/\.cmv-mail p\{display:none/.test(phoneCss))

console.log("\n4. One-tap: the dark in-page checkout, not the checkout page")
const tap = card("tap")
check("the phone in the card shows a creator's page and the instant checkout's window, not /checkout", /class="ic"/.test(tap) && /class="ic-sheet"/.test(tap) && /Buy now/.test(words(tap)) && !/class="pc"/.test(tap) && !/Continue shopping/.test(words(tap)))
check("  the window as instant-checkout.tsx draws it: the product in the head, Your details, Payment method, Pay with Apple Pay", /class="ic-head">[\s\S]*?class="ic-mark">[\s\S]*?Cine Tones LUT Pack[\s\S]*?Mara Quinn/.test(tap) && ["Your details", "Payment method", "Pay $29.00 with Apple Pay", "Payment complete", "Open it now"].every((w) => words(tap).includes(w)))
check("  dark, in app/theme-dark.css's colours", /\.ic-sheet\{[^}]*background:#18181b/.test(css) && /\.ic-head\{[^}]*background:#111113/.test(css) && /\.ic-pay\{[^}]*background:#2d2d33/.test(css) && /\.ic \.ap-sheet\{background:#1c1c1e/.test(css) && /\.cmc-ui\[data-dark\] \.cmc-status\{color:#fff\}/.test(css))
const sheetK = keyframes("ic-sheet")
check("  the loop starts and ends with the window open, so it never jumps as it starts over", /^0%,[\d.]+%\{transform:translate3d\(0,0,0\)/.test(sheetK) && /,100%\{transform:translate3d\(0,0,0\)\}$/.test(sheetK) && !/\.ic-sheet\{[^}]*transform/.test(css.slice(0, css.indexOf("@keyframes"))))
check("  every move of it transform and opacity", ["ic-t1", "ic-t2", "ic-pay", "ic-buy", "ic-dim", "ic-sheet", "ic-form", "ic-done", "ap-dim", "ap-sheet", "ap-side", "ap-done"].every((k) => onlyCompositor(keyframes(k))))
check("  the full page checkout stays the phone on the stage", /class="cmc-rise"><span class="cmc-shade" aria-hidden="true"><\/span><div class="cmc-phone"[\s\S]*?class="pc"/.test(stage) && !/data-dark/.test(stage))

console.log("\n5. On a phone: four stacked cards, every picture whole")
check("one card under another, no sideways scroll or snap anywhere", /\.cmc-bento\{grid-template-columns:minmax\(0,1fr\);gap:12px\}/.test(phoneCss) && !/scroll-snap|overflow-x:auto|touch-action:pan-x/.test(css))
/* Changed on purpose (landing round 13, the owner: "like it's on desktop, but on mobile"): the computer's picture, only smaller, no layout of its own on a phone. */
check("  each picture the computer's 48 x 42, scaled", /\.cmc-vis\{height:auto;aspect-ratio:48\/42;margin:0 -6px;border-radius:16px\}/.test(phoneCss) && /\.cmc-vis-in\{font-size:calc\(100cqw \/ 48\)\}/.test(phoneCss))
/* Changed on purpose (landing round 13, the owner: "like it's on desktop, but on mobile"): the computer's picture, only smaller, no layout of its own on a phone. */
check("  Built to convert: the computer's window, the order beside the form, not laid out again", !/\.cdx\{left:1em/.test(phoneCss) && !/--u:calc\(100cqw \/ 380\)/.test(css) && !/\.cdx-grid\{grid-template-columns:minmax\(0,1fr\)\}/.test(css) && !/\.cdx-sum-in\{animation-name:none\}/.test(css) && !/width:132%/.test(css))
const ph = ruleIn(phoneCss, ".cmv-phone")
/* Changed on purpose (landing round 13, the owner: "like it's on desktop, but on mobile"): the computer's picture, only smaller. */
check("  One-tap: the phone placed as on a computer, nothing panned", !ph && !/cmv-pan/.test(css))
check("  Local in 7 currencies kept, both tiles and all seven currencies", /Local in 7 currencies/.test(words(co)) && (card("currency").match(/class="cv-chip"/g) ?? []).length === 7 && (card("currency").match(/class="cv-tile"/g) ?? []).length === 2)

console.log("\n6. Solid: the cards and the facts")
check("the cards' ground is solid #111113, no alpha, no backdrop", /const CARD_GROUND = "#111113"/.test(src) && /\.cmc-card\{[^}]*background:#111113;/.test(css) && !/CARD_ALPHA|rgba\(17,17,19,0\.\d+\)/.test(src) && !/backdrop-filter/.test(css))
check("  the facts sit on a solid strip of the same ground and hairline", /\.cmc-facts\{[^}]*border-radius:28px;background:#111113;border:1px solid rgba\(255,255,255,\.08\)\}/.test(css))
// Changed on purpose (landing round 11, the ring fix): only the ring fades; the phone's box steps back without fading, so the shade under the phone stays solid.
// Changed on purpose (wave 18): a touch dimmer throughout (the owner), 0.4 behind the cards.
check("  the products still turn in the gaps, fainter (40%) behind them", /to\{opacity:0\.4;/.test(keyframes("cmc-recede")) && /\.cmc-ring\{animation:cmc-recede linear both;/.test(tl) && /\.cmc-phone-wrap\{animation:cmc-back linear both;animation-timeline:--cmc-t;animation-range:contain 48svh contain 100svh\}/.test(tl) && /^from\{transform:scale\(1\)\}to\{transform:scale\(0\.92\)\}$/.test(keyframes("cmc-back")))
check("the orbs stay as subtle as round 9 left them", /rgba\(139,92,246,\.085\)/.test(css) && /rgba\(255,255,255,\.035\)/.test(css))

console.log("\n7. Performance")
check("every keyframe in the section moves transform and opacity only", [...css.matchAll(/@keyframes ([\w-]+)\{/g)].map((m) => m[1]).every((k) => onlyCompositor(keyframes(k))))
check("no filter, blur or backdrop filter; one will-change, on the turning ring only while it turns", !/filter|blur\(/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")) && (css.match(/will-change:/g) ?? []).length === 1)
check("nothing per frame in script: no scroll listener, rAF, layout read, timer or state", !/addEventListener\("scroll"|requestAnimationFrame|getBoundingClientRect\(|offsetTop|setTimeout|setInterval|useState/.test(code(src)))

console.log("\nCopy and the push suite")
const all = words(co)
check("no banned words, no em dash, no banned samples", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(all) && !/—/.test(all) && !/Nadia|The Loop|LaSalle|Nails by Bea|Nordline|Charla|Static Bloom|Maren|Studio Marlow|Kai Moreno|[Cc]eramics|[Ee]nthusiasts|\bfans\b/.test(src + all))
// Changed on purpose (landing round 11, the ring fix): more round 11 suites now sit between the two entries.
check("registered in the push suite, after round 10's", /"tests\/home-landing-r10-checkout\.test\.ts",[\s\S]{0,4000}"tests\/home-landing-r11-checkout\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
