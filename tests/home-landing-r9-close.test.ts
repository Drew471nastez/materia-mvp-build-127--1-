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
import { PLAN_ART, PlanCards, type PlanCardAction } from "@/components/billing/plan-cards"
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
const buttonHex = (id: keyof typeof PLAN_ART) => /bg-\[(#[0-9a-f]{6})\]/.exec(PLAN_ART[id].button)?.[1] ?? ""
const num = (f: string, name: string) => Number(new RegExp(`${name}\\(([\\d.]+)\\)`).exec(f)?.[1] ?? NaN)

console.log("\n── pricing: no pill on the home page ──")
{
  const pricing = read("components/marketing/pricing-section.tsx")
  const cards = read("components/billing/plan-cards.tsx")
  check("the home page's section asks for no pill, /pricing does not", /hideInterval=\{editorial\}/.test(pricing) && !/data-plan-interval-row/.test(pricing))
  check("without the pill the cards are monthly, whatever was held", /const interval = hideInterval \? "monthly" : controlled \?\? own/.test(cards) && /\{hideInterval \? null : inSection \? \(/.test(cards))
  const actions = { free: { label: "Start free", href: "/signup" }, growth: { label: "Get Pro", href: "/signup" }, pro: { label: "Get Scale", href: "/signup" } } as Record<"free" | "growth" | "pro", PlanCardAction>
  const home = renderToStaticMarkup(createElement(PlanCards, { actions, hideInterval: true, interval: "yearly" }))
  const full = renderToStaticMarkup(createElement(PlanCards, { actions }))
  check("drawn: no radio group, no pill row, three cards", !/role="radiogroup"|data-plan-interval-row|data-interval-option/.test(home) && (home.match(/data-plan-card="/g) ?? []).length === 3)
  check("every other surface still draws the pill with both options", /role="radiogroup"/.test(full) && /data-interval-option="monthly"/.test(full) && /data-interval-option="yearly"/.test(full))
  check("the cards are otherwise the same markup", home.includes(full.slice(full.indexOf("<div data-plan-cards"), full.indexOf("<div data-plan-cards") + 400)))
}

console.log("\n── pricing: Scale's colour, the covers ──")
{
  const scale = PLAN_ART.pro
  const all = Object.values(scale).join(" ")
  const hexes = [...all.matchAll(/#[0-9a-f]{6}/g)].map((m) => m[0])
  const hues = hexes.map(hueSat)
  /* Green and teal are 70 to 200 degrees, pink and magenta 280 to 345. */
  check("nothing on Scale is green or teal", hues.every((c) => c.s < 0.12 || c.h < 70 || c.h > 200), hexes)
  check("nor pink or violet", hues.every((c) => c.s < 0.12 || c.h < 255 || c.h > 345) && !/hue-rotate\(-80deg\)|#0f6b66|#7c3aed|#6d28d9/.test(all), hexes)
  const [free, pro, sc] = [buttonHex("free"), buttonHex("growth"), buttonHex("pro")].map(hueSat)
  const apart = Math.min(Math.abs(sc.h - pro.h), 360 - Math.abs(sc.h - pro.h))
  // Changed on purpose (landing round 11): the owner did not like the bronze either; Scale is a steel blue now, some 40 degrees from Pro's violet (tests/home-landing-r11-close.test.ts pins it).
  check("Scale's button is a colour of its own: apart from Pro's violet on the wheel, not Free's black", apart >= 30 && sc.s > 0.3 && free.s < 0.1 && sc.l > free.l + 0.12, { free, pro, sc })
  check("Scale is not bronze any more", !(sc.h >= 20 && sc.h <= 45), sc)
  check("the three covers are three different pictures of colour", new Set(Object.values(PLAN_ART).map((a) => a.filter)).size === 3 && new Set(Object.values(PLAN_ART).map((a) => a.ground)).size === 3)
  /* Round 8's values: brightness 0.9 / 0.62 / 0.55, contrast 1.12 / 1.16 / 1.14, grain 0.05. */
  const was = { free: [0.9, 1.12], growth: [0.62, 1.16], pro: [0.55, 1.14] } as const
  const step = (Object.keys(was) as (keyof typeof was)[]).map((id) => ({ id, b: num(PLAN_ART[id].filter, "brightness"), c: num(PLAN_ART[id].filter, "contrast"), g: PLAN_ART[id].grain }))
  // Changed on purpose (landing round 11): Scale's steel blue picture is held a hair lighter (0.56) than round 8's bronze so the blue still reads; Free and Pro stay darker.
  check("every cover about as dark as round 8 or darker, not by half", step.every((s) => s.b <= was[s.id][0] + 0.02 && s.b >= was[s.id][0] * 0.8 && s.b >= 0.5), step)
  // Changed on purpose (landing round 11): the owner found the contrast too high; it is a hair over 1 now, below round 8's.
  check("contrast natural on each: a hair over 1", step.every((s) => s.c > 1 && s.c <= 1.06), step)
  check("the grain up a little, the same on all three", step.every((s) => s.g > 0.05 && s.g <= 0.1) && new Set(step.map((s) => s.g)).size === 1, step)
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

console.log("\n── footer: the app icon (outline undone in round 11) ──")
{
  // Changed on purpose (landing round 11): the owner, "the Storelib icon in the footer should not be outlined like that". The footer draws the colourful app icon again and the outline variant is gone from the logo component.
  const footerSrc = read("components/marketing/footer.tsx")
  const logoSrc = read("components/brand/storelib-logo.tsx")
  const footer = renderToStaticMarkup(createElement(MarketingFooter))
  check("the footer draws the one logo picture at 40px", /<StorelibLogo size=\{40\} \/>/.test(footerSrc) && (footerSrc.match(/<StorelibLogo\b/g) ?? []).length === 1 && /<img[^>]*data-storelib-logo=""/.test(footer))
  check("no outline anywhere: the variant is gone", !/variant/.test(logoSrc) && !/data-storelib-logo="outline"/.test(footer) && !/STORELIB_S_PATH/.test(logoSrc) && STORELIB_S_PATH.length > 0)
  check("the wordmark beside it is white", /<span class="text-xl font-bold text-white">Storelib<\/span>/.test(footer))
  check("every place draws the picture", /src=\{STORELIB_LOGO\}/.test(logoSrc) && /<img[^>]*data-storelib-logo=""/.test(renderToStaticMarkup(createElement(StorelibLogo, { size: 32 }))))
}

console.log("\n── registered ──")
{
  const runner = read("scripts/run-push-tests.mjs")
  check("this suite runs on push, after round 8's", /"tests\/home-landing-r8-frame\.test\.ts",[\s\S]{0,6000}"tests\/home-landing-r9-close\.test\.ts",/.test(runner))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
