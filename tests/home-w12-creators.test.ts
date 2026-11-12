/**
 * W12 creators: section 7 of the home page (components/marketing/home/
 * creators-carousel.tsx) and the reusable motion primitives under
 * components/marketing/home/motion. Server markup, the seamless two-copy
 * loop, the reduced-motion grid, the bubble morph, transform/opacity-only
 * keyframes, local optimized photos within budget, no hotlinks.
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
  CREATORS_SELL_LABELS,
} from "../components/marketing/home/creators-carousel"
import { MorphPillCluster, MORPH_PILL_CSS } from "../components/marketing/home/motion/morph-pill-cluster"
import { OrbitBadge, ORBIT_BADGE_CSS } from "../components/marketing/home/motion/orbit-badge"
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
  "components/marketing/home/motion/morph-pill-cluster.tsx",
  "components/marketing/home/motion/orbit-badge.tsx",
  "components/marketing/home/motion/sale-pop.tsx",
  "components/marketing/home/motion/use-motion-gate.ts",
]
const KINDS = ["YouTubers", "Musicians", "Authors", "Educators", "Influencers", "Podcasters", "Artists", "Streamers", "Coaches", "Agencies", "Photographers", "Fitness"]

const light = renderToString(createElement(CreatorsCarousel))
const dark = renderToString(createElement(CreatorsCarousel, { tone: "dark" }))

check("twelve creator types, in order, each with a line of what they sell", () => {
  assert.deepEqual(CREATORS.map((c) => c.kind), KINDS)
  for (const c of CREATORS) assert.ok(c.sells.length > 5 && c.sells.length <= 34, c.slug)
  assert.equal(new Set(CREATORS.map((c) => c.name)).size, CREATORS.length)
})

check("server markup: one heading, the copy, both CTAs, region with carousel role", () => {
  assert.equal((light.match(/<h2/g) || []).length, 1)
  assert.ok(light.includes(`aria-label="${CREATORS_HEADING}"`))
  const t = text(light)
  for (const c of CREATORS) assert.ok(t.includes(c.kind) && t.includes(c.sells), c.kind)
  assert.ok(light.includes('href="/signup"') && light.includes('href="/explore"'))
  assert.ok(light.includes('aria-roledescription="carousel"'))
  assert.ok(/aria-label="Pause carousel"/.test(light) && /aria-label="Previous creator"/.test(light) && /aria-label="Next creator"/.test(light))
  assert.ok(dark.includes('data-tone="dark"') && dark.includes("data-story-dark"))
})

check("seamless loop: exactly two copies, the second hidden from assistive tech and inert", () => {
  const cards = light.match(/<li class="cc-card[^"]*"[^>]*>/g) || []
  assert.equal(cards.length, (CREATORS.length + 1) * 2)
  const hidden = cards.filter((c) => /aria-hidden="true"/.test(c) && /inert=""/.test(c))
  assert.equal(hidden.length, CREATORS.length + 1)
  for (const c of cards.slice(0, CREATORS.length + 1)) assert.ok(!/aria-hidden/.test(c))
})

check("photos: local, responsive, lazy, async, sized, alt text only on the first copy", () => {
  const imgs = light.match(/<img [^>]*>/g) || []
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

check("reduced motion: a still grid, one copy, no controls, no animation", () => {
  const rm = CREATORS_CSS.slice(CREATORS_CSS.indexOf("@media(prefers-reduced-motion:reduce)"))
  assert.ok(/\.cc-track\{display:grid/.test(rm) && /transform:none!important/.test(rm))
  assert.ok(/\.cc-card\[aria-hidden="true"\]\{display:none\}/.test(rm))
  assert.ok(/\.cc-controls\{display:none\}/.test(rm) && /animation:none!important/.test(rm))
  for (const css of [MORPH_PILL_CSS, ORBIT_BADGE_CSS, SALE_POP_CSS]) assert.ok(css.includes("prefers-reduced-motion:reduce"))
  const src = read(SRC)
  assert.ok(src.includes('matchMedia("(prefers-reduced-motion: reduce)")') && /const live = \(\) => visible && !document\.hidden && !reduce\.matches/.test(src))
})

check("bubble morph: hover on fine pointers, data-active on touch, spring easing", () => {
  assert.ok(CREATORS_CSS.includes("@media(hover:hover) and (pointer:fine)"))
  for (const shape of ["arch", "tear", "tilt"]) assert.ok(CREATORS_CSS.includes(`[data-shape="${shape}"]{--cc-on:`), shape)
  assert.ok(/\.cc-card\[data-active\] \.cc-shape\{border-radius:var\(--cc-on\)\}/.test(CREATORS_CSS))
  assert.ok(/transition:border-radius 860ms var\(--cc-spring\)/.test(CREATORS_CSS))
  assert.ok(CREATORS_CSS.includes("linear(0,"))
  assert.ok(read(SRC).includes('matchMedia("(hover: none), (pointer: coarse)")'))
})

check("keyframes animate only transform and opacity", () => {
  for (const css of [CREATORS_CSS, MORPH_PILL_CSS, ORBIT_BADGE_CSS, SALE_POP_CSS]) {
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

check("motion primitives render on the server and stay readable", () => {
  const pill = renderToString(createElement(MorphPillCluster, { labels: CREATORS_SELL_LABELS, prefix: "Sell" }))
  assert.ok(pill.includes("Sell merch drops, online courses"))
  assert.ok(/data-state="on"[^>]*><span class="mp-text">merch drops/.test(pill))
  const badge = renderToString(createElement(OrbitBadge, null, "Live now"))
  assert.ok(badge.includes("Live now") && badge.includes("ob-orbit"))
  const pop = renderToString(createElement(SalePop, { items: [{ who: "Maya R.", what: "a beat pack", amount: "$29.00" }] }))
  assert.ok(text(pop).replace(/\s+/g, " ").includes("Maya R. bought a beat pack") && pop.includes("$29.00"))
  for (const f of MOTION) assert.ok(!/from ["'](?:framer-motion|three|lottie[\w-]*|gsap)["']/.test(read(f)), f)
})

check("registered in the push suite", () => {
  assert.ok(read("scripts/run-push-tests.mjs").includes('"tests/home-w12-creators.test.ts"'))
})

console.log(`\nhome-w12-creators: ${passed} checks passed`)
