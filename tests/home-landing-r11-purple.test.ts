/**
 * LANDING ROUND 11, TRACK PURPLE: the analytics section on the purple sheet
 * and the world map under it.
 *
 * The owner:
 *   reports    "Views, Traffic sources, Countries, Top links, Devices, Sales
 *              should have some smooth, clean icons; non-AI, simple, clean":
 *              one line set (lucide), 16px, in the glass tiles.
 *   search     the results "should also have favicons": each site's own
 *              monogram in its own colour, in a round well, drawn inline.
 *   dots       "more smooth, clean and more visible in the purple
 *              background section": the purple tone brighter and rounder,
 *              riding the flow half as far, reaching further down the sheet.
 *   map        "think of another heading"; the flags and the product were
 *              "too far right"; "make it more like" a dark map card with a
 *              column of flags, a product card with its neighbours behind,
 *              an order pill and small Shipped words by the dots; black;
 *              still every 3s; on a phone "the map used to move when the
 *              country changes, very smooth: bring that back"; and "too
 *              short now" since round 10.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AnalyticsShowcase } from "@/components/marketing/home/analytics-showcase"
import { DOT_FIELD_TONES } from "@/components/marketing/home/dot-field"
import {
  SellEverywhereMap,
  SELL_COUNTRIES,
  SELL_DONE,
  SELL_MAP,
  SELL_PAST_ORDERS,
  SELL_PAST_SAYS,
  SELL_STEP_MS,
  sellMapPanTransform,
  sellStackOffset,
} from "@/components/marketing/home/sell-everywhere-map"

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
const DIR = "components/marketing/home"
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
const BANNED = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform(s|ing)?)\b|—/i

console.log("\n── analytics: an icon per report, a favicon per result ──")
{
  const src = read(`${DIR}/analytics-showcase.tsx`)
  const css = read(`${DIR}/analytics-showcase.module.css`)
  const html = renderToStaticMarkup(createElement(AnalyticsShowcase))
  check("the icons are the app's own line set", /from "lucide-react"/.test(src) && /Eye, Globe, Link2, MonitorSmartphone, ShoppingBag, Waypoints/.test(src))
  const items = html.match(/<li class="[^"]*report[^"]*"[\s\S]*?<\/li>/g) ?? []
  check("six reports, each one svg icon and its word", items.length === 6 && items.every((li) => (li.match(/<svg/g) ?? []).length === 1 && /aria-hidden="true"/.test(li)), items.length)
  check("the words are the reports Analytics has", ["Views", "Traffic sources", "Countries", "Top links", "Devices", "Sales"].every((w, i) => text(items[i] ?? "").trim() === w))
  check("16px at a 1.75 stroke, a step dimmer than the word", items.every((li) => /width="16"/.test(li) && /stroke-width="1.75"/.test(li)) && /\.reportIcon \{[^}]*width: 16px;[^}]*color: rgba\(255, 255, 255, 0\.82\);/.test(css))
  check("a long word still ends in an ellipsis, the icon never squeezed", /\.reportLabel \{[^}]*overflow: hidden;\s*text-overflow: ellipsis;/.test(css) && /\.reportIcon \{\s*flex: none;/.test(css))
  check("the tiles keep their white glass", /\.report \{[^}]*background: linear-gradient\(180deg, rgba\(255, 255, 255, 0\.17\) 0%, rgba\(255, 255, 255, 0\.1\) 100%\);/.test(css) && !/backdrop-filter/.test(css))
  const wells = html.match(/<span class="[^"]*faviconWell[^"]*"><svg[^>]*viewBox="0 0 16 16"[\s\S]*?<\/svg><\/span>/g) ?? []
  check("three results, three favicons in round wells", wells.length === 3 && /\.faviconWell \{[^}]*width: 26px;[^}]*border-radius: 50%;/.test(css), wells.length)
  /* Changed on purpose (landing round 12): the owner found the monograms "still letter tiles"; each site has a drawn mark now (tests/home-landing-r12-purple.test.ts). */
  check("each site its own mark and colour", /data-favicon="fjord"/.test(wells[0] ?? "") && /data-favicon="film"/.test(wells[1] ?? "") && /data-favicon="lights"/.test(wells[2] ?? "") && !/<text/.test(wells.join("")))
  check("no grey initials left", !/initial:|\{r\.initial\}/.test(src))
  check("nothing purple on the purple sheet", !/#(7c3aed|8b5cf6|a78bfa|c4b5fd)/i.test(src + css))
  check("no banned words or em dashes", !BANNED.test(text(html)))
}

console.log("\n── the purple's dots: more visible, smoother ──")
{
  const dots = read(`${DIR}/dot-field.tsx`)
  const page = read("app/(storelib)/(marketing)/page.tsx")
  const p = DOT_FIELD_TONES.purple
  check("brighter on purple: 0.17 at rest (was 0.12), 0.4 lit (was 0.32), still white", p.rest === 0.17 && p.lit === 0.4 && p.rgb === "255,255,255")
  check("a touch rounder on purple; the dark tone is the lower track's (same round)", p.r === 0.95 && DOT_FIELD_TONES.dark.r === 0.8)
  check("the dots ride the flow half as far on purple (no shimmer across a device pixel)", p.ride === 0.5 && /\(flow - 0\.5\) \* 0\.8 \* colour\.ride/.test(dots) && /\(flow - 0\.5\) \* 1\.4 \* colour\.ride/.test(dots))
  check("the light wanders a little stronger on purple", /goal = fine \? 0\.45 : 0\.55/.test(dots)) // Changed on purpose (landing round 13): the closing call has its own branch (DOT_FIELD_CALM), so the purple sheet's wander is written on its own; the same values.
  check("the field reaches 1600px down the sheet (was 1100)", /<DotField tone="purple" fade="bottom" gap=\{22\} style=\{\{ height: "min\(100%, 1600px\)" \}\} \/>/.test(page))
}

console.log("\n── the map: a new heading, flags, a stack, an order pill ──")
{
  const src = read(`${DIR}/sell-everywhere-map.tsx`)
  const css = src.split("const MAP_CSS = `")[1] ?? ""
  const html = renderToStaticMarkup(createElement(SellEverywhereMap))
  const words = text(html)
  check("the heading: Sell to buyers worldwide.", words.includes("Sell to buyers worldwide.") && !/never closes|Sell anywhere/.test(words) && /accent=\{\["worldwide"\]\}/.test(src))
  check("no banned words or em dashes", !BANNED.test(words))
  check("still black, still on white", /\.cmm-card\{[^}]*color:#fff;background:#0f0f12;/.test(css) && /\.cmm\{position:relative;background:#fff;/.test(css))
  check("the flags: a column of square 48px tiles, the lit one sliding 56px a country", /\.cmm-flag\{[^}]*width:48px;height:48px;[^}]*border-radius:14px;background:rgba\(255,255,255,\.035\)/.test(css) && /transform:translate3d\(0,calc\(var\(--cmm-a\) \* 56px\),0\)/.test(css))
  check("weighted left: the flags 28 to 44px in from the card's edge", /\.cmm-side\{[^}]*margin-left:clamp\(28px,2\.6vw,44px\)/.test(css))
  const cards = html.match(/<span class="cmm-prod"[^>]*>/g) ?? []
  check("a card per country, each with its own picture, name, price, how it arrives and button", cards.length === SELL_COUNTRIES.length && (html.match(/class="cmm-photo"/g) ?? []).length === 6 && (html.match(/class="cmm-buy" lang="/g) ?? []).length === 6)
  check("on arrival: the first in front, its neighbours peeking out, the rest hidden", cards.map((c) => c.match(/data-o="(-?\d)"/)?.[1]).join() === "0,1,2,-3,-2,-1")
  check("a card's place is its offset from the country in turn", sellStackOffset(1, 0) === 1 && sellStackOffset(5, 0) === -1 && sellStackOffset(0, 1) === -1 && sellStackOffset(3, 0) === -3 && sellStackOffset(2, 5) === -3 && sellStackOffset(4, 3) === 1)
  /* Changed on purpose (landing round 12): opaque cards at depths in one 3D stack, a neighbour dimmed by a shade, all on one 1.1s clock (tests/home-landing-r12-purple.test.ts). */
  check("neighbours smaller and dimmed behind the front card; the rest hidden", /\.cmm-prod\[data-o="1"\]\{opacity:1;transform:translate3d\(42%,0,-40px\) scale\(\.84\)\}/.test(css) && /\.cmm-prod\[data-o="-1"\]\{opacity:1;transform:translate3d\(-42%,0,-40px\) scale\(\.84\)\}/.test(css) && /\.cmm-prod\{[^}]*opacity:0;transform:translate3d\(0,0,-80px\) scale\(\.7\)/.test(css))
  check("a turn moves cards by transform and opacity only", /\.cmm-prod\{[^}]*transition:transform \$\{MOVE\}ms \$\{GLIDE\},opacity \$\{MOVE\}ms \$\{SOFT\}/.test(css) && /put\(node, "data-o", String\(sellStackOffset\(k, i\)\)\)/.test(src))
  check("an order pill with the buyer's flag over the front card's edge", (html.match(/class="cmm-order"/g) ?? []).length === 1 && SELL_COUNTRIES.every((c) => words.includes(`Order for ${c.total}`)) && /\.cmm-order\{position:absolute;z-index:4;left:calc\(var\(--cmm-peek\) \+ var\(--cmm-w\) - 44px\)/.test(css))
  check("small words beside the dots: Shipped or Delivered for the countries, Shipped for six earlier orders", SELL_DONE.physical === "Shipped" && SELL_DONE.digital === "Delivered" && (html.match(/class="cmm-say">Shipped</g) ?? []).length === 3 + SELL_PAST_SAYS.size && (html.match(/class="cmm-say">Delivered</g) ?? []).length === 3 && SELL_PAST_SAYS.size === 6)
  check("plain words, no pill, and the city in turn shows its ring instead", /\.cmm-say\{position:absolute;left:9px;top:0;font-size:12\.5px;[^}]*opacity:\.62;/.test(css) && !/\.cmm-say\{[^}]*background/.test(css) && /\.cmm-pin\[data-on\] \.cmm-say\{opacity:0;/.test(css))
  check("Tokyo, Paris and Sydney put their word on the left (the map's edge, Berlin's dot)", SELL_COUNTRIES.filter((c) => "side" in c).map((c) => c.code).join() === "JP,FR,AU" && /\.cmm-pin\[data-side="left"\] \.cmm-say\{left:auto;right:9px\}/.test(css))
  /* Words are about 16 cells wide and 5 rows tall at the drawn size: none may cover another dot. */
  const said: Array<{ c: number; r: number; left: boolean }> = [
    ...SELL_PAST_ORDERS.filter((_, i) => SELL_PAST_SAYS.has(i)).map(([c, r]) => ({ c, r, left: false })),
    ...SELL_COUNTRIES.map((x) => ({ c: x.cell[0], r: x.cell[1], left: "side" in x })),
  ]
  const dotsAt = [...SELL_PAST_ORDERS, ...SELL_COUNTRIES.map((x) => x.cell)]
  const hits = said.flatMap((w) => {
    const c0 = w.left ? w.c - 19 : w.c + 2
    const c1 = w.left ? w.c - 2 : w.c + 19
    return dotsAt.filter(([c, r]) => !(c === w.c && r === w.r) && c >= c0 && c <= c1 && Math.abs(r - w.r) <= 2.5).map((d) => [w.c, w.r, d])
  })
  check("no word covers another dot", hits.length === 0, hits)
  check("still a 3s turn timed by the lit flag's line", SELL_STEP_MS === 3000 && /<i className="cmm-time" data-lap="0" onAnimationEnd=\{next\} \/>/.test(src) && !/setInterval|setTimeout/.test(src))
  check("still the same accurate map", SELL_MAP.cols === 240 && SELL_MAP.rows === 90)
  check("a taller card again: 560px wide, 540 on a short laptop", /\.cmm-card\{[^}]*padding:44px 0 40px;min-height:560px\}/.test(css) && /@media \(min-width:1024px\) and \(max-height:900px\)\{[^@]*\.cmm-card\{min-height:540px;/.test(css))
  check("pictures ease in once decoded, never pop", /\.cmm-photo img\{[^}]*opacity:0;transition:opacity \.5s ease-out\}/.test(css) && /img\.decode \? img\.decode\(\)/.test(src) && /img\.setAttribute\("data-ready", ""\)/.test(src))
}

console.log("\n── the phone's pan, back ──")
{
  const src = read(`${DIR}/sell-everywhere-map.tsx`)
  const css = src.split("const MAP_CSS = `")[1] ?? ""
  check("the pan is written straight on as the map's transform, at arrival and every turn", /style=\{\{ transform: sellMapPanTransform\(SELL_COUNTRIES\[0\]\.cell\) \}\}/.test(src) && /if \(map\) map\.style\.transform = sellMapPanTransform\(SELL_COUNTRIES\[i\]\.cell\)/.test(src))
  check("no registered pan property left to fail to transition", !/--cmm-pan-x|--cmm-pan-y/.test(src))
  /* Changed on purpose (landing round 12): the pan rides the turn's one clock (1.1s) on an ease that leaves at rest. */
  check("eased on one composited layer, under 640px", /@media \(max-width:639px\)\{[\s\S]*\.cmm-map\{width:\$\{ZOOM \* 100\}%;transition:transform \$\{MOVE\}ms \$\{GLIDE\};will-change:transform\}/.test(css))
  check("wider screens show the whole map, unmoved", /@media \(min-width:640px\)\{\.cmm-map\{transform:none!important\}\}/.test(css))
  check("every country's pan is a different place", new Set(SELL_COUNTRIES.map((c) => sellMapPanTransform(c.cell))).size === SELL_COUNTRIES.length)
  check("reduced motion: the pan, the cards and the pictures are still", /prefers-reduced-motion:reduce\)\{[\s\S]*\.cmm-prod,\.cmm-photo img,\.cmm-map\{transition:none!important\}/.test(css))
}

console.log("\n── registered ──")
{
  const runner = read("scripts/run-push-tests.mjs")
  check("this suite runs on push, after the round 10 landing suites", /"tests\/home-landing-r10-checkout\.test\.ts",[\s\S]{0,3000}"tests\/home-landing-r11-purple\.test\.ts"/.test(runner))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
