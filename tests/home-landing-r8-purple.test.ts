/**
 * ===========================================================================
 *  HOME, LANDING ROUND 8: THE PURPLE SHEET (ANALYTICS AND THE MAP)
 * ===========================================================================
 *   heading   "Get found, and see who finds you." in place of "Know what's
 *             working, as it happens": both rows (search, visitors) in
 *             plain words, no banned word, no em dash.
 *   reports   white glass, as the owner asked: a soft white gradient at
 *             about a seventh, a light top edge, a hairline, white words; no
 *             backdrop blur, nothing animated.
 *   orbs      the globe card, Nora's card, her top places and the SEO card
 *             carry quiet round lights like the engines card's: radial
 *             gradients drifting by transform alone, paused off screen,
 *             gone under reduced motion, no layer bigger than its card.
 *   map       the products: tee, Cine Tones LUT Pack, steel bottle, mobility
 *             course, canvas tote, Ancestral Kitchen cookbook; the turn timed
 *             by the lit flag's CSS line (no JavaScript timer); cities
 *             pressable; a calmer product card whose words leave up and
 *             arrive from below and whose pictures cover each other with no
 *             dark dip.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AnalyticsShowcase } from "@/components/marketing/home/analytics-showcase"
import { SellEverywhereMap, SELL_COUNTRIES, SELL_STEP_MS, SELL_NOTE, SELL_KIND_NOTE } from "@/components/marketing/home/sell-everywhere-map"

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
const GONE = /nadia brooks|the loop\b|lasalle at dusk|nails by bea|nordline coffee|charla circle|static bloom|wild ?camp|drone|enthusiasts/i
const block = (css: string, sel: string) => css.match(new RegExp(`(?:^|\\n)${sel.replace(/\./g, "\\.")} \\{([^}]*)\\}`))?.[1] ?? ""

console.log("\n── analytics: heading, glass reports, orbs ──")
{
  const src = read(`${DIR}/analytics-showcase.tsx`)
  const css = read(`${DIR}/analytics-showcase.module.css`)
  const html = renderToStaticMarkup(createElement(AnalyticsShowcase))
  const words = text(html)
  check("the new heading, its second half the accent", /text="Get found, and see who finds you\." accent=\{\["see", "who", "finds", "you"\]\}/.test(src) && html.includes("Get found, and see who finds you.") && !/as it happens/.test(words))
  check("no banned words or em dashes in what the section says", !BANNED.test(words))
  const report = block(css, ".report")
  check("reports: white at about a seventh, brighter at the top", /background: linear-gradient\(180deg, rgba\(255, 255, 255, 0\.1[4-9]\) 0%, rgba\(255, 255, 255, 0\.(0[89]|1[0-2]?)\) 100%\);/.test(report), report)
  check("reports: a light top edge and a hairline, white words", /inset 0 1px 0 rgba\(255, 255, 255, 0\.3\)/.test(report) && /inset 0 0 0 1px rgba\(255, 255, 255, 0\.16\)/.test(report) && /color: #fff;/.test(report) && !/#0d0d10/.test(report))
  check("reports: no backdrop blur, nothing animated", !/backdrop-filter/.test(css) && !/transition|animation/.test(report))
  check("six reports still", (html.match(/<li class="[^"]*report[^"]*"/g) ?? []).length === 6)

  const orbs = html.match(/class="[^"]*\borb\b[^"]*"/g) ?? []
  check("orbs in the globe card (two), Nora's card, top places and the SEO card", orbs.length === 5 && /\$\{s\.orbGlobeA\}/.test(src) && /\$\{s\.orbGlobeB\}/.test(src) && (src.match(/\$\{s\.orbChip\}/g) ?? []).length === 2 && /\$\{s\.orbSearch\}/.test(src), orbs.length)
  check("every orb is a .loop (paused off screen and in background tabs)", (src.match(/\$\{s\.orb\} [^`]*\$\{m\.loop\}/g) ?? []).length === 5)
  const orb = block(css, ".orb")
  check("orbs move by transform alone, slowly, and sit behind the words", /animation: orbDrift 22s ease-in-out infinite alternate;/.test(orb) && /z-index: -1;/.test(orb) && /@keyframes orbDrift \{\s*from \{\s*transform: translate3d\([^)]*\);\s*\}\s*to \{\s*transform: translate3d\([^)]*\);\s*\}\s*\}/.test(css) && /@keyframes orbDriftBack \{\s*from \{\s*transform: translate3d/.test(css))
  check("orbs are quiet: no white above 0.08, no blur filter", [...css.matchAll(/\.orb[A-Za-z]* \{([^}]*)\}/g)].every((m) => [...m[1].matchAll(/rgba\(\d+, \d+, \d+, (0\.\d+)\)/g)].every((a) => Number(a[1]) <= 0.08)) && !/filter: blur/.test(css))
  check("the cards hold their orbs: dark cards and the chips are their own stacking context", /\.dark \{[^}]*isolation: isolate;/.test(css) && /\.profile,\s*\.places \{[^}]*isolation: isolate;[^}]*overflow: hidden;/.test(css))
  check("reduced motion: the orbs stand still", /prefers-reduced-motion: reduce\) \{[\s\S]*\.orb \{\s*animation: none;/.test(css))
}

console.log("\n── the map: products, the turn, the card ──")
{
  const src = read(`${DIR}/sell-everywhere-map.tsx`)
  const html = renderToStaticMarkup(createElement(SellEverywhereMap))
  const words = text(html)
  const names = SELL_COUNTRIES.map((c) => c.product)
  check("the products the owner asked for", JSON.stringify(names) === JSON.stringify(["705 tee", "Cine Tones LUT Pack", "Steel bottle", "Mobility course", "Canvas tote", "Ancestral Kitchen"]), names)
  check("three physical and three digital, alternating", SELL_COUNTRIES.every((c, i) => c.kind === (i % 2 ? "digital" : "physical")))
  check("nothing the owner removed, anywhere in the section or its pictures", !GONE.test(src) && !GONE.test(words) && !["drone-course", "wild-camp-ebook", "pines-lut-pack"].some((f) => existsSync(join(root, "public/home/sell-map", `${f}.webp`))))
  check("every picture local, square and small", SELL_COUNTRIES.every((c) => existsSync(join(root, "public/home/sell-map", c.photo)) && statSync(join(root, "public/home/sell-map", c.photo)).size < 60_000 && html.includes(`src="/home/sell-map/${c.photo}"`)))
  check("the course says it is watched, the others how they arrive", SELL_NOTE.CA === "Instant access" && words.includes("Instant access") && words.includes(SELL_KIND_NOTE.digital) && words.includes(SELL_KIND_NOTE.physical))

  check("the turn is timed by the lit flag's line, not a JavaScript timer", /<i key=\{active\} className="cmm-time" onAnimationEnd=\{next\} \/>/.test(src) && !/setInterval|setTimeout/.test(src) && SELL_STEP_MS === 3600 && /animation:cmm-time \$\{STEP\}ms linear both;animation-play-state:paused/.test(src))
  check("the line runs only while live, holds under a resting pointer, never under reduced motion", /\[data-commerce-live\] \.cmm-time\{animation-play-state:running\}/.test(src) && /\(hover:hover\) and \(pointer:fine\)\{\[data-commerce-live\] \.cmm-side:hover \.cmm-time\{animation-play-state:paused\}\}/.test(src) && /prefers-reduced-motion:reduce\)\{[\s\S]*\.cmm-time\{animation:none\}/.test(src))
  check("the line grows by one transform", /@keyframes cmm-time\{from\{transform:scaleX\(0\)\}to\{transform:scaleX\(1\)\}\}/.test(src))
  check("cities can be pressed by a pointer, the flags stay the real switch", /className="cmm-pin"[^>]*onClick=\{\(\) => choose\(i\)\}/.test(src) && /\.cmm-pin\{pointer-events:auto;cursor:pointer/.test(src) && (html.match(/<button type="button" class="cmm-flag"/g) ?? []).length === 6)
  check("the ring ripples twice, offset", (html.match(/class="cmm-ring cmm-ring-2"/g) ?? []).length === 6 && /\.cmm-pin\[data-on\] \.cmm-ring-2\{animation-delay:1\.2s\}/.test(src))
  check("a calmer product card: softer corners, a dark ground lit from the top", /\.cmm-prod\{width:236px;padding:10px;border-radius:20px;background:#141418;background-image:linear-gradient\(180deg,rgba\(255,255,255,\.045\)/.test(src))
  check("words leave up and arrive from below", /\.cmm-swap span\{[^}]*transform:translate3d\(0,7px,0\)/.test(src) && /\.cmm-swap span\[data-was\]\{transform:translate3d\(0,-7px,0\)\}/.test(src) && /\.cmm-buy span\[data-was\]\{transform:translate3d\(0,-9px,0\)\}/.test(src))
  check("the next picture covers the last, which waits (no dark dip)", /\.cmm-photos img\[data-was\]\{z-index:0;opacity:1;transform:none;transition:opacity \.2s linear \.85s\}/.test(src) && /\.cmm-photos img\[data-on\]\{opacity:1;z-index:1/.test(src))
  check("only transform and opacity move in the section", [...src.matchAll(/transition:([^;}]*)/g)].every((m) => m[1].split(",").every((t) => /^\s*(none|opacity|transform)\b/.test(t))), [...src.matchAll(/transition:([^;}]*)/g)].map((m) => m[1]))
  check("no banned words or em dashes in what the section says", !BANNED.test(words))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
