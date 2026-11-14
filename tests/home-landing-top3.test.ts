/**
 * ===========================================================================
 *  HOME, LANDING ROUND 3: THE TOP SECTIONS
 * ===========================================================================
 * components/marketing/home/everything-in-one-place.tsx ("Make the work"),
 * ideas-come-to-life.tsx, business-carousel.tsx with
 * showcase-mocks/business-mocks.tsx, and components/marketing/product-marquee.tsx.
 *
 * The owner, round 3:
 *   - "Build a store that looks like you": no storelib.me/name address, no
 *     white header with a URL over a OnePage; a OnePage there is a real one
 *     as a phone shows it; nothing in the strip can be hovered or clicked.
 *   - The Storelib support example is not a payout that has not reached the
 *     bank; none of the three requests is about missing money.
 *   - The digital product is an actual digital product with a name like one
 *     (a LUT pack), not "a cover with a landscape". The same for the
 *     business section's digital product.
 *   - He likes the tabs of "Make the work": the other sections' tabs are of
 *     that family (a grey pill track, 30px tabs, the chosen one white), with
 *     no coloured icon chips.
 *   - "One store for everything you sell" stands on white: dark text, the
 *     stage in the soft grey of "Make the work".
 *   - About half of the examples are things that ship.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  EverythingInOnePlace,
  EVERYTHING_SHOTS,
  EVERYTHING_SLIDES,
  EVERYTHING_STORES,
  EVERYTHING_STRIP,
  EVERYTHING_STYLES,
  EVERYTHING_SUPPORT,
} from "@/components/marketing/home/everything-in-one-place"
/* Changed on purpose (landing round 4): the ideas section has three thin pill tabs again (IDEAS_TABS), the business section a Notion template as its digital product. */
import { IdeasComeToLife, IDEAS_TABS } from "@/components/marketing/home/ideas-come-to-life"
import { BusinessCarousel, BUSINESS_SLIDES } from "@/components/marketing/home/business-carousel"
import { TemplatePage } from "@/components/marketing/home/showcase-mocks/business-mocks"
import { MARQUEE_ROWS } from "@/components/marketing/product-marquee"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const rule = (css: string, selector: string) => {
  const at = css.indexOf(`${selector}{`)
  return at < 0 ? "" : css.slice(at, css.indexOf("}", at) + 1)
}
const src = {
  everything: read("components/marketing/home/everything-in-one-place.tsx"),
  ideas: read("components/marketing/home/ideas-come-to-life.tsx"),
  business: read("components/marketing/home/business-carousel.tsx"),
  pages: read("components/marketing/home/showcase-mocks/business-mocks.tsx"),
}
const everything = renderToStaticMarkup(createElement(EverythingInOnePlace))
const evCss = EVERYTHING_STYLES[0]?.css ?? ""
const strip = everything.slice(everything.indexOf('class="ev-vis ev-s"'), everything.indexOf('class="ev-cap"', everything.indexOf('class="ev-vis ev-s"')))

console.log("\n── Build a store that looks like you: stores and real OnePages, a picture only ──")
check("no storelib.me address in the section, in its markup or its source", !/storelib\.me/i.test(everything) && !/storelib\.me/i.test(src.everything))
check("no address of any kind in the strip (no URL bar over a page)", !/https?:|www\.|\.com|\.me\b|ev-(op|st)-(url|bar-url|chrome|address)/i.test(strip.replace(/src="[^"]*"/g, "")))
/* Changed on purpose (landing round 4): the owner asked for stores, communities on a phone and OnePages with their share and subscribe buttons, each card whole, and a strip that can be dragged. So the pictures between the stores are OnePages and a community at a phone's first screen (EVERYTHING_SHOTS, public/home/everything/strip), and the strip takes the pointer (only the strip: the cards inside take none) and drifts as a Web Animation from script. tests/home-landing-topa4.test.ts pins the rest. */
check("pictures stand between the stores", EVERYTHING_SHOTS.length >= 3 && EVERYTHING_STRIP.length === EVERYTHING_STORES.length + EVERYTHING_SHOTS.length)
check(
  "a store, then a picture, taking turns",
  EVERYTHING_STRIP.slice(0, EVERYTHING_SHOTS.length * 2).every((item, i) => "src" in item === (i % 2 === 1)),
)
check(
  "each picture is a capture that exists, at a phone screen's shape (390 by 650), and small",
  EVERYTHING_SHOTS.every((p) => {
    const file = join(root, "public", p.src)
    return p.src.startsWith("/home/everything/strip/") && existsSync(file) && statSync(file).size < 120_000
  }),
)
check("a picture in the strip is its picture and nothing else", (strip.match(/class="ev-st ev-op"[^>]*><img[^>]*class="ev-op-img"[^>]*><\/div>/g) ?? []).length === EVERYTHING_SHOTS.length * 2)
check("the cards in the strip take no pointer, and nothing is selectable", /pointer-events:none/.test(rule(evCss, ".ev-s-slot")) && /user-select:none/.test(rule(evCss, ".ev-s")))
check("the strip is hidden from assistive tech and holds nothing that takes focus", /class="ev-vis ev-s" aria-hidden="true"/.test(everything) && !/<(a|button|input|select|textarea)\b|tabindex/i.test(strip))
check("no hover style on anything in the strip", !/\.ev-(s|st|op)[\w-]*[^{}]*:hover/.test(evCss))
check("the strip still drifts in one loop, by one set's width", /el\.animate\(\[\{ transform: `translate3d\(\$\{-x\}px,0,0\)` \}, \{ transform: `translate3d\(\$\{-\(x \+ loop\)\}px,0,0\)` \}\]/.test(src.everything) && /class="ev-s-track"/.test(everything))

console.log("\n── Support: three requests, none about missing money ──")
/* Changed on purpose (landing round 4): the owner wants the support card's UI as it was before round 2 (one thread at a time, photos and Storelib's mark), without the From buyers / Storelib switch. Three true requests still take turns, none about money. */
const supportWords = EVERYTHING_SUPPORT.map((r) => [r.title, r.sub, r.ask, r.reply].join(" ")).join(" ")
check("three requests taking turns", EVERYTHING_SUPPORT.length === 3 && (everything.match(/class="ev-c-thread ev-loop"/g) ?? []).length === 3)
check("no request about a payout or a bank", !/payout|bank|hasn't arrived|\$\d/i.test(supportWords), supportWords.match(/payout|bank|\$\d[\d,.]*/gi))
check("the first request is Storelib's, about bringing subscribers over", EVERYTHING_SUPPORT[0].title === "Storelib support" && /subscribers/i.test(EVERYTHING_SUPPORT[0].sub) && /CSV/.test(EVERYTHING_SUPPORT[0].reply))
check("a buyer's request is there too", EVERYTHING_SUPPORT.some((r) => r.title === "From a buyer"))

console.log("\n── The digital product is a real one ──")
const digital = EVERYTHING_SLIDES.find((s) => s.tab === "Digital")
check("it is a LUT pack, named like one", digital?.name === "Cine Tones, 12 LUTs" && digital.kind === "luts")
check("its numbers add up", digital?.stats.map(([, v]) => v).join() === "$29.00,386,$11,194.00" && 29 * 386 === 11194)
check("drawn as the pack: a frame split flat and graded, the looks, the file", /class="ev-lut-flat"/.test(everything) && (everything.match(/class="ev-lut-look ev-lut-/g) ?? []).length === 5 && everything.includes("CT_04_Dusk.cube"))
check("no book cover and no guide left in the product card", !/ev-p-book|ev-p-guide|Sourdough at Home<\/p>|page guide/i.test(everything) && !existsSync(join(root, "public/home/everything/guide-bread.webp")))
check("its one photo exists and is small", existsSync(join(root, "public/home/everything/lut-frame.webp")) && statSync(join(root, "public/home/everything/lut-frame.webp")).size < 40_000)
const pack = renderToStaticMarkup(createElement(TemplatePage))
/* Changed on purpose (landing round 4, the owner did not like Dust & Tape Drums): a Notion template, drawn in HTML. */
check("the business section's digital product is a template drawn in HTML, with no photograph", BUSINESS_SLIDES[0].id === "digital" && pack.includes("Studio OS for Notion") && !/<img/.test(pack))
check("no cookbook cover left there", !/Weeknight Green|bp-book(?!ing)|bp-shelf|EbookPage/.test(src.pages + src.business) && !existsSync(join(root, "public/home/showcase/ss-bowl.webp")))

console.log("\n── Tabs of one family (the tabs of Make the work) ──")
const family = (r: string) => /height:30px/.test(r) && /padding:0 13px/.test(r) && /border-radius:999px/.test(r) && /color:#55525c/.test(r) && /font-size:13px/.test(r) && /font-weight:500/.test(r)
check("Make the work's tab is the reference", family(rule(evCss, ".ev-tab")) && /\.ev-tab\[data-on\]\{color:#18181b\}/.test(evCss) && /\.ev-tab::before\{[^}]*background:#fff/.test(evCss))
/* Changed on purpose (landing round 4): real tabs (aria-selected) above the picture. */
check("ideas: tabs in place of the dots, the same pill", family(rule(src.ideas, ".ideas-tab")) && /\.ideas-tab\[aria-selected="true"\]\{color:#18181b\}/.test(src.ideas) && /\.ideas-tab::before\{[^}]*background:#fff/.test(src.ideas) && !/ideas-dot/.test(src.ideas))
check("ideas: a grey pill track", /\.ideas-tabs\{[^}]*padding:4px;border-radius:999px;background:#f1f1f2/.test(src.ideas))
const ideas = renderToStaticMarkup(createElement(IdeasComeToLife))
check("ideas: one tab an editor, each named in full", (ideas.match(/class="ideas-tab"/g) ?? []).length === IDEAS_TABS.length && IDEAS_TABS.every((s) => ideas.includes(`<span>${s.title}</span>`)))
check("business, on a phone: the same pill row", /@media\(max-width:899px\)\{[\s\S]*\.biz-kind-s\{[^}]*height:30px;padding:0 13px;border-radius:999px;font-size:13px;font-weight:500/.test(src.business) && /\.biz-kind\[aria-selected="true"\] \.biz-kind-s\{background:#fff\}/.test(src.business))
check("business, on a computer: the chosen line on a soft grey, no rule beside it", /\.biz-kind::before\{[^}]*inset:0;border-radius:inherit;background:#f2f2f3/.test(src.business) && !/scaleY/.test(src.business))
const biz = renderToStaticMarkup(createElement(BusinessCarousel))
/* Changed on purpose (landing round 4): no clock in the business section (the scroll steps through it); the tabs end where the stage begins. */
const tabs = biz.slice(biz.indexOf('role="tablist"'), biz.indexOf('class="biz-stage"'))
/* Changed on purpose (landing round 4): the ideas tabs now sit above the picture, so only the tab row is read. */
check("no icons and no coloured chips in the tabs", !/<svg|<img/.test(tabs) && !/<svg|<img/.test(ideas.slice(ideas.indexOf('class="ideas-tabs"'), ideas.indexOf('class="ideas-stage"'))))

console.log("\n── One store for everything you sell, on white ──")
check("dark text on white by itself", /\.biz\{position:relative;background:#fff;color:#18181b\}/.test(src.business) && !/band-ink|band-muted/.test(src.business))
/* Changed on purpose (landing round 4, the owner: colourful grounds behind the products): each page a white card on its own soft gradient, on the white sheet. */
check("each page a white card on its own coloured ground", /\.bp-card\{[^}]*background:#fff/.test(src.pages) && /\.bp-cap\{background:linear-gradient/.test(src.pages))
check("the page in the stage is a picture: no pointer, no selection, nothing that takes focus", /\.biz-stage \.smk\{pointer-events:none;user-select:none/.test(src.business) && !/<(a|button|input)\b/.test(biz.slice(biz.indexOf('class="biz-stage"'))))
check("the editors' previews take no pointer either", /\.ideas-mock\{[^}]*pointer-events:none/.test(src.ideas))
check("no hover style inside any mock", !/:hover/.test(src.pages) && !/:hover/.test(read("components/marketing/home/showcase-mocks/builder-mocks.tsx")))

console.log("\n── Half of the examples ship in a box ──")
check("a physical product comes second in the list", BUSINESS_SLIDES.map((s) => s.id).join() === "digital,physical,courses,communities,bookings")
const PHYSICAL = /^(Merch|T-shirts|Hoodies|Vinyl records|Mugs|Tote bags|Posters|Candles|Art prints|Ceramics|Zines|Hats|Jewelry|Signed books|Phone cases|Stickers)$/
const chips = MARQUEE_ROWS.flatMap((r) => r.items.map((c) => c.label))
const physical = chips.filter((c) => PHYSICAL.test(c)).length
check("the possibilities: close to half are physical, in two rows", MARQUEE_ROWS.length === 2 && physical / chips.length >= 0.4 && physical / chips.length <= 0.6, { physical, of: chips.length })
check("no chip twice", new Set(chips).size === chips.length)
const storeProducts = EVERYTHING_STORES.flatMap((s) => s.products)
check("the stores sell both kinds", storeProducts.some((p) => p.badge === "Physical") && storeProducts.some((p) => p.badge === "Digital") && storeProducts.some((p) => p.badge === "Course") && storeProducts.some((p) => p.badge === "Community"))

console.log("\n── The words ──")
const words = [EVERYTHING_SUPPORT.map((r) => `${r.title} ${r.ask} ${r.reply}`).join(" "), BUSINESS_SLIDES.map((s) => `${s.label} ${s.line} ${s.alt}`).join(" "), chips.join(" "), EVERYTHING_SLIDES.map((s) => s.name).join(" ")].join(" ")
check("no em dashes, no banned words, no fans", !/—/.test(words) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform|passive income|fans?)\b/i.test(words))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
