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
/* Changed on purpose (landing round 7): "One store for everything you sell" (business-carousel and its business-mocks) is off the home page and deleted, so nothing of it is read here. */
import { IdeasComeToLife, IDEAS_STYLES } from "@/components/marketing/home/ideas-come-to-life"
import { BUILDER_CSS, CommunityMock, PlainWeatherSite, ST_TYPED, WebsiteBuilderMock } from "@/components/marketing/home/showcase-mocks/builder-mocks"
import { HowItWorks, HOW_DOMAIN, HOW_IT_WORKS_STYLES, HOW_PRODUCTS } from "@/components/marketing/home/how-it-works"
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
  ideas: "components/marketing/home/ideas-come-to-life.tsx",
  builders: "components/marketing/home/showcase-mocks/builder-mocks.tsx",
  how: "components/marketing/home/how-it-works.tsx",
}
const ideasCss = IDEAS_STYLES.find((s) => s.href === "w12-ideas")?.css ?? ""
const howCss = HOW_IT_WORKS_STYLES.map((s) => s.css).join("\n")

console.log("\nOne store for everything you sell: back on the page (landing round 8)")
/* Changed on purpose (landing round 7): "One store for everything you sell" (business-carousel and its business-mocks) is off the home page and deleted, so nothing of it is read here. */
/* Changed on purpose (landing round 8): the owner, "Keep the One store for everything you sell section, of course": it is back, redesigned, after the ideas section (tests/home-landing-r8-business.test.ts pins it). */
check("the section and its product pages are back, the old tee photograph still gone", existsSync("components/marketing/home/business-carousel.tsx") && existsSync("components/marketing/home/showcase-mocks/business-mocks.tsx") && !existsSync("public/home/showcase/hp-tee.webp"))
const lazy = read("components/marketing/home/lazy-sections.tsx")
/* Changed on purpose (landing round 8): its placeholder box is back (the lead measures its heights again). */
check("its placeholder box is back", /export const LazyBusinessCarousel = lazySection\(/.test(lazy) && /name: "business"/.test(lazy))

console.log("\nSee your ideas come to life: three tabs above the picture")
const ideas = renderToStaticMarkup(createElement(IdeasComeToLife))
const tab = rule(ideasCss, ".ideas-tab")
check("three real tabs above the picture", (ideas.match(/role="tab"/g) ?? []).length === 3 && ideas.indexOf('class="ideas-tabs"') < ideas.indexOf('class="ideas-stage"'))
// Changed on purpose (landing round 6): the owner wants the pill tabs back "like how it was before"; tests/home-landing-r6-ideas.test.ts pins them.
check("pills again: a grey track, the chosen tab a white pill", /border-radius:999px/.test(tab) && /\.ideas-tabs\{[^}]*background:#f1f1f2/.test(ideasCss) && !/box-shadow:inset 0 -1px 0 #e7e7ea/.test(ideasCss))
check("the chosen pill settles in by transform and opacity only", /\.ideas-tab::before\{[^}]*opacity:0;transform:scale\(\.85\);transition:opacity \.35s ease,transform/.test(ideasCss) && /\.ideas-tab\[aria-selected="true"\]::before\{opacity:1;transform:none\}/.test(ideasCss) && /\.ideas-tab\[aria-selected="true"\]\{color:#18181b\}/.test(ideasCss))
check("the row keeps round 4's height (30px pills in a 4px track, 38px), so the page does not change length", /height:30px/.test(tab) && /\.ideas-tabs\{[^}]*padding:4px/.test(ideasCss) && /\.ideas-tabs-row\{[^}]*margin:clamp\(24px,3vw,36px\) auto clamp\(18px,2\.2vw,28px\)/.test(ideasCss)) // Changed on purpose (landing round 7): the row sits in the page's one width; the same vertical margins.

console.log("\nThe website builder: a real small store")
// Changed on purpose (landing round 6): "come up with another example, a more simple and clean merch brand": Plain Weather replaces Saltmoor.
const site = renderToStaticMarkup(createElement(PlainWeatherSite))
const wb = renderToStaticMarkup(createElement(WebsiteBuilderMock))
check("Plain Weather, a small apparel label, in the builder with its own address", site.includes("Everyday cotton, cut and sewn in Porto.") && wb.includes("Plain Weather") && wb.includes("plainweather.co"))
check("its five photographs exist, are webp and small", ["pw-hero", "pw-tee-white", "pw-tee-black", "pw-hoodie", "pw-cap"].every((n) => small(`public/home/showcase/${n}.webp`, 120) && site.includes(`/home/showcase/${n}.webp`)))
check("calm: no gradient, a neutral page", !/\.pw[^{]*\{[^}]*gradient/.test(BUILDER_CSS) && /\.pw\{[^}]*background:#fafaf9/.test(BUILDER_CSS))
check("no Saltmoor left", !/Saltmoor|saltmoor|\bsm-/.test(read(F.builders) + read(F.ideas)) && !existsSync("public/home/showcase/sm-hero.webp"))
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

console.log("\nHow it works: no cap, calm grounds, the domain as it was in round 3")
// Changed on purpose (landing round 7): the owner removed Nadia Brooks, LaSalle at dusk and the checkout tile (with its drawn sheet), and asked for
// the round 3 domain tile back on a black to deep purple ground. tests/home-landing-r7-how.test.ts pins the new section.
const how = renderToStaticMarkup(createElement(HowItWorks))
check("the physical product is the shop apron, not a cap and not the print", HOW_PRODUCTS[0].id === "apron" && how.includes(HOW_PRODUCTS[0].name) && !/Darkroom cap|cap-yellow|LaSalle|print-lasalle/.test(how) && small("public/home/how/apron.webp", 120))
check("what he keeps is the price less the fee and the apron's example cost", HOW_PRODUCTS[0].priceCents === 3800 && HOW_PRODUCTS[0].baseCents === 1600 && HOW_PRODUCTS[0].keepCents < 3800 - 1600)
check("three light grounds and one night ground, all still", (how.match(/data-ground="light"/g) ?? []).length === 3 && (how.match(/data-ground="night"/g) ?? []).length === 1 && !/gradient/.test(rule(howCss, ".cmh-stage")) && !/cmh-gl|cmh-drift|GROUNDS/.test(read(F.how)))
check("no rainbow in the section; the one violet is round 3's .com in the pill", !/#ff5f5a|#2bb3a3|#f2689f|#5cbf6a/.test(howCss) && (howCss.match(/#7c3aed/g) ?? []).length === 1 && /\.cmh-dm-addr b\{[^}]*color:#7c3aed/.test(howCss))
check("no checkout tile: no sheet, no drawn phone", !how.includes("cmh-sheet") && !/cmh-ph-scr|cmh-op-/.test(howCss) && sheetButtonLabel("Check out", "$45.00", true) === "Check out · $45.00")
check("the domain: the drawn website, the address pill and the three addresses Storelib serves", how.includes('class="cmh-dm-site"') && how.includes('class="cmh-dm-pill"') && HOW_DOMAIN.targets.length === 3 && !how.includes("cmh-dm-card") && typeof DEFAULT_A === "string" && CNAME_TARGET === "domains.storelib.com")
check("every loop in the section is transform and opacity only", keyframeBodies(howCss).every(onlyCompositor))

console.log("\nCopy and banned samples")
const all = Object.values(F).map(code).join("\n")
check("none of the banned samples", !/sourdough|Hearth &|Golden Hour|wheel throwing|Drawing Basics|Saturday Run Club|Dust &|Elena Ruiz|Weeknight Pasta|Heavyweight/i.test(all))
check("no em dashes, no banned words, no fans", !/—/.test(all) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|fans?)\b/i.test(all.replace(/transform[:(=][^;}\n]*/g, "")))
check("this suite runs with the push tests", read("scripts/run-push-tests.mjs").includes('"tests/home-landing-r5-middle.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
