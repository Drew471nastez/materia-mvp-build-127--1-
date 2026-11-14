/**
 * ===========================================================================
 *  HOME, LANDING ROUND 3: THE LOWER SECTIONS ON THEIR NEW GROUNDS
 * ===========================================================================
 * The owner: "white modals on black background looks ugly and weird", tabs
 * like the ones in "Make the work", nothing drawn inside a mock hoverable or
 * clickable, and examples that are about half digital products and
 * communities, half physical products and merch.
 *
 *   analytics   on the purple sheet: every card a dark surface with a
 *               hairline; the search card dark with a night search inside;
 *               the profile and top places solid dark chips; the reports
 *               outlined in the ground's ink; nothing answers the pointer.
 *   map         the product card dark with a light button that still says
 *               Buy now; the flags a real switch (buttons that choose the
 *               country); the rest inert; the Example tag off the dots on a
 *               phone.
 *   audience    one neutral grey for every card, no violet light and no
 *               lilac card, no pill row; mocks inert.
 *   earnings    three digital or community kinds and three printed ones; the
 *               kinds and the plan switch in the tab family of "Make the
 *               work" (grey track, white chosen pill).
 *   pricing     white on the home page, where it shares the white sheet.
 *   app         no white ring on the purple ground.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AudienceOwnership } from "@/components/marketing/home/audience-ownership"
import { AnalyticsShowcase } from "@/components/marketing/home/analytics-showcase"
import { SellEverywhereMap, SELL_COUNTRIES, SELL_BUY_LABEL } from "@/components/marketing/home/sell-everywhere-map"
import { EarningsCalculator, EARN_KINDS, EARNINGS_STYLES, commerceMonth } from "@/components/marketing/home/earnings-calculator"
import { AppAnywhere } from "@/components/marketing/home/app-anywhere"
import { PricingSection } from "@/components/marketing/pricing-section"
import { PILLS_CSS } from "@/components/marketing/home/showcase-mocks/pills"

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
const rule = (css: string, sel: string) => css.match(new RegExp(`(?:^|\\})\\s*${sel.replace(/[.[\]"=]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "m"))?.[1] ?? ""
/** Is a #rrggbb colour a dark surface (every channel under 0x30)? */
const dark = (hex: string) => /^#[0-9a-f]{6}$/i.test(hex) && [1, 3, 5].every((i) => parseInt(hex.slice(i, i + 2), 16) < 0x30)

console.log("\n── analytics, on the purple sheet ──")
{
  const src = read(`${DIR}/analytics-showcase.tsx`)
  const css = read(`${DIR}/analytics-showcase.module.css`)
  const html = renderToStaticMarkup(createElement(AnalyticsShowcase))
  check("no light card left: one dark surface class, with a hairline", !/\.light\b/.test(css) && !/s\.light/.test(src) && /\.dark \{[^}]*background: #0d0d10;[^}]*inset 0 0 0 1px rgba\(255, 255, 255, 0\.08\)/.test(css))
  check("the search card is dark, and so is the search inside it", /function SearchCard[\s\S]*?\$\{s\.dark\}/.test(src) && dark(css.match(/\.serp \{\s*border-radius[^}]*background: (#[0-9a-f]{6})/)?.[1] ?? "") && dark(css.match(/\.serpBar \{[^}]*background: (#[0-9a-f]{6})/)?.[1] ?? ""))
  check("the profile and top places are solid dark chips", dark(css.match(/\.profile,\s*\.places \{[^}]*background: (#[0-9a-f]{6})/)?.[1] ?? "") && !/backdrop-filter/.test(css))
  check("no white or light grey slab in the cards' markup", !/bg-white(?![\/\w])|bg-\[#f[0-9a-f]{5}\]|bg-\[#fff\]/.test(html.replace(/<section[^>]*>/, "")))
  check("the reports are outlined in the ground's ink, not white pills", /\.report \{[^}]*color: var\(--band-ink, #1f1d26\);[^}]*box-shadow: inset 0 0 0 1px var\(--band-line,/.test(css) && (html.match(new RegExp(`class="[^"]*report[^"]*"`, "g")) ?? []).length === 7 && !/text-\[#7c3aed\]/.test(src))
  check("nothing in a card answers the pointer", /\.dark > \* \{\s*pointer-events: none;/.test(css) && !/:hover/.test(css))
  check("the sample is a course (digital), still about sourdough", html.includes("Sourdough for beginners: a 7 day starter course"))
}

console.log("\n── the map, on the purple sheet ──")
{
  const src = read(`${DIR}/sell-everywhere-map.tsx`)
  const html = renderToStaticMarkup(createElement(SellEverywhereMap))
  const prod = rule(src, ".cmm-prod")
  check("the card is a dark surface with a hairline", dark(rule(src, ".cmm-card").match(/background:(#[0-9a-f]{6})/)?.[1] ?? "") && /inset 0 0 0 1px rgba\(255,255,255,\.08\)/.test(rule(src, ".cmm-card")))
  check("the product card is dark, not a white slab", dark(prod.match(/background:(#[0-9a-f]{6})/)?.[1] ?? "") && !/background:#fff/.test(prod))
  check("the button still says Buy now, once, in English", SELL_BUY_LABEL === "Buy now" && (html.match(/class="cmm-buy">Buy now</g) ?? []).length === 1)
  check("the flags are a real switch: one pressed button per country, named", (html.match(/<button type="button" class="cmm-flag"/g) ?? []).length === SELL_COUNTRIES.length && (html.match(/aria-pressed="true"/g) ?? []).length === 1 && html.includes('aria-label="United States"') && /role="group" aria-label="Buyer&#x27;s country"/.test(html))
  check("choosing a country restarts the turn from it", /const choose = \(i: number\)/.test(src) && /\}, \[live, picks\]\)/.test(src))
  check("the map, the product, the tag and the words are inert", /\.cmm-world,\.cmm-prod,\.cmm-tag,\.cmm-copy\{pointer-events:none\}/.test(src))
  check("on a phone the Example tag has its own line above the map", /@media \(max-width:1023px\)\{[\s\S]*?\.cmm-tag\{position:static;order:0;align-self:flex-end/.test(src))
  check("the switch keeps a reduced motion path and a focus ring", /\.cmm-flag:focus-visible\{outline:2px solid/.test(src) && /prefers-reduced-motion:reduce\)\{[\s\S]*\.cmm-flag,/.test(src))
}

console.log("\n── audience, on the white sheet ──")
{
  const src = read(`${DIR}/audience-ownership.tsx`)
  const css = read(`${DIR}/audience-ownership.module.css`)
  const html = renderToStaticMarkup(createElement(AudienceOwnership))
  check("one neutral grey for every card: no violet light, no lilac card", /\.panel \{[^}]*background: #f4f4f5;/.test(css) && !/radial-gradient|\.violet|\.stage/.test(css) && !/s\.violet|s\.stage/.test(src))
  check("what stays yours is a plain list, not pills", /<ul class="[^"]*yours[^"]*"[^>]*>(<li>[^<]+<\/li>){4}<\/ul>/.test(html) && !/rounded-full bg-white px-3 py-1\.5/.test(src))
  check("the composer, the list, the file and the tree are inert", /\.mock \{\s*pointer-events: none;/.test(css) && (src.match(/\$\{s\.mock\}/g) ?? []).length >= 5)
  check("still as the owner left it: Download every contact, real faces, the header's logo", html.includes("Download every contact, any time") && /people\/sofia\.webp/.test(html) && /StorelibLogo size=\{44\}/.test(src))
  check("no tabs in the section", !/role="tab"/.test(html))
}

console.log("\n── earnings, on the white sheet ──")
{
  const css = EARNINGS_STYLES.map((s) => s.css).join("\n")
  const html = renderToStaticMarkup(createElement(EarningsCalculator))
  const digital = EARN_KINDS.filter((k) => ["download", "course"].includes(k.as))
  check("half digital and community, half printed", EARN_KINDS.length === 6 && digital.length === 3 && EARN_KINDS.some((k) => k.id === "community") && ["tee", "hoodie", "cap"].every((id) => EARN_KINDS.some((k) => k.id === id)))
  check("six kinds as one radio group, one chosen", (html.match(/class="cme-kind"/g) ?? []).length === 6 && (html.match(/class="cme-kind"[^>]*|role="radio" aria-checked="true"[^>]*class="cme-kind"/g) ?? []).length >= 6 && /role="radiogroup" aria-label="What you sell" class="cme-kinds"/.test(html))
  check("a community costs nothing to make: the fee only", commerceMonth("download", 15, 5, "free").production === 0)
  const pill = rule(PILLS_CSS, ".smk-pill")
  const chosen = rule(PILLS_CSS, '.smk-pill[aria-selected="true"]')
  const kind = css.match(/\.cme-kind,\.cme-plan\{([^}]*)\}/)?.[1] ?? ""
  const on = css.match(/\.cme-kind\[aria-checked="true"\],\.cme-plan\[aria-checked="true"\]\{([^}]*)\}/)?.[1] ?? ""
  check("the tab family of Make the work: the same pill, height, grey and type", ["height:44px", "border-radius:999px", "color:#616161", "font:500 15px/1"].every((d) => pill.includes(d) && kind.includes(d)))
  check("the same chosen state: a white pill with a hairline", chosen.length > 0 && on === chosen)
  check("the same grey track", /\.cme-kinds\{[^}]*background:#f1f1f1;box-shadow:inset 0 0 0 1px #e6e6e6\}/.test(css) && /\.cme-plans\{[^}]*border-radius:999px;background:#f1f1f1;box-shadow:inset 0 0 0 1px #e6e6e6\}/.test(css))
  check("the plan's terms are one line under the switch", html.includes("$0 a month · 5% + $0.25 a sale") && (html.match(/class="cme-plan"/g) ?? []).length === 2)
  check("hover only where a pointer hovers; a focus ring; a reduced motion path", /@media \(hover:hover\) and \(pointer:fine\)\{\.cme-kind:hover/.test(css) && /\.cme-kind:focus-visible,\.cme-plan:focus-visible\{outline:2px solid/.test(css) && /prefers-reduced-motion:reduce\)\{[\s\S]*\.cme-kind,\.cme-plan/.test(css))
}

console.log("\n── pricing and the app ──")
{
  const home = renderToStaticMarkup(createElement(PricingSection, { editorial: true, hideDetailsLink: true }))
  const page = renderToStaticMarkup(createElement(PricingSection, {}))
  check("pricing is white on the home page, with no rules above and below", /<section data-story-section="pricing" class="bg-white py-20 sm:py-24" id="pricing">/.test(home))
  check("/pricing keeps its own ground", /<section class="py-20 sm:py-24 bg-\[#f8f9fa\] border-y border-\[#eef0f2\]" id="pricing">/.test(page))
  const app = renderToStaticMarkup(createElement(AppAnywhere))
  check("the app: no white ring on the purple ground, the short line kept", !/ring-white/.test(app) && app.includes("Your sales, orders and visitors on your phone, wherever you are."))
  check("the terminal is a picture", /\.ait-term\{[^}]*pointer-events:none/.test(read(`${DIR}/ai-tools-section.tsx`)))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
