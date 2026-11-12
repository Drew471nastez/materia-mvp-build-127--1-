/** Wave 12 showcase track: section 2 gallery content, section 4 builder previews, section 6 business carousel. */
import assert from "node:assert/strict"
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { BuildShowcase, SHOWCASE_EXAMPLES } from "../components/marketing/build-showcase"
import { IdeasComeToLife, IDEAS_HEADING, IDEAS_TABS } from "../components/marketing/home/ideas-come-to-life"
import { BusinessCarousel, BUSINESS_HEADING, BUSINESS_SLIDES, BUSINESS_SUBLINE } from "../components/marketing/home/business-carousel"
import { u } from "../components/marketing/home/showcase-mocks/frame"
import { StoreDesktop, StoreMobile } from "../components/marketing/home/showcase-mocks/store-mock"
import { OnePageDesktop, OnePagePhone } from "../components/marketing/home/showcase-mocks/onepage-mock"
import { CommunityDesktop, CommunityMobile } from "../components/marketing/home/showcase-mocks/community-mock"
import { CommunityBuilderMock, OnePageEditorMock, WebsiteBuilderMock } from "../components/marketing/home/showcase-mocks/builder-mocks"

const read = (p: string) => readFileSync(p, "utf8")
const MOCKS = "components/marketing/home/showcase-mocks"
const files = [
  "components/marketing/build-showcase.tsx",
  "components/marketing/use-showcase-motion.ts",
  "components/marketing/home/ideas-come-to-life.tsx",
  "components/marketing/home/business-carousel.tsx",
  ...readdirSync(MOCKS).map((f) => `${MOCKS}/${f}`),
]
const source = files.map(read).join("\n")

/* ---- the design-unit helper rewrites only Nu lengths */
assert.equal(u("a{padding:12u 4.5u;margin:-3u 0;color:#1f2a22}"), "a{padding:calc(12*var(--u)) calc(4.5*var(--u));margin:calc(-3*var(--u)) 0;color:#1f2a22}")
assert.equal(u("transform:translate(14u,-6u) scale(.9)"), "transform:translate(calc(14*var(--u)),calc(-6*var(--u))) scale(.9)")

/* ---- images: local, optimized, sized, lazy; nothing hotlinked */
assert.ok(!/https?:\/\/(images\.unsplash|plus\.unsplash|source\.unsplash)/.test(source), "photos are downloaded, never hotlinked")
assert.ok(!/<img[^>]+src="https?:/.test(source))
const assets = readdirSync("public/home/showcase")
assert.ok(assets.length >= 45 && assets.every((f) => f.endsWith(".webp")), "all showcase photos are webp")
const total = assets.reduce((sum, f) => sum + statSync(`public/home/showcase/${f}`).size, 0)
assert.ok(total <= 6 * 1024 * 1024, `track images stay under 6 MB (${total})`)
for (const f of assets) assert.ok(statSync(`public/home/showcase/${f}`).size < 160 * 1024, `${f} is small`)
// Every mock, every brand: each picture it draws exists, is lazy and sized.
const everyMock = renderToString(
  createElement(
    "div",
    null,
    ...(["hollow", "gridline", "bloom"] as const).flatMap((b) => [createElement(StoreDesktop, { brand: b }), createElement(StoreMobile, { brand: b })]),
    ...(["maya", "lio", "priya"] as const).flatMap((b) => [createElement(OnePagePhone, { brand: b }), createElement(OnePageDesktop, { brand: b })]),
    ...(["darkroom", "founders", "kiln"] as const).flatMap((b) => [createElement(CommunityDesktop, { brand: b }), createElement(CommunityMobile, { brand: b })]),
    createElement(WebsiteBuilderMock),
    createElement(OnePageEditorMock),
    createElement(CommunityBuilderMock),
  ),
)
const srcs = new Set([...everyMock.matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => m[1]))
assert.ok(srcs.size >= 36, `${srcs.size} pictures`)
for (const src of srcs) assert.ok(src.startsWith("/home/showcase/") && existsSync(`public${src}`), `${src} exists`)
assert.ok(!/<img(?![^>]*loading="lazy")[^>]*>/.test(everyMock) && !/<img(?![^>]*height=)[^>]*>/.test(everyMock))
assert.ok(!/\blorem\b/i.test(everyMock))

/* ---- section 2 keeps its gallery, now nine branded examples */
assert.equal(SHOWCASE_EXAMPLES.length, 9)
assert.equal(SHOWCASE_EXAMPLES.filter((e) => e.format === "portrait").length, 3)
for (const e of SHOWCASE_EXAMPLES) {
  assert.ok(existsSync(`public${e.src}`), `${e.src} exists`)
  assert.ok(statSync(`public${e.src}`).size < 120 * 1024)
  assert.ok(e.alt.length > 20)
}
const gallery = renderToString(createElement(BuildShowcase))
assert.equal((gallery.match(/data-showcase-slide=""/g) || []).length, 9)
/* Changed on purpose (merge of main's round 60): each card is its picture's own shape, so a slide is its picture alone, with no blurred fill behind it. */
assert.equal((gallery.match(/loading="lazy"/g) || []).length, 9)
assert.equal((gallery.match(/decoding="async"/g) || []).length, 9)
assert.equal((gallery.match(/build-showcase-fill/g) || []).length, 0)
// Three wide–OnePage–wide pages, each a store, a OnePage and a community.
assert.deepEqual(SHOWCASE_EXAMPLES.map((e) => e.format), ["wide", "portrait", "wide", "wide", "portrait", "wide", "wide", "portrait", "wide"])
assert.equal((gallery.match(/data-showcase-group=""/g) || []).length, 3)
/* Changed on purpose (merge of main's round 60): the rail's motion moved to lib/ui/rail-motion, which the showcase's hook drives. */
const motion = read("components/marketing/use-showcase-motion.ts") + read("lib/ui/rail-motion.ts")
assert.ok(motion.includes("prefers-reduced-motion") && motion.includes("IntersectionObserver") && motion.includes("document.hidden"))

/* ---- section 4: builder previews */
assert.deepEqual(
  IDEAS_TABS.map((t) => t.title),
  ["Website builder", "OnePage editor", "Community builder"],
)
const ideas = renderToString(createElement(IdeasComeToLife))
assert.ok(ideas.includes(`aria-label="${IDEAS_HEADING}"`))
assert.equal((ideas.match(/role="tab"/g) || []).length, 3)
assert.equal((ideas.match(/<button[^>]*aria-selected="true"/g) || []).length, 1)
// Only the active panel and the next one are mounted.
assert.equal((ideas.match(/role="tabpanel"/g) || []).length, 1)
assert.ok(/<div[^>]*data-pane="active"/.test(ideas) && !/<div[^>]*data-pane="next"/.test(ideas), "the next panel waits for an idle moment after first view")
assert.ok(ideas.includes(IDEAS_TABS[0].alt.slice(11, 60)))
assert.ok(!ideas.includes("data-mock-live=\""), "nothing animates before the section is seen")
const builders = read(`${MOCKS}/builder-mocks.tsx`)
// Animations attach only under [data-mock-live], only without reduced motion, and never via * or :has().
const animRules = [...builders.matchAll(/\{animation:([\w-]+) var\(--bm-t\)/g)]
assert.ok(animRules.length >= 20)
assert.equal((builders.match(/@media\(prefers-reduced-motion:no-preference\)\{\[data-mock-live\] /g) || []).length, animRules.length)
assert.ok(!/\.bm \*|:has\(/.test(builders))
// Keyframes animate transform and opacity only.
for (const block of builders.matchAll(/@keyframes [\w-]+\{(.*?)\}\}/g)) {
  for (const prop of block[1].matchAll(/([a-z-]+):/g))
    assert.ok(["opacity", "transform", "box-shadow", "animation-timing-function"].includes(prop[1]), `keyframes use ${prop[1]}`)
}

/* ---- section 6: business carousel */
assert.equal(BUSINESS_HEADING, "Made for every kind of business.")
assert.equal(BUSINESS_SUBLINE, "Explore the different ways people can create, sell, and connect on Storelib.")
assert.deepEqual(
  BUSINESS_SLIDES.map((s) => s.label),
  ["Digital Products", "Courses", "Communities", "OnePage", "Physical Products"],
)
const biz = renderToString(createElement(BusinessCarousel))
assert.equal((biz.match(/role="tab"/g) || []).length, 5)
assert.equal((biz.match(/role="tabpanel"/g) || []).length, 1, "only the active slide is server-rendered")
assert.equal((biz.match(/<figure/g) || []).length, 2, "each mounted slide has a desktop and a phone preview")
assert.equal((biz.match(/<figcaption/g) || []).length, 2)
assert.ok(biz.includes('aspect-ratio:16/9') && biz.includes('aspect-ratio:9/16'))
assert.ok(/>Next<svg/.test(biz), "a Next button")
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/'/g, "&#x27;")
assert.ok(biz.includes(esc(BUSINESS_SLIDES[0].desktopAlt)) && biz.includes(esc(BUSINESS_SLIDES[0].mobileAlt)))
for (const html of [ideas, biz]) {
  assert.ok(!/<img(?![^>]*loading="lazy")[^>]*>/.test(html), "every mock image is lazy")
  assert.ok(!/<img(?![^>]*width=)[^>]*>/.test(html), "every mock image is sized")
}

/* ---- autoplay: no timers, pauses when unseen, stops on a choice, off for reduced motion */
const tabs = read(`${MOCKS}/use-auto-tabs.ts`)
assert.ok(!/setInterval/.test(tabs) && tabs.includes("IntersectionObserver") && tabs.includes("visibilitychange"))
assert.ok(tabs.includes("prefers-reduced-motion") && tabs.includes("playing && !reduce") && tabs.includes("requestIdleCallback") && tabs.includes("startTransition"))
assert.ok(/const select = useCallback\(\s*\(to: number\) => \{\s*setPlaying\(false\)/.test(tabs), "manual selection stops autoplay")
for (const f of ["ideas-come-to-life.tsx", "business-carousel.tsx"]) {
  const s = read(`components/marketing/home/${f}`)
  assert.ok(s.includes("onAnimationEnd={i === t.index ? t.advance : undefined}") && s.includes("animation-play-state:running"))
  assert.ok(s.includes("prefers-reduced-motion:reduce"))
  assert.ok(/height:44px/.test(s), "44px tap targets")
}

/* ---- fictional brands only; no real-brand marks in the mocks */
assert.ok(!/react-icons/.test(source))
assert.ok(!/\b(Shopify|Nike|Notion Labs|Figma Inc)\b/.test(source))

console.log("home-w12-showcase: ok")
