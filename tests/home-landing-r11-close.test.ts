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
import { PLAN_ART, PlanCards, type PlanCardAction } from "@/components/billing/plan-cards"
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
const buttonHex = (id: keyof typeof PLAN_ART) => /bg-\[(#[0-9a-f]{6})\]/.exec(PLAN_ART[id].button)?.[1] ?? ""
const num = (f: string, name: string) => Number(new RegExp(`${name}\\(([\\d.]+)\\)`).exec(f)?.[1] ?? NaN)

console.log("\n── pricing: natural covers ──")
{
  const all = Object.values(PLAN_ART)
  check("every cover's contrast a hair over 1, no longer 1.2 and up", all.every((a) => num(a.filter, "contrast") > 1 && num(a.filter, "contrast") <= 1.06), all.map((a) => a.filter))
  check("still dimmed for the white words: brightness between 0.5 and 0.8", all.every((a) => num(a.filter, "brightness") >= 0.5 && num(a.filter, "brightness") <= 0.8))
  check("Free and Pro written out", PLAN_ART.free.filter === "brightness(0.78) contrast(1.04)" && PLAN_ART.growth.filter === "brightness(0.54) contrast(1.05) saturate(1.05)")
  check("the grain left as it was", all.every((a) => a.grain === 0.08))
}

console.log("\n── pricing: Scale is steel blue ──")
{
  const scale = PLAN_ART.pro
  const hexes = [...Object.values(scale).join(" ").matchAll(/#[0-9a-f]{6}/g)].map((m) => m[0])
  const hues = hexes.map(hsl)
  check("nothing on Scale is brown, green, teal or pink", hues.every((c) => c.s < 0.12 || (c.h >= 200 && c.h <= 230)), { hexes, hues })
  check("the old bronze is gone", !/#8a5a24|#3a2a17|#1c130a|hue-rotate\(148deg\)/.test(Object.values(scale).join(" ")))
  const [free, pro, sc] = [buttonHex("free"), buttonHex("growth"), buttonHex("pro")].map(hsl)
  const apart = Math.min(Math.abs(sc.h - pro.h), 360 - Math.abs(sc.h - pro.h))
  check("a blue of its own: at least 30 degrees from Pro's violet, quieter than it, lighter than Free's black", apart >= 30 && sc.s < pro.s && sc.s > 0.3 && free.s < 0.1 && sc.l > free.l + 0.12, { free, pro, sc, apart })
  const white = (1.05) / (lum(buttonHex("pro")) + 0.05)
  check("white words on Scale's button at 4.5:1 or better", white >= 4.5, white)
  check("the cover turned from Pro's indigo toward blue, its saturation held down", /^hue-rotate\(-38deg\) saturate\(0\.62\) brightness\(0\.56\) contrast\(1\.05\)$/.test(scale.filter))
}

console.log("\n── pricing: lighter depth, filled checks ──")
{
  const cards = read("components/billing/plan-cards.tsx")
  check("the deep 36px drop is gone", !/0_36px_72px/.test(cards))
  const shadow = /bg-white shadow-\[([^\]]+)\] ring-1/.exec(cards)?.[1] ?? ""
  const alphas = [...shadow.matchAll(/rgba\(16,24,40,([\d.]+)\)/g)].map((m) => Number(m[1]))
  const offsets = [...shadow.matchAll(/0_(\d+)px_(\d+)px/g)].map((m) => Number(m[1]))
  check("a short, light shadow: no layer darker than 0.16, none more than 12px down", alphas.length === 2 && alphas.every((a) => a <= 0.16) && offsets.every((o) => o <= 12), { shadow })
  const actions = { free: { label: "Start free", href: "/signup" }, growth: { label: "Get Pro", href: "/signup" }, pro: { label: "Get Scale", href: "/signup" } } as Record<"free" | "growth" | "pro", PlanCardAction>
  const pub = renderToStaticMarkup(createElement(PlanCards, { actions, tick: "ink", hideInterval: true }))
  const app = renderToStaticMarkup(createElement(PlanCards, { actions }))
  const ticks = pub.match(/<svg viewBox="0 0 20 20" class="mt-px h-\[18px\] w-\[18px\] shrink-0 text-\[#18181b\]" aria-hidden="true" data-plan-tick="filled"><circle cx="10" cy="10" r="10" fill="currentColor"><\/circle><path d="[^"]+" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><\/path><\/svg>/g) ?? []
  const lines = (pub.match(/<li class="flex items-start gap-3/g) ?? []).length
  const crosses = (pub.match(/Not included:/g) ?? []).length
  check("every included line on the public cards has a filled ink check", ticks.length > 0 && ticks.length === lines - crosses, { ticks: ticks.length, lines, crosses })
  check("one ink for every plan, no plan colour on the public checks", !/data-plan-tick="filled"[^>]*text-\[#5a43ee\]/.test(pub) && !/data-plan-tick="ink"/.test(pub))
  check("the app's surfaces (Billing, onboarding, upgrade) keep their thin plan checks", !/data-plan-tick/.test(app) && /lucide-check/.test(app))
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
  check("the gap: 1/12 of the screen per tile and gap (was 1/10.5), 8px least on a phone", INTEGRATION_STEP_SHARE === 1 / 12 && /--gap: max\(20px, calc\(100vw \/ 12 - var\(--tile\)\)\);/.test(css) && /--gap: max\(8px, calc\(100vw \/ 12 - var\(--tile\)\)\);/.test(css))
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
