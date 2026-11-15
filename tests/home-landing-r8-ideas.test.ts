/**
 * ===========================================================================
 *  HOME, LANDING ROUND 8 (IDEAS): A LOUD MERCH BRAND, A REAL COMMUNITY BANNER
 * ===========================================================================
 * components/marketing/home/ideas-come-to-life.tsx and showcase-mocks/builder-mocks.tsx.
 *
 * The owner, after round 7:
 *   - Website builder: "change the cover picture; make the brand more
 *     realistic, more bold, more clean, more colorful, more funky, more
 *     great, more cool, like a real Storelib store". Mondo Mango, an invented
 *     merch label: a fat 70s wordmark (a picture, so no webfont is loaded), a
 *     wall of colour photographs for a hero, and the drop on white with the
 *     wordmark printed on a crewneck, a trucker cap, a tee and a tote.
 *   - Community: "instead of the SR avatar, add a more realistic icon for the
 *     community" and "the cover should have bold text, like yellow, that
 *     represents the community; make it real". A barbell emblem in black on
 *     yellow, and a cover with THE STRENGTH ROOM in heavy yellow on the
 *     photograph, baked into the picture like a real banner.
 *   - The pill tabs and the autoplay stay as they were.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { IDEAS_STYLES, IDEAS_TABS, IdeasComeToLife } from "@/components/marketing/home/ideas-come-to-life"
import { BUILDER_CSS, BUILDER_DURATION_MS, CommunityMock, MondoMangoSite, WebsiteBuilderMock } from "@/components/marketing/home/showcase-mocks/builder-mocks"

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
const pic = (n: string) => `public/home/showcase/${n}.webp`
const small = (n: string) => existsSync(pic(n)) && statSync(pic(n)).size < 120 * 1024
const F = {
  ideas: "components/marketing/home/ideas-come-to-life.tsx",
  builders: "components/marketing/home/showcase-mocks/builder-mocks.tsx",
}
const ideasCss = IDEAS_STYLES.find((s) => s.href === "w12-ideas")?.css ?? ""
const site = renderToStaticMarkup(createElement(MondoMangoSite))
const wb = renderToStaticMarkup(createElement(WebsiteBuilderMock))
const cm = renderToStaticMarkup(createElement(CommunityMock))

console.log("\nThe website builder shows Mondo Mango, a bold, colourful merch label")
check("its name in the builder's bar, its own address in Publish", wb.includes('<b class="wx-name">Mondo Mango</b>') && wb.includes("<b>mondomango.shop</b>"))
check("a wordmark in the middle of the header, drawn as a picture (no webfont to load)", /class="smk-pic mg-logo"/.test(site) && site.includes("/home/showcase/mm-logo.webp") && /\.mg-logo\{position:absolute;left:50%;top:50%;[^}]*background:none!important;transform:translate\(-50%,-50%\)\}/.test(BUILDER_CSS) && !/fonts\.googleapis|Shrikhand|@font-face/.test(BUILDER_CSS + read(F.builders)))
check("the header's links, small and tracked: Shop all, Drop 03, About, Search, Bag (2)", ["Shop all", "Drop 03", "About", "Search", "Bag (2)"].every((w) => site.includes(w)) && /\.mg-links\{[^}]*letter-spacing:\.16em;text-transform:uppercase/.test(BUILDER_CSS))
/* Changed on purpose (landing round 9): "Mondo Mango has too many images": mm-hero is one photograph beside the label's orange, no longer a wall of seven. */
check("a cover: one photograph in the hero", (site.match(/mm-hero\.webp/g) ?? []).length === 1 && /class="smk-pic mg-wall"/.test(site) && !/pw-hero|Everyday cotton|Porto/.test(site + read(F.builders)))
check("a round yellow sticker on the wall: Drop 03, out now", /class="mg-sticker"><b>Drop 03<\/b><i>out now<\/i>/.test(site) && /\.mg-sticker\{[^}]*border-radius:50%;background:#ffc928;color:#2338e8;transform:rotate\(-12deg\)/.test(BUILDER_CSS))
const prices = [...site.matchAll(/<em>(€\d+)<\/em>/g)].map((m) => Number(m[1].slice(1)))
check("the drop: a crewneck, a trucker cap, a tee and a tote, priced like real merch", prices.length === 4 && prices.every((p) => p >= 20 && p <= 90) && ["Logo Crewneck", "Trucker Cap", "Logo Tee", "Market Tote"].every((n) => site.includes(n)))
check("colour swatches under each piece", (site.match(/<span class="mg-dots">/g) ?? []).length === 4 && (site.match(/<i style="background:#/g) ?? []).length >= 8)
check("every picture is real, webp and under 120 KB", ["mm-hero", "mm-logo", "mm-crew", "mm-cap", "mm-tee", "mm-tote"].every((n) => small(n) && site.includes(`/home/showcase/${n}.webp`)))
check("Plain Weather and its pictures are gone", !/Plain Weather|plainweather|PlainWeather|\bpw-/.test(code(F.builders) + code(F.ideas)) && ["pw-hero", "pw-tee-white", "pw-tee-black", "pw-hoodie", "pw-cap"].every((n) => !existsSync(pic(n))))
check("the page is white with no gradient", /\.mg\{[^}]*background:#fff;/.test(BUILDER_CSS) && !/\.mg[^{]*\{[^}]*gradient/.test(BUILDER_CSS))
check("the builder still rings the Hero, then the products", (wb.match(/<em>Selected<\/em>/g) ?? []).length === 2 && /class="mg-ring wx-ring-a"/.test(wb) && /class="mg-ring wx-ring-b"/.test(wb) && /\.mg-ring\.wx-ring-b\{opacity:0\}/.test(BUILDER_CSS))

console.log("\nThe Strength Room: a real emblem, a banner for a cover")
const mark = cm.match(/<svg class="cx-mark"[\s\S]*?<\/svg>/)?.[0] ?? ""
check("an emblem in place of the SR letters: a barbell in black on yellow", !!mark && /fill="#ffd400"/.test(mark) && (mark.match(/fill="#111"/g) ?? []).length === 5 && !/>SR</.test(cm) && !/\.cx-mark\{[^}]*#c8743b/.test(BUILDER_CSS))
check("the emblem is 40 units with round corners, beside the name", /\.cx \.cx-mark\{display:block;flex:none;width:40u|\.cx \.cx-mark\{display:block;flex:none;width:calc\(40\*var\(--u\)\)/.test(BUILDER_CSS) && cm.indexOf('class="cx-mark"') < cm.indexOf("The Strength Room"))
check("the cover is the banner with the name in heavy yellow (st-banner), the old cover gone", cm.includes("/home/showcase/st-banner.webp") && small("st-banner") && !existsSync(pic("st-cover")) && !/st-cover/.test(read(F.builders)))
check("the rest of the community is as it was", cm.includes("By Rina Castillo") && cm.includes("storelib.com/community/strengthroom") && cm.includes("Block 4 is up"))

console.log("\nTabs, autoplay and height as they were")
const ideas = renderToStaticMarkup(createElement(IdeasComeToLife))
check("three pill tabs on the grey track", IDEAS_TABS.map((t) => t.title).join() === "Website builder,OnePage editor,Community" && /\.ideas-tabs\{[^}]*border-radius:999px;background:#f1f1f2/.test(ideasCss) && (ideas.match(/role="tab"/g) ?? []).length === 3)
check("the same autoplay clock (one 8.4 s moment per tab)", BUILDER_DURATION_MS === 8400 && /\.ideas\[data-run\] \.smk-clock\[data-on\]\{animation-play-state:running\}/.test(ideasCss))
check("the picture keeps its 1280 x 752 shape, so the section keeps its height", /\.ideas-mock\{aspect-ratio:1280\/752;/.test(ideasCss) && /\.bm-frame>\.smk\{--w:1280\}/.test(BUILDER_CSS))
check("nothing new moves: the store and the emblem are still pictures", !/@keyframes sxk-mg|@keyframes sxk-cx-mark/.test(BUILDER_CSS) && !/\.mg[^{]*\{[^}]*(animation|transition)/.test(BUILDER_CSS))
check("the alt text tells the new story", /Mondo Mango/.test(IDEAS_TABS[0].alt) && /barbell emblem/.test(IDEAS_TABS[2].alt) && !/Plain Weather/.test(IDEAS_TABS.map((t) => t.alt).join()))

console.log("\nCopy")
const all = code(F.ideas) + code(F.builders)
check("no em dashes, no banned words, no fans", !/—/.test(all) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|fans?|enthusiasts?)\b/i.test(all.replace(/transform[:(=][^;}\n]*/g, "")))
check("none of the banned samples", !/Nadia Brooks|The Loop|LaSalle|Nails by Bea|Nordline|Charla Circle|Static Bloom|Wildcamp|sourdough|Golden Hour|Weeknight Pasta|Elena Ruiz/i.test(all))
check("this suite runs with the push tests", read("scripts/run-push-tests.mjs").includes('"tests/home-landing-r8-ideas.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
