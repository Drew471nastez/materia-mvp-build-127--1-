/**
 * ===========================================================================
 *  HOME, LANDING ROUND 5: THE LOWER SECTIONS, AS THE OWNER ASKED
 * ===========================================================================
 *   audience   simpler, shorter, one compact picture (Contacts) beside three
 *              plain rows; nothing in it moves, so nothing glitches.
 *   AI tools   just the terminal again, as before round 4: no page preview.
 *   analytics  white report pills with a little depth; a quieter SEO grid;
 *              the engine switcher as before round 4 with one very quiet
 *              light turning around it.
 *   map        physical and digital products; no Example pill.
 *   earnings   the kinds are even tiles, not pills, and never cut;
 *              "Example" is a quiet word.
 *   close      "what you make" lighter; the dot field is one canvas whose
 *              light follows the mouse, cheap and paused off screen.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AudienceOwnership, AUDIENCE_PEOPLE } from "@/components/marketing/home/audience-ownership"
import { AnalyticsShowcase } from "@/components/marketing/home/analytics-showcase"
import { SellEverywhereMap, SELL_COUNTRIES, SELL_KIND_NOTE } from "@/components/marketing/home/sell-everywhere-map"
import { EarningsCalculator, EARNINGS_STYLES } from "@/components/marketing/home/earnings-calculator"
import { AiToolsSection, AI_TOOLS_STYLES } from "@/components/marketing/home/ai-tools-section"
import { DOT_FIELD_CSS, DOT_FIELD_MAX_DPR, DOT_FIELD_TONES, dotFieldPoints } from "@/components/marketing/home/dot-field"

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
const BANNED_SAMPLES = /sourdough|weeknight pasta|golden hour|wheel throwing|drawing basics|saturday run club|dust & tape|elena ruiz|payout|\bfans?\b/i

console.log("\n── audience: one picture, nothing moving ──")
{
  const src = read(`${DIR}/audience-ownership.tsx`)
  const css = read(`${DIR}/audience-ownership.module.css`)
  const html = renderToStaticMarkup(createElement(AudienceOwnership))
  const words = text(html)
  check("one picture: Contacts, with its count and Export CSV", (src.match(/className=\{s\.mock\}/g) ?? []).length === 1 && words.includes("Contacts") && words.includes("Export CSV") && words.includes("18,240"))
  check("five people, each a real face and a door Contacts names", AUDIENCE_PEOPLE.length === 5 && AUDIENCE_PEOPLE.every((p) => existsSync(join(root, "public/home/audience/people", `${p.photo}.webp`))) && ["OnePage", "Checkout", "Free download", "Website"].every((v) => AUDIENCE_PEOPLE.some((p) => p.via === v)))
  check("the five email platforms in their own marks", /EMAIL_PLATFORMS\.map/.test(src) && (html.match(/class="[^"]*mark[^"]*" title="/g) ?? []).length === 5)
  check("three plain rows beside it, no composer", (html.match(/<li><h3>/g) ?? []).length === 3 && !/Composer|Send test|Subject/.test(src))
  check("no timers, loops, reveals or state", !/useState|useEffect|setInterval|setTimeout|m\.reveal|m\.loop|usePlatformSection/.test(src))
  check("its CSS animates nothing", !/@keyframes|transition|animation/.test(css))
  check("words: no banned word, sample or em dash", !BANNED.test(words) && !BANNED_SAMPLES.test(words))
}

console.log("\n── AI tools: just the terminal ──")
{
  const css = AI_TOOLS_STYLES.map((s) => s.css).join("\n")
  const html = renderToStaticMarkup(createElement(AiToolsSection))
  check("no page preview beside the log", !/ait-pv|ait-site|ait-panes|<img /.test(html + css))
  check("the card as before round 4: words beside the terminal from 1024px", /@media \(min-width:1024px\)\{\s*\.ait-card\{grid-template-columns:minmax\(0,\.92fr\) minmax\(0,1\.08fr\)\}/.test(css))
  check("still starts part written, its words unselectable", /\.ait-line,\.ait-cover\{animation-delay:-3\.7s\}/.test(css) && /\.ait-term\{[^}]*user-select:none/.test(css))
}

console.log("\n── analytics ──")
{
  const src = read(`${DIR}/analytics-showcase.tsx`)
  const css = read(`${DIR}/analytics-showcase.module.css`)
  const html = renderToStaticMarkup(createElement(AnalyticsShowcase))
  check("the reports are white pills with depth, no backdrop blur", /\.report \{[^}]*background: linear-gradient\(180deg, rgba\(255, 255, 255, 0\.98\)/.test(css) && !/backdrop-filter/.test(css))
  check("the SEO grid is fainter and slower", /\.dots \{[^}]*rgba\(255, 255, 255, 0\.09\)[^}]*animation: dotsDrift 16s/.test(css))
  check("the engine switcher as before round 4: no buttons, no light per engine", !/engineTab|\.glow|aria-pressed/.test(html + css) && (html.match(/data-rel="/g) ?? []).length === 5)
  check("one very quiet light turning around it, by transform, paused off screen", /\$\{s\.orbit\} \$\{m\.loop\}/.test(src) && /\.orbit \{[^}]*rgba\(139, 124, 246, 0\.22\)/.test(css) && /@keyframes orbit \{\s*to \{\s*transform: rotate\(360deg\);/.test(css))
}

console.log("\n── the map: physical and digital ──")
{
  const src = read(`${DIR}/sell-everywhere-map.tsx`)
  const html = renderToStaticMarkup(createElement(SellEverywhereMap))
  const digital = SELL_COUNTRIES.filter((c) => c.kind === "digital")
  check("three digital and three physical products, alternating", digital.length === 3 && SELL_COUNTRIES.every((c, i) => c.kind === (i % 2 ? "digital" : "physical")))
  check("each says how it arrives", SELL_COUNTRIES.every((c) => html.includes(SELL_KIND_NOTE[c.kind])) && SELL_KIND_NOTE.digital === "Instant download")
  check("the new pictures are local webp files under 60 KB", ["pines-lut-pack", "drone-course", "wild-camp-ebook"].every((f) => existsSync(join(root, "public/home/sell-map", `${f}.webp`)) && statSync(join(root, "public/home/sell-map", `${f}.webp`)).size < 60_000))
  check("no Example pill", !/cmm-tag|>Example</.test(src + html))
}

console.log("\n── earnings: tiles, not pills ──")
{
  const css = EARNINGS_STYLES.map((s) => s.css).join("\n")
  const html = renderToStaticMarkup(createElement(EarningsCalculator))
  const kind = css.match(/\.cme-kind\{([^}]*)\}/)?.[1] ?? ""
  check("even tiles: 12px corners, one height, three across, two on a narrow phone", /border-radius:12px/.test(kind) && /height:48px/.test(kind) && /\.cme-kinds\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\);gap:8px\}/.test(css) && /@media \(max-width:479px\)\{\.cme-kinds\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/.test(css))
  check("no pill shape on the kinds or their track", !/border-radius:(99|999)px|border-radius:26px/.test(kind + (css.match(/\.cme-kinds\{([^}]*)\}/)?.[1] ?? "")))
  check("Example is a quiet word", /class="cme-example">Example</.test(html) && !/cme-pill/.test(html + css))
}

console.log("\n── the close and the dot field ──")
{
  const cta = read(`${DIR}/final-cta.tsx`)
  const src = read(`${DIR}/dot-field.tsx`)
  check('"what you make" a little lighter', /\.fcta-title em\{font-style:normal;color:#b6b3c1\}/.test(cta))
  check("one canvas, the device pixel ratio capped at 1.5", DOT_FIELD_MAX_DPR === 1.5 && /<canvas ref=\{canvasRef\}/.test(src))
  const pts = dotFieldPoints(1200, 600, 18)
  const grid = Math.ceil(1200 / 18 + 1) * Math.ceil(600 / 18 + 1)
  check("scattered and thinned in patches, not a full grid", pts.length / 4 > grid * 0.25 && pts.length / 4 < grid * 0.85, { dots: pts.length / 4, grid })
  check("subtle: resting dots at about a seventh, lit under a half", Object.values(DOT_FIELD_TONES).every((t) => t.rest <= 0.16 && t.lit <= 0.45))
  check("the earnings tile drops its icon before its word is cut", /@container \(max-width:136px\)\{\.cme-kind-i\{display:none\}/.test(EARNINGS_STYLES.map((s) => s.css).join("")))
  check("the pointer is followed with a lerp in the loop, a mouse only", /lightX \+= \(tx - lightX\) \* k/.test(src) && /pointerType !== "mouse"/.test(src))
  check("no React state, no layout read in the loop", !/useState/.test(src) && !/getBoundingClientRect/.test(src.slice(src.indexOf("const draw"), src.indexOf("const resize"))))
  check("paused off screen and in a hidden tab; one still frame under reduced motion", /IntersectionObserver/.test(src) && /visibilitychange/.test(src) && /cancelAnimationFrame/.test(src) && /&& !reduced/.test(src))
  check("a calm drift on touch, at 30 frames a second", /if \(!fine && dt < 30\) return/.test(src))
  check("its props kept: gap, fade, tone, className, style", /gap = 18,\s*fade = "edges",\s*tone = "dark",\s*className,\s*style,/.test(src) && /\.dotf\{position:absolute;inset:0;z-index:-1;[^}]*pointer-events:none/.test(DOT_FIELD_CSS))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
