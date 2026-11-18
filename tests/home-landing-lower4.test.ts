/**
 * ===========================================================================
 *  HOME, LANDING ROUND 4: THE LOWER SECTIONS, AS THE OWNER ASKED
 * ===========================================================================
 *   audience      smaller and lighter: one card (the composer) and three
 *                 plain rows beside it, no card per idea.
 *   analytics     no sourdough: the search is for a LUT pack; a quiet dot
 *                 grid on the SEO card, which stays dark; the engine switcher
 *                 plays by itself AND can be pressed, with a soft light in
 *                 the engine's colours changing behind it; fewer report
 *                 chips, lit from above; the globe's cards say each place's
 *                 share and stack on a phone.
 *   map           the product changes with the country (real photographs of
 *                 physical products) and the Buy now button speaks that
 *                 country's language; on a phone the map is drawn larger and
 *                 glides to the country in turn; a dot grid on the card.
 *   integrations  fades a fifth narrower and lighter, the strip wider; no
 *                 bump under the pointer, nothing square behind a turn.
 *   earnings      no Free and Pro switch, no black result card: one white
 *                 panel with the kinds, the two sliders, the total, three
 *                 figures and Start earning; the photograph kept.
 *   AI tools      the terminal starts about a quarter written, a preview
 *                 fills in beside it, its words cannot be selected; the card
 *                 is the page's container width with the words above.
 *   widths        every section here in the page's one container: 1400px
 *                 wide with the page's gutter inside it.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AudienceOwnership } from "@/components/marketing/home/audience-ownership"
import { AnalyticsShowcase } from "@/components/marketing/home/analytics-showcase"
import { SellEverywhereMap, SELL_COUNTRIES, SELL_MAP, sellMapPan } from "@/components/marketing/home/sell-everywhere-map"
import { IntegrationsSection } from "@/components/marketing/home/integrations-section"
import { EarningsCalculator, EARNINGS_STYLES } from "@/components/marketing/home/earnings-calculator"
import { AiToolsSection, AI_TOOLS_SCRIPT, AI_TOOLS_STYLES, AI_TOOLS_START_S } from "@/components/marketing/home/ai-tools-section"

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
const BANNED = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform(s|ing)?)\b|passive income|—/i
/** Every property a CSS file's keyframes set. */
const keyframeProps = (css: string) => [...css.matchAll(/@keyframes [\w-]+\s*\{([\s\S]*?\})\s*\}/g)].flatMap((m) => [...m[1].matchAll(/([a-z-]+)\s*:/g)].map((p) => p[1]))
/** Sample content the owner banned this round. */
const BANNED_SAMPLES = /sourdough|weeknight pasta|golden hour|wheel throwing|drawing basics|saturday run club|dust & tape|elena ruiz|hemi walker|lowtide|payout/i

/* Changed on purpose (landing round 15): the owner asked for the audience section as it was before round 14, so audience-ownership.tsx and its stylesheet are f248e7d0a^'s again and the checks round 14 changed here are put back as they were (the four step sequence is gone; tests/home-landing-r14-purple.test.ts). */
console.log("\n── audience: smaller and lighter ──")
{
  const src = read(`${DIR}/audience-ownership.tsx`)
  const css = read(`${DIR}/audience-ownership.module.css`)
  const html = renderToStaticMarkup(createElement(AudienceOwnership))
  const words = text(html)
  /* Changed on purpose (landing round 5): the owner asked for a simpler, shorter section with one compact picture: Contacts, beside three plain rows. */
  check("one picture only: Contacts; the rest are plain rows", (src.match(/\$\{s\.mock\}/g) ?? []).length === 1 && (html.match(/<li>[^<]+<\/li>/g) ?? []).length === 3)  /* Changed on purpose (landing round 9): each point is one short line, no heading over a sentence. */
  check("the rows are hairlines, not cards", /\.points li \{[^}]*border-top: 1px solid #ececf0;/.test(css) && !/\.points li \{[^}]*background/.test(css))
  check("the old tree, list and pill row are gone", !/s\.tree|s\.list|s\.yours|StorelibLogo/.test(src) && !/\.tree|\.yours|\.list\[/.test(css))
/* Changed on purpose (landing round 7): the owner asked for a chart, then Synced with, then the export, autoplaying smooth and clean: one attribute a turn, no state, no keyframes, no reveal. */
  check("calm: no React state, no keyframes, no reveal; the scenes turn by one attribute", /* Changed on purpose (landing round 9): one strip on one CSS clock (two keyframes, transform and opacity), no timer at all. */ !/useState|setTimeout|setInterval|m\.reveal|m\.loop/.test(src) && (css.match(/@keyframes/g) ?? []).length === 2)  /* Changed on purpose (landing round 5): the owner saw it glitch and flash while scrolling; it is drawn once and still. */
  check("the words the owner kept", /* Changed on purpose (landing round 9): half the words. */ ["Download every contact, any time", "Syncs with your email platform", "One list from every sign-up"].every((w) => words.includes(w)))  /* Changed on purpose (landing round 5): the composer and its figures are gone. */
/* Changed on purpose (landing round 7): every section in the page's one width (--home-edge, --home-max). */
  check("in the page's one width", /\$\{s\.grid\} home-wrap/.test(src) && !/max-w-\[1400px\]/.test(src))
  check("no banned words or samples", !BANNED.test(words) && !BANNED_SAMPLES.test(words))
}

console.log("\n── analytics ──")
{
  const src = read(`${DIR}/analytics-showcase.tsx`)
  const css = read(`${DIR}/analytics-showcase.module.css`)
  const html = renderToStaticMarkup(createElement(AnalyticsShowcase))
  const words = text(html)
  check("no sourdough anywhere: a LUT pack search, its stills local", !/sourdough/i.test(src + css) && words.includes("cinematic LUT pack for Premiere Pro") && ["lut-fog", "lut-neon", "lut-autumn"].every((f) => existsSync(join(root, "public/home/analytics", `${f}.webp`)) && statSync(join(root, "public/home/analytics", `${f}.webp`)).size < 60_000))
  check("the sourdough stills are gone from the repo", ["sourdough-loaf", "sourdough-crumb", "sourdough-rustic"].every((f) => !existsSync(join(root, "public/home/analytics", `${f}.webp`))))
  check("the SEO card stays a dark card, with a quieter dot grid drifting by transform", /function SearchCard[\s\S]*?\$\{s\.dark\}/.test(src) && /\.dots \{[^}]*radial-gradient\(rgba\(255, 255, 255, 0\.09\) 0\.9px/.test(css) && /@keyframes dotsDrift \{\s*from \{\s*transform:[^}]*\}\s*to \{\s*transform: translate3d\(22px, 22px, 0\);/.test(css) && /\$\{s\.dots\} \$\{m\.loop\}/.test(src))  /* Changed on purpose (landing round 5): the owner found the pattern too visible. */
  /* Changed on purpose (landing round 5): the owner asked for the engine switcher as it was before round 4: it plays by itself, no buttons. */
/* Changed on purpose (landing round 7): smoother: the names ride one strip moved by one transform, no React render per turn. */
  check("the switcher plays by itself: one strip of names, no buttons", (html.match(/class="[^"]*strip[^"]*"/g) ?? []).length === 1 && !/engineTab|aria-pressed/.test(html) && /el\.style\.setProperty\("--pos"/.test(src) && /\}, \[live, reduced\]\)/.test(src))
  check("nothing to press", !/const choose =|setPicks/.test(src))
  check("one very quiet light turns around it, by transform alone, while live", (html.match(/class="[^"]*orbit[^"]*"/g) ?? []).length === 1 && /\$\{s\.orbit\} \$\{m\.loop\}/.test(src) && /@keyframes orbit \{\s*to \{\s*transform: rotate\(360deg\);/.test(css) && !/\.glow/.test(css))  /* Changed on purpose (landing round 5): "the subtle clean gradients going around, very subtle". */
  check("no part of the card answers the pointer", /\.dark > \* \{\s*pointer-events: none;/.test(css) && !/pointer-events: auto/.test(css))
  check("fewer words around the reports: six chips, one short line", (html.match(/<li class="[^"]*report[^"]*"/g) ?? []).length === 6 && words.includes("Every visit and sale on your page and store, live.") && !/No setup, no extra app/.test(words))
/* Changed on purpose (landing round 7): not white pills, and nothing purple on the purple sheet. */
  /* Changed on purpose (landing round 8): white glass tiles on the purple, as the owner asked. */
  check("the chips are white glass tiles with a hairline", /\.report \{[^}]*border-radius: 12px;[^}]*background: linear-gradient\(180deg, rgba\(255, 255, 255,/.test(css))  /* Changed on purpose (landing round 5): white pills, as the owner asked. */
  check("top places show each one's share of the visitors, drawn by a static transform", (html.match(/class="[^"]*share[^"]*"/g) ?? []).length === 3 && /46%/.test(words) && /scaleX\(0\.458\)/.test(html))
  check("the creator is a colorist now, and her globe's arcs land in Oslo", words.includes("@noravik.grade") && /const HOME: \[number, number\] = \[59\.91, 10\.75\]/.test(read(`${DIR}/analytics-globe.tsx`)))
  check("on a phone the globe's cards stack full width", /@media \(max-width: 639px\) \{[\s\S]*?\.overlay \{[^}]*flex-direction: column;/.test(css))
  check("keyframes animate only transform and opacity", keyframeProps(css).every((p) => p === "transform" || p === "opacity"), keyframeProps(css))
  check("reduced motion stops the dots and the light", /prefers-reduced-motion: reduce\) \{[\s\S]*\.dots,\s*\.orbit \{\s*animation: none;/.test(css))
/* Changed on purpose (landing round 7): every section in the page's one width (--home-edge, --home-max). */
  check("in the page's one width", /<div className="home-wrap">/.test(src) && !/max-w-\[1400px\]/.test(src))
  check("no banned words or samples", !BANNED.test(words) && !BANNED_SAMPLES.test(words))
}

console.log("\n── the map ──")
{
  const src = read(`${DIR}/sell-everywhere-map.tsx`)
  const css = src.split("const MAP_CSS = `")[1] ?? ""
  const html = renderToStaticMarkup(createElement(SellEverywhereMap))
  check("a product per country, every one a local picture", SELL_COUNTRIES.length === 6 && new Set(SELL_COUNTRIES.map((c) => c.product)).size === 6 && SELL_COUNTRIES.every((c) => existsSync(join(root, "public/home/sell-map", c.photo)) && statSync(join(root, "public/home/sell-map", c.photo)).size < 60_000 && html.includes(`src="/home/sell-map/${c.photo}"`)))  /* Changed on purpose (landing round 5): physical and digital, as the owner asked. */
  check("one card in front at a time, its picture eased in once decoded", (html.match(/class="cmm-prod"[^>]*data-o="0"/g) ?? []).length === 1 && /\.cmm-photo img\{[^}]*opacity:0/.test(css) && /\.cmm-photo img\[data-ready\]\{opacity:1\}/.test(css)) // Changed on purpose (landing round 11): the products are a stack (tests/home-landing-r11-purple.test.ts).
  check("the button speaks the country's language, marked with lang", SELL_COUNTRIES.every((c) => html.includes(`lang="${c.lang}"`) && html.includes(`>${c.buy}</span>`)) && ["Jetzt kaufen", "今すぐ購入", "Acheter", "Buy now"].every((w) => SELL_COUNTRIES.some((c) => c.buy === w)))
  check("the country's language and its money: Germany in German and euros, Japan in Japanese and yen", SELL_COUNTRIES.some((c) => c.code === "DE" && c.buy === "Jetzt kaufen" && c.total.endsWith("€")) && SELL_COUNTRIES.some((c) => c.code === "JP" && c.lang === "ja" && c.total.startsWith("¥")))
  check("the order's words change one after the other (out, then in)", /\.cmm-swap span\[data-on\]\{opacity:1;transform:translate3d\(0,0,0\);transition:opacity \$\{MOVE - OUT\}ms \$\{SOFT\} \$\{OUT\}ms/.test(css)) // Changed on purpose (landing round 12): out in OUT, in after it, on the turn's one clock. Changed on purpose (landing round 11): the product's words travel on their own card; only the order pill swaps words.
  check("on a phone the map is drawn larger and glides to the country (one transform)", /\.cmm-map\{width:\$\{ZOOM \* 100\}%;transition:transform \$\{MOVE\}ms/.test(css) && /style=\{\{ transform: sellMapPanTransform\(SELL_COUNTRIES\[0\]\.cell\) \}\}/.test(src) && /map\.style\.transform = sellMapPanTransform\(/.test(src)) // Changed on purpose (landing round 12): the pan on the turn's one 1.1s clock. Changed on purpose (landing round 11): the pan is written straight on as the map's transform; the owner said on an iPhone the map no longer moved.
  const pans = SELL_COUNTRIES.map((c) => sellMapPan(c.cell))
  check("the pan never shows past the map's edges", pans.every((p) => parseFloat(p.x) <= 0 && parseFloat(p.x) >= -100 * (1 - 1 / 1.9) - 0.01 && parseFloat(p.y) <= 0), pans)
  check("a quiet dot grid on the dark card, drifting only while live", /\.cmm-grid\{[^}]*radial-gradient\(rgba\(255,255,255,\.13\) 1px/.test(css) && /\[data-commerce-live\] \.cmm-grid\{animation-play-state:running\}/.test(css) && /@keyframes cmm-grid\{from\{transform:translate3d\(0,0,0\)\}to\{transform:translate3d\(24px,24px,0\)\}\}/.test(css))
  check("reduced motion: nothing glides or fades", /prefers-reduced-motion:reduce\)\{[\s\S]*\.cmm-grid\{animation:none\}[\s\S]*\.cmm-prod,\.cmm-photo img,\.cmm-map\{transition:none!important\}/.test(css)) // Changed on purpose (landing round 11): the stack's cards and the pictures' ease in are stilled too.
  check("still the same accurate map", SELL_MAP.cols === 240 && SELL_MAP.rows === 90)
  check("no banned samples", !BANNED_SAMPLES.test(text(html)))
}

console.log("\n── integrations ──")
{
  const css = read(`${DIR}/integrations-section.module.css`)
  const src = read(`${DIR}/integrations-section.tsx`)
  const html = renderToStaticMarkup(createElement(IntegrationsSection))
  /* Changed on purpose (landing round 7): the owner wanted the icons full width, so there is no solid strip any more; each fade is only a short ramp at the screen's edge. */
  check("the fades short and light, at the screen's edges only", /width: clamp\(40px, 11vw, 220px\);/.test(css) && /rgba\(255, 255, 255, 0\.8\) 18%/.test(css) && !/0\.92\)/.test(css) && !/--solid/.test(css))
  check("no bump under the pointer: no lift, no shadow layer of the tile's own", !/\.tile:hover|\.tile::before|translate3d\(0, -4px, 0\)/.test(css))
  /* Changed on purpose (landing round 11 perf): the face has no backface-visibility: hidden any more; the turn goes 0 to 90 and -90 to 0 degrees, so its back is never shown, and the property made every icon a layer of its own. */
  check("nothing square behind a turning icon: only the rounded face turns, a hairline only round light icons", /\.inner \{[^}]*border-radius: 24%;/.test(css) && !/\.inner \{[^}]*backface-visibility/.test(css) && /\.inner\[data-light\]/.test(css) && /data-light=/.test(src) && (html.match(/data-light="true"/g) ?? []).length >= 8)
  // Changed on purpose (landing round 8): the owner found the flip delayed: 680ms, setting off at once.
  check("one smooth turn", /const TURN_MS = 680/.test(src) && /perspective\(700px\) rotateY\(90deg\)", offset: 0\.5/.test(src))
}

console.log("\n── earnings ──")
{
  const css = EARNINGS_STYLES.map((s) => s.css).join("\n")
  const src = read(`${DIR}/earnings-calculator.tsx`)
  const html = renderToStaticMarkup(createElement(EarningsCalculator))
  const words = text(html)
  check("no Free and Pro switch", !/cme-plan|role="radio"[^>]*>Pro</.test(html) && !/>Free<|>Pro</.test(html))
  check("no black Monthly revenue card", !/Monthly revenue/.test(words) && !/\.cme-out\{[^}]*background:#1/.test(css))
  check("one white panel: the kinds, two sliders, then the total, three figures and Start earning", /class="cme-panel"/.test(html) && (html.match(/type="range"/g) ?? []).length === 2 && words.includes("You keep each month") && (html.match(/<dt>/g) ?? []).length === 3 && /<a[^>]*href="\/signup"[^>]*>Start earning/.test(html))
/* Changed on purpose (landing round 7): the owner asked for the fee line under the figures to go. */
  check("no fee line under the figures", !/After Storelib/.test(words) && !/card processing fee/.test(words))
  check("the photograph kept", html.includes("/home/earnings/night-flash-tee-640.webp"))
/* Changed on purpose (landing round 7): every section in the page's one width (--home-edge, --home-max). */
  check("in the page's one width", /\.cme-wrap,\[data-landing-story\] \.cme>\.cme-wrap\{[^}]*max-width:var\(--home-max,2020px\)/.test(css) && /plan: CommercePlan/.test(src))
}

console.log("\n── your AI tools ──")
{
  const css = AI_TOOLS_STYLES.map((s) => s.css).join("\n")
  const html = renderToStaticMarkup(createElement(AiToolsSection))
  const shown = AI_TOOLS_SCRIPT.filter((l) => l.at <= AI_TOOLS_START_S - 0.32).length / AI_TOOLS_SCRIPT.length
  check("the terminal starts about a fifth to a third written", shown >= 0.2 && shown <= 0.34, shown)
  check("every part of the run shares the starting delay, set after the shorthands", new RegExp(`@keyframes ait-blink[^\\n]*\\n\\.ait-line,\\.ait-cover\\{animation-delay:-${AI_TOOLS_START_S}s\\}`).test(css))
  check("its words cannot be selected", /\.ait-term\{[^}]*user-select:none/.test(css))
  /* Changed on purpose (landing round 5): the owner asked for the terminal alone, as before round 4, with no page preview. */
  check("just the terminal: no page preview", !/ait-pv|ait-site|ait-panes/.test(html + css))
  check("the terminal runs only while live and stands finished under reduced motion", /\.ait-term\[data-live\] \.ait-line/.test(css) && /\.ait-line\{animation:none!important;opacity:1;transform:none\}/.test(css))
  check("no pictures in the terminal", !/<img /.test(html))
  check("the card as it was before round 4: the words beside the terminal from 1024px", /@media \(min-width:1024px\)\{\s*\.ait-card\{grid-template-columns:minmax\(0,\.92fr\) minmax\(0,1\.08fr\)\}/.test(css))
  check("keyframes move transform and opacity only", [...css.matchAll(/@keyframes ait-[\w-]+\{([\s\S]*?\})\}/g)].every((m) => !/(width|height|top|left|margin|padding|filter|clip|background)\s*:/.test(m[1])))
  check("no banned words", !BANNED.test(text(html)))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
