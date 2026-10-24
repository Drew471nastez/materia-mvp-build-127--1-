/**
 * ===========================================================================
 *  ROUND AX: A LIVE IMPORTED THEME'S CLOSED COUNTRY LISTS COST NOTHING
 * ===========================================================================
 * The owner: "it takes about 8 seconds to load a page, I want it under 2".
 * Measured on andrewrullz.storelib.com: four country lists (header, its
 * phone copy, top bar, footer) were 6,500 of the product page's 7,900
 * elements, laid out on every layout a theme script forced. Each list is
 * now skipped whole while it is closed and let go before it is used
 * (lib/storelib-theme/compat/first-load.ts, 4.). And every drawn page says
 * where its time went (Server-Timing).
 *
 * Run with:  npx tsx tests/live-speed-ax.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { COUNTRY_LIST_ATTR, COUNTRY_LIST_HEAD, readierFirstLoad } from "../lib/storelib-theme/compat/first-load"
import { flagImage } from "../lib/storelib-theme/compat/objects"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nA closed country list is skipped whole\n")
const us = flagImage("US")
const fr = flagImage("FR")
const list = (id: string) => `<div id="${id}" class="disclosure__list invisible"><ul class="list"><li><a data-value="US"><span><img src="${us}" alt="United States"></span><span>United States</span></a></li><li><a data-value="FR"><span><img src="${fr}" alt="France"></span><span>France</span></a></li></ul></div>`
const page = `<html><head><title>x</title></head><body><header>${list("a")}</header><nav><ul class="menu"><li><a href="/shop">Shop</a></li></ul></nav><footer>${list("b")}</footer><script>var t='<ul><li><img src="${us}"></li></ul>'</script></body></html>`
const r = readierFirstLoad(page)
check("each list holding flags is marked closed, once", r.countryLists === 2 && (r.html.match(new RegExp(`<ul ${COUNTRY_LIST_ATTR}="closed" class="list">`, "g")) ?? []).length === 2, r.countryLists)
check("a list with no flag (a menu) is left as it was", r.html.includes(`<ul class="menu"><li><a href="/shop">Shop</a></li></ul>`))
check("a list written inside a script's string is not touched", r.html.includes(`var t='<ul><li><img src="${us}"></li></ul>'`))
check("every item, its link and its flag stay in the page, the flags lazy", (r.html.match(/data-value="US"/g) ?? []).length === 2 && (r.html.match(/<img loading="lazy" src="data:image\/svg\+xml,/g) ?? []).length === 4)
check("the rule and the script that lets a list go are written once, in the head", r.html.indexOf(COUNTRY_LIST_HEAD) > 0 && r.html.indexOf(COUNTRY_LIST_HEAD) < r.html.indexOf("</head>") && r.html.split(COUNTRY_LIST_HEAD).length === 2)
const again = readierFirstLoad(r.html)
check("done twice, nothing more is marked or written", again.countryLists === 0 && again.html === r.html)
check("a page with no country list gets neither", !readierFirstLoad(`<html><head></head><body><ul><li>x</li></ul></body></html>`).html.includes("data-sl-countries"))

console.log("\nIt is let go before it is used\n")
check("skipped only while closed (content-visibility: hidden), never removed or display:none", /\[data-sl-countries="closed"\]\{content-visibility:hidden\}/.test(COUNTRY_LIST_HEAD) && !/display:\s*none/.test(COUNTRY_LIST_HEAD))
check("a pointer resting on or pressing, a touch, a key or a focus reaching it lets it go, before the theme's own handler (capture)", /\["pointerdown","pointerover","touchstart","keydown","focusin"\]/.test(COUNTRY_LIST_HEAD) && /capture:true,passive:true/.test(COUNTRY_LIST_HEAD))
check("found through what controls it (aria-controls) or what holds it", /getAttribute\("aria-controls"\)/.test(COUNTRY_LIST_HEAD) && /form,details/.test(COUNTRY_LIST_HEAD))
check("and the theme opening it by itself (class, style, open, hidden, aria-expanded around it) lets it go too", /MutationObserver/.test(COUNTRY_LIST_HEAD) && /attributeFilter:\["class","style","open","hidden","aria-expanded","aria-hidden"\]/.test(COUNTRY_LIST_HEAD))
check("let go for good: nothing ever marks it closed again", !/setAttribute\(A,"closed"\)/.test(COUNTRY_LIST_HEAD))

console.log("\nA drawn page says where its time went\n")
const route = code("app/api/site-theme/site/[username]/[[...path]]/route.ts")
check("read, localize, draw and post, then the total", /mark\("read"\)/.test(route) && /mark\("localize"\)/.test(route) && /mark\("draw"\)/.test(route) && /mark\("post"\)/.test(route) && /headers\.set\("Server-Timing", timing\.join\(", "\)\)/.test(route))
check("a held page says it was held, and what its draw cost when drawn", /hold;desc=hit/.test(route) && /drawn-\$2;/.test(route))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
