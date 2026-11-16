/**
 * LANDING ROUND 12, TRACK PURPLE: the search results' favicons and the world
 * map's motion.
 *
 * The owner:
 *   favicons   "still letter tiles": realistic small site icons, each with
 *              its own feel, no real brand. Nora Vik a fjord at dusk, Frame
 *              and Grain a strip of film, Colorist Notes three lights.
 *   map        the money and the language changing, and the map moving,
 *              "not smooth": transform and opacity only, eased, no jumps, no
 *              reflow, no jank at 4x CPU on a phone. One clock per turn, an
 *              ease that leaves at rest, opaque cards in one 3D stack (the
 *              compositor swaps them halfway, no z-index frame).
 *   phone      the map section full width, edge to edge.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AnalyticsShowcase } from "@/components/marketing/home/analytics-showcase"
import { SellEverywhereMap, SELL_COUNTRIES, SELL_STEP_MS, SELL_TURN_MOVE_MS } from "@/components/marketing/home/sell-everywhere-map"

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
/** The page-wide list from the round 12 brief. */
const NEVER = /Nadia Brooks|The Loop|LaSalle at dusk|Nails by Bea|Nordline Coffee|Charla Circle|Static Bloom|Maren Holt|Harbor yarn kit|enthusiasts|Studio Marlow|Kai Moreno|ceramics|\btotes?\b|After Dark|memberships|Mondo Mango|Mara Lind/i

console.log("\n── the favicons: drawn marks, not letters ──")
{
  const src = read(`${DIR}/analytics-showcase.tsx`)
  const html = renderToStaticMarkup(createElement(AnalyticsShowcase))
  const wells = html.match(/<span class="[^"]*faviconWell[^"]*"><svg[\s\S]*?<\/svg><\/span>/g) ?? []
  check("three results, three marks in round wells", wells.length === 3, wells.length)
  check("Nora Vik a fjord at dusk, Frame and Grain a strip of film, Colorist Notes three lights", /data-favicon="fjord"/.test(wells[0] ?? "") && /data-favicon="film"/.test(wells[1] ?? "") && /data-favicon="lights"/.test(wells[2] ?? ""))
  check("no letters in any of them", wells.every((w) => !/<text/.test(w)) && !/function Favicon\(\{ mark/.test(src))
  check("each on a 16px grid, crisp in the 26px well", wells.every((w) => /viewBox="0 0 16 16"/.test(w) && /width="16"/.test(w) && /height="16"/.test(w)))
  check("the fjord: two peaks, a low sun, the water", /<path d="M1\.5 11\.5 5\.6 5\.2 7\.9 8\.5 9\.6 6\.6 14\.5 11\.5Z"/.test(wells[0] ?? "") && /<circle[^>]*fill="#f0b36a"/.test(wells[0] ?? "") && /<rect x="3" y="12\.6"/.test(wells[0] ?? ""))
  check("the film: a dark strip, two frames and eight sprocket holes", (wells[1]?.match(/fill="#f6c58f"/g) ?? []).length === 2 && ((wells[1] ?? "").match(/h\.9v1h-\.9z/g) ?? []).length === 8)
  check("the lights: red, green and blue meeting in white (screen)", ["#ff3b30", "#2bd45a", "#2f6bff"].every((c) => (wells[2] ?? "").includes(`fill="${c}"`)) && ((wells[2] ?? "").match(/mix-blend-mode:screen/g) ?? []).length === 3)
  check("three different grounds, three different shapes", /<rect width="16" height="16" rx="3\.5" fill="#173f48"/.test(wells[0] ?? "") && /<rect width="16" height="16" rx="3\.5" fill="#d9692a"/.test(wells[1] ?? "") && /<circle cx="8" cy="8" r="8" fill="#121317"/.test(wells[2] ?? ""))
  check("invented sites only", /noravik\.example/.test(html) && /frameandgrain\.example/.test(html) && /coloristnotes\.example/.test(html))
  check("no banned words or em dashes", !BANNED.test(text(html)))
}

console.log("\n── the map: one clock, no jumps, no reflow ──")
{
  const src = read(`${DIR}/sell-everywhere-map.tsx`)
  const css = src.split("const MAP_CSS = `")[1] ?? ""
  const html = renderToStaticMarkup(createElement(SellEverywhereMap))
  const words = text(html)
  check("a turn's motion takes 1.1s of the 3s a country stays", SELL_TURN_MOVE_MS === 1100 && SELL_STEP_MS === 3000)
  check("one ease that leaves at rest (no steep start that reads as a jump)", /const GLIDE = "cubic-bezier\(\.45,0,\.15,1\)"/.test(src) && !/cubic-bezier\(\.22,1,\.36,1\)/.test(src) && !/\$\{EASE\}/.test(css))
  /* The stylesheet with each ${...} written as «...», so a rule's braces are its own. */
  const flat = css.replace(/\$\{([^}]*)\}/g, "«$1»")
  const timed = [...flat.matchAll(/transition:([^;}]*)/g)].map((m) => m[1]).filter((t) => !/^none/.test(t))
  check("every transition in a turn on the one clock (the photo's one-off ease in, the leaving words' shorter fade excepted)", timed.length >= 10 && timed.every((t) => t.split(",").every((part) => /«MOVE»ms|«OUT»ms|«MOVE - OUT»ms|^opacity \.5s ease-out$/.test(part.trim()))), timed)
  check("no delays but the new words waiting for the old ones", (flat.match(/ms «SOFT» «OUT»ms/g) ?? []).length === 1 && timed.every((t) => t.split(",").every((part) => part.trim().split(" ").length <= 3 || /«OUT»ms$/.test(part.trim()))))
  check("transform and opacity only", timed.every((t) => t.split(",").every((part) => /^(transform|opacity) /.test(part.trim()))))
  check("the cards: opaque, at depths in one 3D stack, no z-index", /\.cmm-stack\{[^}]*transform-style:preserve-3d\}/.test(css) && !/\.cmm-prod[^{]*\{[^}]*z-index/.test(css) && /\.cmm-prod\[data-o="0"\]\{opacity:1;transform:translate3d\(0,0,0\) scale\(1\)\}/.test(css) && /\.cmm-prod\[data-o="1"\]\{opacity:1;transform:translate3d\(42%,0,-40px\) scale\(\.84\)\}/.test(css) && /\.cmm-prod\[data-o="2"\]\{transform:translate3d\(64%,0,-80px\) scale\(\.7\)\}/.test(css))
  check("a neighbour dimmed by a shade over it, not see-through", /\.cmm-prod::after\{[^}]*background:#0f0f12;opacity:\.62;/.test(css) && /\.cmm-prod\[data-o="0"\]::after\{opacity:0\}/.test(css))
  check("the moving layers stay layers (no repaint each turn)", /\.cmm-prod\{[^}]*will-change:transform,opacity\}/.test(flat) && /\.cmm-prod::after\{[^}]*will-change:opacity\}/.test(flat) && /\.cmm-swap span\{[^}]*will-change:transform,opacity\}/.test(flat))
  check("the pill's words for every country in one grid cell: as wide as the widest, nothing reflows", /\.cmm-order \.cmm-swap\{display:grid\}/.test(css) && /\.cmm-swap span\{grid-area:1\/1;[^}]*font-variant-numeric:tabular-nums;/.test(css) && SELL_COUNTRIES.every((c) => words.includes(`Order for ${c.total}`)))
  check("prices in tabular figures", /\.cmm-prod-row\{display:flex;font-variant-numeric:tabular-nums;/.test(css) && /\.cmm-price\{[^}]*font-variant-numeric:tabular-nums/.test(css))
  check("a turn writes only what changes", /const put = \(node: HTMLElement, name: string, value: string \| null\) => \{\s*if \(node\.getAttribute\(name\) === value\) return/.test(src) && !/toggleAttribute/.test(src))
  check("still no timer and no render per turn", !/setInterval|setTimeout|useState\(0\)/.test(src))
  check("the phone's pan on the same clock and ease", /\.cmm-map\{width:\$\{ZOOM \* 100\}%;transition:transform \$\{MOVE\}ms \$\{GLIDE\};will-change:transform\}/.test(css))
  check("reduced motion: still nothing moves", /prefers-reduced-motion:reduce\)\{[\s\S]*\.cmm-core,\.cmm-say,\.cmm-flag,\.cmm-flags \.cmm-flag-lit,\.cmm-swap span,\.cmm-prod,\.cmm-photo img,\.cmm-map\{transition:none!important\}/.test(css))
  check("the canvas tote is a camp mug now (nothing on the page from the never list)", SELL_COUNTRIES.find((c) => c.code === "FR")?.product === "Camp mug" && !NEVER.test(words))
  check("no banned words or em dashes", !BANNED.test(words))
}

console.log("\n── on a phone: edge to edge ──")
{
  const src = read(`${DIR}/sell-everywhere-map.tsx`)
  const css = src.split("const MAP_CSS = `")[1] ?? ""
  const phone = css.split("@media (max-width:639px){")[1]?.split("\n}\n")[0] ?? ""
  check("the card is inset again, with its rounded corners", /* Changed on purpose (landing round 14): the owner: not full width on a phone any more, the inset card as before round 12. */ /\.cmm-card\{border-radius:21px\}/.test(phone) && !/\.cmm-card\{margin:0 calc/.test(phone))
  check("the map's window inset in it, rounded", /* Changed on purpose (landing round 14): the inset card, as before round 12. */ /\.cmm-world\{aspect-ratio:1\/\$\{VIEW_H\}\}/.test(phone))
  check("the heading keeps the page's edge", /\.cmm-wrap,\[data-landing-story\] \.cmm>\.cmm-wrap\{[^}]*padding:0 var\(--home-edge/.test(css))
}

console.log("\n── registered ──")
{
  const runner = read("scripts/run-push-tests.mjs")
  check("this suite runs on push, after the round 11 landing suites", /"tests\/home-landing-r11-stability\.test\.ts",[\s\S]{0,1500}"tests\/home-landing-r12-purple\.test\.ts"/.test(runner))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
