/**
 * ===========================================================================
 *  HOME, LANDING ROUND 7: THE LOWER SECTIONS, AS THE OWNER ASKED
 * ===========================================================================
 *   analytics  the reports are one near-black panel of six even cells, not
 *              white pills; nothing purple on the purple sheet (heading
 *              accent, muted line, share bars, the light behind the
 *              engines); "Ready for Google and AI search" slides one strip
 *              by one transform, eased, the text never scaled.
 *   dots       the field on the purple and under the closing call is an
 *              even grid with a slow current of light flowing through it
 *              by itself and a light that glides after the mouse; neutral
 *              white on the purple; one canvas, DPR capped, paused off
 *              screen, still under reduced motion.
 *   earnings   no "After Storelib's 5% + $0.25 ... Stripe's card processing
 *              fee is separate." line; the photograph a little wider.
 *   audience   Contacts plays growth chart, then Synced with, then Export,
 *              in one fixed box, one attribute a turn; five new faces.
 *   width      every section here in the page's one width (--home-edge,
 *              --home-max), headings set in by --home-head-inset.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AudienceOwnership, AUDIENCE_PEOPLE, AUDIENCE_SCENES, AUDIENCE_SCENE_MS } from "@/components/marketing/home/audience-ownership"
import { AnalyticsShowcase } from "@/components/marketing/home/analytics-showcase"
import { SellEverywhereMap, SELL_EVERYWHERE_STYLES } from "@/components/marketing/home/sell-everywhere-map"
import { EarningsCalculator, EARNINGS_STYLES } from "@/components/marketing/home/earnings-calculator"
import { AiToolsSection, AI_TOOLS_STYLES } from "@/components/marketing/home/ai-tools-section"
import { DOT_FIELD_CSS, DOT_FIELD_MAX_DPR, DOT_FIELD_TONES, dotFieldFlow, dotFieldPoints } from "@/components/marketing/home/dot-field"

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
const BANNED_SAMPLES = /sourdough|weeknight pasta|golden hour|wheel throwing|drawing basics|saturday run club|dust & tape|elena ruiz|payout|\bfans?\b/i
/** Any violet or lilac written as a colour: the brand purples and their light tints. */
const PURPLE = /#(8b5cf6|7c3aed|6d28d9|5b21b6|a78bfa|c4b5fd|ddd6fe|ede9fe|8b7cf6|cdc2f7)\b|rgba\((139, ?124, ?246|196, ?181, ?253|167, ?139, ?250|221, ?214, ?254|237, ?233, ?254|91, ?33, ?182)/i

console.log("\n── analytics: other shapes, nothing purple on the purple ──")
{
  const src = read(`${DIR}/analytics-showcase.tsx`)
  const css = read(`${DIR}/analytics-showcase.module.css`)
  const html = renderToStaticMarkup(createElement(AnalyticsShowcase))
  const words = text(html)
  check("six reports as even tiles, three across, two on a phone", (html.match(/<li class="[^"]*report[^"]*"/g) ?? []).length === 6 && /\.reports \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);[^}]*gap: 8px;/.test(css) && /@media \(max-width: 479px\) \{\s*\.reports \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/.test(css))
  /* Changed on purpose (landing round 8): the owner asked for the tiles white glass, not black; still square-ish, no icons. */
  check("no pills: the cells are white glass, square-ish, no icons", /\.report \{[^}]*border-radius: 12px;[^}]*background: linear-gradient\(180deg, rgba\(255, 255, 255,/.test(css) && !/\.report \{[^}]*border-radius: 999px/.test(css) && !/linear-gradient\(180deg, rgba\(255, 255, 255, 0\.98\)/.test(css) && !/lucide-react/.test(src))
  check("nothing purple in the section's colours", !PURPLE.test(css) && !PURPLE.test(src), (css + src).match(PURPLE))
  check("the heading's accent white and the line under the title neutral here", /\.section :global\(\.story-heading\) \{\s*--story-accent: #fff;/.test(css) && /\.section \{\s*--band-muted: #dddce3;/.test(css) && /\$\{s\.section\}/.test(src))
  check("the engines: one strip, three sets, moved by one custom property, no React state", /const STRIP = \[\.\.\.ENGINES, \.\.\.ENGINES, \.\.\.ENGINES\]/.test(src) && /el\.style\.setProperty\("--pos"/.test(src) && !/useState/.test(src) && (html.match(/class="[^"]*strip[^"]*"/g) ?? []).length === 1)
  check("the strip moves by transform alone, eased in and out, never scaling its text", /\.strip \{[^}]*transform: translate3d\(calc\(var\(--pos, 5\) \* var\(--step\) \* -1\), 0, 0\);[^}]*transition: transform 1000ms cubic-bezier\(0\.65, 0, 0\.35, 1\);/.test(css) && !/scale\(0\.84\)/.test(css) && !/\.engine \{[^}]*transition/.test(css))
  check("the jump back one set is unseen: no transition, then on", /\.strip\[data-snap\] \{\s*transition: none;/.test(css) && /pos\.current -= EN/.test(src))
  check("the names brighten in the middle through a mask that does not move", /\.engines \{[^}]*mask-image: linear-gradient\(90deg, transparent 0, rgba\(0, 0, 0, 0\.28\) 24%, #000 42%, #000 58%/.test(css))
  check("still under reduced motion and off screen", /if \(!el \|\| !live \|\| reduced\) return/.test(src) && /prefers-reduced-motion: reduce\) \{\s*\.globe canvas,\s*\.strip \{\s*transition: none;/.test(css))
  check("every engine named for a screen reader", words.includes("Read by Google, ChatGPT, Claude, Perplexity, Gemini."))
  check("in the page's one width, the headings set in", /<div className="home-wrap">/.test(src) && /\.inset \{\s*padding-left: var\(--home-head-inset, 0px\);/.test(css) && !/max-w-\[1400px\]/.test(src))
  check("no banned words", !BANNED.test(words) && !BANNED_SAMPLES.test(words))
}

console.log("\n── the dot field: even, flowing, following the mouse ──")
{
  const src = read(`${DIR}/dot-field.tsx`)
  const page = read("app/(storelib)/(marketing)/page.tsx")
  const cta = read(`${DIR}/final-cta.tsx`)
  const pts = dotFieldPoints(1200, 600, 18)
  const cols = Math.floor(1200 / 18) + 1
  const rows = Math.floor(600 / 18) + 1
  check("an even grid, centred: every point of it, the same margin both sides", pts.length / 4 === cols * rows && Math.abs(pts[0] - (1200 - pts[(cols - 1) * 4])) < 0.001 && Math.abs(pts[4] - pts[0] - 18) < 0.001)
  const flows = [0, 4000, 9000].map((t) => dotFieldFlow(300, 200, t))
  check("a current of its own: the flow at a point changes with time, within 0..1", new Set(flows.map((f) => f.toFixed(3))).size === 3 && flows.every((f) => f >= 0 && f <= 1), flows)
  // Changed on purpose (landing round 8): the closing call's dots a little more visible (dark 0.19 / 0.46), the purple unchanged.
  check("subtle, and neutral white on the purple", DOT_FIELD_TONES.purple.rgb === "255,255,255" && DOT_FIELD_TONES.purple.rest <= 0.12 && DOT_FIELD_TONES.purple.lit <= 0.32 && DOT_FIELD_TONES.dark.rest <= 0.2 && DOT_FIELD_TONES.dark.lit <= 0.48)
  check("follows the mouse with a lerp, wanders by itself without one", /lightX \+= \(tx - lightX\) \* k/.test(src) && /pointerType !== "mouse"/.test(src) && /Math\.sin\(t \* 0\.00011\)/.test(src))
  check("one canvas at no more than 1.5 device pixels per CSS pixel", DOT_FIELD_MAX_DPR === 1.5 && /Math\.min\(DOT_FIELD_MAX_DPR/.test(src) && /<canvas ref=\{canvasRef\}/.test(src))
  // Changed on purpose (landing round 8): the light wanders on its own now, so it draws at up to 60 a second whenever it runs (at 30 it stepped).
  check("at most 60 frames a second, evenly", /if \(last && t - last < 12\) return/.test(src) && /waves\[j\] = points\[i\] \* 0\.0052/.test(src))
  check("paused off screen and in a hidden tab, one still frame under reduced motion, no state, no layout read in the loop", /IntersectionObserver/.test(src) && /visibilitychange/.test(src) && /&& !reduced/.test(src) && !/useState/.test(src) && !/getBoundingClientRect/.test(src.slice(src.indexOf("const draw"), src.indexOf("const resize"))))
  check("on the purple sheet, a little sparser there, and under the closing call", /<DotField tone="purple" fade="bottom" gap=\{22\}/.test(page) && /<DotField fade="close" \/>/.test(cta)) // Changed on purpose (landing round 8): the closing call's field fades out before its foot.
  check("the field keeps its CSS: behind, no pointer, no CSS animation", /\.dotf\{position:absolute;inset:0;z-index:-1;[^}]*pointer-events:none/.test(DOT_FIELD_CSS) && !/@keyframes/.test(DOT_FIELD_CSS))
  check("the closing call in the page's one width", /padding:clamp\(88px,10vw,152px\) var\(--home-edge,/.test(cta))
}

console.log("\n── earnings: no fee line, a wider photograph ──")
{
  const src = read(`${DIR}/earnings-calculator.tsx`)
  const css = EARNINGS_STYLES.map((s) => s.css).join("\n")
  const html = renderToStaticMarkup(createElement(EarningsCalculator))
  const words = text(html)
  check("the line is gone", !/card processing fee is separate/.test(words) && !/After Storelib/.test(words) && !/cme-note/.test(html + css) && !/FREE_TERMS/.test(src))
  check("the photograph's column wider from 1280px (.82 of 2, was .62)", /@media \(min-width:1280px\)\{\s*\.cme-card\{grid-template-columns:minmax\(0,\.82fr\) minmax\(0,2fr\)\}/.test(css))
  check("the photograph still local, sized and lazy", /<div class="cme-photo"><img src="\/home\/earnings\/night-flash-tee-640\.webp"[^>]*sizes="\(min-width: 1280px\) 28vw/.test(html))
  check("in the page's one width, beating the old 1400px column, its heading set in", /\.cme-wrap,\[data-landing-story\] \.cme>\.cme-wrap\{[^}]*max-width:var\(--home-max,2020px\);[^}]*padding:0 var\(--home-edge,/.test(css) && /\.cme \.story-section-heading\{padding-left:var\(--home-head-inset,0px\)\}/.test(css))
}

console.log("\n── audience: growth, synced with, export; real faces ──")
{
  const src = read(`${DIR}/audience-ownership.tsx`)
  const css = read(`${DIR}/audience-ownership.module.css`)
  const html = renderToStaticMarkup(createElement(AudienceOwnership))
  const words = text(html)
  check("three scenes in the owner's order", AUDIENCE_SCENES.join("|") === "Growth|Synced with|Export" && html.indexOf('data-i="0"') < html.indexOf('data-i="1"') && html.indexOf('data-i="1"') < html.indexOf('data-i="2"'))
  check("the chart first: one smooth line and its area", /<path d="M0 88\.0C/.test(html) && (html.match(/<path d="M0 88/g) ?? []).length === 2)
  check("then Synced with, the five platforms in their own marks", words.includes("Synced with") && ["Klaviyo", "Omnisend", "Brevo", "MailerLite", "Kit"].every((n) => words.includes(n)))
  check("then the export, a CSV writing then Downloaded", words.includes("contacts.csv") && words.includes("Downloaded") && words.includes("Export CSV"))
  check("one box of a fixed height; the scenes stacked in one cell", /\.scenes \{\s*display: grid;\s*height: 158px;/.test(css) && /\.scene \{\s*grid-area: 1 \/ 1;/.test(css))
  check("the turn is one attribute on the box, no React state", /el\.dataset\.scene = String\(i\)/.test(src) && !/useState/.test(src) && /AUDIENCE_SCENE_MS/.test(src) && AUDIENCE_SCENE_MS >= 3000)
  check("only opacity and transform change in the stage", ![...css.matchAll(/transition:([^;]+);/g)].some((m) => /width|height|left|top|margin|padding|stroke-dash|filter|box-shadow/.test(m[1])))
  check("plays only on screen with the tab visible; still under reduced motion", /usePlatformSection\(root/.test(src) && /if \(!el \|\| !live \|\| reduced\) return/.test(src) && /@media \(prefers-reduced-motion: reduce\)/.test(css))
  const faces = AUDIENCE_PEOPLE.map((p) => p.photo)
  check("five new faces, small webp files, none of the old stock profiles", faces.length === 5 && faces.every((f) => existsSync(join(root, "public/home/audience/people", `${f}.webp`)) && statSync(join(root, "public/home/audience/people", `${f}.webp`)).size < 40 * 1024) && !faces.some((f) => ["sofia", "jonah", "aiko", "liam", "priya"].includes(f)), faces)
  check("the old portraits are gone from the folder", ["sofia", "jonah", "aiko", "liam", "priya", "amara", "ines", "leo"].every((f) => !existsSync(join(root, "public/home/audience/people", `${f}.webp`))))
  check("in the page's one width, the words set in", /className=\{`\$\{s\.grid\} home-wrap`\}/.test(src) && /\.words \{\s*padding-left: var\(--home-head-inset, 0px\);/.test(css))
  check("no banned words or samples", !BANNED.test(words) && !BANNED_SAMPLES.test(words))
}

console.log("\n── the map and the AI tools: the one width ──")
{
  const map = SELL_EVERYWHERE_STYLES.map((s) => s.css).join("\n")
  const ai = AI_TOOLS_STYLES.map((s) => s.css).join("\n")
  const mapHtml = renderToStaticMarkup(createElement(SellEverywhereMap))
  const aiHtml = renderToStaticMarkup(createElement(AiToolsSection))
  check("map: in the one width, its heading set in", /\.cmm-wrap,\[data-landing-story\] \.cmm>\.cmm-wrap\{[^}]*max-width:var\(--home-max,2020px\);[^}]*padding:0 var\(--home-edge,/.test(map) && /\.cmm-head\{[^}]*padding-left:var\(--home-head-inset,0px\)\}/.test(map) && /class="cmm-wrap"/.test(mapHtml))
  check("map: nothing purple on the purple sheet", !PURPLE.test(map) && /\[data-band\] \.cmm \.story-heading\{--story-accent:#fff\}/.test(map), map.match(PURPLE))
  check("AI tools: in the one width", /\.ait-wrap,\[data-landing-story\] \.ait>\.ait-wrap\{[^}]*max-width:var\(--home-max,2020px\);[^}]*padding:0 var\(--home-edge,/.test(ai) && /class="ait-wrap"/.test(aiHtml))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
