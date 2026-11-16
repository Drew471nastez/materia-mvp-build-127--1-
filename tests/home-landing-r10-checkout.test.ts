/**
 * LANDING ROUND 10, THE CHECKOUT SECTION (storelib.com home, the dark "Checkout that turns a tap into a sale")
 *
 * The owner: "when I reach the cards the rotating axis products should still be there in the background,
 * blurred and faded, rotating in 3D, not consuming much performance, very smooth and clean, going around
 * behind the cards". And for the round: on a 1440 x 800 screen the section must not feel oversized.
 *
 *   held behind the cards   the track holds the stage and the cards, so the sticky stage stays behind the
 *                           cards for as long as they are on screen; the cards start where they did (56svh
 *                           over the stage's foot), so the section's height on a phone is unchanged
 *   stepping back           as the cards come up the phone and the ring get a little smaller and fade to
 *                           55% (the wrap round the 3D space, never the space itself), the headline fades
 *                           before the cards reach it, and the ring keeps turning behind them
 *   blurred, cheaply        each object and the phone cross fade to a blurred copy baked as a small webp
 *                           (scripts/bake-checkout-soft.mjs): opacity on the scroll timeline, no CSS filter,
 *                           nothing blurred or painted again per frame
 *   seen through            the cards' ground 66% opaque, no ground behind the cards, so the products show
 *                           between, around and faintly through them
 *   1440 x 800              a card's picture never taller than 44svh (its drawing keeps its shape, centred):
 *                           a card 698px tall became 559px, the section 2984px became 2706px
 *
 * Measured against the dev server (scratch script, Playwright Chromium, cards on screen, ring turning):
 * 3s idle at 1440 x 800 2 paints before and after; iPhone 13 at 4x CPU 0 paints before and after,
 * frames 16.6ms on average either way.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { CheckoutScene, CHECKOUT_STYLES, FLOATS, SOFT } from "../components/marketing/home/checkout-scene"

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
const onlyCompositor = (body: string) => body.length > 0 && [...body.matchAll(/[{;]([a-z-]+):/g)].map((x) => x[1]).every((p) => p === "transform" || p === "opacity")
const rule = (sel: string) => css.match(new RegExp(`(?:^|\\n|\\})${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{([^}]*)\\}`))?.[1] ?? ""
/* The rules that only apply with scroll timelines, and those that apply everywhere. */
const tl = css.slice(css.indexOf("@supports (animation-timeline:view()){"), css.indexOf(" * The cards: no ground of their own"))
const base = css.slice(0, css.indexOf("@media (prefers-reduced-motion:no-preference){", css.indexOf(".cmc-phone-soft{transform:none}")))
const still = css.slice(css.lastIndexOf("@media (prefers-reduced-motion:reduce)"))
/* A webp's canvas size, from its VP8X header. */
const webpSize = (p: string) => {
  const b = readFileSync(p)
  return { vp8x: b.toString("ascii", 12, 16) === "VP8X", alpha: (b[20] & 0x10) !== 0, w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) }
}

console.log("\n1. The stage stays held behind the cards")
const track = co.slice(co.indexOf('class="cmc-track"'))
check("one track holds the stage and then the cards", /^class="cmc-track"><div class="cmc-stage">/.test(track) && track.indexOf('class="cmc-cards"') > track.indexOf('class="cmc-phone-wrap"') && /<\/ul><\/div><\/div><\/div><\/section>$/.test(co))
check("  the stage is sticky and the track carries the timeline, only where scroll timelines exist", /\.cmc\[data-story-section\] > \.cmc-track\.cmc-track\{view-timeline:--cmc-t block\}/.test(tl) && /\.cmc-stage\{position:sticky;top:0\}/.test(tl) && !/position:sticky/.test(base))
check("  the cards start where round 9 had them: 56svh over the stage's foot, above the stage (z 5)", /\.cmc-track > \.cmc-cards\{margin-top:calc\(100svh - 56svh\)\}/.test(tl) && /\.cmc-cards\{position:relative;z-index:5;margin-top:-8svh\}/.test(css))
check("  no height on the track: it is the stage's and the cards' own", !/\.cmc-track\.cmc-track\{[^}]*height:(?!auto)/.test(css))
check("the timeline's ranges are svh of scroll (the track is longer now), so the entrance keeps its pace", /\.cmc-world\{[^}]*animation-range:contain 0svh contain 44svh\}/.test(tl) && /\.cmc-w\[data-w="7"\]\{animation-range:contain 23\.2svh contain 44svh\}/.test(tl) && !/contain [\d.]+%/.test(tl.replace(/animation-range:entry 0% exit 100%/g, "")))

console.log("\n2. As the cards come up, the phone and the ring step back")
// Changed on purpose (landing round 11): the ring is its own 3D space under the phone now, and both step back to 45% (the cards are solid, the products show only in the gaps).
// Changed on purpose (landing round 11): the phone's box only steps back now (cmc-back) and the ring alone fades, so the shade in the phone's box under it stays solid and no product shows through the fading phone.
// Changed on purpose (wave 18): the ring starts at 0.88 (the owner: the products a touch dimmer) and fades to 0.4, the old 45% made as much darker.
check("the phone's box and the ring's box get a little smaller and the ring fades to 40%, on the timeline", /\.cmc-phone-wrap\{animation:cmc-back linear both;animation-timeline:--cmc-t;animation-range:contain 48svh contain 100svh\}/.test(tl) && /\.cmc-ring\{animation:cmc-recede linear both;animation-timeline:--cmc-t;animation-range:contain 48svh contain 100svh\}/.test(tl) && /^from\{opacity:0\.88;transform:scale\(1\)\}to\{opacity:0\.4;transform:scale\(0\.92\)\}$/.test(keyframes("cmc-recede")))
check("  the 3D space itself is never faded or filtered (that would flatten it)", !/\.cmc-(world|orbit|o)\{[^}]*(opacity|filter|mask|overflow)/.test(css) && !/\.cmc-(world|orbit|o)\{animation:cmc-(recede|out|in)/.test(css))
check("  the headline fades before the cards reach it", /\.cmc-copy\{animation:cmc-out linear both;animation-timeline:--cmc-t;animation-range:contain 86svh contain 116svh\}/.test(tl))
/* Changed on purpose (wave 17): the stage wakes a screen ahead (it popped in on an iPhone recording); still paused off screen beyond that and in a hidden tab. */
// Changed on purpose (landing round 12): the ring wakes half a screen ahead (the page audit), and its clock loops pause once the cards have come up half a screen past the top (data-cmc-covered); the scroll still turns it.
check("the ring keeps turning behind the cards: its loop still runs on the stage's own observer, paused off screen", /\.cmc:not\(\[data-cmc-covered\]\) \.cmc-stage\[data-commerce-live\] \.cmc-o\{animation-play-state:running;will-change:transform\}/.test(css) && /const \[stageRef\] = useCommerceLive<HTMLDivElement>\("50% 0px", false\)/.test(src) && /<div ref=\{stageRef\} className="cmc-stage">/.test(src))

console.log("\n3. Blurred, without blurring anything in the browser")
const stage = co.slice(co.indexOf('class="cmc-stage"'), co.indexOf('class="cmc-cards"'))
// Changed on purpose (landing round 11): the sharp object sits in cmc-near (its depth fade), and the copy is drawn twice: cmc-far for depth, cmc-soft for the cards.
check("every object on the ring has a blurred copy beside it in its face", FLOATS.every((f) => new RegExp(`data-f="${f.id}"[^>]*><span class="cmc-face"><span class="cmc-sharp"><span class="cmc-near">[\\s\\S]*?</span></span><img class="cmc-far" src="/home/commerce/soft-${f.id}\\.webp"[^>]*><img class="cmc-soft" src="/home/commerce/soft-${f.id}\\.webp"`).test(stage)))
// Changed on purpose (landing round 11): the shade comes first in the phone's box.
// Changed on purpose (landing round 12): the owner found the phone "too visible" behind the cards: it has no blurred copy now, it fades out whole.
check("  and the big phone has none: it fades out whole", /<div class="cmc-rise"><span class="cmc-shade" aria-hidden="true"><\/span><div class="cmc-phone"/.test(stage) && !/cmc-phone-soft|soft-phone/.test(stage))
const softs = stage.match(/<img class="cmc-soft[^>]*>/g) ?? []
// Changed on purpose (landing round 12): one copy fewer, the phone's.
check("  each with its width and height, lazy, decoded off the main thread, no words", softs.length === FLOATS.length && (stage.match(/<img class="cmc-far"/g) ?? []).length === FLOATS.length && softs.every((t) => /width="\d+"/.test(t) && /height="\d+"/.test(t) && /loading="lazy"/.test(t) && /decoding="async"/.test(t) && /alt=""/.test(t)))
const files = Object.keys(SOFT).map((k) => [k, `public/home/commerce/soft-${k}.webp`] as const)
// Changed on purpose (landing round 12): no copy of the phone.
check("the copies are small webp files with alpha, each under 4 KB, all under 20 KB", Object.keys(SOFT).sort().join() === FLOATS.map((f) => f.id).sort().join() && files.every(([, p]) => existsSync(p) && webpSize(p).vp8x && webpSize(p).alpha && statSync(p).size < 4 * 1024) && files.reduce((a, [, p]) => a + statSync(p).size, 0) < 20 * 1024)
check("  the sizes in the code are the files' own", files.every(([k, p]) => webpSize(p).w === SOFT[k].w && webpSize(p).h === SOFT[k].h))
// Changed on purpose (landing round 11): the depth copy (cmc-far) shares the rule.
// Changed on purpose (landing round 12): the phone's copy and its rule are gone.
check("  a copy is its object's box with a fifth of its width spare on every side, turned with it", /\.cmc-soft,\.cmc-far\{position:absolute;left:0;top:0;display:block;width:140%;max-width:none;height:auto;margin:-20% 0 0 -20%;opacity:0;pointer-events:none;-webkit-user-drag:none;transform:rotate\(var\(--rz\)\)\}/.test(css) && /\.cmc-face\{position:relative;/.test(css) && !/\.cmc-phone-soft/.test(css))
// Changed on purpose (landing round 12): the phone has its own, shorter fade (48 to 80svh); the objects keep theirs.
check("the sharp object fades out as its copy fades in, on the same stretch of the timeline", /\.cmc-sharp\{animation:cmc-out linear both;animation-timeline:--cmc-t;animation-range:contain 48svh contain 92svh\}/.test(tl) && /\.cmc-soft\{animation:cmc-in linear both;animation-timeline:--cmc-t;animation-range:contain 48svh contain 92svh\}/.test(tl))
// Changed on purpose (landing round 11): the wrap no longer fades it, so the copy ends at 30% of the ring's 45% itself.
// Changed on purpose (landing round 12): no copy of the phone comes up at all.
check("  no copy of the phone comes up behind the cards, so the products lead", !/cmc-phone-soft|cmc-in-half/.test(css))
check("  the card demos' own phone is not touched", !/(^|[^>] )\.cmc-phone\{animation/.test(css) && !/\.cmv-phone \.cmc-phone\{[^}]*animation/.test(css))
// Changed on purpose (landing round 12): cmc-in-half is gone with the phone's copy.
check("every new keyframe moves opacity and transform only", ["cmc-recede", "cmc-out", "cmc-in"].every((k) => onlyCompositor(keyframes(k))))
check("no filter, blur or backdrop filter anywhere in the section, and no new will-change", !/filter|blur\(/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")) && (css.match(/will-change:/g) ?? []).length === 1)
check("nothing per frame in script: no scroll listener, rAF, layout read, timer or state", !/addEventListener\("scroll"|requestAnimationFrame|getBoundingClientRect\(|offsetTop|setTimeout|setInterval|useState/.test(code(src)))
const bake = read("scripts/bake-checkout-soft.mjs")
// Changed on purpose (landing round 12): the script no longer bakes the phone.
check("the copies are baked from the scene itself by a script in the repo", /soft-\$\{name\}\.webp/.test(bake) && !/bake\("\.cmc-rise > \.cmc-phone"/.test(bake) && /const PAD = 0\.2/.test(bake) && /\.blur\(sigma\)/.test(bake))

console.log("\n4. The products show between, around and through the cards")
check("the cards' box has no ground of its own", !/background/.test(rule(".cmc-cards")) && !/\.cmc-cards[^{]*\{[^}]*background/.test(css))
// Changed on purpose (landing round 11): the owner: the cards should not be transparent. Solid now.
check("  each card is the same dark, solid, still with its hairline", /\.cmc-card\{[^}]*border-radius:28px;background:#111113;border:1px solid rgba\(255,255,255,\.08\)/.test(css) && !/backdrop-filter/.test(css))

console.log("\n5. Not oversized on a 1440 x 800 screen")
check("a card's picture is 48 x 42 but never taller than 44svh", /\.cmc-card\{[^}]*container-type:inline-size;--vis-cap:44svh\}/.test(css) && /\.cmc-vis\{[^}]*height:min\(calc\(100cqw \* 42 \/ 48\),var\(--vis-cap\)\)/.test(css) && /* Changed on purpose (landing round 13): a phone uses the same 48 x 42 shape, as an aspect ratio. */ !/^\.cmc-vis\{[^}]*aspect-ratio:48\/42/m.test(css))
check("  where capped, its drawing keeps its shape and sits in the middle (a 48 x 42 em box, its own container)", /\.cmc-vis-in\{position:absolute;left:50%;top:0;width:48em;height:42em;margin-left:-24em;font-size:min\(calc\(100cqw \/ 48\),calc\(var\(--vis-cap\) \/ 42\)\);[^}]*container-type:inline-size\}/.test(css))
// Changed on purpose (landing round 11): on a phone the cards are stacked and each picture is a whole square, a 32 x 32 grid.
/* Changed on purpose (landing round 13, the owner: "like it's on desktop, but on mobile"): the computer's picture, only smaller, no layout of its own on a phone. */
check("  a phone draws the computer's 48 x 42 picture, scaled", /\.cmc-vis\{height:auto;aspect-ratio:48\/42;/.test(css) && /\.cmc-vis-in\{font-size:calc\(100cqw \/ 48\)\}/.test(css))
// Changed on purpose (landing round 11): the settled phone's width (--pe) is the room one screen leaves under a two row headline; the big phone it starts as is a multiple of it.
check("the stage itself stays one small screen tall (svh), the phone sized from it", /\.cmc-stage\{position:relative;height:100svh;/.test(css) && /--pe:min\(400px,calc\(\(100svh - var\(--hd\) - var\(--tt\) - var\(--fs\) \* 2\.1 - var\(--gap\) - var\(--pb\)\) \/ 2\.07\)\)/.test(css))

console.log("\n6. Reduced motion and no scroll timelines")
// Changed on purpose (landing round 11): the copies' rule is shared with cmc-far.
check("reduced motion: nothing held, no overlap, nothing moving, the copies never shown", /\.cmc-cards\{margin-top:0\}/.test(still) && /\.cmc\[data-story-section\] > \.cmc-track\.cmc-track\{height:auto\}/.test(still) && /\.cmc-stage \*\{transition:none!important;animation:none!important\}/.test(still) && /opacity:0/.test(rule(".cmc-soft,.cmc-far")))
check("every timeline rule sits inside prefers-reduced-motion: no-preference", css.lastIndexOf("@media (prefers-reduced-motion:no-preference){", css.indexOf("@supports (animation-timeline:view()){")) > css.indexOf(".cmc-phone-soft{transform:none}"))

console.log("\nCopy and the push suite")
const words = co.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]*>/g, " ")
check("no banned words, no em dash, no banned samples", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(words) && !/—/.test(words) && !/Nadia|The Loop|LaSalle|Nails by Bea|Nordline|Charla|Static Bloom|Maren|Harbor|[Ee]nthusiasts/.test(src + words))
check("registered in the push suite, after round 9's", /"tests\/home-landing-r9-[a-z]+\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r10-checkout\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
