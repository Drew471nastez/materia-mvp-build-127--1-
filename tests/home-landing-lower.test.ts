/**
 * ===========================================================================
 *  HOME, LANDING ROUND: THE LOWER SECTIONS, AS THE OWNER ASKED
 * ===========================================================================
 * components/marketing/home/
 *   audience-ownership.tsx    "Your audience belongs to you."
 *   analytics-showcase.tsx    "Know what's working, as it happens."
 *   sell-everywhere-map.tsx   "Your store never closes. Sell anywhere."
 *   integrations-section.tsx  "Connect your favorite apps"
 *
 * What the owner asked, pinned:
 *   audience      the composer smaller; subscribers with real faces, not
 *                 initials; the email platforms in their own marks;
 *                 "Download every contact, any time" as it was.
 *   analytics     kept and smaller: a dark globe card (section 3's engine,
 *                 read only), an invented creator, top places by country, an
 *                 SEO · GEO · AEO card (a LUT pack since round 4), and the
 *                 engines (Google, ChatGPT, Claude, Perplexity, Gemini)
 *                 taking turns, paused off screen; no "fans".
 *   map           no "fans" in the heading; a shorter card; a finer, accurate
 *                 dotted map; markers on land and apart; the price changes
 *                 with the country (round 4: the product and the button's
 *                 language change too).
 *   integrations  two rows, tiles a fifth smaller, no tile ever on screen
 *                 twice, no light that follows the pointer, shadows with
 *                 room, crisp marks (vectors or icons at 3x), the current
 *                 Stripe wordmark, Apple Pay with the Apple logo.
 *   all four      cards a pixel less round; keyframes on transform and
 *                 opacity only.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AudienceOwnership } from "@/components/marketing/home/audience-ownership"
import { AnalyticsShowcase } from "@/components/marketing/home/analytics-showcase"
import { SellEverywhereMap, SELL_COUNTRIES, SELL_PAST_ORDERS, SELL_MAP, sellMapLand } from "@/components/marketing/home/sell-everywhere-map"
import { IntegrationsSection, INTEGRATION_ROW_SIZES, INTEGRATION_STEP_SHARE, PLATFORM_INTEGRATION_APPS } from "@/components/marketing/home/integrations-section"

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
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ")
const keyframeProps = (css: string) => [...css.matchAll(/@keyframes\s+[\w-]+\s*\{([\s\S]*?)\n\}/g)].flatMap((m) => [...m[1].matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1]))

console.log("\n── audience ──")
{
  const src = read(`${DIR}/audience-ownership.tsx`)
  const css = read(`${DIR}/audience-ownership.module.css`)
  const html = renderToStaticMarkup(createElement(AudienceOwnership))
  const words = text(html)
  const faces = [...src.matchAll(/photo: "([a-z]+)"/g)].map((m) => m[1])
  /* Changed on purpose (landing round 5): the section is one Contacts picture now: five people, each a real face. */
  check("every contact shown has a real face, a small webp under public/home/audience/people", faces.length === 5 && faces.every((f) => existsSync(join(root, "public/home/audience/people", `${f}.webp`)) && statSync(join(root, "public/home/audience/people", `${f}.webp`)).size < 12 * 1024), faces)
  check("no initials in place of a face", !/initials\(|tint:/.test(src) && /\$\{IMG\}\/\$\{p\.photo\}\.webp/.test(src))
  /* Changed on purpose (landing round 4): the owner asked for a smaller, lighter audience section; the sync card is a plain row now, the platforms in their own marks without the Storelib logo above them. */
  check("the sync row shows the email platforms in their own marks, not the old tree", /EMAIL_PLATFORMS\.map/.test(src) && !/STORELIB_S_PATH/.test(src) && !/s\.tree/.test(src))
  /* Changed on purpose (landing round 5): the owner found the composer too big and asked for one compact picture; the composer is gone. */
  check("no composer: one compact picture", !/Composer|s\.bleed/.test(src) && !/\.bleed/.test(css))
  check("Download every contact, any time, as it was", /Download every contact, any time/.test(words) && /Export CSV/.test(words))  /* Changed on purpose (landing round 9): the owner asked for half the words; the line under each point is gone. */  /* Changed on purpose (landing round 5): the CSV is the picture's Export CSV button now. */
  /* Changed on purpose (landing round 5): one card, the Contacts picture, at 20px. */
  check("one card, a 20px corner", /\.mock \{[^}]*border-radius: 20px;/.test(css) && !/border-radius: 28px/.test(css))
  check("no fans in the words", !/\bfans?\b/i.test(words))
}

console.log("\n── analytics ──")
{
  const src = read(`${DIR}/analytics-showcase.tsx`)
  const css = read(`${DIR}/analytics-showcase.module.css`)
  const globe = read(`${DIR}/analytics-globe.tsx`)
  const html = renderToStaticMarkup(createElement(AnalyticsShowcase))
  const words = text(html)
  check("the section stays on the home page", /<LazyAnalyticsShowcase \/>/.test(read("app/(storelib)/(marketing)/page.tsx")) && /LazyAnalyticsShowcase = lazySection/.test(read(`${DIR}/lazy-sections.tsx`)))
  check("its heading, and a title about visitors, not fans", words.includes("See where your visitors are") && !/\bfans?\b/i.test(words))
  check("an invented creator with a real portrait, no celebrity", /Nora Vik/.test(words) && existsSync(join(root, "public/home/analytics/nora.webp")) && !/Ice Spice|icespice|verified/i.test(words))
  check("top places by country (Storelib keeps no cities)", /Top places/.test(words) && !/New York|Los Angeles|\bCities\b/.test(words))
  check("the globe is section 3's engine and worker, its files untouched", /createGlobeEngine/.test(globe) && /EVERYTHING_GLOBE_WORKER_SOURCE/.test(globe) && /const held = new WeakMap/.test(globe))
  /* Changed on purpose (landing round 4): the owner banned the sourdough example; the search is for a cinematic LUT pack. */
  check("SEO · GEO · AEO, a LUT pack search, no sourdough, example addresses, no vases, no em dash", /SEO · GEO · AEO/.test(words) && /cinematic LUT pack for Premiere Pro/.test(words) && !/sourdough/i.test(words) && /\.example/.test(words) && !/vase/i.test(words) && !/—/.test(words))
  /* Changed on purpose (landing round 4): new stills for the LUT pack search. */
  check("the search thumbnails are local webp files", ["lut-fog", "lut-neon", "lut-autumn"].every((f) => existsSync(join(root, "public/home/analytics", `${f}.webp`)) && html.includes(`/home/analytics/${f}.webp`)))
  const marks = read(`${DIR}/engine-marks.tsx`)
  check("five engines in their own vector marks", ["GoogleG", "OpenAIMark", "ClaudeMark", "PerplexityMark", "GeminiMark"].every((n) => new RegExp(`export function ${n}\\(`).test(marks)) && ["Google", "ChatGPT", "Claude", "Perplexity", "Gemini"].every((e) => src.includes(`name: "${e}"`)))
/* Changed on purpose (landing round 7): smoother: one strip slides by one transform, the names fade through a still mask. */
  check("the switcher turns only while live, never under reduced motion, by transform", /if \(!el \|\| !live \|\| reduced\) return/.test(src) && /window\.clearInterval/.test(src) && /\.strip \{[^}]*transition: transform 1000ms/.test(css)) /* Changed on purpose (landing round 5): the switcher is the one from before round 4 again, as the owner asked. */
  check("keyframes animate only transform and opacity", keyframeProps(css).every((p) => p === "transform" || p === "opacity"), keyframeProps(css))
  check("cards a pixel less round (27px, 21px on a phone)", /border-radius: 27px/.test(css) && /border-radius: 21px/.test(css))
  // Changed on purpose (landing round 10): 400px at most, 44svh on a short laptop screen (352px at 800 high), never under 340.
  check("smaller: two fixed rows of at most 400px, no dashboard, no tabbed cards", /\.globeCard,\s*\.fixed \{\s*height: clamp\(340px, 44svh, 400px\);/.test(css) && !/Total Revenue|Conversion Rate|Previous period/.test(words))
}

console.log("\n── map ──")
{
  const src = read(`${DIR}/sell-everywhere-map.tsx`)
  const html = renderToStaticMarkup(createElement(SellEverywhereMap))
  const words = text(html)
  check("the heading has no fans", words.includes("Your store never closes. Sell anywhere.") && !/\bfans?\b/i.test(words))
  /* Changed on purpose (landing round 4): the owner reversed the first round's ask; the button now speaks each country's language (tests/home-landing-lower4.test.ts). */
  check("one buy button, its words per country", (html.match(/class="cmm-buy">/g) ?? []).length === 1 && SELL_COUNTRIES.every((c) => html.includes(`lang="${c.lang}"`)))
  check("the price changes with the country, one per country", SELL_COUNTRIES.every((c) => html.includes(`>${c.total}</span>`)) && new Set(SELL_COUNTRIES.map((c) => c.total)).size === SELL_COUNTRIES.length)
  check("a shorter card: 500px on a wide screen (it was 680)", /\.cmm-card\{[^}]*height:500px/.test(src) && !/height:680px/.test(src))
  check("a finer map: 240 x 90 cells of 1.5 degrees", SELL_MAP.cols === 240 && SELL_MAP.rows === 90 && SELL_MAP.step === 1.5)
  const cells = [...SELL_COUNTRIES.map((c) => c.cell), ...SELL_PAST_ORDERS]
  check("every marker sits on a land dot", cells.every(([c, r]) => sellMapLand(c, r)), cells.filter(([c, r]) => !sellMapLand(c, r)))
  let closest = Infinity
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) closest = Math.min(closest, Math.hypot(cells[i][0] - cells[j][0], cells[i][1] - cells[j][1]))
  check("no two markers closer than 7 cells (they never touch)", closest >= 7, closest)
  const far = SELL_COUNTRIES.every((c, i) => {
    const n = SELL_COUNTRIES[(i + 1) % SELL_COUNTRIES.length]
    return Math.abs(c.cell[0] - n.cell[0]) >= 40
  })
  check("one country and the next are far apart, so a New order and the last Shipped never meet", far)
  const css = src.split("const MAP_CSS = `")[1] ?? ""
  check("keyframes animate only transform and opacity", [...css.matchAll(/@keyframes [\w-]+\{([^@]*?)\}\}/g)].every((m) => !/(width|height|top|left|margin|background|box-shadow|filter)\s*:/.test(m[1])))
  check("loops run only while live, and stop under reduced motion", /\[data-commerce-live\] \.cmm-pin\[data-on\] \.cmm-ring\{animation-play-state:running\}/.test(css) && /prefers-reduced-motion:reduce/.test(css))
  check("a pixel less round (31px)", /\.cmm-card\{[^}]*border-radius:31px/.test(css))
}

console.log("\n── integrations ──")
{
  const src = read(`${DIR}/integrations-section.tsx`)
  const css = read(`${DIR}/integrations-section.module.css`)
  const html = renderToStaticMarkup(createElement(IntegrationsSection))
  check("two rows", INTEGRATION_ROW_SIZES.length === 2 && (html.match(/class="[^"]*\brow\b/g) ?? []).length >= 2)
  /* Changed on purpose (landing round 7): the owner wanted the icons full width, so past 1600px they grow a little (116px at most). */
  check("tiles a fifth smaller: 90px, 67px on a phone", /--tile: clamp\(90px, 5\.6vw, 116px\);/.test(css) && /--tile: 67px;/.test(css))
  /* Changed on purpose (landing round 7): the rows are seen across the whole screen, so a tile and its gap take at least 1/10.5 of it; a set of n tiles is (n - 1) / 10.5 screens plus a tile. */
  check("no tile is ever seen twice: each row's set is wider than the screen plus one tile", INTEGRATION_ROW_SIZES.every((n) => (n - 1) * INTEGRATION_STEP_SHARE >= 1) && /--gap: max\(20px, calc\(100vw \/ 10\.5 - var\(--tile\)\)\);/.test(css) && /--gap: max\(10px, calc\(100vw \/ 10\.5 - var\(--tile\)\)\);/.test(css) && /\[0, 1\]\.flatMap/.test(src) && /translate3d\(-50%, 0, 0\)/.test(css))
  check("every app once per set", new Set(PLATFORM_INTEGRATION_APPS.map((a) => a.name)).size === PLATFORM_INTEGRATION_APPS.length)
  check("no light follows the pointer (nothing to cut, nothing measured)", !/data-glow|data-spot|\.glow|\.spot|pointermove|getBoundingClientRect/.test(src + css))
  check("the shadows have room and the fades run the rows' full height", /padding-block: var\(--room\)/.test(css) && /\.rows::before,\s*\.rows::after \{[\s\S]*?top: 0;\s*bottom: 0;/.test(css) && /padding-block: calc\(var\(--room\)/.test(css))
  const marks = read(`${DIR}/integration-marks.tsx`)
  check("Apple Pay is Apple's mark (the Apple logo and Pay), Google Pay has the four colour G", /export function ApplePayMark/.test(marks) && /export function GooglePayMark/.test(marks) && /#EA4335/.test(marks) && /mark: ApplePayMark/.test(src) && /mark: GooglePayMark/.test(src))
  check("Stripe is the current wordmark, not the old S icon", /mark: StripeMark/.test(src) && !/SiStripe/.test(src))
  // Changed on purpose (landing round 8): TikTok drawn as TikTok draws it (integration-marks TikTokMark): cyan and red notes, white where they overlap.
  check("TikTok is its own mark with its cyan and red", /mark: TikTokMark/.test(src) && /#25F4EE/.test(read("components/marketing/home/integration-marks.tsx")) && /#FE2C55/.test(read("components/marketing/home/integration-marks.tsx")))
  const files = PLATFORM_INTEGRATION_APPS.map((a) => a.logo).filter((l): l is string => !!l)
  check("no small raster mark: each file is a vector or an icon under public/home/apps", files.every((f) => f.endsWith(".svg") || f.startsWith("/home/apps/")), files)
  check("the app icons are at three times the tile or more (336px webp)", files.filter((f) => f.endsWith(".webp")).every((f) => {
    const b = readFileSync(join(root, "public", f))
    /* VP8 / VP8L / VP8X: the width sits at a fixed offset of each. */
    const kind = b.toString("ascii", 12, 16)
    const w = kind === "VP8 " ? b.readUInt16LE(26) & 0x3fff : kind === "VP8L" ? 1 + (((b[22] << 8) | b[21]) & 0x3fff) : 1 + b.readUIntLE(24, 3)
    return w >= 270
  }))
  check("keyframes animate only transform and opacity", keyframeProps(css).every((p) => p === "transform" || p === "opacity"), keyframeProps(css))
  check("a reduced motion path", /prefers-reduced-motion: reduce/.test(css))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
