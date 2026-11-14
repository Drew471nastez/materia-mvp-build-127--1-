/**
 * ===========================================================================
 *  HOME, LANDING ROUND 6 (IDEAS): PILL TABS AGAIN, A CLEAN MERCH STORE
 * ===========================================================================
 * components/marketing/home/ideas-come-to-life.tsx and showcase-mocks/builder-mocks.tsx.
 *
 * The owner, after round 5:
 *   - "In 'Ideas come to life' (Website builder, OnePage editor, Community
 *     tabs) it should be with pill shapes like how it was before." Round 4's
 *     thin pills (main at 971429ade drew the same family), keeping round 5's
 *     roving tabindex, aria and the autoplay pause.
 *   - "In the website builder example, come up with another example, a more
 *     simple and clean merch brand." Plain Weather, an invented apparel
 *     label, in place of Saltmoor's candles.
 *   - A shorter line under the heading.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { IdeasComeToLife, IDEAS_STYLES, IDEAS_SUB, IDEAS_TABS } from "@/components/marketing/home/ideas-come-to-life"
import { BUILDER_CSS, PlainWeatherSite, WebsiteBuilderMock } from "@/components/marketing/home/showcase-mocks/builder-mocks"

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
const small = (p: string, kb: number) => existsSync(p) && statSync(p).size < kb * 1024
const F = {
  ideas: "components/marketing/home/ideas-come-to-life.tsx",
  builders: "components/marketing/home/showcase-mocks/builder-mocks.tsx",
}
const ideasCss = IDEAS_STYLES.find((s) => s.href === "w12-ideas")?.css ?? ""
const ideas = renderToStaticMarkup(createElement(IdeasComeToLife))

console.log("\nThe tabs are pills again, as before")
const track = rule(ideasCss, ".ideas-tabs")
const tab = rule(ideasCss, ".ideas-tab")
check("a grey pill track with 4px around the tabs", /border-radius:999px/.test(track) && /background:#f1f1f2/.test(track) && /padding:4px/.test(track))
check("thin pills: 30px, 13px words, the round 4 family", /height:30px/.test(tab) && /padding:0 13px/.test(tab) && /border-radius:999px/.test(tab) && /font-size:13px/.test(tab) && /color:#55525c/.test(tab))
check("the chosen one is a white pill under its words", /\.ideas-tab::before\{content:"";position:absolute;inset:0;border-radius:inherit;background:#fff/.test(ideasCss) && /\.ideas-tab span\{position:relative\}/.test(ideasCss))
check("it settles in by transform and opacity only", /\.ideas-tab::before\{[^}]*transition:opacity \.35s ease,transform \.5s/.test(ideasCss) && /\.ideas-tab\[aria-selected="true"\]::before\{opacity:1;transform:none\}/.test(ideasCss) && !/transition:[^;}]*(background|box-shadow|width|height)/.test(tab + rule(ideasCss, ".ideas-tab::before")))
check("no underline left from round 5", !/\.ideas-tab::after/.test(ideasCss) && !/inset 0 -1px 0 #e7e7ea/.test(ideasCss))
check("still under reduced motion", /prefers-reduced-motion:reduce\)\{[^@]*\.ideas-tab,\.ideas-tab::before\{transition:none\}/.test(ideasCss))
check("the row keeps its 38px height and margins, so the section does not change length", /\.ideas-tabs-row\{display:flex;justify-content:center;margin:clamp\(24px,3vw,36px\) var\(--landing-gutter,16px\) clamp\(18px,2\.2vw,28px\)\}/.test(ideasCss))

console.log("\nThe later fixes are kept: real tabs, roving focus, autoplay that pauses")
check("a tablist of three tabs, each controlling its panel", /role="tablist"/.test(ideas) && (ideas.match(/role="tab"/g) ?? []).length === IDEAS_TABS.length && IDEAS_TABS.every((t) => ideas.includes(`aria-controls="ideas-panel-${t.id}"`)))
check("roving tabindex: only the chosen tab is in the tab order", (ideas.match(/tabindex="0"/gi) ?? []).length === 1 && (ideas.match(/tabindex="-1"/gi) ?? []).length === IDEAS_TABS.length - 1)
check("arrow keys move between tabs", /ArrowRight/.test(read(F.ideas)) && /ArrowLeft/.test(read(F.ideas)))
check("autoplay pauses under the pointer, off screen and in a hidden tab", /\{\.\.\.t\.hoverProps\}/.test(read(F.ideas)) && /data-run=\{t\.run \|\| undefined\}/.test(read(F.ideas)) && /\.ideas\[data-run\] \.smk-clock\[data-on\]\{animation-play-state:running\}/.test(ideasCss))
check("no timers of its own", !/setInterval|setTimeout/.test(code(F.ideas)))

console.log("\nThe line under the heading is shorter")
const words = IDEAS_SUB.split(/\s+/).length
check("about five words shorter than round 5's 21", words <= 17 && words >= 12)
check("it still says no code and nothing to install", /^No code, nothing to install\./.test(IDEAS_SUB) && ideas.includes(IDEAS_SUB))

console.log("\nThe website builder shows Plain Weather, a simple, clean merch brand")
const site = renderToStaticMarkup(createElement(PlainWeatherSite))
const wb = renderToStaticMarkup(createElement(WebsiteBuilderMock))
check("its name in the bar, its own address in Publish", wb.includes('<b class="wx-name">Plain Weather</b>') && wb.includes("<b>plainweather.co</b>"))
check("a plain header: wordmark, five links, the bag", site.includes('<span class="pw-logo">Plain Weather</span>') && (site.match(/<span class="pw-links">([\s\S]*?)<\/span><span class="pw-cart">/)?.[1].match(/<(b|span)>/g) ?? []).length === 5 && site.includes("Bag (1)"))
check("one hero photograph, one button", (site.match(/class="pw-photo"/g) ?? []).length === 1 && (site.match(/<b>Shop new in<\/b>/g) ?? []).length === 1)
const prices = [...site.matchAll(/<em>(€\d+)<\/em>/g)].map((m) => m[1])
check("four products, tees, a hoodie and a cap, priced in euros", prices.length === 4 && /Tee/.test(site) && /Hoodie/.test(site) && /Cap/.test(site) && prices.every((p) => Number(p.slice(1)) >= 20 && Number(p.slice(1)) <= 120))
check("real photographs, webp, each under 120 KB", ["pw-hero", "pw-tee-white", "pw-tee-black", "pw-hoodie", "pw-cap"].every((n) => small(`public/home/showcase/${n}.webp`, 120) && site.includes(`/home/showcase/${n}.webp`)))
check("a neutral page: near white, near black, greys; no gradient, no serif", /\.pw\{[^}]*background:#fafaf9;color:#161616/.test(BUILDER_CSS) && !/\.pw[^{]*\{[^}]*(gradient|Georgia)/.test(BUILDER_CSS))
check("the builder still rings the Hero, then the products", (wb.match(/<em>Selected<\/em>/g) ?? []).length === 2 && /class="pw-ring wx-ring-a"/.test(wb) && /class="pw-ring wx-ring-b"/.test(wb))
check("the Saltmoor store and its pictures are gone", !/Saltmoor|saltmoor|\bsm-/.test(read(F.builders) + read(F.ideas)) && ["sm-hero", "sm-bergamot", "sm-glass", "sm-votive", "sm-pillar"].every((n) => !existsSync(`public/home/showcase/${n}.webp`)))

console.log("\nCopy")
const all = code(F.ideas) + code(F.builders)
check("no em dashes, no banned words, no fans", !/—/.test(all) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|fans?)\b/i.test(all.replace(/transform[:(=][^;}\n]*/g, "")))
check("none of the banned samples", !/sourdough|Hearth &|Golden Hour|wheel throwing|Drawing Basics|Saturday Run Club|Dust &|Elena Ruiz|Weeknight Pasta|Heavyweight|Field Day/i.test(all))
check("this suite runs with the push tests", read("scripts/run-push-tests.mjs").includes('"tests/home-landing-r6-ideas.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
