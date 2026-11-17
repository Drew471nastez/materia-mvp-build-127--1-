/**
 * LANDING ROUND 15: the checkout scene, the store strip and the Digital tab.
 *
 * The owner:
 *   checkout   too much empty black at the top when the section arrives; on a phone the moving scene back, as on a
 *              computer, cheap; on large screens Local currencies and Checkout reminders wider; the phone behind the
 *              cards very blurred, lower, moving smoothly
 *   strip      Loudlib's real store in Fieldwork's place, Sora and GodBless added, from his screenshots, wired like
 *              the strip's other pictures
 *   digital    another moving picture for digital products, shown on a phone as on a computer
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { CHECKOUT_STYLES, CheckoutScene, SOFT_PHONE } from "@/components/marketing/home/checkout-scene"
import { DELIVERY_FILE, EVERYTHING_STORES, EVERYTHING_STYLES, ProductSlides } from "@/components/marketing/home/everything-in-one-place"

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
const BANNED = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform(s|ing)?)\b|—/i
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
/** A webp's own size, from its VP8X or VP8 header. */
function webp(p: string): [number, number] | null {
  const b = readFileSync(join(root, "public", p))
  if (b.subarray(0, 4).toString() !== "RIFF" || b.subarray(8, 12).toString() !== "WEBP") return null
  const kind = b.subarray(12, 16).toString()
  if (kind === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)]
  if (kind === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]
  if (kind === "VP8L") {
    const v = b.readUInt32LE(21)
    return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]
  }
  return null
}

console.log("\n── checkout: no black block, the scene back on a phone ──")
{
  const css = CHECKOUT_STYLES.map((s) => s.css).join("\n")
  const src = read("components/marketing/home/checkout-scene.tsx")
  const html = renderToStaticMarkup(createElement(CheckoutScene))
  // Changed on purpose (landing round 15, second pass): on a phone the stage is held under the header (top: --hd); it opens with the headline and the phone's top, not the header's height of black.
  const desk = css.slice(css.indexOf("@media (min-width:900px){\n  @supports (animation-timeline:view()){"), css.indexOf("@media (max-width:899px){\n    .cmc-stage{position:sticky;top:var(--hd)}"))
  const phone = css.slice(css.indexOf("@media (max-width:899px){\n    .cmc-stage{position:sticky;top:var(--hd)}"), css.indexOf("The cards: no ground of their own"))
  // Changed on purpose (landing round 16): the settle runs from 88svh before the hold to the hold, the heading from 16svh before it.
  check("the settle and the heading run as the section comes up the screen, into the hold", /\.cmc-world\{animation:cmc-settle cubic-bezier\(\.333,0,\.667,\.333\) both;animation-timeline:--cmc-t;animation-range:contain -88svh contain -8svh\}/.test(css) && /\.cmc-copy\{animation:cmc-head linear both;animation-timeline:--cmc-t;animation-range:contain -16svh contain 68svh\}/.test(css))
  // Changed on purpose (landing round 15, second pass): the phone rises 22svh into place from 1.12x (tests/home-landing-r15-checkout.test.ts).
  // Changed on purpose (landing round 16): on a computer the big phone starts 12svh down the stage, coming on screen as the settle starts; on a phone at its settled place.
  check("the big phone starts where it comes on screen as the settle starts, not 40svh down a black stage", /--big:1\.667;--ps:0\.6;--y0:12svh;/.test(css) && /--y0:var\(--y1\)/.test(css) && !/--y0:40svh/.test(css))
  // Changed on purpose (landing round 16): the cards 40svh after the held stage at every width.
  check("the cards start 40svh after the held stage", /\.cmc-track > \.cmc-cards\{margin-top:40svh\}/.test(css))
  // Changed on purpose (landing round 16): the cards 40svh after the stage on a phone too.
  check("on a phone the stage is held under the header", /\.cmc-stage\{position:sticky;top:var\(--hd\)\}\s*\.cmc-track > \.cmc-cards\{margin-top:40svh\}\s*@media \(min-width:900px\)\{\s*\.cmc-stage\{top:0\}/.test(css))
  // Changed on purpose (landing round 16): two scroll timelines at every width, compositor only (the owner wants the reference's motion on phones too).
  check("at every width two boxes follow the scroll, on the compositor", (css.match(/animation-timeline:--cmc-t/g) ?? []).length === 2)
  // Changed on purpose (landing round 15, second pass): the phone starts 7svh low at 1.04x; the words have their own step (data-cmc-words).
  // Changed on purpose (landing round 16): no observer steps: the scroll timelines run it.
  check("no armed steps", !/data-cmc-armed|data-cmc-in\b|data-cmc-words/.test(css))
  // Changed on purpose (landing round 16): at every width; the heading fades on the scroll before the cards reach it.
  check("behind the cards: the phone sinks and goes soft, the ring steps back", /\.cmc\[data-cmc-back\] \.cmc-phone-wrap\{transform:translate3d\(0,var\(--sink\),0\) scale\(0\.9\)\}/.test(css) && /\.cmc\[data-cmc-back\] \.cmc-phone-soft\{opacity:0\.3\}/.test(css) && /\.cmc\[data-cmc-back\] \.cmc-shade\{opacity:0;transition-delay:\.6s\}/.test(css))
  // Changed on purpose (landing round 16): observers set the arrival behind the cards; nothing per frame in script.
  check("observers only: no scroll listener, no rAF, no layout read", /function useBack/.test(src) && !/addEventListener\("scroll"|requestAnimationFrame|getBoundingClientRect\(/.test(src))
  // Changed on purpose (landing round 16): reduced motion: nothing observed for the arrival, nothing held.
  check("reduced motion: nothing observed, nothing held", /if \(matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\) return\n\s*const cards/.test(src) && /@media \(prefers-reduced-motion:no-preference\)\{[\s\S]*\.cmc-stage\{position:sticky;top:var\(--hd\)\}/.test(css))
  // Changed on purpose (landing round 16): a transition once the cards are up, at every width.
  check("on a computer the phone goes soft and sinks behind the cards", /\.cmc\[data-cmc-back\] \.cmc-phone-wrap\{transform:translate3d\(0,var\(--sink\),0\) scale\(0\.9\)\}/.test(css) && /\.cmc\[data-cmc-back\] \.cmc-phone-soft\{opacity:0\.3\}/.test(css) && /--sink:24svh/.test(css))
  const soft = "/home/commerce/soft-phone.webp"
  const size = existsSync(join(root, "public", soft)) ? webp(soft) : null
  check("the phone's blurred copy is baked, small, at its declared size", !!size && size[0] === SOFT_PHONE.w && size[1] === SOFT_PHONE.h && statSync(join(root, "public", soft)).size < 12 * 1024, size)
  check("drawn in the phone's own box after the phone, lazy", new RegExp(`<img class="cmc-phone-soft" src="${soft}" alt="" width="${SOFT_PHONE.w}" height="${SOFT_PHONE.h}" loading="lazy"`).test(html))
  check("from 1180px Local currencies and Checkout reminders draw up to 64em wide", /@media \(min-width:1180px\)\{\s*\.cmc-card:is\(\[data-k=currency\],\[data-k=recover\]\) \.cmc-vis-in\{width:min\(100%,64em\)/.test(css))
  check("no banned words in the scene", !BANNED.test(text(html)))
}

console.log("\n── the store strip: Loudlib, Sora and GodBless ──")
{
  const strip = EVERYTHING_STORES
  const shots = strip.filter((s) => s.kind === "shot")
  check("Loudlib first, in Fieldwork's place; Sora and GodBless in the strip", strip[0].key === "loudlib" && !strip.some((s) => s.key === "fieldwork") && ["sora", "godbless"].every((k) => shots.some((s) => s.key === k)))
  for (const s of shots.filter((x) => x.key !== "satori")) {
    if (s.kind !== "shot") continue
    const full = webp(s.src)
    const small = webp(s.src.replace(/\.webp$/, "-360.webp"))
    check(`${s.key}: a webp at its own size and a 360px one, both light`, !!full && full[0] === s.w && full[1] === s.h && !!small && small[0] === 360 && statSync(join(root, "public", s.src)).size < 60 * 1024, [full, small])
    check(`${s.key}: the srcset names both`, s.srcSet === `${s.src.replace(/\.webp$/, "-360.webp")} 360w, ${s.src} ${s.w}w`)
  }
  check("the strip is still one stylesheet and a picture per page", EVERYTHING_STYLES.length >= 1)
}

console.log("\n── Digital: the file goes out ──")
{
  const html = renderToStaticMarkup(createElement(ProductSlides))
  const css = EVERYTHING_STYLES.map((s) => s.css).join("\n")
  check("the notice is drawn under the card, quiet until Digital is on", /<div class="ev-p-dl" aria-hidden="true">/.test(html) && html.includes(DELIVERY_FILE) && /Download link sent/.test(html))
  check("what it says is what happens: the link is emailed after paying (developers docs)", /the download link is emailed to them/.test(read("lib/developers/content.generated.ts")))
  check("it moves by transform and opacity only", /@keyframes ev-dl-fill\{from\{transform:scaleX\(0\)\}to\{transform:scaleX\(1\)\}\}/.test(css) && /\.ev-p-dl\{[^}]*transition:opacity \.35s ease,transform \.5s/.test(css))
  check("on a phone it has its own row under the card, not hidden", /@media\(max-width:479px\)\{[^@]*\.ev-p-dl\{left:0;right:0;top:calc\(100% \+ 10px\);width:auto;/.test(css) && !/\.ev-p-dl\{[^}]*display:none/.test(css))
  check("reduced motion shows it finished", /\.ev-p-dl-bar i,\.ev-p-dl-a,\.ev-p-dl-b,\.ev-p-dl-ok\{animation:none !important\}/.test(css) /* each animated part named, no wildcard (tests/home-w12-platform) */)
  check("no banned words", !BANNED.test(text(html)))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
