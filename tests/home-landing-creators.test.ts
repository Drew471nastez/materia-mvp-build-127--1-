/**
 * LANDING ROUND, THE CREATORS BUILDER'S SECTIONS (storelib.com home)
 *
 * What the owner asked for, pinned:
 *
 *   creators      "Storelib is for creators. Whatever you make.": no bump on
 *                 hover, the card's foot as it was before (the name, the kind
 *                 and what they sell on a shade inside the photo, not a white
 *                 product tile), no "New sale" notifications, new photographs
 *                 for seven kinds, the rail still endless and draggable
 *   how it works  less "fans", no Golden Hour presets, one tile for physical
 *                 and digital products, a real course player, no purple
 *                 gradient grounds
 *   checkout      a scroll that never scrubs: steps set by an
 *                 IntersectionObserver and played as compositor transitions,
 *                 no orbiting products, no Golden Hour presets, less "fans"
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { CreatorsCarousel, CREATORS, CREATORS_CSS } from "../components/marketing/home/creators-carousel"
import { HowItWorks, HOW_HEADING, HOW_PRODUCTS, HOW_IT_WORKS_STYLES } from "../components/marketing/home/how-it-works"
import { CheckoutScene, CHECKOUT_STYLES } from "../components/marketing/home/checkout-scene"
import { EBOOK, EBOOK_COVER_CSS } from "../components/marketing/home/ebook-cover"

let passed = 0
const check = (label: string, fn: () => void) => {
  fn()
  passed++
  console.log(`  ok    ${label}`)
}
const read = (p: string) => readFileSync(p, "utf8")
const words = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!-- -->/g, "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ")

const CC = "components/marketing/home/creators-carousel.tsx"
const HOW = "components/marketing/home/how-it-works.tsx"
const CO = "components/marketing/home/checkout-scene.tsx"
const creators = renderToString(createElement(CreatorsCarousel))
const how = renderToString(createElement(HowItWorks))
const co = renderToString(createElement(CheckoutScene))

console.log("\nCreators")
check("no sale notification of any kind under the rail", () => {
  assert.ok(!/New sale|bought|sp-root|cc-salepop|cc-foot/.test(creators))
  assert.ok(!existsSync("components/marketing/home/motion/sale-pop.tsx"))
})
check("no bump on hover: no lift, no zoom, no transition on the card or its photo", () => {
  assert.ok(!/:hover \.cc-(body|img|photo|card|meta)/.test(CREATORS_CSS))
  assert.ok(!/\.cc-(img|photo|card)\{[^}]*transition/.test(CREATORS_CSS))
})
check("the card's foot is as it was before: name, kind and what they sell on a shade inside the photo", () => {
  const card = creators.match(/<li class="cc-card"[\s\S]*?<\/li>/)?.[0] ?? ""
  assert.ok(/<div class="cc-photo"><img class="cc-img"[^>]*\/?><span class="cc-shade" aria-hidden="true"><\/span><span class="cc-meta"><span class="cc-who">[^<]+<\/span><span class="cc-kind">[^<]+<\/span><span class="cc-sells">/.test(card), card.slice(0, 400))
  assert.ok(!/cc-prod|cc-info|<svg/.test(card))
})
check("seven kinds have new photographs, each 4:5 WebP within budget", () => {
  for (const slug of ["authors", "podcasters", "artists", "agencies", "fitness", "youtubers", "musicians"]) {
    for (const [w, max] of [[400, 40_000], [720, 90_000]] as const) {
      const p = `public/home/creators/${slug}-${w}.webp`
      assert.ok(existsSync(p) && statSync(p).size < max, p)
      const buf = readFileSync(p)
      assert.equal(buf.subarray(8, 12).toString(), "WEBP", p)
    }
  }
  const alt = (slug: string) => CREATORS.find((c) => c.slug === slug)?.alt ?? ""
  /* Changed on purpose (landing round 4): new pictures for agencies and YouTubers (and musicians and educators), their words with them. */
  assert.ok(/guitar/.test(alt("musicians")) && /notebook/.test(alt("authors")) && /microphone/.test(alt("podcasters")) && /easel/.test(alt("artists")) && /laptop/.test(alt("agencies")) && /kettlebell/.test(alt("fitness")) && /clapperboard/.test(alt("youtubers")))
})
check("the rail stays endless, on the compositor, and draggable without fighting the page's scroll", () => {
  const src = read(CC)
  assert.ok(/track\.animate\(/.test(src) && src.includes("setPointerCapture") && CREATORS_CSS.includes("touch-action:pan-y"))
})

console.log("\nHow it works")
check("the heading and captions lean less on fans", () => {
  assert.equal(HOW_HEADING, "Sell what people love. We handle the rest.")
  assert.ok(!/\bfans?\b/i.test(words(how)))
})
check("no Golden Hour presets, no camera picture, no purple gradient grounds", () => {
  assert.ok(!/Golden Hour|golden|course-camera|lt-field|Presets/i.test(how + read(HOW)))
  /* Changed on purpose (landing round 4): the owner asked for colourful, changing gradient grounds behind every tile; they live only in the two ground layers, and none is purple. */
  const css = HOW_IT_WORKS_STYLES[0].css
  for (const m of css.matchAll(/([^{}]+)\{[^}]*(?:linear|radial)-gradient/g)) assert.ok(/^\s*\.cmh-gl[12]$/.test(m[1]), m[1])
  assert.ok(!/#7c3aed|#8b5cf6|#a855f7/.test(css.slice(0, css.indexOf(".cmh-dm-addr"))))
})
check("one tile sells physical and digital products, each with what the seller keeps", () => {
  assert.deepEqual(HOW_PRODUCTS.map((p) => p.kind), ["Physical", "Digital"])
  const t = words(how)
  /* Changed on purpose (landing round 4): one card at a time on a coloured ground, the cap made to order and the e-book delivered at once. */
  assert.ok(t.includes("Sell physical and digital products.") && t.includes("Production cost") && t.includes("Instant"))
  assert.ok(!/Sell your own merch, no inventory/.test(t))
  assert.ok(HOW_PRODUCTS.every((p) => t.includes(`You keep $${(p.keepCents / 100).toFixed(2)}`)))
})
check("the course tile is the course player: Lessons, done count, the round marks", () => {
  const t = words(how)
  /* Changed on purpose (landing round 4): a new course, no pasta. */
  assert.ok(t.includes("Lessons") && t.includes("2 of 7 done") && /data-state="done"/.test(how) && /data-state="now"/.test(how) && how.includes("/home/how/course-street.webp"))
})
check("every loop still pauses off screen and holds still for reduced motion", () => {
  const css = HOW_IT_WORKS_STYLES[0].css
  assert.ok(css.includes("[data-commerce-live] .cmh-a{animation-play-state:running!important}") && /prefers-reduced-motion:reduce\)\{\s*\.cmh-a\{animation:none!important\}/.test(css)) /* Changed on purpose (landing round 4): no spinner any more, the sheet is the captured one. */
})

console.log("\nCheckout")
/* Changed on purpose (landing round 4): the owner asked for the phone to rise and stay, the products to orbit it again, and the tab cards to rise over it; the scroll no longer presses Pay. Driven by view timelines, with observers setting two attributes as the fallback. */
check("the scroll never steps through a payment, and no scroll listener, rAF or layout read drives it", () => {
  const src = read(CO)
  const stage = co.slice(co.indexOf('class="cmc-stage"'), co.indexOf('class="cmc-cards"'))
  assert.ok(!/data-step|cmc-band|Face ID|Payment complete/.test(stage))
  assert.ok(!/addEventListener\("scroll"|requestAnimationFrame|getBoundingClientRect\(|offset(Top|Height)|useState\(0\)/.test(src))
  /* Changed on purpose (landing round 5): no view timelines; the stage is held by the browser's own sticky scrolling and the cards come up over it. */
  assert.ok(/\.cmc-stage\{position:sticky;top:0;height:100svh/.test(CHECKOUT_STYLES.map((s) => s.css).join("\n")))
})
check("no purple glow, no Golden Hour presets, less fans", () => {
  const src = read(CO)
  assert.ok(!/rgba\(124,58,237/.test(src))
  assert.ok(!/Golden Hour|golden/i.test(src + co))
  assert.ok(!/\bfans?\b/i.test(words(co)) && co.includes("Prices people read without a calculator"))
})
check("the product is a real looking e-book: a local photograph under its title", () => {
  /* Changed on purpose (landing round 5, the owner did not like After Dark there): the checkout sells The Loop, its cover a picture file; How it works keeps the e-book below. */
  /* Changed on purpose (landing round 7, the owner: not The Loop there): the checkout sells Maren Holt's knitting pattern, its picture a local photograph file. */
  assert.ok(co.includes("/home/commerce/maren-pattern.webp") && !co.includes("ebook-night") && existsSync("public/home/commerce/maren-pattern.webp") && statSync("public/home/commerce/maren-pattern.webp").size < 60 * 1024)
  /* Changed on purpose (landing round 5): After Dark is gone from How it works too; its picture is no longer used. */
  assert.ok(!/ebook-night/.test(readFileSync("components/marketing/home/ebook-cover.tsx", "utf8")))
  /* Changed on purpose (landing round 5): the cover is one picture file with its title printed on it, so it needs no container query. */
  assert.ok(/guide-loop\.webp/.test(read("components/marketing/home/ebook-cover.tsx")) && !/https?:/.test(EBOOK_COVER_CSS + read("components/marketing/home/ebook-cover.tsx")))
})
check("reduced motion: nothing pinned, nothing moves", () => {
  const css = CHECKOUT_STYLES.map((s) => s.css).join("\n")
  const still = css.slice(css.lastIndexOf("@media (prefers-reduced-motion:reduce)"))
  assert.ok(/\.cmc-track\.cmc-track\{height:auto\}/.test(still) && /\.cmc-stage \*\{transition:none!important;animation:none!important\}/.test(still))
})

console.log("\nThe coordinator's follow ups")
/* Changed on purpose (landing round 4, the owner: "don't make the button solid purple"): a calm white pill, its arrow in a violet disc; still not black. */
check("the creators button is calm, not solid purple and not black", () => {
  assert.ok(/\.cc-cta\{[^}]*background:#fff;color:#18181b/.test(CREATORS_CSS) && /\.cc-cta-ic\{[^}]*background:#7c3aed/.test(CREATORS_CSS) && !/\.cc-cta\{[^}]*background:#7c3aed/.test(CREATORS_CSS))
})
check("no small print under How it works or the checkout tabs", () => {
  assert.ok(!/Example prices|cmh-fine/.test(how) && !/Card payments are processed by Stripe|cmc-foot/.test(co))
})
check("corners a pixel softer: cards 23px, tiles up to 27px, panels 31px", () => {
  assert.ok(/\.cc-photo\{[^}]*border-radius:23px/.test(CREATORS_CSS))
  assert.ok(/border-radius:clamp\(21px,2\.4vw,27px\)/.test(HOW_IT_WORKS_STYLES[0].css))
  assert.ok(/\.cmc-panel\{[^}]*border-radius:31px/.test(CHECKOUT_STYLES.map((s) => s.css).join("\n")))
})

check("registered in the push suite", () => {
  assert.ok(read("scripts/run-push-tests.mjs").includes('"tests/home-landing-creators.test.ts"'))
})

console.log(`\nhome-landing-creators: ${passed} checks passed`)
