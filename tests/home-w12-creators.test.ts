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
 *
 * Changed on purpose (landing round): the owner asked for the card's foot to
 * be as it was before the product tiles (the name, the kind and what they
 * sell on a shade inside the photo), for no lift or zoom on hover, and for
 * the "New sale" notifications under the rail to go (they read as AI); the
 * sale-pop primitive had no other user and was removed with them.
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

let passed = 0
const check = (label: string, fn: () => void) => {
  fn()
  passed++
  console.log(`  ok    ${label}`)
}
const read = (p: string) => readFileSync(p, "utf8")
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&")

const SRC = "components/marketing/home/creators-carousel.tsx"
/* Changed on purpose (landing round): the sale notification and its primitive are gone. */
const MOTION: string[] = []
/* Changed on purpose (landing round 11): podcasters are off the rail (the owner). */
const KINDS = ["YouTubers", "Musicians", "Authors", "Educators", "Influencers", "Artists", "Streamers", "Coaches", "Agencies", "Photographers", "Fitness"]

const light = renderToString(createElement(CreatorsCarousel))
const dark = renderToString(createElement(CreatorsCarousel, { tone: "dark" }))

/* Changed on purpose (landing round): no product tile on the card any more. */
check("twelve creator types, in order, each with a line of what they sell and a name", () => {
  assert.deepEqual(CREATORS.map((c) => c.kind), KINDS)
  for (const c of CREATORS) assert.ok(c.sells.length > 5 && c.sells.length <= 34, c.slug)
  assert.equal(new Set(CREATORS.map((c) => c.name)).size, CREATORS.length)
})

check("server markup: one heading, no eyebrow, no subheading, one CTA, region with carousel role", () => {
  assert.equal((light.match(/<h2/g) || []).length, 1)
  assert.ok(light.includes(`aria-label="${CREATORS_HEADING}"`))
  const t = text(light)
  for (const c of CREATORS) assert.ok(t.includes(c.kind) && t.includes(c.sells) && t.includes(c.name), c.kind)
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
  /* Changed on purpose (landing round 9): one shared grain tile lives beside the photos. */
  for (const f of readdirSync(dir)) assert.ok(/^[a-z]+-(400|720)\.webp$/.test(f) || f === "grain.webp", `stray file ${f}`)
  assert.ok(total < 1_500_000, `total ${total}`)
})

check("reduced motion: a still grid, one copy, no transitions", () => {
  const rm = CREATORS_CSS.slice(CREATORS_CSS.indexOf("@media(prefers-reduced-motion:reduce)"))
  assert.ok(/\.cc-track\{display:grid/.test(rm) && /transform:none!important/.test(rm))
  assert.ok(/\.cc-card\[aria-hidden="true"\]\{display:none\}/.test(rm))
  assert.ok(/transition:none!important/.test(rm))
  const src = read(SRC)
  assert.ok(src.includes('matchMedia("(prefers-reduced-motion: reduce)")') && /const live = \(\) => visible && !document\.hidden && !reduce\.matches/.test(src))
})

/* Changed on purpose (landing round): the owner did not like the bump on hover; a card stays still under the pointer (no lift, no zoom), and its foot is the shade with the name, the kind and what they sell, as before the product tiles. */
check("cards: still under the pointer, the creator's words on a shade inside the photo, no product tile", () => {
  assert.ok(!/:hover \.cc-(body|img|photo|card)/.test(CREATORS_CSS) && !/(^|\n|\})\.cc-img\{[^}]*transition/.test(CREATORS_CSS)) /* Changed on purpose (landing round 11): only the decoded photo's arrival eases in, under [data-cc-ready]. */
  assert.ok(!/--cc-on|data-shape|data-active|transition:border-radius/.test(CREATORS_CSS + read(SRC)))
  assert.ok(!/\.cc-(body|photo)\{[^}]*(translate3d|translateZ)/.test(CREATORS_CSS))
  assert.ok(/\.cc-shade\{position:absolute;inset:0;background:linear-gradient\(to top/.test(CREATORS_CSS) && /\.cc-meta\{position:absolute/.test(CREATORS_CSS))
  assert.equal((light.match(/class="cc-meta"/g) || []).length, CREATORS.length * 2)
  assert.ok(!/cc-prod|cc-info/.test(light + CREATORS_CSS))
  assert.ok(read(SRC).includes('matchMedia("(hover: none), (pointer: coarse)")'))
})

/* Changed on purpose (landing round): the owner did not want the button black; it takes Storelib's own primary look, as the page's other Start for free and Sign Up buttons draw it (violet #7c3aed, 12px corners, white words). */
/* Changed on purpose (landing round 4, the owner: "don't make the button solid purple"): a white pill on a hairline, the arrow in a violet disc. */
check("the CTA: a calm white pill to /signup with a violet arrow, not black, focus ring", () => {
  assert.ok(/\.cc-cta\{[^}]*border-radius:999px;background:#fff;color:#18181b/.test(CREATORS_CSS) && !/\.cc-cta\{[^}]*background:var\(--cc-ink\)/.test(CREATORS_CSS))
  assert.ok(/\.cc-cta:focus-visible/.test(CREATORS_CSS))
})

/* Changed on purpose (landing round): the owner found the "New sale: $6.00, Sam Ortiz bought Signal+ membership" notifications AI looking; nothing replaces them. */
check("no sale notification under the rail", () => {
  assert.ok(!/New sale|sp-root|sp-card|cc-salepop|bought/.test(light) && !/sale-pop|SalePop/.test(read(SRC)))
  assert.ok(!existsSync("components/marketing/home/motion/sale-pop.tsx"))
})

check("keyframes animate only transform and opacity", () => {
  for (const css of [CREATORS_CSS]) {
    for (const block of css.match(/@keyframes [\w-]+\{(?:[^{}]*\{[^{}]*\})+\}/g) || []) {
      const props = [...block.matchAll(/[{;]\s*([a-z-]+)\s*:/g)].map((m) => m[1])
      for (const p of props) assert.ok(p === "transform" || p === "opacity", `${block.slice(0, 30)} animates ${p}`)
    }
  }
})

check("engine: one rAF, transform only, IO and visibility pause, drag with capture, pan-y", () => {
  const src = read(SRC)
  /* Changed on purpose (landing round 8): the transform string is made in one place (tf), the same translate3d. */
  assert.ok(src.includes("track.style.transform = tf(x)") && src.includes("`translate3d(${(-v).toFixed(2)}px,0,0)`"))
  assert.ok(!/style\.(left|width|marginLeft|scrollLeft)\s*=/.test(src))
  assert.ok(src.includes("new IntersectionObserver") && src.includes('"visibilitychange"'))
  /* Changed on purpose (landing round 9): the pointer handling is components/marketing/rail-gesture.ts, shared with the showcase. */
  assert.ok(src.includes("bindRailGesture(viewport") && read("components/marketing/rail-gesture.ts").includes("setPointerCapture") && CREATORS_CSS.includes("touch-action:pan-y"))
  assert.ok(src.includes("cancelAnimationFrame(paintFrame)"))
  // the measuring reads happen only in measure(), never per frame
  const frame = src.slice(src.indexOf("const frame = "), src.indexOf("const schedule = "))
  assert.ok(!/offset(Left|Width)|getBoundingClientRect|clientWidth/.test(frame))
})

check("no animation library, and one stylesheet", () => {
  for (const f of [SRC, ...MOTION]) assert.ok(!/from ["'](?:framer-motion|three|lottie[\w-]*|gsap)["']/.test(read(f)), f)
  /* Changed on purpose (wave 13): the morphing pill and orbit badge went with the rotating "Sell …" pill and the overlays. */
  assert.ok(!existsSync("components/marketing/home/motion/morph-pill-cluster.tsx") && !existsSync("components/marketing/home/motion/orbit-badge.tsx"))
  assert.deepEqual(CREATORS_STYLES.map((s) => s.href), ["w12-creators-carousel"])
})

check("registered in the push suite", () => {
  assert.ok(read("scripts/run-push-tests.mjs").includes('"tests/home-w12-creators.test.ts"'))
})

console.log(`\nhome-w12-creators: ${passed} checks passed`)
