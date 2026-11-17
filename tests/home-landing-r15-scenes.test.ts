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
  const desk = css.slice(css.indexOf("@media (min-width:900px){\n  @supports (animation-timeline:view()){"), css.indexOf("@media (max-width:899px){\n    .cmc-stage{position:sticky;top:0}"))
  const phone = css.slice(css.indexOf("@media (max-width:899px){\n    .cmc-stage{position:sticky;top:0}"), css.indexOf("The cards: no ground of their own"))
  check("the settle and the words run as the section comes up the screen, before the hold", /\.cmc-world\{animation:cmc-settle[^}]*animation-range:contain -84svh contain 14svh\}/.test(desk) && /\.cmc-w\[data-w="0"\]\{animation-range:contain -84svh contain -63svh\}/.test(desk))
  check("the big phone starts just under its settled place, not 40svh down a black stage", /--y0:calc\(var\(--y1\) \+ 12svh\)/.test(css) && !/--y0:40svh/.test(css))
  check("20svh less hold before the cards", /\.cmc-track > \.cmc-cards\{margin-top:calc\(80svh - 56svh\)\}/.test(desk))
  check("on a phone the stage is held and the cards follow it straight on", /\.cmc-stage\{position:sticky;top:0\}/.test(phone) && /\.cmc-track > \.cmc-cards\{margin-top:0\}/.test(phone))
  check("on a phone nothing follows the scroll frame by frame: transitions only", phone.length > 0 && !/animation-timeline|animation:/.test(phone) && /transition:transform 1\.1s/.test(phone))
  check("the phone rises and settles, the words rise one after another, once the observer plays it", /\.cmc\[data-cmc-armed\]:not\(\[data-cmc-in\]\) \.cmc-world\{transform:translate3d\(0,calc\(var\(--y1\) \+ 9svh\),0\) scale\(1\.12\);transition-duration:0s\}/.test(phone) && (phone.match(/\.cmc-w\[data-w="\d"\]\{transition-delay:\d+ms\}/g) ?? []).length === 8)
  check("behind the cards on a phone: the phone sinks and goes soft, the ring steps back, the headline fades", /\.cmc\[data-cmc-back\] \.cmc-phone-wrap\{transform:translate3d\(0,var\(--sink\),0\) scale\(0\.9\)\}/.test(phone) && /\.cmc\[data-cmc-back\] \.cmc-phone-soft\{opacity:0\.3\}/.test(phone) && /\.cmc\[data-cmc-back\] \.cmc-shade\{opacity:0;transition-delay:\.6s\}/.test(phone))
  check("the steps are set by observers only: no scroll listener, no rAF, no layout read", /function useStepScene/.test(src) && /useStepScene\(rootRef\)/.test(src) && !/addEventListener\("scroll"|requestAnimationFrame|getBoundingClientRect\(/.test(src))
  check("reduced motion: nothing armed, nothing held", /if \(matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\) return\n\s*const stage/.test(src) && /@media \(prefers-reduced-motion:no-preference\)\{[\s\S]*@media \(max-width:899px\)\{\n\s*\.cmc-stage\{position:sticky;top:0\}/.test(css))
  check("on a computer the phone goes soft and sinks behind the cards to the track's end", /\.cmc-phone-wrap\{animation:cmc-back linear both;animation-timeline:--cmc-t;animation-range:contain 28svh contain 100%\}/.test(desk) && /\.cmc-phone-soft\{animation:cmc-soft-phone linear both;animation-timeline:--cmc-t;animation-range:contain 28svh contain 60svh\}/.test(desk) && /--sink:24svh/.test(css))
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
