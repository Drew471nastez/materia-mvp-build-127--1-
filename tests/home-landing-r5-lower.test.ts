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
  check("one picture: Contacts, with its count and Export CSV", (src.match(/\$\{s\.mock\}/g) ?? []).length === 1 && words.includes("Contacts") && words.includes("Export CSV") && words.includes("18,240"))
  check("five people, each a real face and a door Contacts names", AUDIENCE_PEOPLE.length === 5 && AUDIENCE_PEOPLE.every((p) => existsSync(join(root, "public/home/audience/people", `${p.photo}.webp`))) && ["OnePage", "Checkout", "Free download", "Website"].every((v) => AUDIENCE_PEOPLE.some((p) => p.via === v)))
/* Changed on purpose (landing round 7): the platforms are the second scene of the picture now, each named under its mark. */
  check("the five email platforms in their own marks", /EMAIL_PLATFORMS\.map/.test(src) && (html.match(/<span class="[^"]*mark[^"]*"><svg/g) ?? []).length === 5)
  check("three plain rows beside it, no composer", (html.match(/<li><h3>/g) ?? []).length === 3 && !/Composer|Send test|Subject/.test(src))
/* Changed on purpose (landing round 7): the owner asked for a chart, then Synced with, then the export, autoplaying smooth and clean. It turns by one attribute, no state; only transitions on opacity and transform (tests/home-landing-r7-lower.test.ts). */
  check("no state, timeouts or reveals; one interval while on screen", !/useState|setTimeout|m\.reveal|m\.loop/.test(src) && /usePlatformSection/.test(src) && (src.match(/setInterval/g) ?? []).length === 1)
  check("its CSS has no keyframes", !/@keyframes|animation:/.test(css))
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
/* Changed on purpose (landing round 7): another shape than the white pills, nothing purple on the purple sheet. */
  /* Changed on purpose (landing round 8): white glass, as the owner asked; still no backdrop blur. */
  check("the reports are white glass tiles, no backdrop blur", /\.report \{[^}]*background: linear-gradient\(180deg, rgba\(255, 255, 255, 0\.1[0-9]\)[^}]*inset 0 1px 0 rgba\(255, 255, 255, 0\.3\)[^}]*color: #fff;/.test(css) && !/backdrop-filter/.test(css))
  check("the SEO grid is fainter and slower", /\.dots \{[^}]*rgba\(255, 255, 255, 0\.09\)[^}]*animation: dotsDrift 16s/.test(css))
/* Changed on purpose (landing round 7): smoother: one strip slides, no slots; the light behind it is neutral, nothing purple on the purple sheet. */
  check("the engine switcher: no buttons, no light per engine, one strip", !/engineTab|\.glow|aria-pressed/.test(html + css) && (html.match(/class="[^"]*strip[^"]*"/g) ?? []).length === 1)
  check("one very quiet light turning around it, by transform, paused off screen", /\$\{s\.orbit\} \$\{m\.loop\}/.test(src) && /\.orbit \{[^}]*rgba\(255, 255, 255, 0\.07\)/.test(css) && /@keyframes orbit \{\s*to \{\s*transform: rotate\(360deg\);/.test(css))
}

console.log("\n── the map: physical and digital ──")
{
  const src = read(`${DIR}/sell-everywhere-map.tsx`)
  const html = renderToStaticMarkup(createElement(SellEverywhereMap))
  const digital = SELL_COUNTRIES.filter((c) => c.kind === "digital")
  check("three digital and three physical products, alternating", digital.length === 3 && SELL_COUNTRIES.every((c, i) => c.kind === (i % 2 ? "digital" : "physical")))
  check("each says how it arrives", SELL_COUNTRIES.every((c) => html.includes(SELL_KIND_NOTE[c.kind])) && SELL_KIND_NOTE.digital === "Instant download")
  /* Changed on purpose (landing round 8): the owner swapped the e-book for a cookbook, the course for another, and the LUT pack for Cine Tones. */
  check("the new pictures are local webp files under 60 KB", ["cine-tones-lut-pack", "mobility-course", "ancestral-kitchen-cookbook"].every((f) => existsSync(join(root, "public/home/sell-map", `${f}.webp`)) && statSync(join(root, "public/home/sell-map", `${f}.webp`)).size < 60_000))
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
  /* Changed on purpose (landing round 7): the owner asked for the pattern "smooth, flowing ... clean": an even grid with a current of light flowing through it. */
  check("an even grid, every point of it", pts.length / 4 === (Math.floor(1200 / 18) + 1) * (Math.floor(600 / 18) + 1), { dots: pts.length / 4 })
  // Changed on purpose (landing round 8): the closing call's dots a little more visible, still under a fifth at rest and a half lit.
  check("subtle: resting dots under a fifth, lit under a half", Object.values(DOT_FIELD_TONES).every((t) => t.rest <= 0.2 && t.lit <= 0.48))
  check("the earnings tile drops its icon before its word is cut", /@container \(max-width:136px\)\{\.cme-kind-i\{display:none\}/.test(EARNINGS_STYLES.map((s) => s.css).join("")))
  check("the pointer is followed with a lerp in the loop, a mouse only", /lightX \+= \(tx - lightX\) \* k/.test(src) && /pointerType !== "mouse"/.test(src))
  check("no React state, no layout read in the loop", !/useState/.test(src) && !/getBoundingClientRect/.test(src.slice(src.indexOf("const draw"), src.indexOf("const resize"))))
  check("paused off screen and in a hidden tab; one still frame under reduced motion", /IntersectionObserver/.test(src) && /visibilitychange/.test(src) && /cancelAnimationFrame/.test(src) && /&& !reduced/.test(src))
/* Changed on purpose (landing round 7): the flow moves on every screen: 60 frames a second while a mouse moves the light, 30 when only the slow flow moves. */
  // Changed on purpose (landing round 8): 60 a second whenever it runs; the wandering light stepped at 30.
  check("at most 60 frames a second", /if \(last && t - last < 12\) return/.test(src))
  check("its props kept: gap, fade, tone, className, style", /gap = 18,\s*fade = "edges",\s*tone = "dark",\s*className,\s*style,/.test(src) && /\.dotf\{position:absolute;inset:0;z-index:-1;[^}]*pointer-events:none/.test(DOT_FIELD_CSS))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
