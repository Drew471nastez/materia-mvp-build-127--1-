/**
 * LANDING ROUND 11, THE CLOSE: pricing cards, the apps, the possibilities.
 *
 * The owner looked at the page after round 10:
 *
 *   pricing   "you increased the contrast of the cover images too much":
 *             back to a hair over 1. "I don't like the brown one for the
 *             Scale card": a steel blue, apart from Free's black and Pro's
 *             violet, not green, not pink. "too much depth": a short, light
 *             shadow. "actual filled check icons, smooth and clean": a
 *             filled ink circle with a white check on the public cards.
 *   apps      "reduce the horizontal gap a little more": 1/12 of the screen
 *             per tile and gap, not 1/10.5. "add Instagram, Spotify, Apple
 *             Music, YouTube and Meta": four new tiles, and Meta's own
 *             gradient mark on the Meta Pixel tile.
 *   ideas     "don't add ceramics, or totes; more digital products like
 *             before", with photos that clearly show each thing.
 *
 * Run: node scripts/run-push-tests.mjs (or the single-suite runner).
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { IntegrationsSection, INTEGRATION_ROW_SIZES, INTEGRATION_STEP_SHARE, PLATFORM_INTEGRATION_APPS } from "@/components/marketing/home/integrations-section"
import { AppleMusicTile, InstagramTile, MetaMark } from "@/components/marketing/home/integration-marks"
import { MARQUEE_ROWS, ProductMarquee } from "@/components/marketing/product-marquee"

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
const BANNED = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform your)\b|—/i

/** Hue in degrees, saturation and lightness (0 to 1) of a #rrggbb colour. */
function hsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (!d) return { h: 0, s: 0, l }
  const h = (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60
  return { h, s: d / (1 - Math.abs(2 * l - 1)), l }
}
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

console.log("\n── pricing: handed to pricing round 5 ──")
{
  /* Changed on purpose (pricing round 5): the owner had the plan cards redrawn from a reference picture (white cards, a grey panel, Grow and Pro names, no cover pictures), so this round's checks on the covers' contrast, Scale's colour and the filled ticks are retired. tests/pricing-cards-r5.test.ts pins the cards now. */
  const cards = read("components/billing/plan-cards.tsx")
  check("the cards no longer draw cover pictures or grain", !/PLAN_ART|PLAN_GRAIN|feTurbulence|hue-rotate/.test(cards))
  check("the deep 36px drop is still gone", !/0_36px_72px/.test(cards))
}

console.log("\n── apps: five asked for, a smaller gap ──")
{
  const src = read("components/marketing/home/integrations-section.tsx")
  const css = read("components/marketing/home/integrations-section.module.css")
  const names = PLATFORM_INTEGRATION_APPS.map((a) => a.name)
  check("Instagram, Spotify, Apple Music and YouTube are on the page, once each", ["Instagram", "Spotify", "Apple Music", "YouTube"].every((n) => names.filter((x) => x === n).length === 1), names)
  check("Meta is on the page once, as Meta's own mark", names.filter((n) => /Meta/.test(n)).length === 1 && /\{ name: "Meta Pixel", bg: "#ffffff", mark: MetaMark, scale: 0\.62 \}/.test(src) && !/\/integrations\/meta\.svg/.test(src))
  check("each new app is a real thing a one page embeds", /spotify/.test(read("lib/onepage/embed-address.ts")) && /appleMusic/.test(read("lib/onepage/embed-address.ts")) && /youtube/.test(read("lib/onepage/embed-address.ts")) && existsSync(join(root, "lib/onepage/instagram-profile.ts")))
  check("Spotify: the green mark on black; YouTube: the red play button on white", /\{ name: "Spotify", bg: "#000000", icon: SiSpotify, color: "#1ed760", scale: 0\.62 \}/.test(src) && /\{ name: "YouTube", bg: "#ffffff", icon: SiYoutube, color: "#ff0000", scale: 0\.66 \}/.test(src))
  const ig = renderToStaticMarkup(createElement(InstagramTile))
  check("Instagram: its glow from the bottom left (yellow, orange, magenta, purple, blue) and the white camera", /<radialGradient id="ig[^"]+" cx="0.28" cy="1.08"/.test(ig) && ["#FFDD55", "#FF543E", "#E1306C", "#C837AB", "#4F5BD5"].every((c) => ig.includes(c)) && /<rect x="23" y="23" width="54" height="54" rx="15.5"><\/rect>/.test(ig) && /<circle cx="50" cy="50" r="12.8"><\/circle>/.test(ig) && /stroke="#FFFFFF"/.test(ig))
  const am = renderToStaticMarkup(createElement(AppleMusicTile))
  check("Apple Music: Apple's red, lighter at the top, and the white note", /stop-color="#FB5C74"/.test(am) && /stop-color="#FA233B"/.test(am) && /<path fill="#FFFFFF" d="M17.571 10.114v5.712/.test(am))
  const meta = renderToStaticMarkup(createElement(MetaMark))
  check("Meta: the infinity mark in Meta's blue gradient", /stop-color="#0064E1"/.test(meta) && /stop-color="#0082FB"/.test(meta) && /fill="url\(#meta[^"]+\)" d="M6.915 4.03/.test(meta))
  const two = renderToStaticMarkup(createElement("div", null, createElement(InstagramTile), createElement(InstagramTile), createElement(MetaMark), createElement(MetaMark)))
  const ids = [...two.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])
  check("each drawing's gradient id is its own, since every tile is drawn twice", ids.length === 4 && new Set(ids).size === 4, ids)
  check("the gap: 1/12 of the screen per tile and gap (was 1/10.5), 8px least on a phone", INTEGRATION_STEP_SHARE === 1 / 15 && /--gap: max\(10px, calc\(100vw \/ 15 - var\(--tile\)\)\);/.test(css) && /--gap: max\(6px, calc\(100vw \/ 13 - var\(--tile\)\)\);/.test(css)) // Changed on purpose (landing round 12): the gap a little smaller again: 1/13 of the screen, 6px least on a phone; 14 tiles still make a screen. // Changed on purpose (landing round 14): the gap about half on a computer, 1/15 of the screen, 10px least; a phone keeps 1/13 and 6px.
  check("and still no icon seen twice: each set is more than a screen plus a tile", INTEGRATION_ROW_SIZES.every((n) => (n - 1) * INTEGRATION_STEP_SHARE >= 1), INTEGRATION_ROW_SIZES)
  const html = renderToStaticMarkup(createElement(IntegrationsSection))
  check("each new app a named icon", ["Instagram", "Spotify", "Apple Music", "YouTube"].every((n) => html.includes(`role="img" aria-label="${n}"`)))
  check("no banned words or em dashes", ![src, css, read("components/marketing/home/integration-marks.tsx")].some((s) => BANNED.test(s)))
}

console.log("\n── possibilities: digital again, real photos ──")
{
  const src = read("components/marketing/product-marquee.tsx")
  const items = MARQUEE_ROWS.flatMap((r) => r.items)
  const labels = items.map((i) => i.label)
  check("no ceramics, totes, candles or jewelry", !labels.some((l) => /ceramic|tote|candle|jewel/i.test(l)) && !/ceramics/i.test(src.replace(/\/\*[\s\S]*?\*\//g, "")))
  const digital = ["Presets", "Online courses", "Sample packs", "Ebooks", "Communities", "LUTs", "Coaching", "Fonts", "Music", "Templates", "Podcasts", "Procreate brushes", "Stock footage", "Workshops", "Event tickets"]
  check("mostly digital, as before round 4", digital.every((d) => labels.includes(d)) && labels.length === 18, labels)
  check("a few things that ship: merch, art prints, hoodies", ["Merch", "Art prints", "Hoodies"].every((p) => labels.includes(p)))
  check("never memberships (they live in communities)", !labels.some((l) => /membership/i.test(l)))
  check("nine in each row, no label or photo twice", MARQUEE_ROWS.every((r) => r.items.length === 9) && new Set(labels).size === 18 && new Set(items.map((i) => i.photo)).size === 18)
  const size = (f: string) => statSync(join(root, "public/home/possibilities", `${f}.webp`)).size
  check("every photo on disk, a small WebP", items.every((i) => existsSync(join(root, "public/home/possibilities", `${i.photo}.webp`)) && size(i.photo) < 20_000), items.map((i) => [i.photo, existsSync(join(root, "public/home/possibilities", `${i.photo}.webp`)) ? size(i.photo) : 0]))
  check("the dropped photos are gone from public/", ["candles", "ceramics", "jewelry", "totes", "vinyl"].every((f) => !existsSync(join(root, "public/home/possibilities", `${f}.webp`))))
  const html = renderToStaticMarkup(createElement(ProductMarquee))
  check("drawn three times each, the photos sized and decoded off the main thread", (html.match(/<img src="\/home\/possibilities\/[a-z]+\.webp" alt="" width="256" height="256" decoding="async"/g) ?? []).length === 54)
  check("no banned words or em dashes", !BANNED.test(src))
}

console.log("\n── registered ──")
{
  const runner = read("scripts/run-push-tests.mjs")
  check("this suite runs on push, after round 10's", /"tests\/home-landing-r10-checkout\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r11-close\.test\.ts",/.test(runner))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
