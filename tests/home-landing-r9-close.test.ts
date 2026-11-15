/**
 * LANDING ROUND 9, THE CLOSE: pricing, the questions, the footer's logo.
 *
 * The owner looked at the page after round 8:
 *
 *   pricing   "get rid of the Monthly / Yearly pill there; monthly or yearly
 *             is chosen when I pay": the home page's cards show monthly
 *             prices and no pill, /pricing and the app keep theirs.
 *             "Don't make Scale green": Scale is a warm bronze, apart from
 *             the black Free card and the violet Pro card.
 *             "the covers more darkened, the grain and contrast increased
 *             just a little bit": one step each.
 *   faq       "actually like the reference": a centred heading, one centred
 *             column of light grey rows with a plus at the right, small gaps,
 *             opening smoothly, and a small line with /faq and the help
 *             center under them.
 *   footer    "a white outline version, not the colourful purple one": the
 *             same mark as white line art, in the marketing footer only.
 *
 * Run: node scripts/run-push-tests.mjs (or the single-suite runner).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { PlanCards, type PlanCardAction } from "@/components/billing/plan-cards"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { STORELIB_S_PATH } from "@/components/storelib-mark"
import { FaqSection } from "@/components/marketing/faq-section"
import { MarketingFooter } from "@/components/marketing/footer"

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

/** Hue in degrees and saturation (0 to 1) of a #rrggbb colour. */
function hueSat(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (!d) return { h: 0, s: 0, l }
  const h = (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60
  return { h, s: d / (1 - Math.abs(2 * l - 1)), l }
}

console.log("\n── pricing: no pill on the home page ──")
{
  const pricing = read("components/marketing/pricing-section.tsx")
  const cards = read("components/billing/plan-cards.tsx")
  check("the home page's section asks for no pill, /pricing does not", /hideInterval=\{editorial\}/.test(pricing) && !/data-plan-interval-row/.test(pricing))
  /* Changed on purpose (pricing round 5): the heading row and the pill row are drawn apart now, the pill row skipped when hidden. */
  check("without the pill the cards are monthly, whatever was held", /const interval = hideInterval \? "monthly" : controlled \?\? own/.test(cards) && /\{hideInterval \? null : \(/.test(cards))
  const actions = { free: { label: "Start free", href: "/signup" }, growth: { label: "Get Pro", href: "/signup" }, pro: { label: "Get Scale", href: "/signup" } } as Record<"free" | "growth" | "pro", PlanCardAction>
  const home = renderToStaticMarkup(createElement(PlanCards, { actions, hideInterval: true, interval: "yearly" }))
  const full = renderToStaticMarkup(createElement(PlanCards, { actions }))
  check("drawn: no radio group, no pill row, three cards", !/role="radiogroup"|data-plan-interval-row|data-interval-option/.test(home) && (home.match(/data-plan-card="/g) ?? []).length === 3)
  check("every other surface still draws the pill with both options", /role="radiogroup"/.test(full) && /data-interval-option="monthly"/.test(full) && /data-interval-option="yearly"/.test(full))
  /* Changed on purpose (pricing round 5): the cards sit inside their grey ground now, so the comparison starts there. */
  check("the cards are otherwise the same markup", home.includes(full.slice(full.indexOf("<div data-plan-ground"), full.indexOf("<div data-plan-ground") + 400)))
}

console.log("\n── pricing: Scale's colour, the covers ──")
{
  /* Changed on purpose (pricing round 5): the $99 plan is named Pro now and the cards have no covers (the owner's reference picture: white cards, a grey panel, one purple button on the middle card), so the checks on the covers' colours, dimming and grain are retired; tests/pricing-cards-r5.test.ts pins the new cards. */
  const cards = read("components/billing/plan-cards.tsx")
  check("no cover pictures, colours or grain left on the cards", !/PLAN_ART|PLAN_GRAIN|feTurbulence|hue-rotate/.test(cards))
}

console.log("\n── questions: a centred column of grey rows ──")
{
  const src = read("components/marketing/faq-section.tsx")
  const home = renderToStaticMarkup(createElement(FaqSection, { editorial: true }))
  const pricing = renderToStaticMarkup(createElement(FaqSection))
  check("the heading is the owner's words, centred", /Frequently[\s\S]{0,400}asked[\s\S]{0,400}questions/.test(home) && !/Good questions|Clear answers/.test(src) && /story-section-heading !mx-auto !mb-9 w-full !text-center/.test(src))
  check("one centred column inside the page's width", /home-wrap !max-w-\[var\(--home-max\)\] !px-\[var\(--home-edge\)\]/.test(src) && /data-faq-column="" class="!mx-auto w-full !max-w-\[880px\] !px-0"/.test(home))
  check("the grey is on each row, with a small gap between them", /\.faq-rows\{display:grid;gap:6px;border-top:0\}/.test(src) && /\.faq-rows \.faq-item\{border-bottom:0;border-radius:10px;background:#f5f5f6\}/.test(src) && /style="background:transparent"/.test(home))
  const rows = (home.match(/class="faq-item"/g) ?? []).length
  check("seven rows, each a real button in a heading with a plus", rows === 7 && (home.match(/<h3 class="m-0"><button type="button" class="faq-q" aria-expanded="false" aria-controls="faq-a-\d" id="faq-q-\d">/g) ?? []).length === 7 && (home.match(/<span class="faq-mark" aria-hidden="true"><\/span>/g) ?? []).length === 7)
  check("each answer is a region named by its question, out of reach while closed", (home.match(/<div class="faq-a" id="faq-a-\d" role="region" aria-labelledby="faq-q-\d" inert="">/g) ?? []).length === 7 && /inert=\{!isOpen\}/.test(src))
  check("opens by its grid row, the plus turning into a minus: nothing measured", /\.faq-a\{display:grid;grid-template-rows:0fr;transition:grid-template-rows \.4s/.test(src) && /\.faq-item\[data-open\] \.faq-a\{grid-template-rows:1fr\}/.test(src) && /\.faq-q\[aria-expanded="true"\] \.faq-mark::after\{transform:rotate\(0deg\)\}/.test(src) && !/getBoundingClientRect|scrollHeight|offsetHeight|useEffect|useRef/.test(src))
  check("no transition on the rows' own colour or box, only the answer's row, the mark and the words", !/\.faq-rows[^{}]*\{[^}]*transition/.test(src))
  check("reduced motion: it simply opens", /@media \(prefers-reduced-motion:reduce\)\{\.faq-q,\.faq-mark::before,\.faq-mark::after,\.faq-a,\.faq-a p\{transition:none\}\}/.test(src))
  check("the closing line links the real FAQ page and the help center", /More questions\? Browse <a href="\/faq">all FAQs<\/a> or visit the <a href="(https:\/\/help\.storelib\.com|\/help)">help center<\/a>\./.test(home) && /href=\{publicHelpUrl\(\)\}/.test(src), /<p class="faq-more">[\s\S]*?<\/p>/.exec(home)?.[0])
  check("/pricing keeps its own list: no grey rows, no closing line", !/faq-rows|faq-more|data-faq-column/.test(pricing) && /class="faq-list flex-1 min-w-0"/.test(pricing) && (pricing.match(/class="faq-item"/g) ?? []).length === 7)
  check("no banned words or em dashes in the section", !BANNED.test(src))
}

console.log("\n── footer: the white outline mark ──")
{
  const footerSrc = read("components/marketing/footer.tsx")
  const logoSrc = read("components/brand/storelib-logo.tsx")
  const footer = renderToStaticMarkup(createElement(MarketingFooter))
  const mark = renderToStaticMarkup(createElement(StorelibLogo, { size: 40, variant: "outline" }))
  check("the footer asks the one logo component for its outline", /<StorelibLogo size=\{40\} variant="outline" \/>/.test(footerSrc) && (footerSrc.match(/<StorelibLogo\b/g) ?? []).length === 1)
  check("drawn as an inline SVG: no picture, no violet", /<svg[^>]*data-storelib-logo="outline"/.test(footer) && !/<img[^>]*data-storelib-logo/.test(footer) && !/storelib-logo-v2|#7b5cf|#8b5cf6|#8B56FA/i.test(mark))
  check("line art in white: no fill, a white stroke", /fill="none"/.test(mark) && /stroke="currentColor"/.test(mark) && /color:#fff/.test(mark) && !/fill="(?!none)/.test(mark))
  check("the S is the mark's own curves, inside a rounded square", mark.includes(`d="${STORELIB_S_PATH}"`) && /<rect [^>]*rx="35"/.test(mark) && /viewBox="0 0 200 200"/.test(mark))
  check("40px square, named Storelib for a reader", /width="40" height="40"/.test(mark) && /role="img" aria-label="Storelib"/.test(mark))
  check("the wordmark beside it is white", /<span class="text-xl font-bold text-white">Storelib<\/span>/.test(footer))
  check("every other place still draws the picture", /variant = "picture"/.test(logoSrc) && /src=\{STORELIB_LOGO\}/.test(logoSrc) && /<img[^>]*data-storelib-logo=""/.test(renderToStaticMarkup(createElement(StorelibLogo, { size: 32 }))))
  const others = ["components/marketing/header.tsx", "components/storefront/seller-footer.tsx"].filter((f) => { try { return /variant="outline"/.test(read(f)) } catch { return false } })
  check("the outline is the marketing footer's alone", others.length === 0, others)
}

console.log("\n── registered ──")
{
  const runner = read("scripts/run-push-tests.mjs")
  check("this suite runs on push, after round 8's", /"tests\/home-landing-r8-frame\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r9-close\.test\.ts",/.test(runner))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
