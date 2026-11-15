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
import { SHOWCASE_AUTOPLAY } from "@/components/marketing/use-showcase-motion"

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
const rail = hook.slice(hook.indexOf("function startRail"), hook.indexOf("export function useShowcaseMotion"))
const html = renderToStaticMarkup(createElement(BuildShowcase))

console.log("\n── The caption never lands on anything ──")
const figures = html.match(/<figure[^>]*>[\s\S]*?<\/figure>/g) ?? []
/* Changed on purpose (landing round 9): the box is a <picture>, with a 4:3 source for phones in a store's, website's or community's. */
check("twelve cards, each a picture box and then its caption", figures.length === 12 && figures.every((f) => /<picture class="build-showcase-pic">(?:<source [^>]*\/>)?<img [^>]*\/><\/picture><figcaption>[^<]+<\/figcaption><\/figure>$/.test(f)), figures.length)
check("the caption is in the flow under the picture, never laid over it", !/figcaption \{[^}]*position:absolute/.test(css) && /\.build-showcase-slide figcaption \{height:44px;padding-top:14px;box-sizing:border-box;overflow:hidden;white-space:nowrap;text-overflow:ellipsis/.test(css))
check("it keeps its line whether shown or not, so a hover moves nothing (opacity only)", /\.build-showcase-slide figcaption \{[^}]*opacity:0;[^}]*transition:opacity/.test(css) && !/figcaption\{[^}]*(transform|height|margin)[^}]*\}/.test(css.replace(/\.build-showcase-slide figcaption\{height:38px[^}]*\}/, "")))
check("a mouse shows it on hover, never while dragging", /@media\(hover:hover\) and \(pointer:fine\)\{\.build-showcase-track:not\(\[data-dragging\]\) \.build-showcase-slide:hover figcaption\{opacity:1/.test(css))
check("a touch screen has no hover, so there it is simply shown", /@media\(hover:none\),\(pointer:coarse\)\{\.build-showcase-slide figcaption\{opacity:1;transition:none\}\}/.test(css))
/* Changed on purpose (landing round 9): the box's ground is the page's own tone until its picture has faded in. */
check("the picture is clipped in its own box, the caption outside it", /\.build-showcase-pic \{[^}]*border-radius:7px;contain:paint;background:var\(--showcase-tone,#151517\);overflow:hidden\}/.test(css) && !/\.build-showcase-slide \{[^}]*overflow:hidden/.test(css))

console.log("\n── The cards end inside the section, with room under them ──")
check("no negative bottom margin runs the rail past the section's edge", !/margin-bottom:calc\([^)]*-\./.test(css) && !/--showcase-height/.test(css))
// Changed on purpose (landing round 7): the owner: "the bottom padding of the section under the hero is too short"; 52 to 96px under the caption line, 44 to 64px on a phone (tests/home-landing-r7-frame.test.ts).
check("desktop: padding under the caption line", /\.build-showcase-card \{[^}]*padding:clamp\(72px,7vw,112px\) 0 clamp\(52px,5\.4vw,96px\)\}/.test(css))
check("phone: padding under the caption line", /\.build-showcase-card\{padding:64px 0 clamp\(44px,12vw,64px\)\}/.test(phone))
check("the left-gutter cover is gone (nothing fades over a moving card)", !/build-showcase-viewport::after/.test(css))

console.log("\n── On a phone: the reference's shape ──")
check("every card is 78% of the screen wide (440px at most), on the gutter", /--showcase-card:min\(78vw,440px\)/.test(phone) && /\.build-showcase-slide\{flex:0 0 var\(--showcase-card\);width:var\(--showcase-card\);scroll-snap-align:start;scroll-snap-stop:normal\}/.test(phone) && /padding-inline:var\(--showcase-gutter\);scroll-padding-inline:var\(--showcase-gutter\)/.test(phone))
/* Changed on purpose (landing round 8): the owner wants a OnePage on a phone as a tall 9:16 card, as a short video is shown, not a phone screen stood in a 4:3 card; stores and websites stay 4:3 (tests/home-landing-r8-rails.test.ts). */
check("4:3 landscape for stores and websites, 10px apart", /\.build-showcase-pic\{aspect-ratio:4\/3;border-radius:8px\}/.test(phone) && /--showcase-gap:10px/.test(phone))
/* Changed on purpose (landing round 9): "Keep OnePages as they are", the page's own 540 x 1056 on a phone too. */
check("a OnePage is the page's own shape on its own page colour", /\[data-format="portrait"\] \.build-showcase-pic\{aspect-ratio:540\/1056\}/.test(phone) && /\.build-showcase-pic \{[^}]*background:var\(--showcase-tone,#151517\)/.test(css) && !/left:27%;top:9%;width:46%/.test(phone))
const tones = SHOWCASE_EXAMPLES.filter((e) => e.format === "portrait").map((e) => e.tone)
check("each OnePage has its tone, the wide pages none", tones.length === 4 && tones.every((t) => /^#[0-9a-f]{6}$/.test(t ?? "")) && SHOWCASE_EXAMPLES.filter((e) => e.format === "wide").every((e) => e.tone === undefined), tones)
check("the tone reaches the card as a custom property", (html.match(/style="--showcase-tone:#[0-9a-f]{6}"/g) ?? []).length === 4)
/* Changed on purpose (landing round 9): no mask at any width now (a mask over a moving layer is drawn again every frame), so the phone has none to switch off. */
check("the phone rail has hard edges: no mask anywhere", /\.build-showcase-viewport\{margin-inline:0\}/.test(phone) && !/mask-image/.test(css))
check("desktop keeps its groups: wide, OnePage, wide in their own shapes", /grid-template-columns:256fr 90fr 256fr/.test(css) && /aspect-ratio:1440\/990/.test(css) && /\.build-showcase-slide\[data-format="portrait"\] \.build-showcase-pic \{aspect-ratio:540\/1056\}/.test(css))

console.log("\n── Autoplay waits for the reader ──")
/* Changed on purpose (landing round 8): the native scroller is only the rail before the script; the script moves it on every screen (one engine, tests/home-landing-r8-rails.test.ts). Autoplay still never yanks the strip. */
check("before the script: the native scroller, mandatory snap, no back gesture at the ends", /\.build-showcase-track \{[^}]*overflow-x:auto;[^}]*touch-action:pan-x pan-y pinch-zoom;overscroll-behavior-x:contain;scroll-snap-type:x mandatory/.test(css))
check("no touchmove listener and no frame loop", !/"touchmove"/.test(rail) && !/requestAnimationFrame\(tick|requestAnimationFrame\(step/.test(rail))
check("the timing: a card every 4.2s, 5s after the reader's last input", SHOWCASE_AUTOPLAY.intervalMs === 4200 && SHOWCASE_AUTOPLAY.idleMs === 5000)
check("autoplay steps only once the reader has been idle and an interval has passed, never into a held or moving rail", /lastInput \+ SHOWCASE_AUTOPLAY\.idleMs, lastStep \+ SHOWCASE_AUTOPLAY\.intervalMs/.test(rail) && /if \(holding \|\| drag \|\| moving\(\) \|\| due > now\) return schedule/.test(rail))
check("coming on screen, it rests a whole interval before the first step", /if \(v && !visible\) lastStep = performance\.now\(\)/.test(rail))
check("one timer at most", /const schedule = \(ms: number = SHOWCASE_AUTOPLAY\.intervalMs\) => \{\s*clearTimeout\(timer\)/.test(rail))
check("the browser check is there", /Input\.dispatchTouchEvent/.test(read("scripts/check-landing-r8-rails.mjs")))

console.log("\n── Words ──")
const words = SHOWCASE_EXAMPLES.map((e) => `${e.label} ${e.alt}`).join(" ")
check("no banned words or em dashes in the cards", !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(words) && !/—/.test(words))
check("captions are three words at most", SHOWCASE_EXAMPLES.every((e) => e.label.split(/\s+/).length <= 3))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
