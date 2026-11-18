/**
 * ===========================================================================
 *  HOME, LANDING ROUND 15 (LATER): THE SHOWCASE'S NUMBERS, ITS PHONE RAIL,
 *  STEEZ ALONE, UNLIMITED POSSIBILITIES WITHOUT ITS LINE
 * ===========================================================================
 * components/marketing/build-showcase.tsx,
 * components/marketing/home/ideas-come-to-life.tsx,
 * components/marketing/home/showcase-mocks/builder-mocks.tsx and
 * components/marketing/product-marquee.tsx.
 *
 * The owner:
 *   1. "get rid of the numbers in the build your pages, sell your products ... completely": nothing numbered under
 *      the heading. "the stats should show under the images ... nice vertical line dividers in between, very smooth
 *      and clean, the numbers should have count-up number animations, smooth, and different stats".
 *   2. Phone card rails "1.1 view, not 1.2".
 *   3. The website builder shows only Steez; loudlib goes, with its scene and its pictures.
 *   4. Unlimited possibilities loses its line under the heading.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import * as Showcase from "@/components/marketing/build-showcase"
import { BuildShowcase, SHOWCASE_STYLES } from "@/components/marketing/build-showcase"
import * as Builder from "@/components/marketing/home/showcase-mocks/builder-mocks"
import { IDEAS_TABS, IdeasComeToLife } from "@/components/marketing/home/ideas-come-to-life"
import { ProductMarquee } from "@/components/marketing/product-marquee"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const BANNED = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform(s|ing)?)\b|—/i
const css = SHOWCASE_STYLES[0].css
const src = code(read("components/marketing/build-showcase.tsx"))
const html = renderToStaticMarkup(createElement(BuildShowcase))

console.log("\n── 1. No numbers under the heading, and none under the pictures ──")
const top = html.slice(html.indexOf('class="build-showcase-top"'), html.indexOf('class="build-showcase-viewport"'))
check("nothing numbered under the heading: no row, no figure", top.length > 0 && !/<dl|data-stat/.test(top) && !/\d/.test(top.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "")), top.replace(/<[^>]+>/g, " "))
// Changed on purpose (landing round 17): the owner asked for the row of three numbers under the pictures to go completely, with its count up, its styles and its constants.
check("no row of numbers under the pictures: the section ends on the rail", !/<dl|data-stat|build-showcase-stats|build-showcase-unit/.test(html) && /class="build-showcase-viewport"[\s\S]*<\/div><\/div><\/div><\/section>$/.test(html))
// Changed on purpose (landing round 17): no stats constants, no count up loop, no styles left behind.
check("no stats constants, count up or styles left", !("SHOWCASE_STATS" in Showcase) && !("SHOWCASE_THEME_COUNT" in Showcase) && !/ShowcaseStats|COUNT_MS|IntersectionObserver|CROSS_BORDER_REGION|MAX_UPLOAD_BYTES/.test(src) && !/build-showcase-stats|build-showcase-unit/.test(css))

console.log("\n── 2. The phone rail: about 1.1 cards on screen ──")
const phone = css.slice(css.indexOf("@media(max-width:767px){.build-showcase{"))
check("a phone card is 85% of the screen, 440px at most", /\.build-showcase\{--showcase-card:min\(85vw,440px\)\}/.test(phone))
check("its picture is picked for 85vw", (html.match(/sizes="85vw"/g) ?? []).length === 8 && !/78vw/.test(html))
/* At 390: the gutter is clamp(20px, 5.15vw, 84px), the gap 10px. What is on screen past the gutter over a card's width. */
const at = (w: number) => {
  const gutter = Math.min(84, Math.max(20, 0.0515 * w))
  const card = Math.min(0.85 * w, 440)
  return { view: +((w - gutter) / card).toFixed(3), peek: +(w - gutter - card - 10).toFixed(1) }
}
check("about 1.1 cards on screen at 360, 390 and 430 (was about 1.22), the next one peeking", [360, 390, 430].every((w) => at(w).view >= 1.08 && at(w).view <= 1.15 && at(w).peek >= 20), [360, 390, 430].map(at))

console.log("\n── 3. The website builder: Steez alone ──")
const wb = renderToStaticMarkup(createElement(Builder.WebsiteBuilderMock))
check("no loudlib in the builder: no site, no tree, no name, no address", !/loudlib|class="ll|Featured products|BESTSELLING/i.test(wb) && !("LoudlibSite" in Builder) && !("LL_EDIT" in Builder))
check("no second scene and no cross fade", !/bm-s[12]|data-scene/.test(wb + Builder.BUILDER_CSS) && IDEAS_TABS.every((t) => !("scenes" in t)) && !/data-scene/.test(renderToStaticMarkup(createElement(IdeasComeToLife))))
check("no loudlib styles or motion left", !/\.ll[-{ ]|sxk-ll-|sxk-cur-ll|wx-cur-ll/.test(Builder.BUILDER_CSS) && !("ll" in Builder.EDIT_PLAN) && !("ll" in Builder.EDIT_AT))
check("Steez keeps its whole edit: one tree, one ring, its panels, its pointer", (wb.match(/class="wx-tree"/g) ?? []).length === 1 && (wb.match(/<em>Selected<\/em>/g) ?? []).length === 1 && /<span class="wx-panels"><div class="wx-panel wx-pa">/.test(wb) && /<span class="wx-curs"><svg class="bm-cursor wx-cur wx-cur-stz"/.test(wb))
const gone = ["ll-serum", "ll-tech-house", "ll-drums", "ll-ambience", "ll-deep-house", "ll-unitech"]
check("loudlib's box pictures are deleted", gone.every((n) => !existsSync(join(root, `public/marketing/loudlib/${n}.webp`)) && !existsSync(join(root, `public/marketing/loudlib/${n}-320.webp`))) && gone.filter((n) => n !== "ll-drums").every((n) => !existsSync(join(root, `public/home/showcase/${n}.webp`))))
check("what still uses a loudlib picture keeps it: the showcase card and the digital product scene", ["a-loud", "a-loud-720", "m-loud-640", "m-loud-960"].every((n) => existsSync(join(root, `public/marketing/loudlib/${n}.webp`))) && /* Changed on purpose (landing round 16): the digital scene is a cookbook now; the drums picture stays on disk. */ existsSync(join(root, "public/home/showcase/ll-drums.webp")))
check("the alt text tells only Steez", /Steez/.test(IDEAS_TABS[0].alt) && !/loudlib|Bestselling|First Steez/.test(IDEAS_TABS[0].alt))

console.log("\n── 4. Unlimited possibilities: the heading alone ──")
const um = renderToStaticMarkup(createElement(ProductMarquee))
check("no line under the heading, at any width", !/um-sub|Whatever you make/.test(um) && /<header class="um-head"><h2[\s\S]*?<\/h2><\/header>/.test(um), um.slice(um.indexOf("<header"), um.indexOf("</header>") + 9))

console.log("\n── Words ──")
const words = IDEAS_TABS[0].alt
check("no banned words, no em dashes", !BANNED.test(words) && !/—/.test(read("components/marketing/build-showcase.tsx") + read("components/marketing/product-marquee.tsx")))
// Changed on purpose (landing round 17): the numbers are gone, so the section's text is what must claim no one's sales.
check("no claims about other people's sales", !/served|earned|entrepreneurs|creators paid|\bM\+|\bB\+/i.test(html.replace(/<[^>]+>/g, " ")))
check("this suite runs with the push tests, after round 14's", /"tests\/home-landing-r14-everything\.test\.ts",[\s\S]{0,600}"tests\/home-landing-r15-stats\.test\.ts"/.test(read("scripts/run-push-tests.mjs").replace(/\/\*[\s\S]*?\*\//g, "")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
