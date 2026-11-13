/** Wave 12 showcase track: section 2 gallery content, section 4 builder previews, section 6 business carousel. */
import assert from "node:assert/strict"
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { BuildShowcase, SHOWCASE_EXAMPLES } from "../components/marketing/build-showcase"
import { IdeasComeToLife, IDEAS_HEADING, IDEAS_TABS } from "../components/marketing/home/ideas-come-to-life"
import { BusinessCarousel, BUSINESS_HEADING, BUSINESS_SLIDES } from "../components/marketing/home/business-carousel"
import { u } from "../components/marketing/home/showcase-mocks/frame"
/* Changed on purpose (wave 13): the storefront mocks (store, OnePage, community) are one file of five real-looking businesses, each a desktop and a phone page. */
import * as Biz from "../components/marketing/home/showcase-mocks/business-mocks"
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
    ...(["Saltlight", "Bloom", "Darkroom", "Sol", "Hollow"] as const).flatMap((b) => [createElement(Biz[`${b}Desktop`]), createElement(Biz[`${b}Mobile`])]),
    createElement(Biz.MayaPage),
    createElement(WebsiteBuilderMock),
    createElement(OnePageEditorMock),
    createElement(CommunityBuilderMock),
  ),
)
/* Changed on purpose (wave 13): Storelib's own logo in the editors' bars is drawn by its one component (components/brand/storelib-logo), not a showcase photo. */
const srcs = new Set([...everyMock.matchAll(/<img(?![^>]*data-storelib-logo)[^>]*src="([^"]+)"/g)].map((m) => m[1]))
assert.ok(srcs.size >= 36, `${srcs.size} pictures`)
for (const src of srcs) assert.ok(src.startsWith("/home/showcase/") && existsSync(`public${src}`), `${src} exists`)
/* The logo goes through next/image (lazy by default there; the test stub leaves the attribute out), so the photos are checked here. */
const photos = everyMock.replace(/<img[^>]*data-storelib-logo[^>]*>/g, "")
assert.ok(!/<img(?![^>]*loading="lazy")[^>]*>/.test(photos) && !/<img(?![^>]*height=)[^>]*>/.test(photos))
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
/* Changed on purpose (wave 13): each editor has one quiet scripted moment (select a section and publish; switch a block on and save; write and post), fewer moving parts than before. */
assert.ok(animRules.length >= 15, `${animRules.length} animation rules`)
assert.equal((builders.match(/@media\(prefers-reduced-motion:no-preference\)\{\[data-mock-live\] /g) || []).length, animRules.length)
assert.ok(!/\.bm \*|:has\(/.test(builders))
// Keyframes animate transform and opacity only.
for (const block of builders.matchAll(/@keyframes [\w-]+\{(.*?)\}\}/g)) {
  for (const prop of block[1].matchAll(/([a-z-]+):/g))
    assert.ok(["opacity", "transform", "box-shadow", "animation-timing-function"].includes(prop[1]), `keyframes use ${prop[1]}`)
}

/* ---- section 6: business carousel */
/* Changed on purpose (wave 13, the owner): a different heading and no subheading. */
assert.notEqual(BUSINESS_HEADING, "Made for every kind of business.")
assert.ok(!/Explore the different ways/.test(read("components/marketing/home/business-carousel.tsx")))
assert.deepEqual(
  BUSINESS_SLIDES.map((s) => s.label),
  ["Digital Products", "Courses", "Communities", "OnePage", "Physical Products"],
)
const biz = renderToString(createElement(BusinessCarousel))
assert.equal((biz.match(/role="tab"/g) || []).length, 5)
assert.equal((biz.match(/role="tabpanel"/g) || []).length, 1, "only the active slide is server-rendered")
/* Changed on purpose (wave 13, the owner): no phone frame, no backdrop, no captions, no pause or Next button. Each slide is a 4:3 desktop card and a 9:16 phone card, the same height (their columns are 64:27, the ratio of their widths at one height). */
assert.equal((biz.match(/class="biz-card /g) || []).length, 2, "each mounted slide has a desktop and a phone card")
assert.ok(biz.includes("aspect-ratio:4/3") && biz.includes("aspect-ratio:9/16"))
assert.ok(!/<figcaption|>Next<|Pause the|Play the|biz-phone|biz-chrome/.test(biz))
const bizSrc = read("components/marketing/home/business-carousel.tsx")
assert.ok(bizSrc.includes("grid-template-columns:minmax(0,64fr) minmax(0,27fr)") && 4 / 3 / (9 / 16) === 64 / 27, "equal heights")
assert.ok(!/\.biz-stage\{[^}]*background/.test(bizSrc) && !/tint/.test(bizSrc), "no backdrop behind the cards")
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/'/g, "&#x27;")
assert.ok(biz.includes(esc(BUSINESS_SLIDES[0].desktopAlt)) && biz.includes(esc(BUSINESS_SLIDES[0].mobileAlt)))
for (const html of [ideas, biz].map((h) => h.replace(/<img[^>]*data-storelib-logo[^>]*>/g, ""))) {
  assert.ok(!/<img(?![^>]*loading="lazy")[^>]*>/.test(html), "every mock image is lazy")
  assert.ok(!/<img(?![^>]*width=)[^>]*>/.test(html), "every mock image is sized")
}

/* ---- autoplay: no timers, pauses when unseen, stops on a choice, off for reduced motion */
const tabs = read(`${MOCKS}/use-auto-tabs.ts`)
assert.ok(!/setInterval/.test(tabs) && tabs.includes("IntersectionObserver") && tabs.includes("visibilitychange"))
assert.ok(tabs.includes("prefers-reduced-motion") && tabs.includes("playing && !reduce") && tabs.includes("requestIdleCallback") && tabs.includes("startTransition"))
assert.ok(/const select = useCallback\(\s*\(to: number\) => \{\s*setPlaying\(false\)/.test(tabs), "manual selection stops autoplay")
/* Changed on purpose (wave 13, the owner): no loading or progress line in the pills and no pause button. Autoplay runs on one invisible clock beside the tabs (pills.ts .smk-clock), paused unless the section runs. */
const pills = read(`${MOCKS}/pills.ts`)
assert.ok(/height:44px/.test(pills), "44px tap targets")
assert.ok(/\.smk-clock\{[^}]*opacity:0/.test(pills) && /\.smk-clock\[data-on\]\{animation:smk-clock 1s linear both paused\}/.test(pills))
for (const f of ["ideas-come-to-life.tsx", "business-carousel.tsx"]) {
  const s = read(`components/marketing/home/${f}`)
  assert.ok(s.includes("onAnimationEnd={t.advance}") && s.includes('className="smk-clock"') && s.includes("animation-play-state:running"))
  assert.ok(s.includes("prefers-reduced-motion:reduce"))
  assert.ok(!/progress|Pause|setPlaying/.test(s), `${f}: no progress line or pause button`)
}
for (const html of [ideas, biz]) assert.ok(!/<button[^>]*role="tab"[^>]*>(?:(?!<\/button>).)*<span[^>]*(progress|clock)/.test(html), "nothing inside a pill but its words")

/* ---- section 4 (wave 13, the owner): light, centred, no backdrop, no caption, nothing slides in */
const ideasSrc = read("components/marketing/home/ideas-come-to-life.tsx")
assert.ok(/\.ideas\{position:relative;background:#fff/.test(ideasSrc), "a light section")
assert.ok(/\.ideas-in\{[^}]*text-align:center/.test(ideasSrc) && /\.ideas-tabs\{margin:[^}]*auto/.test(ideasSrc) && /\.ideas-stage\{[^}]*margin:0 auto/.test(ideasSrc))
assert.ok(!/radial-gradient|ideas-caption/.test(ideasSrc), "no backdrop and no caption")
assert.ok(/@keyframes ideas-in\{from\{opacity:0\}\}/.test(ideasSrc) && !/@keyframes ideas-in\{[^}]*translate/.test(ideasSrc), "a crossfade, not a slide")
assert.ok(/\.ideas-panel\{[^}]*box-shadow:0 0 0 1px/.test(ideasSrc), "the picture has its own depth")
// The editors as they are: the website builder's bar and tree, the OnePage editor's tabs, the app shell around the community builder.
for (const want of ["Sections", "Pages", "Theme", "Add section", "Publish", "Preview"]) assert.ok(ideas.includes(want), `website builder: ${want}`)
const onepageHtml = renderToString(createElement(OnePageEditorMock))
for (const want of ["Links", "Design", "Products", "Share your OnePage", "Add Group", "View archive"]) assert.ok(onepageHtml.includes(want), `OnePage editor: ${want}`)
const communityHtml = renderToString(createElement(CommunityBuilderMock))
for (const want of ["Overview", "Posts", "Spaces", "Members", "Save draft", "All posts", "Dashboard"]) assert.ok(communityHtml.includes(want), `community builder: ${want}`)

/* ---- fictional brands only; no real-brand marks in the mocks */
assert.ok(!/react-icons/.test(source))
assert.ok(!/\b(Shopify|Nike|Notion Labs|Figma Inc)\b/.test(source))

/* A slide put away keeps the height it last drew (contain-intrinsic-block-size: auto, set on every slide since the browser only records the size while the rule is already there), so the business stage never shrinks when a shorter slide comes up (it scored a 0.02 layout shift on phones). */
assert.ok(read("components/marketing/home/business-carousel.tsx").includes('.biz-slide{grid-area:1/1;contain-intrinsic-block-size:auto 0px;'))

console.log("home-w12-showcase: ok")
