/**
 * ===========================================================================
 *  HOME, LANDING ROUND 6 (SHOWCASE): CAPTIONS UNDER THE CARDS, A 4:3 PHONE
 *  RAIL AND AUTOPLAY THAT WAITS FOR THE READER
 * ===========================================================================
 * components/marketing/build-showcase.tsx and use-showcase-motion.ts.
 *
 * The owner, after round 5:
 *   - "when I hover, the text there on mobile devices and desktop gets
 *     overlapped": the caption lay over the bottom of the picture and the
 *     section cut the cards' bottom, so it ran into both. It is now a line of
 *     its own under the picture, and the cards end inside the section.
 *   - "increase a little bit the height at the bottom of the section".
 *   - On a phone, the reference: 4:3 landscape cards about 78% of the screen
 *     wide on the gutter, the next one peeking in, a small gap.
 *   - The swipe "smooth and clean like the video": the browser's own scroller
 *     follows the finger and its momentum, and autoplay never moves a rail
 *     the reader is using or that is still moving.
 *
 * Measured in a browser by scripts/check-showcase-swipe.mjs (CDP touch at
 * iPhone 13 emulation, and a mouse hover at 1440).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { BuildShowcase, SHOWCASE_EXAMPLES } from "@/components/marketing/build-showcase"
import { SHOWCASE_NATIVE } from "@/components/marketing/use-showcase-motion"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `  (${JSON.stringify(detail)})`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const showcase = read("components/marketing/build-showcase.tsx")
const hook = read("components/marketing/use-showcase-motion.ts")
const css = showcase.slice(showcase.indexOf("const CSS = `"))
const phone = css.slice(css.indexOf("@media(max-width:767px)"))
const native = hook.slice(hook.indexOf("function startNative"), hook.indexOf("export function useShowcaseMotion"))
const html = renderToStaticMarkup(createElement(BuildShowcase))

console.log("\n── The caption never lands on anything ──")
const figures = html.match(/<figure[^>]*>[\s\S]*?<\/figure>/g) ?? []
check("twelve cards, each a picture box and then its caption", figures.length === 12 && figures.every((f) => /<div class="build-showcase-pic"><img [^>]*\/><\/div><figcaption>[^<]+<\/figcaption><\/figure>$/.test(f)), figures.length)
check("the caption is in the flow under the picture, never laid over it", !/figcaption \{[^}]*position:absolute/.test(css) && /\.build-showcase-slide figcaption \{height:44px;padding-top:14px;box-sizing:border-box;overflow:hidden;white-space:nowrap;text-overflow:ellipsis/.test(css))
check("it keeps its line whether shown or not, so a hover moves nothing (opacity only)", /\.build-showcase-slide figcaption \{[^}]*opacity:0;[^}]*transition:opacity/.test(css) && !/figcaption\{[^}]*(transform|height|margin)[^}]*\}/.test(css.replace(/\.build-showcase-slide figcaption\{height:38px[^}]*\}/, "")))
check("a mouse shows it on hover, never while dragging", /@media\(hover:hover\) and \(pointer:fine\)\{\.build-showcase-track:not\(\[data-dragging\]\) \.build-showcase-slide:hover figcaption\{opacity:1/.test(css))
check("a touch screen has no hover, so there it is simply shown", /@media\(hover:none\),\(pointer:coarse\)\{\.build-showcase-slide figcaption\{opacity:1;transition:none\}\}/.test(css))
check("the picture is clipped in its own box, the caption outside it", /\.build-showcase-pic \{[^}]*border-radius:7px;contain:paint;isolation:isolate;background:#151517;overflow:hidden\}/.test(css) && !/\.build-showcase-slide \{[^}]*overflow:hidden/.test(css))

console.log("\n── The cards end inside the section, with room under them ──")
check("no negative bottom margin runs the rail past the section's edge", !/margin-bottom:calc\([^)]*-\./.test(css) && !/--showcase-height/.test(css))
// Changed on purpose (landing round 7): the owner: "the bottom padding of the section under the hero is too short"; 52 to 96px under the caption line, 44 to 64px on a phone (tests/home-landing-r7-frame.test.ts).
check("desktop: padding under the caption line", /\.build-showcase-card \{[^}]*padding:clamp\(72px,7vw,112px\) 0 clamp\(52px,5\.4vw,96px\)\}/.test(css))
check("phone: padding under the caption line", /\.build-showcase-card\{padding:64px 0 clamp\(44px,12vw,64px\)\}/.test(phone))
check("the left-gutter cover is gone (nothing fades over a moving card)", !/build-showcase-viewport::after/.test(css))

console.log("\n── On a phone: the reference's shape ──")
check("every card is 78% of the screen wide (440px at most), on the gutter", /--showcase-card:min\(78vw,440px\)/.test(phone) && /\.build-showcase-slide\{flex:0 0 var\(--showcase-card\);width:var\(--showcase-card\);scroll-snap-align:start;scroll-snap-stop:normal\}/.test(phone) && /padding-inline:var\(--showcase-gutter\);scroll-padding-inline:var\(--showcase-gutter\)/.test(phone))
check("4:3 landscape, OnePages too, 10px apart", /\.build-showcase-pic,\.build-showcase-slide\[data-format="portrait"\] \.build-showcase-pic\{aspect-ratio:4\/3;border-radius:8px\}/.test(phone) && /--showcase-gap:10px/.test(phone))
check("a OnePage stands in its card as a phone screen, on its own page colour", /\[data-format="portrait"\] \.build-showcase-pic\{background:var\(--showcase-tone,#151517\)\}/.test(phone) && /\[data-format="portrait"\] \.build-showcase-pic img\{position:absolute;left:27%;top:9%;width:46%;height:auto;aspect-ratio:540\/1056/.test(phone))
const tones = SHOWCASE_EXAMPLES.filter((e) => e.format === "portrait").map((e) => e.tone)
check("each OnePage has its tone, the wide pages none", tones.length === 4 && tones.every((t) => /^#[0-9a-f]{6}$/.test(t ?? "")) && SHOWCASE_EXAMPLES.filter((e) => e.format === "wide").every((e) => e.tone === undefined), tones)
check("the tone reaches the card as a custom property", (html.match(/style="--showcase-tone:#[0-9a-f]{6}"/g) ?? []).length === 4)
check("the phone rail has hard edges: no mask over a scroller (it keeps WebKit's scroll on the compositor)", /\.build-showcase-viewport\{margin-inline:0;mask-image:none;-webkit-mask-image:none\}/.test(phone))
check("desktop keeps its groups: wide, OnePage, wide in their own shapes", /grid-template-columns:256fr 90fr 256fr/.test(css) && /aspect-ratio:1440\/990/.test(css) && /\.build-showcase-slide\[data-format="portrait"\] \.build-showcase-pic \{aspect-ratio:540\/1056\}/.test(css))

console.log("\n── The swipe is the browser's, autoplay waits for the reader ──")
check("the native scroller: both axes to the browser, mandatory snap, no back gesture at the ends", /\.build-showcase-track \{[^}]*overflow-x:auto;[^}]*touch-action:pan-x pan-y pinch-zoom;overscroll-behavior-x:contain;scroll-snap-type:x mandatory/.test(css))
check("no touchmove listener and nothing per frame on the native rail", !/"touchmove"/.test(native) && !/requestAnimationFrame\(tick|requestAnimationFrame\(step/.test(native))
check("the timing: a card every 4.2s, 6s after the reader's last scroll, never into a moving rail", SHOWCASE_NATIVE.intervalMs === 4200 && SHOWCASE_NATIVE.idleMs === 6000 && SHOWCASE_NATIVE.settleMs >= 150)
check("every scroll that is not autoplay's own counts as reading (momentum after the finger lifts too)", /const onScroll = \(\) => \{\s*const now = performance\.now\(\)\s*lastMove = now[\s\S]*?if \(!auto\) lastRead = now/.test(native))
check("autoplay steps only once the reader has been idle, an interval has passed and the rail is still", /lastRead \+ SHOWCASE_NATIVE\.idleMs,\s*lastStep \+ SHOWCASE_NATIVE\.intervalMs,\s*lastMove \+ SHOWCASE_NATIVE\.settleMs/.test(native) && /if \(touching \|\| due > now\) return schedule/.test(native))
check("a touch, a mouse press, a sideways wheel or a key takes the rail back from autoplay at once", /const hold = \(\) => \{[\s\S]*?auto = false\s*lastRead = performance\.now\(\)/.test(native) && (native.match(/hold\(\)/g) ?? []).length >= 5)
check("autoplay is one smooth scrollTo the next card, marked as its own", /auto = true\s*lastStep = performance\.now\(\)\s*el\.scrollTo\(\{ left: stops\[next\], behavior: "smooth" \}\)/.test(native))
check("coming on screen, it rests a whole interval before the first step", /if \(v && !visible\) lastStep = performance\.now\(\)/.test(native))
check("one timer at most, no timer per scroll event", /const schedule = \(ms: number = SHOWCASE_NATIVE\.intervalMs\) => \{\s*clearTimeout\(timer\)/.test(native) && !/onScroll[\s\S]{0,200}setTimeout/.test(native))
check("the browser check is there", /Input\.dispatchTouchEvent/.test(read("scripts/check-showcase-swipe.mjs")))

console.log("\n── Words ──")
const words = SHOWCASE_EXAMPLES.map((e) => `${e.label} ${e.alt}`).join(" ")
check("no banned words or em dashes in the cards", !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(words) && !/—/.test(words))
check("captions are three words at most", SHOWCASE_EXAMPLES.every((e) => e.label.split(/\s+/).length <= 3))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
