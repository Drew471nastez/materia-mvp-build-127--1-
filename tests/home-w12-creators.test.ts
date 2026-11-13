/**
 * W12 creators: section 7 of the home page (components/marketing/home/
 * creators-carousel.tsx) and the sale notification under it
 * (components/marketing/home/motion/sale-pop.tsx). Server markup, the
 * seamless two-copy loop, the reduced-motion grid, transform/opacity-only
 * motion, local optimized photos within budget, no hotlinks.
 *
 * Changed on purpose (wave 13): the owner asked for the "For creators" pill,
 * the rotating "Sell …" pill, the subheading, "See creator shops", the
 * arrows and the pause button to go, for plain cards (no bubble morph, no
 * "next could be you" tile) and for a realistic Storelib sale notification.
 * The morphing pill and orbit badge primitives had no other user and were
 * removed with them.
 */
import assert from "node:assert/strict"
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import {
  CreatorsCarousel,
  CREATORS,
  CREATORS_CSS,
  CREATORS_HEADING,
  CREATORS_STYLES,
} from "../components/marketing/home/creators-carousel"
import { SalePop, SALE_POP_CSS } from "../components/marketing/home/motion/sale-pop"

let passed = 0
const check = (label: string, fn: () => void) => {
  fn()
  passed++
  console.log(`  ok    ${label}`)
}
const read = (p: string) => readFileSync(p, "utf8")
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&")

const SRC = "components/marketing/home/creators-carousel.tsx"
const MOTION = [
  "components/marketing/home/motion/sale-pop.tsx",
  "components/marketing/home/motion/use-motion-gate.ts",
]
const KINDS = ["YouTubers", "Musicians", "Authors", "Educators", "Influencers", "Podcasters", "Artists", "Streamers", "Coaches", "Agencies", "Photographers", "Fitness"]

const light = renderToString(createElement(CreatorsCarousel))
const dark = renderToString(createElement(CreatorsCarousel, { tone: "dark" }))

check("twelve creator types, in order, each with a line of what they sell and one real product with a price", () => {
  assert.deepEqual(CREATORS.map((c) => c.kind), KINDS)
  for (const c of CREATORS) assert.ok(c.sells.length > 5 && c.sells.length <= 34, c.slug)
  for (const c of CREATORS) assert.ok(c.product.title.length > 3 && c.product.title.length <= 26 && /^\$\d+(\.\d\d)?(\/mo)?$/.test(c.product.price), c.slug)
  assert.equal(new Set(CREATORS.map((c) => c.name)).size, CREATORS.length)
})

check("server markup: one heading, no eyebrow, no subheading, one CTA, region with carousel role", () => {
  assert.equal((light.match(/<h2/g) || []).length, 1)
  assert.ok(light.includes(`aria-label="${CREATORS_HEADING}"`))
  const t = text(light)
  for (const c of CREATORS) assert.ok(t.includes(c.kind) && t.includes(c.sells) && t.includes(c.product.title) && t.includes(c.name), c.kind)
  assert.ok(/<a class="cc-cta" href="\/signup">Start selling for free/.test(light))
  /* Changed on purpose (wave 13): the eyebrow, the subheading, the rotating "Sell …" pill and "See creator shops" are gone. */
  assert.ok(!/story-eyebrow|For creators|cc-sub|mp-root|See creator shops|href="\/explore"/.test(light))
  assert.ok(light.includes('aria-roledescription="carousel"'))
  /* Changed on purpose (wave 13): no arrows and no pause button; the rail moves on its own (drag, keys and hover or focus still slow it). */
  assert.ok(!/<button/.test(light) && !/Pause carousel|Previous creator|Next creator/.test(light))
  assert.ok(dark.includes('data-tone="dark"') && dark.includes("data-story-dark"))
})

check("seamless loop: exactly two copies, the second hidden from assistive tech and inert", () => {
  const cards = light.match(/<li class="cc-card[^"]*"[^>]*>/g) || []
  assert.equal(cards.length, CREATORS.length * 2)
  const hidden = cards.filter((c) => /aria-hidden="true"/.test(c) && /inert=""/.test(c))
  assert.equal(hidden.length, CREATORS.length)
  for (const c of cards.slice(0, CREATORS.length)) assert.ok(!/aria-hidden/.test(c))
})

check("photos: local, responsive, lazy, async, sized, alt text only on the first copy", () => {
  /* The creator photos (the sale notification draws the Storelib icon too). */
  const imgs = light.match(/<img class="cc-img"[^>]*>/g) || []
  assert.equal(imgs.length, CREATORS.length * 2)
  for (const img of imgs) {
    assert.ok(/src="\/home\/creators\/[a-z]+-400\.webp"/.test(img), img)
    assert.ok(/srcSet="[^"]*-400\.webp 400w, [^"]*-720\.webp 720w"/i.test(img), img)
    assert.ok(/sizes="/.test(img) && /loading="lazy"/.test(img) && /decoding="async"/.test(img), img)
    assert.ok(/width="400"/.test(img) && /height="500"/.test(img), img)
  }
  assert.equal(imgs.filter((i) => /alt=""/.test(i)).length, CREATORS.length)
})

check("no hotlinked images anywhere in the section or primitives", () => {
  for (const f of [SRC, ...MOTION]) {
    const s = read(f)
    assert.ok(!/unsplash\.com|https?:\/\/[^"'`\s]+\.(?:jpe?g|png|webp|avif)/i.test(s), f)
  }
  assert.ok(!/src="https?:/.test(light))
})

check("assets exist, are WebP at the right size, and fit the budget", () => {
  const dir = "public/home/creators"
  let total = 0
  for (const c of CREATORS)
    for (const w of [400, 720]) {
      const p = `${dir}/${c.slug}-${w}.webp`
      assert.ok(existsSync(p), p)
      const buf = readFileSync(p)
      assert.equal(buf.subarray(0, 4).toString(), "RIFF")
      assert.equal(buf.subarray(8, 12).toString(), "WEBP")
      const size = statSync(p).size
      assert.ok(size < (w === 400 ? 40_000 : 90_000), `${p} ${size}`)
      total += size
    }
  for (const f of readdirSync(dir)) assert.ok(/^[a-z]+-(400|720)\.webp$/.test(f), `stray file ${f}`)
  assert.ok(total < 1_500_000, `total ${total}`)
})

check("reduced motion: a still grid, one copy, no transitions", () => {
  const rm = CREATORS_CSS.slice(CREATORS_CSS.indexOf("@media(prefers-reduced-motion:reduce)"))
  assert.ok(/\.cc-track\{display:grid/.test(rm) && /transform:none!important/.test(rm))
  assert.ok(/\.cc-card\[aria-hidden="true"\]\{display:none\}/.test(rm))
  assert.ok(/transition:none!important/.test(rm))
  assert.ok(SALE_POP_CSS.includes("prefers-reduced-motion:reduce"))
  const src = read(SRC)
  assert.ok(src.includes('matchMedia("(prefers-reduced-motion: reduce)")') && /const live = \(\) => visible && !document\.hidden && !reduce\.matches/.test(src))
})

/* Changed on purpose (wave 13): the bubble morph (corners springing into domes and leaves) read as a gimmick; a card now lifts a little and its photo eases in, on fine pointers only. */
check("cards: a plain lift on hover for fine pointers, no border-radius morph, no data-active", () => {
  assert.ok(CREATORS_CSS.includes("@media(hover:hover) and (pointer:fine)"))
  assert.ok(!/--cc-on|data-shape|data-active|transition:border-radius/.test(CREATORS_CSS + read(SRC)))
  /* Changed on purpose (wave 13 perf): a 2D lift, and no 3D transform on a card at rest, so the cards are not a compositor layer each. */
  assert.ok(/\.cc-card:hover \.cc-body\{transform:translate\(0,-6px\)\}/.test(CREATORS_CSS) && !/\.cc-(body|photo)\{[^}]*(translate3d|translateZ)/.test(CREATORS_CSS))
  assert.ok(read(SRC).includes('matchMedia("(hover: none), (pointer: coarse)")'))
})

check("the CTA: one solid pill to /signup with its arrow in a disc, focus ring", () => {
  assert.ok(/\.cc-cta\{[^}]*border-radius:999px/.test(CREATORS_CSS) && /\.cc-cta-ic\{[^}]*background:#7c3aed/.test(CREATORS_CSS))
  assert.ok(/\.cc-cta:focus-visible/.test(CREATORS_CSS))
})

check("sale notification: Storelib's own words, a stack in a fixed box, transitions on transform and opacity only", () => {
  /* Changed on purpose (landing round 2): the buyers' names follow the section's renamed ones. */
  const items = [
    { who: "Femi Adeyemi", what: "Drum Kit Vol. 2", amount: "$29.00" },
    { who: "Tom Kessler", what: "Spanish in 6 Weeks", amount: "$149.00" },
    { who: "Aiko Sato", what: "Sunday Club hoodie", amount: "$62.00" },
    { who: "Leo Martin", what: "60-min strategy call", amount: "$120.00" },
    { who: "Hana Wright", what: "Film Tones presets", amount: "$24.00" },
  ]
  const html = renderToString(createElement(SalePop, { items }))
  const t = text(html).replace(/\s+/g, " ")
  assert.ok(t.includes("New sale: $29.00") && t.includes("Femi Adeyemi bought Drum Kit Vol. 2 for $29.00."))
  /* Changed on purpose (wave 13 integration): the notice's icon is the real logo drawn through StorelibLogo (tests/brand-logo.test.ts forbids the old /storelib-mark.svg file). */
  assert.ok(html.includes("data-storelib-logo"))
  /* One card in front, two behind, the rest waiting; only the front one is read out. */
  const cards = html.replace(/<style[\s\S]*?<\/style>/g, "")
  assert.deepEqual([...cards.matchAll(/data-pos="(\d)"/g)].map((m) => m[1]), ["0", "4", "3", "2", "1"])
  assert.equal((cards.match(/aria-hidden="true"/g) || []).length, 4)
  assert.ok(/\.sp-root\{[^}]*height:100px/.test(SALE_POP_CSS) && /\.sp-card\{position:absolute/.test(SALE_POP_CSS))
  for (const m of SALE_POP_CSS.matchAll(/transition:([^;}]+)/g)) for (const part of m[1].split(",")) assert.ok(/^\s*(transform|opacity|none)\b/.test(part), m[1])
  assert.ok(!/@keyframes/.test(SALE_POP_CSS))
  assert.ok(read("lib/notify/templates/catalog.ts").includes("`New sale: ${total}`"))
})

check("keyframes animate only transform and opacity", () => {
  for (const css of [CREATORS_CSS, SALE_POP_CSS]) {
    for (const block of css.match(/@keyframes [\w-]+\{(?:[^{}]*\{[^{}]*\})+\}/g) || []) {
      const props = [...block.matchAll(/[{;]\s*([a-z-]+)\s*:/g)].map((m) => m[1])
      for (const p of props) assert.ok(p === "transform" || p === "opacity", `${block.slice(0, 30)} animates ${p}`)
    }
  }
})

check("engine: one rAF, transform only, IO and visibility pause, drag with capture, pan-y", () => {
  const src = read(SRC)
  assert.ok(src.includes("track.style.transform = `translate3d("))
  assert.ok(!/style\.(left|width|marginLeft|scrollLeft)\s*=/.test(src))
  assert.ok(src.includes("new IntersectionObserver") && src.includes('"visibilitychange"'))
  assert.ok(src.includes("setPointerCapture") && CREATORS_CSS.includes("touch-action:pan-y"))
  assert.ok(src.includes("cancelAnimationFrame(raf)"))
  // the measuring reads happen only in measure(), never per frame
  const frame = src.slice(src.indexOf("const frame = "), src.indexOf("const schedule = "))
  assert.ok(!/offset(Left|Width)|getBoundingClientRect|clientWidth/.test(frame))
})

check("the sale notification renders on the server and stays readable, with no animation library", () => {
  const pop = renderToString(createElement(SalePop, { items: [{ who: "Maya R.", what: "a beat pack", amount: "$29.00" }] }))
  assert.ok(text(pop).replace(/\s+/g, " ").includes("Maya R. bought a beat pack for $29.00.") && pop.includes("$29.00"))
  for (const f of MOTION) assert.ok(!/from ["'](?:framer-motion|three|lottie[\w-]*|gsap)["']/.test(read(f)), f)
  /* Changed on purpose (wave 13): the morphing pill and orbit badge went with the rotating "Sell …" pill and the overlays. */
  assert.ok(!existsSync("components/marketing/home/motion/morph-pill-cluster.tsx") && !existsSync("components/marketing/home/motion/orbit-badge.tsx"))
  assert.deepEqual(CREATORS_STYLES.map((s) => s.href), ["w12-creators-carousel", "w12-sale-pop"])
})

check("registered in the push suite", () => {
  assert.ok(read("scripts/run-push-tests.mjs").includes('"tests/home-w12-creators.test.ts"'))
})

console.log(`\nhome-w12-creators: ${passed} checks passed`)
