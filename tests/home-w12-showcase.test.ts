/** Wave 12 showcase track: section 2 gallery content, section 4 builder previews, section 6 business carousel. */
import assert from "node:assert/strict"
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { BuildShowcase, SHOWCASE_EXAMPLES } from "../components/marketing/build-showcase"
import { IdeasComeToLife, IDEAS_HEADING, IDEAS_SLIDES } from "../components/marketing/home/ideas-come-to-life"
import { BusinessCarousel, BUSINESS_HEADING, BUSINESS_SLIDES } from "../components/marketing/home/business-carousel"
import { u } from "../components/marketing/home/showcase-mocks/frame"
/* Changed on purpose (landing round): section 6 is one product page per kind of thing sold (business-mocks), and the builders gained the Design slide. */
import * as Biz from "../components/marketing/home/showcase-mocks/business-mocks"
/* Changed on purpose (landing round, second pass): the OnePage in the editor is Nina Sato's on the Air theme (NinaPage), not Maya Okafor's. */
import { CommunityBuilderMock, DesignMock, NinaPage, OnePageEditorMock, WebsiteBuilderMock } from "../components/marketing/home/showcase-mocks/builder-mocks"

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
    ...([Biz.EbookPage, Biz.CoursePage, Biz.CommunityPage, Biz.TeePage, Biz.BookingPage] as const).map((P) => createElement(P)),
    createElement(NinaPage),
    createElement(WebsiteBuilderMock),
    createElement(DesignMock),
    createElement(OnePageEditorMock),
    createElement(CommunityBuilderMock),
  ),
)
/* Changed on purpose (wave 13): Storelib's own logo in the editors' bars is drawn by its one component (components/brand/storelib-logo), not a showcase photo. */
const srcs = new Set([...everyMock.matchAll(/<img(?![^>]*data-storelib-logo)[^>]*src="([^"]+)"/g)].map((m) => m[1]))
/* Changed on purpose (landing round): fewer, calmer pictures (no storefront pairs, no florals). */
assert.ok(srcs.size >= 15, `${srcs.size} pictures`)
for (const src of srcs) assert.ok(src.startsWith("/home/showcase/") && existsSync(`public${src}`), `${src} exists`)
/* The logo goes through next/image (lazy by default there; the test stub leaves the attribute out), so the photos are checked here. */
const photos = everyMock.replace(/<img[^>]*data-storelib-logo[^>]*>/g, "")
assert.ok(!/<img(?![^>]*loading="lazy")[^>]*>/.test(photos) && !/<img(?![^>]*height=)[^>]*>/.test(photos))
assert.ok(!/\blorem\b/i.test(everyMock))

/* ---- section 2 keeps its gallery. Changed on purpose (wave 13): twelve examples, four groups, with Satori Studio's real OnePage added. */
assert.equal(SHOWCASE_EXAMPLES.length, 12)
assert.equal(SHOWCASE_EXAMPLES.filter((e) => e.format === "portrait").length, 4)
assert.ok(SHOWCASE_EXAMPLES.some((e) => e.src === "/home/showcase/a-satori.webp" && e.format === "portrait"), "the real Satori Studio OnePage is a card")
for (const e of SHOWCASE_EXAMPLES) {
  assert.ok(existsSync(`public${e.src}`), `${e.src} exists`)
  assert.ok(statSync(`public${e.src}`).size < 120 * 1024)
  assert.ok(e.alt.length > 20)
}
const gallery = renderToString(createElement(BuildShowcase))
assert.equal((gallery.match(/data-showcase-slide=""/g) || []).length, 12)
/* Changed on purpose (merge of main's round 60): each card is its picture's own shape, so a slide is its picture alone, with no blurred fill behind it. */
assert.equal((gallery.match(/loading="lazy"/g) || []).length, 12)
assert.equal((gallery.match(/decoding="async"/g) || []).length, 12)
assert.equal((gallery.match(/build-showcase-fill/g) || []).length, 0)
// Four wide–OnePage–wide pages.
assert.deepEqual(SHOWCASE_EXAMPLES.map((e) => e.format), ["wide", "portrait", "wide", "wide", "portrait", "wide", "wide", "portrait", "wide", "wide", "portrait", "wide"])
assert.equal((gallery.match(/data-showcase-group=""/g) || []).length, 4)

/* ---- wave 13, the owner's asks for section 2 */
/** A webp's own width and height, from its header. */
function webpSize(file: string) {
  const b = readFileSync(file)
  const kind = b.toString("ascii", 12, 16)
  if (kind === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) }
  if (kind === "VP8L") {
    const bits = b.readUInt32LE(21)
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 }
  }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff }
}
for (const e of SHOWCASE_EXAMPLES) {
  const size = webpSize(`public${e.src}`)
  assert.deepEqual(size, { w: e.width, h: e.height }, `${e.src} is drawn at its card's shape`)
}
// The cards are 10% taller than round 60's 16:10 and 9:16 (same widths, so the columns stay 256fr 90fr 256fr).
const wideEx = SHOWCASE_EXAMPLES.find((e) => e.format === "wide")!
const tallEx = SHOWCASE_EXAMPLES.find((e) => e.format === "portrait")!
assert.ok(Math.abs(wideEx.height / wideEx.width / (10 / 16) - 1.1) < 0.005 && Math.abs(tallEx.height / tallEx.width / (16 / 9) - 1.1) < 0.005)
const showcaseSrc = read("components/marketing/build-showcase.tsx")
assert.ok(showcaseSrc.includes("aspect-ratio:1440/990") && showcaseSrc.includes("aspect-ratio:540/1056") && showcaseSrc.includes("256fr 90fr 256fr"))
// OnePage captions are three words at most.
for (const e of SHOWCASE_EXAMPLES.filter((x) => x.format === "portrait")) assert.ok(e.label.split(/\s+/).length <= 3, `"${e.label}" is three words at most`)
/* Added (wave 14, the owner): every caption is three words at most, and the cards are real kinds of creators (a Notion template seller, a strength coach, a music producer and more), each card its own picture. */
for (const e of SHOWCASE_EXAMPLES) assert.ok(e.label.split(/\s+/).length <= 3, `"${e.label}" is three words at most`)
assert.equal(new Set(SHOWCASE_EXAMPLES.map((e) => e.src)).size, 12, "twelve different pictures")
for (const want of [/Notion template/, /strength|training program/i, /sample pack/i]) assert.ok(SHOWCASE_EXAMPLES.some((e) => want.test(e.alt)), `a creator for ${want}`)
// The caption and its fade are hidden by default and come in only while a mouse rests on the picture, as one opacity on its own layer.
/* Changed on purpose (wave 13 perf): the caption's own layer (will-change) only where a mouse can show it; a touch screen never does. */
assert.ok(/\.build-showcase-slide figcaption \{[^}]*opacity:0;[^}]*transition:opacity/.test(showcaseSrc) && /@media\(hover:hover\) and \(pointer:fine\)\{\.build-showcase-slide figcaption\{will-change:opacity\}/.test(showcaseSrc), "the caption starts hidden")
assert.ok(/@media\(hover:hover\) and \(pointer:fine\)\{\.build-showcase-track:not\(\[data-dragging\]\) \.build-showcase-slide:hover figcaption\{opacity:1/.test(showcaseSrc), "and shows only under a resting mouse, never while dragging")
assert.equal((showcaseSrc.match(/figcaption\{opacity:1/g) || []).length, 1, "no other rule shows it")
// On a phone: the row starts on the heading's gutter, the first card about three quarters wide, the next peeking, 8px apart.
assert.ok(/--showcase-gap:8px;--showcase-height:clamp\(170px,51\.5vw,380px\)/.test(showcaseSrc) && /padding-left:var\(--showcase-gutter/.test(showcaseSrc))
{
  const h = 0.515 * 390
  const first = 1.4545 * h
  const peek = 390 - 20 - first - 8
  assert.ok(first / 390 > 0.7 && first / 390 < 0.8 && peek > 40 && peek < 1.4545 * h * 0.5114 / 1.4545, `at 390 the first card is ${Math.round(first)}px and the next shows ${Math.round(peek)}px`)
}
// The corner of image 29: the radius overlaps the hero, a 1px top highlight that follows the curve, no side hairline.
assert.ok(/--showcase-radius:clamp\(24px,2\.78vw,48px\)/.test(showcaseSrc) && /margin:calc\(var\(--showcase-radius\)\*-1\)/.test(showcaseSrc) && /box-shadow:inset 0 1px 0 rgba\(255,255,255,\.065\)/.test(showcaseSrc) && !/inset 0 0 0 1px/.test(showcaseSrc))
// Nothing restyles the page while the rail moves (the heading no longer dims at each autoplay step).
assert.ok(!/data-showcase-browsing/.test(showcaseSrc + read("components/marketing/use-showcase-motion.ts")))
/* Changed on purpose (merge of main's round 60): the rail's motion moved to lib/ui/rail-motion, which the showcase's hook drives. */
const motion = read("components/marketing/use-showcase-motion.ts") + read("lib/ui/rail-motion.ts")
assert.ok(motion.includes("prefers-reduced-motion") && motion.includes("IntersectionObserver") && motion.includes("document.hidden"))
/* Added (wave 14): the pictures stay lazy in the markup, and all twelve are fetched and decoded once the section is on screen, so a card brought in by a swipe or autoplay is never empty (it was, for a few frames, at 4x CPU). */
assert.ok(/if \(entry\.isIntersecting\) warm\(\)/.test(motion) && motion.includes('img.loading = "eager"') && motion.includes("img.decode?.()"))

/* ---- section 4: builder previews. Changed on purpose (landing round, the owner): a carousel of four editors under a heading that flips with them, every slide drawn (the neighbours show at the sides), the same drawing on a phone. */
assert.deepEqual(
  IDEAS_SLIDES.map((t) => t.title),
  ["Website builder", "Design", "OnePage editor", "Community editor"],
)
const ideas = renderToString(createElement(IdeasComeToLife))
assert.ok(ideas.includes(`aria-label="${IDEAS_HEADING}"`))
assert.equal((ideas.match(/data-ideas-slide=""/g) || []).length, 4)
assert.equal((ideas.match(/<div[^>]*data-active="true"/g) || []).length, 1)
assert.ok(ideas.includes(IDEAS_SLIDES[0].alt.slice(11, 60)))
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

/* ---- section 6. Changed on purpose (landing round, the owner: "every business one home at all, please look at something else"): what a store sells, a list beside one product page. */
assert.notEqual(BUSINESS_HEADING, "Made for every kind of business.")
assert.ok(!/Every business|Explore the different ways/.test(read("components/marketing/home/business-carousel.tsx")))
assert.deepEqual(
  BUSINESS_SLIDES.map((s) => s.label),
  ["Digital products", "Courses", "Communities", "Physical products", "Bookings"],
)
const biz = renderToString(createElement(BusinessCarousel))
assert.equal((biz.match(/role="tab"/g) || []).length, 5)
assert.equal((biz.match(/role="tabpanel"/g) || []).length, 1, "only the active page is server-rendered")
assert.ok(biz.includes("aspect-ratio:640/520"))
assert.ok(!/<figcaption|>Next<|Pause the|Play the|biz-phone|biz-chrome/.test(biz))
const bizSrc = read("components/marketing/home/business-carousel.tsx")
assert.ok(!/\btint\b|className="[^"]*smk-pills/.test(bizSrc), "no backdrop tint and no pill row")
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/'/g, "&#x27;")
assert.ok(biz.includes(esc(BUSINESS_SLIDES[0].alt)))
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
/* Changed on purpose (landing round): section 4 is a carousel moved by lib/ui/rail-motion (its own autoplay, paused off screen); section 6 keeps the invisible clock. */
for (const f of ["business-carousel.tsx"]) {
  const s = read(`components/marketing/home/${f}`)
  assert.ok(s.includes("onAnimationEnd={t.advance}") && s.includes('className="smk-clock"') && s.includes("animation-play-state:running"))
  assert.ok(s.includes("prefers-reduced-motion:reduce"))
  assert.ok(!/progress|Pause|setPlaying/.test(s), `${f}: no progress line or pause button`)
}
for (const html of [ideas, biz]) assert.ok(!/<button[^>]*role="tab"[^>]*>(?:(?!<\/button>).)*<span[^>]*(progress|clock)/.test(html), "nothing inside a pill but its words")

/* ---- section 4: light, centred, the picture with its own depth. Changed on purpose (landing round): the slides glide (rail-motion) and the heading flips; nothing else slides in. */
const ideasSrc = read("components/marketing/home/ideas-come-to-life.tsx")
assert.ok(/\.ideas\{position:relative;background:#fff/.test(ideasSrc), "a light section")
assert.ok(/\.ideas-head\{[^}]*text-align:center/.test(ideasSrc))
assert.ok(!/radial-gradient|ideas-caption/.test(ideasSrc), "no backdrop and no caption")
assert.ok(/\.ideas-slide\{[^}]*box-shadow:0 0 0 1px/.test(ideasSrc), "the picture has its own depth")
assert.ok(ideasSrc.includes("prefers-reduced-motion:reduce") && /new RailMotion\(/.test(ideasSrc) && ideasSrc.includes("IntersectionObserver") && ideasSrc.includes("visibilitychange"))
// The editors as they are: the website builder's bar and tree, the OnePage editor's tabs, the community page editor's own screen.
for (const want of ["Sections", "Pages", "Theme", "Add section", "Publish", "Preview"]) assert.ok(ideas.includes(want), `website builder: ${want}`)
const onepageHtml = renderToString(createElement(OnePageEditorMock))
for (const want of ["Links", "Design", "Products", "Share your OnePage", "Add Group", "View archive"]) assert.ok(onepageHtml.includes(want), `OnePage editor: ${want}`)
const communityHtml = renderToString(createElement(CommunityBuilderMock))
for (const want of ["Edit page", "Name and introduction", "Cover and gallery", "Join button", "Visibility and search", "Computer", "Phone", "As a visitor", "Published", "Save", "Tagline"]) assert.ok(communityHtml.includes(want), `community editor: ${want}`)

/* ---- fictional brands only; no real-brand marks in the mocks */
assert.ok(!/react-icons/.test(source))
/* Changed on purpose (landing round, second pass, the owner: "modern social icons", the official marks): the OnePage's social row draws
   Instagram, TikTok, YouTube and Spotify through the marks the OnePage itself draws (components/icons/brand-icons.generated), and nothing else. */
const brandImports = [...source.matchAll(/import \{([^}]*)\} from "@\/components\/icons\/brand-icons\.generated"/g)].map((m) => m[1].replace(/\s/g, ""))
assert.deepEqual(brandImports, ["SiInstagram,SiSpotify,SiTiktok,SiYoutube"])
assert.ok(!/\b(Shopify|Nike|Notion Labs|Figma Inc)\b/.test(source))

/* A slide put away keeps the height it last drew (contain-intrinsic-block-size: auto, set on every slide since the browser only records the size while the rule is already there), so the business stage never shrinks when a shorter slide comes up (it scored a 0.02 layout shift on phones). */
assert.ok(read("components/marketing/home/business-carousel.tsx").includes('.biz-slide{grid-area:1/1;contain-intrinsic-block-size:auto 0px;'))

console.log("home-w12-showcase: ok")
