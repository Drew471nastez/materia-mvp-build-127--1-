/**
 * ===========================================================================
 *  HOME, LANDING ROUND 5 (MIDDLE): IDEAS, ONE STORE, HOW IT WORKS
 * ===========================================================================
 * The owner, after round 4 on an iPhone and a computer:
 *   - One store for everything you sell: "just make it how it was before",
 *     smooth and clean, and without "that interactiveness that stops the
 *     section, so when I swipe it just goes through everything". The round 3
 *     section again (a list, or tabs on a phone, beside one product page on
 *     a light grey stage), with no scroll pin.
 *   - Ideas: another store in the website builder, "more realistic", and a
 *     community like the ones people really pay for in 2026, not AI slop;
 *     tabs "not as pill shapes".
 *   - How it works: no cap, a product sheet with a bigger, bolder title and
 *     price, and grounds that are not colourful ("more dark UI, modern"),
 *     the domain drawn simply.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { BusinessCarousel, BUSINESS_SLIDES, BUSINESS_STYLES } from "@/components/marketing/home/business-carousel"
import { BUSINESS_MOCK_CSS, TeePage } from "@/components/marketing/home/showcase-mocks/business-mocks"
import { IdeasComeToLife, IDEAS_STYLES } from "@/components/marketing/home/ideas-come-to-life"
import { BUILDER_CSS, CommunityMock, SaltmoorSite, ST_TYPED, WebsiteBuilderMock } from "@/components/marketing/home/showcase-mocks/builder-mocks"
import { HowItWorks, HOW_DOMAIN, HOW_IT_WORKS_STYLES, HOW_PRINT, HOW_PRODUCTS } from "@/components/marketing/home/how-it-works"
import { CNAME_TARGET, DEFAULT_A } from "@/lib/custom-domains/hostname"
import { sheetButtonLabel } from "@/lib/onepage/product-block"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const rule = (css: string, selector: string) => {
  const at = css.indexOf(`${selector}{`)
  return at < 0 ? "" : css.slice(at, css.indexOf("}", at) + 1)
}
const keyframeBodies = (css: string) => [...css.matchAll(/@keyframes [\w-]+\{([\s\S]*?\})\}/g)].map((m) => m[1])
const onlyCompositor = (body: string) => [...body.matchAll(/[{;]([a-z-]+):/g)].every((x) => ["transform", "opacity", "animation-timing-function"].includes(x[1]))
const small = (p: string, kb: number) => existsSync(p) && statSync(p).size < kb * 1024

const F = {
  business: "components/marketing/home/business-carousel.tsx",
  pages: "components/marketing/home/showcase-mocks/business-mocks.tsx",
  ideas: "components/marketing/home/ideas-come-to-life.tsx",
  builders: "components/marketing/home/showcase-mocks/builder-mocks.tsx",
  how: "components/marketing/home/how-it-works.tsx",
}
const bizCss = BUSINESS_STYLES.find((s) => s.href === "w12-biz")?.css ?? ""
const ideasCss = IDEAS_STYLES.find((s) => s.href === "w12-ideas")?.css ?? ""
const howCss = HOW_IT_WORKS_STYLES.map((s) => s.css).join("\n")

console.log("\nOne store for everything you sell: how it was before, nothing that stops the scroll")
const biz = renderToStaticMarkup(createElement(BusinessCarousel))
check("no scroll pin: no position: sticky, no tall track, no step markers", !/sticky|biz-track|biz-pin|biz-step|svh/.test(bizCss + biz))
check("no scroll work of its own: no IntersectionObserver on markers, no scrollTo of the page", !/IntersectionObserver|window\.scrollTo|addEventListener\("scroll"/.test(code(F.business)))
check("the kinds take turns on the invisible clock (use-auto-tabs), paused unless the section runs", /useAutoTabs\(BUSINESS_SLIDES\.length\)/.test(read(F.business)) && /onAnimationEnd=\{t\.advance\}/.test(read(F.business)) && /\.biz\[data-run\] \.smk-clock\[data-on\]\{animation-play-state:running\}/.test(bizCss))
check("the round 3 layout: a list beside one page on a computer, the tab row on a phone", /\.biz-grid\{display:grid;grid-template-columns:minmax\(0,5fr\) minmax\(0,8fr\)/.test(bizCss) && /role="tablist" aria-orientation="vertical"/.test(biz) && /@media\(max-width:899px\)\{[\s\S]*\.biz-list\{display:flex/.test(bizCss))
check("the tab row on a phone scrolls sideways on its own and leaves vertical swipes to the page", /\.biz-list\{display:flex;[^}]*overflow-x:auto;overscroll-behavior-x:contain/.test(bizCss) && !/touch-action:none/.test(bizCss))
check("a page changes by a crossfade only, none under reduced motion", /@keyframes biz-in\{from\{opacity:0\}\}/.test(bizCss) && /\.biz-slide\{animation:none!important;transition:none!important\}/.test(bizCss))
check("the light grey stage, no coloured grounds behind the products", /\.bp\{[^}]*background:#eef0f2/.test(BUSINESS_MOCK_CSS) && !/gradient\((1[0-9]0deg|120deg)/.test(BUSINESS_MOCK_CSS) && !/#b37dff|#ff9ec7|#ff7a4d/.test(BUSINESS_MOCK_CSS))
check("five kinds, physical second, each a newer example", BUSINESS_SLIDES.map((s) => s.id).join() === "digital,physical,courses,communities,bookings" && /Studio OS/.test(BUSINESS_SLIDES[0].alt) && /Pines Tour Tee/.test(BUSINESS_SLIDES[1].alt))
check("the tee page draws its photograph", renderToStaticMarkup(createElement(TeePage)).includes("/home/showcase/hp-tee.webp") && small("public/home/showcase/hp-tee.webp", 120))
const lazy = read("components/marketing/home/lazy-sections.tsx")
check("its placeholder box no longer grows with the screen's height", !/\[data-lazy-section="business"\]\{--lz:calc\(3\d\dsvh/.test(lazy) && !/business:\s*\[\{/.test(read("scripts/measure-home-lazy-heights.mjs")))

console.log("\nSee your ideas come to life: tabs, not pills")
const ideas = renderToStaticMarkup(createElement(IdeasComeToLife))
const tab = rule(ideasCss, ".ideas-tab")
check("three real tabs above the picture", (ideas.match(/role="tab"/g) ?? []).length === 3 && ideas.indexOf('class="ideas-tabs"') < ideas.indexOf('class="ideas-stage"'))
check("no pill: square words on one hairline, no grey track", /border-radius:0/.test(tab) && /background:none/.test(tab) && !/999px/.test(rule(ideasCss, ".ideas-tabs") + tab) && /\.ideas-tabs\{[^}]*box-shadow:inset 0 -1px 0 #e7e7ea/.test(ideasCss))
check("the chosen tab is dark with a rule under it that grows from its middle (transform only)", /\.ideas-tab::after\{[^}]*transform:scaleX\(0\);[^}]*transition:transform/.test(ideasCss) && /\.ideas-tab\[aria-selected="true"\]::after\{transform:none\}/.test(ideasCss) && /\.ideas-tab\[aria-selected="true"\]\{color:#18181b\}/.test(ideasCss))
check("the row keeps round 4's height (38px), so the page does not change length", /height:38px/.test(tab) && /\.ideas-tabs-row\{[^}]*margin:clamp\(24px,3vw,36px\) var\(--landing-gutter,16px\) clamp\(18px,2\.2vw,28px\)/.test(ideasCss))

console.log("\nThe website builder: a real small store")
const site = renderToStaticMarkup(createElement(SaltmoorSite))
const wb = renderToStaticMarkup(createElement(WebsiteBuilderMock))
check("Saltmoor, a two person candle studio in Leeds, with refills and plain specs", site.includes("Candles poured by hand in Leeds.") && /refill/i.test(site) && site.includes("220 g · 45 h") && wb.includes("Saltmoor") && wb.includes("saltmoorcandles.co.uk"))
check("its five photographs exist, are webp and small", ["sm-hero", "sm-bergamot", "sm-glass", "sm-votive", "sm-pillar"].every((n) => small(`public/home/showcase/${n}.webp`, 120) && site.includes(`/home/showcase/${n}.webp`)))
check("calm: no gradient, no orange accent, a serif wordmark", !/\.sm[^{]*\{[^}]*gradient/.test(BUILDER_CSS) && /\.sm-logo\{[^}]*Georgia/.test(BUILDER_CSS))
check("no Field Day, no caps left", !/Field Day|FIELD|fielddaysupply|fd-cap|Marigold/.test(read(F.builders) + read(F.ideas)) && !existsSync("public/home/showcase/fd-hero.webp"))

console.log("\nThe community: a paid strength coaching group")
const cm = renderToStaticMarkup(createElement(CommunityMock))
check("The Strength Room by Rina Castillo, with its own address", cm.includes("The Strength Room") && cm.includes("By Rina Castillo") && cm.includes("storelib.com/community/strengthroom"))
const members = Number((cm.match(/<b>([\d,]+)<\/b><i>Members<\/i>/) ?? [])[1]?.replace(/,/g, ""))
check("a modest, believable size (a thousand or so members, a few dozen online)", members > 300 && members < 5000 && /<b>37<\/b>/.test(cm))
check("believable posts: a program block from the coach, a member's win with two photographs", cm.includes("Block 4 is up") && cm.includes("70 kg deadlift") && cm.includes("/home/showcase/st-pull.webp") && cm.includes("/home/showcase/st-squat.webp"))
check("its photographs exist and are small", ["st-cover", "st-pull", "st-squat"].every((n) => small(`public/home/showcase/${n}.webp`, 120)))
check("the caret steps once per typed character", BUILDER_CSS.includes(`steps(${ST_TYPED.length},end)`))
check("no Crema Club left", !/Crema|cremaclub|Joana Reis|cc-cover/.test(read(F.builders) + read(F.ideas)) && !existsSync("public/home/showcase/cc-cover.webp"))

console.log("\nHow it works: no cap, a bold sheet, calm grounds, a simple domain")
const how = renderToStaticMarkup(createElement(HowItWorks))
check("the physical product is Nadia's signed print, not a cap", HOW_PRODUCTS[0].id === "print" && how.includes(HOW_PRINT.title) && !/Darkroom cap|cap-yellow/.test(how) && small("public/home/how/print-lasalle.webp", 30))
check("what she keeps is the price less the fee and the print's example cost", HOW_PRODUCTS[0].priceCents === 4500 && HOW_PRODUCTS[0].baseCents === HOW_PRINT.baseCents && HOW_PRODUCTS[0].keepCents < 4500 - HOW_PRINT.baseCents)
check("every ground is a soft grey or near black, and still", (how.match(/data-ground="(light|dark)"/g) ?? []).length === 6 && !/gradient/.test(rule(howCss, ".cmh-stage")) && !/cmh-gl|cmh-drift|GROUNDS/.test(read(F.how)))
check("no purple and no rainbow in the section", !/#7c3aed|#ff5f5a|#2bb3a3|#f2689f|#5cbf6a/.test(howCss))
const title = rule(howCss, ".cmh-sh-title")
const price = rule(howCss, ".cmh-sh-price")
const px = (r: string) => Number((r.match(/font-size:calc\(([\d.]+) \* var\(--p\)\)/) ?? [])[1])
const weight = (r: string) => Number((r.match(/font-weight:(\d+)/) ?? [])[1])
check("the sheet's title and price are big and bold (32 and 26 at a phone's width, 800 and 700)", px(title) >= 30 && weight(title) >= 800 && px(price) >= 24 && weight(price) >= 700)
check("the sheet is drawn, not a captured picture, and its button is the product sheet's own", how.includes('class="cmh-a cmh-sheet"') && !/op-nadia/.test(read(F.how)) && how.includes(sheetButtonLabel("Check out", HOW_PRINT.price, true).replace("·", "·")))
check("the phone's drawing is measured once, from the screen's width (--p), so its parts and the tap agree", /\.cmh-ph-scr\{--p:calc\(100cqw \/ 393\)/.test(howCss) && /\.cmh-op \.cmh-tap\{[^}]*top:calc\(26px \+ \d+ \* var\(--p\)\)/.test(howCss))
check("the domain: one dark card, the address and lock, the two records Storelib asks for", /\.cmh-dm-card\{[^}]*background:#1a1a1d/.test(howCss) && how.includes('class="cmh-dm-bar"') && HOW_DOMAIN.records.map((r) => r.value).join() === `${DEFAULT_A},${CNAME_TARGET}` && how.includes(CNAME_TARGET))
check("every loop in the section is transform and opacity only", keyframeBodies(howCss).every(onlyCompositor))

console.log("\nCopy and banned samples")
const all = Object.values(F).map(code).join("\n")
check("none of the banned samples", !/sourdough|Hearth &|Golden Hour|wheel throwing|Drawing Basics|Saturday Run Club|Dust &|Elena Ruiz|Weeknight Pasta|Heavyweight/i.test(all))
check("no em dashes, no banned words, no fans", !/—/.test(all) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|fans?)\b/i.test(all.replace(/transform[:(=][^;}\n]*/g, "")))
check("this suite runs with the push tests", read("scripts/run-push-tests.mjs").includes('"tests/home-landing-r5-middle.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
