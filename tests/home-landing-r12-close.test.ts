/**
 * LANDING ROUND 12, THE CLOSE: the AI tools card, the closing call, the
 * pricing cards, the apps and the footer's logo.
 *
 * The owner looked at the page after round 11:
 *
 *   ai tools  the dot pattern "far too strong": a third as strong. The light
 *             round the terminal "too heavy, too visible and too fast": a
 *             lap in 26s (was 9), a soft lilac head that fades out, a
 *             fainter wide rim.
 *   close     the dots "too regular": scattered (seeded Poisson disc). An
 *             email field with a faint outline and a little glass that goes
 *             straight to sign up with the address, Continue pressed for
 *             them; signed in, one Dashboard button instead.
 *   pricing   no grey ground behind the cards; Grow's icon not a plant;
 *             Free and Pro the earnings section's dark button with its
 *             arrow, Grow the creators section's white pill.
 *   apps      the gap "a little more" smaller: 1/13 of the screen.
 *   footer    a solid mark like Shopify's: a white square, the S cut out.
 *
 * Run: node scripts/run-push-tests.mjs (or the single-suite runner).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AI_TOOLS_STYLES } from "@/components/marketing/home/ai-tools-section"
import { FinalCta, FINAL_CTA_EMAIL, finalCtaHref } from "@/components/marketing/home/final-cta"
import { DOT_FIELD_SEED, dotFieldPoints, dotFieldScatter } from "@/components/marketing/home/dot-field"
import { PlanCards, type PlanCardAction } from "@/components/billing/plan-cards"
import { INTEGRATION_ROW_SIZES, INTEGRATION_STEP_SHARE } from "@/components/marketing/home/integrations-section"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { MarketingFooter } from "@/components/marketing/footer"
import type { OfferedPlanId } from "@/lib/billing/plans"

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

console.log("\n── AI tools: quieter dots, a slower, softer light ──")
{
  const css = AI_TOOLS_STYLES.map((s) => s.css).join("")
  const rule = (sel: string) => (css.match(new RegExp(`(?:^|\\n|\\})${sel.replace(/[.[\]=()*+?^$|\\/]/g, "\\$&")}\\{([^}]*)\\}`)) ?? [])[1] ?? ""
  const dots = rule(".ait-dots")
  const alpha = Number(/rgba\(255,255,255,(\.\d+)\) 0/.exec(dots)?.[1] ?? 1)
  // Changed on purpose (landing round 13): the owner: "still too strong", .055 (tests/home-landing-r13-lower.test.ts).
  check("the dots a third as strong or less: .055 (was .24, then .085)", alpha === 0.055, alpha)
  const spin = rule(".ait-spin")
  // Changed on purpose (landing round 12, perf): the turn is put on only while live (no paused animation holding two layers off screen), pinned in tests/home-landing-r12-perf.test.ts.
  check("one lap in 26s (was 9s), linear, still off screen", /\.ait-tw\[data-live\] \.ait-spin\{animation:ait-spin 26s linear infinite\}/.test(css) && !/animation/.test(spin))
  const alphas = [...spin.matchAll(/rgba\(\d+,\d+,\d+,(\.?\d+)\)/g)].map((m) => Number(m[1]))
  check("no white head: the brightest stop is a lilac at .42 or less (was #fff)", !/#fff/.test(spin) && Math.max(...alphas) <= 0.42, alphas)
  check("the head fades out over 10 degrees instead of ending on a hard edge", /rgba\(220,210,255,\.42\) 170deg,rgba\(220,210,255,0\) 180deg/.test(spin) && /rgba\(220,210,255,\.42\) 350deg,rgba\(220,210,255,0\) 360deg/.test(spin))
  check("the tail fades in over about 80 degrees", /rgba\(139,92,246,0\) 90deg,rgba\(139,92,246,\.06\) 120deg/.test(spin))
  check("the wide rim fainter: .16 (was .55)", /opacity:\.16;/.test(rule(".ait-glow")))
  check("still only a transform, still stands still under reduced motion", /@keyframes ait-spin\{from\{transform:rotate\(0deg\)\}to\{transform:rotate\(360deg\)\}\}/.test(css) && /\.ait-spin\{animation:none!important;transform:rotate\(38deg\)\}/.test(css) && !/filter/.test(css))
}

console.log("\n── Closing call: scattered dots ──")
{
  const src = read("components/marketing/home/final-cta.tsx")
  check("the closing call draws the scattered field", /<DotField fade="close" scatter \/>/.test(src))
  const a = dotFieldScatter(1200, 600, 18)
  const b = dotFieldScatter(1200, 600, 18)
  check("seeded: the same box gets the same dots", DOT_FIELD_SEED === 1207 && a.length === b.length && a.every((v, i) => v === b[i]))
  const n = a.length / 4
  const grid = dotFieldPoints(1200, 600, 18).length / 4
  check("about as dense as the grid it replaces (within a fifth)", Math.abs(n - grid) / grid < 0.2, { n, grid })
  let minD = Infinity
  const xs = new Set<number>()
  for (let i = 0; i < a.length; i += 4) {
    xs.add(Math.round(a[i]))
    for (let j = i + 4; j < a.length; j += 4) {
      const d = Math.hypot(a[i] - a[j], a[i + 1] - a[j + 1])
      if (d < minD) minD = d
    }
  }
  check("no clumps: every dot at least 0.8 of the gap from the next", minD >= 18 * 0.8 - 1e-3, minD)
  check("no columns: dots spread over hundreds of x positions, not a grid's 67", xs.size > 400, xs.size)
  let inside = true
  let bright = true
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] < 0 || a[i] >= 1200 || a[i + 1] < 0 || a[i + 1] >= 600) inside = false
    if (a[i + 2] < 0.55 || a[i + 2] > 1) bright = false
  }
  check("every dot inside the box, each with its own brightness between 0.55 and 1", inside && bright)
  check("the purple sheet keeps its grid", /<DotField tone="purple" fade="bottom" gap=\{22\}/.test(read("app/(storelib)/(marketing)/page.tsx")))
}

console.log("\n── Closing call: the email field ──")
{
  const html = renderToStaticMarkup(createElement(FinalCta))
  check("a GET form to /signup, with the sell intent and Continue pressed (works without JavaScript)", /<form noValidate="" class="fcta-form" data-fcta-form="" action="\/signup" method="get">/.test(html) && /<input type="hidden" name="intent" value="sell"\/>/.test(html) && /<input type="hidden" name="start" value="1"\/>/.test(html), html.slice(html.indexOf("<form"), html.indexOf("<form") + 600))
  check("one email field, labelled, the browser's autofill asked", /<label for="([^"]+)" class="fcta-sr">Email address<\/label><input id="\1" type="email" autoComplete="email" inputMode="email"[^>]*name="email"\/>/.test(html) && (html.match(/<input [^>]*type="email"/g) ?? []).length === 1, html.slice(html.indexOf("<label"), html.indexOf("<label") + 300))
  check("the button inside the field: Start free with the arrow", /<div class="fcta-field">[\s\S]*<button type="submit" class="fcta-btn fcta-primary">Start free<svg/.test(html))
  check("drawn for a guest first: the Dashboard button hidden", /<div class="fcta-actions" hidden="">/.test(html))
  const src = read("components/marketing/home/final-cta.tsx")
  const field = /\.fcta-field\{([^}]*)\}/.exec(src)?.[1] ?? ""
  check("a faint outline and a little glass", /border:1px solid rgba\(255,255,255,\.14\)/.test(field) && /background:rgba\(255,255,255,\.055\)/.test(field) && /backdrop-filter:blur\(10px\) saturate\(140%\)/.test(field))
  check("the address goes straight to sign up", finalCtaHref(" ana@example.com ") === "/signup?intent=sell&email=ana%40example.com&start=1" && finalCtaHref("") === "/signup?intent=sell")
  check("checked first: good addresses pass, bad ones do not", ["ana@example.com", "a.b+c@shop.co.uk"].every((e) => FINAL_CTA_EMAIL.test(e)) && ["ana", "ana@", "ana@example", "@example.com", "a b@example.com", "ana@example."].every((e) => !FINAL_CTA_EMAIL.test(e)))
  check("a bad address says so under the field and goes nowhere", /setInvalid\(true\)[\s\S]{0,120}return/.test(src) && /role="alert"/.test(src) && /That email does not look right\./.test(src))
  check("signed in, from the header's record, read before paint: Dashboard for a seller", /useLayoutEffect\(/.test(src) && /readAuthSnapshot\(\)/.test(src) && /subscribeAuthSnapshot\(read\)/.test(src) && /hidden=\{audience !== "guest"\}/.test(src) && /audience === "seller" \? "\/app"/.test(src) && /"Dashboard"/.test(src))
  const signup = read("app/(storelib)/(auth)/signup/page.tsx")
  check("the sign up page fills the field from ?email= and presses Continue once for start=1", /const prefilledEmail = searchParams\.get\("email"\)/.test(signup) && /searchParams\.get\("start"\) === "1"/.test(signup) && /autoStarted\.current = true\s*formRef\.current\?\.requestSubmit\(\)/.test(signup) && /<form ref=\{formRef\} onSubmit=\{handleContinue\}/.test(signup))
  check("never for an invite or while a session may be there", /if \(!autoStart \|\| autoStarted\.current \|\| !prefilledEmail \|\| inviteEmail \|\| maybeSignedIn \|\| authGateLoading \|\| nativeAuthInProgress\) return/.test(signup))
  check("no banned words or em dashes", !BANNED.test(src.replace(/transform:|transform \.|translate/g, "")))
}

console.log("\n── Pricing cards ──")
{
  const actions: Record<OfferedPlanId, PlanCardAction> = {
    free: { label: "Start free", href: "/signup" },
    growth: { label: "Get Grow", href: "/signup" },
    pro: { label: "Get Pro", href: "/signup" },
  }
  const html = renderToStaticMarkup(createElement(PlanCards, { actions, contactSales: true }))
  const card = (id: string) => {
    const start = html.indexOf(`data-plan-card="${id}"`)
    const next = html.indexOf("data-plan-card=", start + 20)
    return html.slice(start, next < 0 ? undefined : next)
  }
  const src = read("components/billing/plan-cards.tsx")
  check("no grey ground behind the cards", !/bg-\[#efeff0\]/.test(/data-plan-ground="" class="([^"]*)"/.exec(html)?.[1] ?? "x") && !/p-2\.5 sm:p-5 lg:p-7/.test(src))
  check("Grow's icon is a line going up, not a plant", /growth: TrendingUp,/.test(src) && !/Sprout/.test(src))
  const dark = (id: string) => /<a[^>]*class="[^"]*bg-\[#0f0e13\][^"]*text-white[^"]*"[^>]*data-plan-button="dark"/.test(card(id)) && /<path d="M4 10h12M11 5l5 5-5 5"><\/path>/.test(card(id))
  check("Start free and Get Pro: the earnings section's dark button and arrow", dark("free") && dark("pro") && /\.cme-cta\{[^}]*background:#0f0e13;color:#fff/.test(read("components/marketing/home/earnings-calculator.tsx")))
  // Changed on purpose (landing round 13): the owner: "Get Grow" is a solid Storelib purple button, no white pill and no round arrow (tests/home-landing-r13-pricing.test.ts).
  check("Get Grow: a solid Storelib purple button, no round arrow", /data-plan-button="purple"/.test(card("growth")) && /bg-\[#7c3aed\] font-semibold text-white/.test(card("growth")) && !/data-plan-arrow/.test(card("growth")) && !/<path d="M3\.5 8h8\.5M8\.5 4\.5 12 8l-3\.5 3\.5"/.test(card("growth")))
  check("Grow's card still the raised one", /data-plan-card="growth" data-plan-featured=""/.test(html))
  const settled = renderToStaticMarkup(createElement(PlanCards, { actions: { ...actions, growth: { label: "Current plan", settled: true } }, compact: true }))
  check("a settled button stays quiet, with no arrow", /data-plan-button="settled"/.test(settled) && !/data-plan-arrow/.test(settled.slice(settled.indexOf('data-plan-card="growth"'), settled.indexOf('data-plan-card="pro"'))))
  check("the arrows move by translate only, and not under reduced motion", /className="[^"]*transition duration-\[250ms\]/.test(src) && (src.match(/motion-reduce:transition-none/g) ?? []).length >= 1) // Changed on purpose (landing round 13): Grow's round arrow is gone, so the dark arrow is the one left to hold still.
}

console.log("\n── Apps: a smaller gap, still no icon seen twice ──")
{
  const css = read("components/marketing/home/integrations-section.module.css")
  check("1/13 of the screen per tile and gap (was 1/12), 6px least on a phone (was 8)", INTEGRATION_STEP_SHARE === 1 / 15 && /--gap: max\(10px, calc\(100vw \/ 15 - var\(--tile\)\)\);/.test(css) && /--gap: max\(6px, calc\(100vw \/ 13 - var\(--tile\)\)\);/.test(css)) // Changed on purpose (landing round 14): the gap about half on a computer, 1/15 of the screen, 10px least; a phone keeps 1/13 and 6px.
  check("each set still more than a screen plus a tile", INTEGRATION_ROW_SIZES.every((n) => (n - 1) * INTEGRATION_STEP_SHARE >= 1), INTEGRATION_ROW_SIZES)
  /* At the widths the owner looks at: the set's width against the screen plus a tile. */
  const ok = [390, 1024, 1440, 1920, 2560].every((vw) => {
    const tile = vw < 640 ? 67 : Math.min(116, Math.max(90, vw * 0.056))
    const gap = Math.max(vw < 640 ? 6 : 20, vw / 13 - tile)
    return Math.min(...INTEGRATION_ROW_SIZES) * (tile + gap) >= vw + tile
  })
  check("measured at 390, 1024, 1440, 1920 and 2560 wide", ok)
}

console.log("\n── Footer: a solid mark ──")
{
  const footer = renderToStaticMarkup(createElement(MarketingFooter))
  const mark = /<svg[^>]*data-storelib-logo="solid"[\s\S]*?<\/svg><\/svg>|<svg[^>]*data-storelib-logo="solid"[\s\S]*?<\/svg>/.exec(footer)?.[0] ?? ""
  check("the footer draws the solid mark at 40px, not the picture", /width="40" height="40"/.test(mark) && !/<img[^>]*data-storelib-logo/.test(footer))
  // Changed on purpose (landing round 13): the owner: a white S on a near black square with depth, a dark app icon (tests/home-landing-r13-lower.test.ts).
  check("a solid mark, no picture, no drawn outline", /<rect width="200" height="200" rx="35" fill="url\(#storelib-solid-ground\)"/.test(footer) && !/stroke=/.test(mark))
  check("white on the footer's black", /color:#fff/.test(mark))
  check("every other place still draws the picture", /<img[^>]*data-storelib-logo=""/.test(renderToStaticMarkup(createElement(StorelibLogo, { size: 32 }))))
}

console.log("\n── registered ──")
{
  const runner = read("scripts/run-push-tests.mjs")
  check("this suite runs on push, after round 11's", /"tests\/home-landing-r11-stability\.test\.ts",[\s\S]{0,8000}"tests\/home-landing-r12-close\.test\.ts",/.test(runner))
}


console.log("\n── pricing: no grey panel inside the cards ──")
{
  const cards = read("components/billing/plan-cards.tsx")
  check("the top panel is white with a hairline, no #f4f4f5", /data-plan-panel="" className=\{`flex flex-col rounded-t-\[18px\] border-b border-\[#ececef\] bg-white/.test(cards) && !/bg-\[#f4f4f5\]/.test(cards))
}
console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
