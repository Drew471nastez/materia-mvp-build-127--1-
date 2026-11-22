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
// Changed on purpose (landing round 16): the stage is held at every width (under the header on a phone); the track carries the timeline where scroll timelines exist.
// Changed on purpose (landing round 17): the cards start from the phone's foot.
check("  the stage is held at every width and the track carries the timeline where scroll timelines exist", /\.cmc\[data-story-section\] > \.cmc-track\.cmc-track\{view-timeline:--cmc-t block\}/.test(tl) && /\.cmc-stage\{position:sticky;top:var\(--hd\)\}\s*\.cmc-track > \.cmc-cards\{margin-top:calc\(var\(--foot\)/.test(css) && /@media \(min-width:900px\)\{\s*\.cmc-stage\{top:0\}/.test(css))
/* Changed on purpose (landing round 15): 80svh of hold before the cards, not 100svh. */
// Changed on purpose (landing round 16): the cards start 40svh after the held stage and come up over it on the page's own scroll.
// Changed on purpose (landing round 17): the cards start from the phone's foot.
check("  the cards start from the phone's foot, above the stage (z 5)", /\.cmc-track > \.cmc-cards\{margin-top:calc\(var\(--foot\) \+ var\(--over\)/.test(css) && /\.cmc-cards\{position:relative;z-index:5;margin-top:-8svh\}/.test(css))
check("  no height on the track: it is the stage's and the cards' own", !/\.cmc-track\.cmc-track\{[^}]*height:(?!auto)/.test(css))
/* Changed on purpose (landing round 15): the settle and the words run from 84svh before the hold; the phone sinks behind the cards to the track's end (contain 100%), the one range in percent. */
// Changed on purpose (landing round 16): two ranges, both svh of scroll: the phone's settle and the heading.
// Changed on purpose (landing round 17): the phone's sink replaces the heading on the timeline.
check("the timeline's ranges are svh of scroll, so the entrance keeps its pace", /\.cmc-world\{animation:cmc-settle cubic-bezier\(\.333,0,\.667,\.333\) both;animation-timeline:--cmc-t;animation-range:contain -88svh contain -8svh\}/.test(tl) && /\.cmc-phone-wrap\{animation:cmc-sink cubic-bezier\(\.4,0,\.6,1\) both;animation-timeline:--cmc-t;animation-range:contain 10svh contain 54svh\}/.test(tl) && !/contain [\d.]+%/.test(tl))

console.log("\n2. As the cards come up, the phone and the ring step back")
// Changed on purpose (landing round 11): the ring is its own 3D space under the phone now, and both step back to 45% (the cards are solid, the products show only in the gaps).
// Changed on purpose (landing round 11): the phone's box only steps back now (cmc-back) and the ring alone fades, so the shade in the phone's box under it stays solid and no product shows through the fading phone.
// Changed on purpose (wave 18): the ring starts at 0.88 (the owner: the products a touch dimmer) and fades to 0.4, the old 45% made as much darker.
/* Changed on purpose (landing round 15): every range after the settle starts 20svh sooner (28svh), and the phone's box also sinks (--sink) to the track's end. */
// Changed on purpose (landing round 16): behind the cards the phone and the ring step back as transitions (data-cmc-back), not on the scroll.
check("the phone's box and the ring's box get a little smaller and the ring fades to 40%, once the cards are up", /\.cmc\[data-cmc-back\] \.cmc-phone-wrap\{transform:translate3d\(0,var\(--sink\),0\) scale\(0\.9\)\}/.test(css) && /\.cmc\[data-cmc-back\] \.cmc-ring\{opacity:0\.4;transform:scale\(0\.92\)\}/.test(css) && /\.cmc-ring\{position:absolute;[^}]*opacity:0\.88\}/.test(css))
check("  the 3D space itself is never faded or filtered (that would flatten it)", !/\.cmc-(world|orbit|o)\{[^}]*(opacity|filter|mask|overflow)/.test(css) && !/\.cmc-(world|orbit|o)\{animation:cmc-(recede|out|in)/.test(css))
/* Changed on purpose (landing round 15): 20svh sooner, with the cards. */
// Changed on purpose (landing round 16): the heading fades from 44 to 68svh, as the cards come up.
// Changed on purpose (landing round 17): the heading fades as the phone goes soft (data-cmc-back).
check("  the headline fades before the cards reach it", /\.cmc\[data-cmc-back\] \.cmc-copy\{opacity:0;/.test(css))
/* Changed on purpose (wave 17): the stage wakes a screen ahead (it popped in on an iPhone recording); still paused off screen beyond that and in a hidden tab. */
// Changed on purpose (landing round 12): the ring wakes half a screen ahead (the page audit), and its clock loops pause once the cards have come up half a screen past the top (data-cmc-covered); the scroll still turns it.
check("the ring keeps turning behind the cards: its loop still runs on the stage's own observer, paused off screen", /\.cmc:not\(\[data-cmc-covered\]\) \.cmc-stage\[data-commerce-live\] \.cmc-o\{animation-play-state:running;will-change:transform\}/.test(css) && /const \[stageRef\] = useCommerceLive<HTMLDivElement>\("50% 0px", false\)/.test(src) && /<div ref=\{stageRef\} className="cmc-stage">/.test(src))

console.log("\n3. Blurred, without blurring anything in the browser")
const stage = co.slice(co.indexOf('class="cmc-stage"'), co.indexOf('class="cmc-cards"'))
// Changed on purpose (landing round 11): the sharp object sits in cmc-near (its depth fade), and the copy is drawn twice: cmc-far for depth, cmc-soft for the cards.
check("every object on the ring has a blurred copy beside it in its face", FLOATS.every((f) => new RegExp(`data-f="${f.id}"[^>]*><span class="cmc-face"><span class="cmc-sharp"><span class="cmc-near">[\\s\\S]*?</span></span><img class="cmc-far" src="/home/commerce/soft-${f.id}\\.webp"[^>]*><img class="cmc-soft" src="/home/commerce/soft-${f.id}\\.webp"`).test(stage)))
// Changed on purpose (landing round 11): the shade comes first in the phone's box.
// Changed on purpose (landing round 12): the owner found the phone "too visible" behind the cards: it has no blurred copy now, it fades out whole.
/* Changed on purpose (landing round 15): the owner wants the phone behind the cards again, very blurred and lower: its baked copy is back, after the phone in its box. */
check("  and the big phone has one again, after it in its own box", /<div class="cmc-rise"><span class="cmc-shade" aria-hidden="true"><\/span><div class="cmc-phone"/.test(stage) && /<img class="cmc-phone-soft" src="\/home\/commerce\/soft-phone\.webp"/.test(stage))
const softs = stage.match(/<img class="cmc-soft[^>]*>/g) ?? []
// Changed on purpose (landing round 12): one copy fewer, the phone's.
// Changed on purpose (landing round 21): the ring's pictures load with the scene (eager), since a lazy one turning around the phone could still have no pixels when the page came to rest on it.
check("  each with its width and height, loaded with the scene, decoded off the main thread, no words", softs.length === FLOATS.length && (stage.match(/<img class="cmc-far"/g) ?? []).length === FLOATS.length && softs.every((t) => /width="\d+"/.test(t) && /height="\d+"/.test(t) && /loading="eager"/.test(t) && /decoding="async"/.test(t) && /alt=""/.test(t)))
const files = Object.keys(SOFT).map((k) => [k, `public/home/commerce/soft-${k}.webp`] as const)
// Changed on purpose (landing round 12): no copy of the phone.
check("the copies are small webp files with alpha, each under 4 KB, all under 20 KB", Object.keys(SOFT).sort().join() === FLOATS.map((f) => f.id).sort().join() && files.every(([, p]) => existsSync(p) && webpSize(p).vp8x && webpSize(p).alpha && statSync(p).size < 4 * 1024) && files.reduce((a, [, p]) => a + statSync(p).size, 0) < 20 * 1024)
check("  the sizes in the code are the files' own", files.every(([k, p]) => webpSize(p).w === SOFT[k].w && webpSize(p).h === SOFT[k].h))
// Changed on purpose (landing round 11): the depth copy (cmc-far) shares the rule.
// Changed on purpose (landing round 12): the phone's copy and its rule are gone.
check("  a copy is its object's box with a fifth of its width spare on every side, turned with it", /\.cmc-soft,\.cmc-far\{position:absolute;left:0;top:0;display:block;width:140%;max-width:none;height:auto;margin:-20% 0 0 -20%;opacity:0;pointer-events:none;-webkit-user-drag:none;transform:rotate\(var\(--rz\)\)\}/.test(css) && /\.cmc-face\{position:relative;/.test(css))
// Changed on purpose (landing round 12): the phone has its own, shorter fade (48 to 80svh); the objects keep theirs.
/* Changed on purpose (landing round 15): 20svh sooner, with the cards. */
// Changed on purpose (landing round 16): the cross fade is a transition once the cards are up.
check("the sharp object fades out as its copy fades in, together", /\.cmc\[data-cmc-back\] :is\(\.cmc-rise > \.cmc-phone,\.cmc-sharp\)\{opacity:0\}/.test(css) && /\.cmc\[data-cmc-back\] \.cmc-soft\{opacity:1\}/.test(css))
// Changed on purpose (landing round 11): the wrap no longer fades it, so the copy ends at 30% of the ring's 45% itself.
// Changed on purpose (landing round 12): no copy of the phone comes up at all.
/* Changed on purpose (landing round 15): the phone's blurred copy comes up again, faint (0.3), as the sharp phone goes. */
// Changed on purpose (landing round 16): a transition once the cards are up.
check("  the phone's copy comes up faint behind the cards, the products still lead", /\.cmc\[data-cmc-back\] \.cmc-phone-soft\{opacity:0\.3\}/.test(css) && !/cmc-in-half/.test(css))
check("  the card demos' own phone is not touched", !/(^|[^>] )\.cmc-phone\{animation/.test(css) && !/\.cmv-phone \.cmc-phone\{[^}]*animation/.test(css))
// Changed on purpose (landing round 12): cmc-in-half is gone with the phone's copy.
// Changed on purpose (landing round 16): the section's scroll keyframes are cmc-settle and cmc-head.
// Changed on purpose (landing round 17): cmc-sink replaces cmc-head.
check("every new keyframe moves opacity and transform only", onlyCompositor(keyframes("cmc-settle")) && onlyCompositor(keyframes("cmc-sink")))
// Changed on purpose (landing round 16): one more will-change, on the phone while the section is near (one raster as it scales).
check("no filter, blur or backdrop filter anywhere in the section, and one more will-change, only while near", !/filter|blur\(/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")) && (css.match(/will-change:/g) ?? []).length === 2)
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
// Changed on purpose (landing round 15): under 900px the stage is held under the header, so it is the screen less the header there; from 900px one screen as before.
// Changed on purpose (landing round 16): on a computer the settled phone is a fifth of the screen wide (the owner's reference).
// Changed on purpose (landing round 17): the stage's numbers are on the track; on a computer the phone is also capped by the room under the heading.
check("the stage itself stays one small screen tall (svh), the phone sized from it", /\.cmc-stage\{position:relative;height:calc\(100svh - var\(--at\)\);/.test(css) && /\.cmc-track\{--hd:69px;--top:var\(--hd\);--at:0px;/.test(css) && /--pe:min\(50vw,230px,calc\(\(100svh - var\(--hd\) - var\(--tt\) - var\(--fs\) \* 2\.1 - var\(--gap\) - var\(--pb\)\) \/ 2\.07\)\)/.test(css) && /--pe:min\(clamp\(220px,20vw,440px\),/.test(css))

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
