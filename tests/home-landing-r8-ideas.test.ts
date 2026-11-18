/**
 * ===========================================================================
 *  HOME, LANDING ROUND 8 (IDEAS): A LOUD MERCH BRAND, A REAL COMMUNITY BANNER
 * ===========================================================================
 * components/marketing/home/ideas-come-to-life.tsx and showcase-mocks/builder-mocks.tsx.
 *
 * The owner, after round 7:
 *   - Website builder: "change the cover picture; make the brand more
 *     realistic, more bold, more clean, more colorful, more funky, more
 *     great, more cool, like a real Storelib store". An invented merch label
 *     (replaced in landing round 12 by the owner's own GodBless store).
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
import { BUILDER_CSS, BUILDER_DURATION_MS, CommunityMock, SteezSite, WebsiteBuilderMock } from "@/components/marketing/home/showcase-mocks/builder-mocks"

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
const site = renderToStaticMarkup(createElement(SteezSite))
const wb = renderToStaticMarkup(createElement(WebsiteBuilderMock))
const cm = renderToStaticMarkup(createElement(CommunityMock))

console.log("\nThe website builder shows a real store")
// Changed on purpose (landing round 12): the owner dropped the earlier builder example entirely; the first site is their own GodBless store (tests/home-landing-r12-top.test.ts).
// Changed on purpose (landing round 13): the owner asked for an accurate website builder example; GodBless is replaced by their Materia Steez theme (SteezSite), pinned in tests/home-landing-r13-ideas.test.ts.
check("its name in the builder's bar, its own address in Publish", wb.includes('<b class="wx-name">Steez</b>') && wb.includes('<b class="wx-pub-host">steez.storelib.com</b>')) // Changed on purpose (landing round 15): Steez alone.
// Changed on purpose (landing round 12): the store's condensed heading face ships as a small self-hosted subset (gb-oswald.woff2); still nothing from a font service.
check("a wordmark in the middle of the header, drawn as a picture", /class="smk-pic stz-logo"/.test(site) && site.includes("/home/showcase/stz-logo.webp") && /grid-template-columns:1fr auto 1fr/.test(BUILDER_CSS) && !/fonts\.googleapis|fonts\.gstatic/.test(BUILDER_CSS))
check("the header's links and the shop's keys", ["Home", "Shop", "Products", "Contact"].every((w) => site.includes(w)) && /class="stz-icons"/.test(site))
check("a cover: one photograph in the hero", (site.match(/stz-hero\.webp/g) ?? []).length === 1 && /class="smk-pic stz-photo"/.test(site) && !/pw-hero|Everyday cotton|Porto/.test(site + read(F.builders)))
const prices = [...site.matchAll(/<span class="stz-price">\$(\d+)\.00<\/span>/g)].map((m) => Number(m[1]))
// Changed on purpose (landing round 14): the owner's own four Steez products, at his prices.
check("four tees, priced like real clothes", prices.length === 4 && prices.every((p) => p >= 15 && p <= 150) && ["Gradient Hoodie", "Raw Tee", "Grey Graphic T-shirt", "Faith over fear Graphic T-shirt"].every((n) => site.includes(n)))
check("every picture is real, webp and under 120 KB", ["stz-hero", "stz-logo", "stz-summer", "stz-p-hoodie", "stz-p-raw", "stz-p-grey", "stz-p-faith"].every((n) => small(n) && site.includes(`/home/showcase/${n}.webp`)))
check("Plain Weather and its pictures are gone", !/Plain Weather|plainweather|PlainWeather|\bpw-/.test(code(F.builders) + code(F.ideas)) && ["pw-hero", "pw-tee-white", "pw-tee-black", "pw-hoodie", "pw-cap"].every((n) => !existsSync(pic(n))))
check("the page is white", /\.stz\{[^}]*background:#fff;/.test(BUILDER_CSS))
// Changed on purpose (landing round 11): two sites, so two pairs of rings.
// Changed on purpose (landing round 14): one ring per site, around the section whose heading is edited.
// Changed on purpose (landing round 15): one site, one ring.
check("the builder still rings the products", (wb.match(/<em>Selected<\/em>/g) ?? []).length === 1 && /class="wx-sel wx-ring"/.test(wb))

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
// Changed on purpose (landing round 13): the Steez page scrolls its products into view when they are selected (sxk-stz-scroll, a transform); nothing else of the store moves.
// Changed on purpose (landing round 14): the only things that move on the store are the builder's own edit (the ring, the heading's words) and the canvas scroll.
check("nothing new moves: the store and the emblem are still pictures", !/@keyframes sxk-gb|@keyframes sxk-cx-mark/.test(BUILDER_CSS) && !/\.stz(?!-page| \.wx-)[^{,]*\{[^}]*(animation|transition)/.test(BUILDER_CSS.replace(/@media\(prefers-reduced-motion:no-preference\)\{[^{}]*\[data-mock-live\] \.stz [^{}]*\{animation:sxk-(?:stz|ed)-[^}]*\}\}/g, ""))) /* Changed on purpose (landing round 15): the edit's own moves on Steez (the scroll, the space its products section takes, the outline) are the builder's, all under reduced motion's no-preference. */
check("the alt text tells the new story", /Steez/.test(IDEAS_TABS[0].alt) && /barbell emblem/.test(IDEAS_TABS[2].alt) && !/Plain Weather/.test(IDEAS_TABS.map((t) => t.alt).join()))

console.log("\nCopy")
const all = code(F.ideas) + code(F.builders)
check("no em dashes, no banned words, no fans", !/—/.test(all) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|fans?|enthusiasts?)\b/i.test(all.replace(/transform[:(=][^;}\n]*/g, "")))
check("none of the banned samples", !/Nadia Brooks|The Loop|LaSalle|Nails by Bea|Nordline|Charla Circle|Static Bloom|Wildcamp|sourdough|Golden Hour|Weeknight Pasta|Elena Ruiz/i.test(all))
check("this suite runs with the push tests", read("scripts/run-push-tests.mjs").includes('"tests/home-landing-r8-ideas.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
