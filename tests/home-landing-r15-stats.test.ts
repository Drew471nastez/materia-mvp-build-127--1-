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
import { BuildShowcase, SHOWCASE_STATS, SHOWCASE_STYLES, SHOWCASE_THEME_COUNT } from "@/components/marketing/build-showcase"
import * as Builder from "@/components/marketing/home/showcase-mocks/builder-mocks"
import { IDEAS_TABS, IdeasComeToLife } from "@/components/marketing/home/ideas-come-to-life"
import { ProductMarquee } from "@/components/marketing/product-marquee"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { CROSS_BORDER_REGION } from "@/lib/payments/stripe/payout-regions"
import { MAX_UPLOAD_BYTES } from "@/lib/security/uploads/policy"

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

console.log("\n── 1. No numbers under the heading; three true ones under the pictures ──")
const top = html.slice(html.indexOf('class="build-showcase-top"'), html.indexOf('class="build-showcase-viewport"'))
check("nothing numbered under the heading: no row, no figure", top.length > 0 && !/<dl|data-stat/.test(top) && !/\d/.test(top.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "")), top.replace(/<[^>]+>/g, " "))
check("the row stands after the rail, inside the section's card", /class="build-showcase-viewport"[\s\S]*<\/div><\/div><dl class="build-showcase-stats">[\s\S]*<\/dl><\/div><\/section>$/.test(html))
check("79 OnePage themes: the Design tab's own list", SHOWCASE_THEME_COUNT === THEME_TEMPLATES.length && SHOWCASE_STATS[0].value === 79 && SHOWCASE_STATS[0].label === "OnePage themes")
check("34 countries a creator can be paid out in (Stripe's cross border region)", SHOWCASE_STATS[1].value === CROSS_BORDER_REGION.size && SHOWCASE_STATS[1].value === 34)
check("10 GB, the largest product file the upload routes take", SHOWCASE_STATS[2].value * 1024 ** 3 === MAX_UPLOAD_BYTES.product_file && SHOWCASE_STATS[2].value === 10 && SHOWCASE_STATS[2].suffix === " GB")
check("different numbers from the row under the heading (currencies, languages, $0)", !/CURRENCY_FEE_RULES|SITE_LANGUAGE_CODES|SHOWCASE_FREE_MONTHLY_CENTS/.test(src) && SHOWCASE_STATS.every((s) => s.value > 0))
check(
  "the server draws the final numbers, each label under its number, the unit after the counting box",
  /<dl class="build-showcase-stats"><div><dt>OnePage themes<\/dt><dd><span data-stat="" style="width:2ch">79<\/span><\/dd><\/div><div><dt>Countries you get paid in<\/dt><dd><span data-stat="" style="width:2ch">34<\/span><\/dd><\/div><div><dt>Largest file you can sell<\/dt><dd><span data-stat="" style="width:2ch">10<\/span><span class="build-showcase-unit">GB<\/span><\/dd><\/div><\/dl>/.test(html),
  html.slice(html.indexOf("<dl"), html.indexOf("</dl>") + 5),
)
check("the numbers on one line across the row, whatever the labels' lengths", /\.build-showcase-stats>div \{[^}]*justify-content:flex-start/.test(css) && /\.build-showcase-unit \{margin-left:\.16em\}/.test(css))
check("thin vertical lines between them, none before the first", /\.build-showcase-stats>div\+div \{border-left:1px solid rgba\(255,255,255,\.12\)\}/.test(css) && !/\.build-showcase-stats>div \{[^}]*border/.test(css))
check("three across at every width, centred, big light numbers over a small grey label", /\.build-showcase-stats \{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\);[^}]*text-align:center\}/.test(css) && /\.build-showcase-stats dd \{order:-1;[^}]*font-weight:300[^}]*white-space:nowrap\}/.test(css) && /\.build-showcase-stats dt \{[^}]*color:#a1a1aa/.test(css) && !/build-showcase-stats/.test(css.slice(css.indexOf("@media(max-width:767px){.build-showcase{"))))
check("the numbers in tabular figures in a box as wide as the final figures, so counting moves nothing", /\.build-showcase-stats \[data-stat\] \{display:inline-block;font-variant-numeric:tabular-nums/.test(css) && /style=\{\{ width: `\$\{text\.length\}ch` \}\}/.test(src))

console.log("\n── The count ──")
const stats = src.slice(src.indexOf("function ShowcaseStats"), src.indexOf("export function BuildShowcase"))
check("counts once, when half the row is seen: one observer, disconnected at once", /new IntersectionObserver/.test(stats) && /io\.disconnect\(\)\s*const start/.test(stats) && /threshold: 0\.5/.test(stats))
check("one requestAnimationFrame loop for 1.6s, eased out (quartic), then it stops", /const COUNT_MS = 1600/.test(src) && /show\(1 - Math\.pow\(1 - t, 4\)\)/.test(stats) && /if \(t < 1\) raf = requestAnimationFrame\(step\)/.test(stats) && (stats.match(/requestAnimationFrame\(/g) ?? []).length === 2)
check("writes textContent only, and only when it changes; no React state per frame", /if \(n\.textContent !== text\) n\.textContent = text/.test(stats) && !/useState/.test(stats))
check("reduced motion, or a row already on screen, keeps the final numbers the server drew", /prefers-reduced-motion: reduce\)"\)\.matches\) return/.test(stats) && /if \(box\.top < window\.innerHeight && box\.bottom > 0\) return/.test(stats))
check("leaving mid count puts the final numbers back", /return \(\) => \{\s*io\.disconnect\(\)\s*cancelAnimationFrame\(raf\)\s*show\(1\)/.test(stats))

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
check("what still uses a loudlib picture keeps it: the showcase card and the digital product scene", ["a-loud", "a-loud-720", "m-loud-640", "m-loud-960"].every((n) => existsSync(join(root, `public/marketing/loudlib/${n}.webp`))) && existsSync(join(root, "public/home/showcase/ll-drums.webp")) && /\/home\/showcase\/ll-drums\.webp/.test(read("components/marketing/home/showcase-mocks/business-mocks.tsx")))
check("the alt text tells only Steez", /Steez/.test(IDEAS_TABS[0].alt) && !/loudlib|Bestselling|First Steez/.test(IDEAS_TABS[0].alt))

console.log("\n── 4. Unlimited possibilities: the heading alone ──")
const um = renderToStaticMarkup(createElement(ProductMarquee))
check("no line under the heading, at any width", !/um-sub|Whatever you make/.test(um) && /<header class="um-head"><h2[\s\S]*?<\/h2><\/header>/.test(um), um.slice(um.indexOf("<header"), um.indexOf("</header>") + 9))

console.log("\n── Words ──")
const words = SHOWCASE_STATS.map((s) => s.label).join(" ") + " " + IDEAS_TABS[0].alt
check("no banned words, no em dashes", !BANNED.test(words) && !/—/.test(read("components/marketing/build-showcase.tsx") + read("components/marketing/product-marquee.tsx")))
check("no claims about other people's sales", !/served|earned|entrepreneurs|creators paid|\bM\+|\bB\+/i.test(SHOWCASE_STATS.map((s) => s.label).join(" ")))
check("this suite runs with the push tests, after round 14's", /"tests\/home-landing-r14-everything\.test\.ts",[\s\S]{0,600}"tests\/home-landing-r15-stats\.test\.ts"/.test(read("scripts/run-push-tests.mjs").replace(/\/\*[\s\S]*?\*\//g, "")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
