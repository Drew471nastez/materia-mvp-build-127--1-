/**
 * THE HOME PAGE'S COMMERCE SECTIONS (wave 12, track commerce)
 *
 * components/marketing/home: how-it-works (motion tiles and the profit
 * picker), checkout-scene (the scroll scene with Storelib's instant checkout
 * on a phone), sell-everywhere-map (the dotted world) and
 * earnings-calculator. What is held here:
 *
 *   the figures   every fee is the one checkout charges
 *                 (lib/payments/fees/calculate); Pro's price is
 *                 lib/billing/plans'; the currency count is the fee rules'
 *   the markup    each section renders on the server with its headline,
 *                 its roles (tabs, radios, sliders) and the signup link
 *   the motion    a reduced motion path in every section; scroll work only
 *                 through scroll timelines or one rAF; no live blur filters
 *                 on the floating products; no universal selector toggled
 *                 to pause loops
 *   the images    local webp under public/home/commerce, every one the code
 *                 names exists, each small, the whole set under budget, and
 *                 nothing hotlinked
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { HowItWorks, HOW_MERCH } from "@/components/marketing/home/how-it-works"
import { CheckoutScene, CHECKOUT_STYLES } from "@/components/marketing/home/checkout-scene"
import { SellEverywhereMap, COMMERCE_LAND, SELL_COUNTRIES, commerceLandPath } from "@/components/marketing/home/sell-everywhere-map"
import { EarningsCalculator, commerceMonth } from "@/components/marketing/home/earnings-calculator"
import { COMMERCE_CURRENCY_COUNT, COMMERCE_PRO_MONTHLY_CENTS, COMMERCE_PRODUCTS, commerceSale, commerceUsd } from "@/components/marketing/home/commerce-kit"
import { PRO_PRICE_CENTS } from "@/lib/billing/plans"
import { CURRENCY_FEE_RULES } from "@/lib/payments/fees/currency-rules"
import { calculateStorelibFee } from "@/lib/payments/fees/calculate"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`)
  }
}
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")
const DIR = "components/marketing/home"
const FILES = {
  how: `${DIR}/how-it-works.tsx`,
  checkout: `${DIR}/checkout-scene.tsx`,
  map: `${DIR}/sell-everywhere-map.tsx`,
  earn: `${DIR}/earnings-calculator.tsx`,
  kit: `${DIR}/commerce-kit.tsx`,
}
const src = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, read(p)])) as Record<keyof typeof FILES, string>

console.log("\nCommerce: the figures are Storelib's")
{
  const tee = commerceSale(3000, "tee")
  check("a $30 tee on Free pays 5% + $0.25 = $1.75", tee.feeCents === 175, tee)
  check("and leaves $30 - $12.50 example cost - $1.75 = $15.75", tee.profitCents === 1575, tee)
  const proTee = commerceSale(3000, "tee", "pro")
  check("on Pro the same tee pays 3% + $0.25 = $1.15", proTee.feeCents === 115, proTee)
  const small = commerceSale(300, "download")
  check("under $4.00 the fee is the small-order percentage only", small.feeCents === calculateStorelibFee({ grossMinor: 300, currency: "USD", sellerPlan: "free" }).totalStorelibFeeMinor && small.feeCents === 34, small)
  check("downloads and courses have no production cost", commerceSale(1900, "download").baseCents === 0 && commerceSale(12900, "course").baseCents === 0)
  check("Pro's monthly price is lib/billing/plans PRO_PRICE_CENTS", COMMERCE_PRO_MONTHLY_CENTS === PRO_PRICE_CENTS, { COMMERCE_PRO_MONTHLY_CENTS, PRO_PRICE_CENTS })
  check("the currency count is the fee rules'", COMMERCE_CURRENCY_COUNT === Object.keys(CURRENCY_FEE_RULES).length && COMMERCE_CURRENCY_COUNT >= 2, COMMERCE_CURRENCY_COUNT)
  check("the checkout tab names the count from the code, not a typed number", /stat: `\$\{COMMERCE_CURRENCY_COUNT\} currencies`/.test(src.checkout))
  const m = commerceMonth("download", 19, 5, "free")
  check("a month of $19 downloads, 5 a day: 150 orders, $2,850, $180 fees, $2,670 kept", m.orders === 150 && m.revenue === 285000 && m.fees === 18000 && m.keep === 267000, m)
  const mp = commerceMonth("tee", 30, 10, "pro")
  check("Pro takes its $29 off the month, merch its production", mp.keep === 300 * 3000 - 300 * 115 - 300 * 1250 - 2900 && mp.planCost === 2900, mp)
  check("every product's default price is inside its slider", COMMERCE_PRODUCTS.every((p) => p.min <= p.price && p.price <= p.max))
  check("every merch default leaves a profit", COMMERCE_PRODUCTS.every((p) => commerceSale(p.price * 100, p.id).profitCents > 0))
  check("money reads $15.75 and $2,850", commerceUsd(1575) === "$15.75" && commerceUsd(285000) === "$2,850")
  for (const [k, s] of Object.entries(src)) check(`${k}: example figures are labelled`, k === "kit" || k === "checkout" || /[Ee]xample/.test(s))
  check("Stripe's processing fee is named as separate wherever fees are shown", /card processing fee is separate/.test(src.how) && /card processing fee is separate/.test(src.earn))
}

console.log("\nCommerce: the sections render on the server")
{
  const how = renderToStaticMarkup(createElement(HowItWorks))
  check("how it works: its heading", how.includes("Sell what you make. We handle the rest."))
  check("how it works: five tiles", (how.match(/class="cmh-tile"/g) ?? []).length === 5)
  /* Changed on purpose (wave 13): the owner removed the profit picker, the "How it works" pill and the subheading. */
  check("how it works: no picker, no eyebrow, no subheading", !how.includes('role="radiogroup"') && !how.includes('type="range"') && !/story-eyebrow|What you keep on every sale|Merch with no stock to buy/.test(how))
  check("how it works: the merch card shows a $30 tee leaving $15.75, and five products", how.includes("$15.75") && how.includes("$30.00") && HOW_MERCH.length === 5 && HOW_MERCH.every((m) => how.includes(m.name) && how.includes(`/home/how/merch-${m.id}.webp`)))
  check("how it works: each merch profit is Storelib's fee and the example cost off the price", HOW_MERCH.every((m) => m.profitCents === m.priceCents - calculateStorelibFee({ grossMinor: m.priceCents, currency: "USD", sellerPlan: "free" }).totalStorelibFeeMinor - m.baseCents && m.profitCents > 0))
  check("how it works: the tiles use the product's real words", ["Buy now · $19", "Payment complete", "Thanks for your purchase", "Get your files", "Add lesson", "Publish", "Free preview"].every((w) => how.includes(w)))

  const co = renderToStaticMarkup(createElement(CheckoutScene))
  check("checkout: its own headline, not the reference's", co.includes("Checkout that turns a tap into a sale") && !/almost cheating/i.test(co))
  /* Changed on purpose (wave 13): a fifth tab, Order paid, as the owner asked; the closed panels are inert and hidden by visibility, not display:none, so all five share one box and switching tabs moves nothing below. */
  check("checkout: five tabs and one visible panel", (co.match(/role="tab"/g) ?? []).length === 5 && (co.match(/role="tabpanel"/g) ?? []).length === 5 && (co.match(/role="tabpanel"[^>]*inert/g) ?? []).length === 4 && !/role="tabpanel"[^>]*hidden/.test(co) && /\.cmc-panel\{grid-area:1\/1;[^}]*visibility:hidden/.test(src.checkout))
  /* Changed on purpose (wave 13): the real instant checkout heads its fields "Your details" (components/checkout/instant-checkout.tsx), not "Contact". */
  check("checkout: the phone draws the real checkout's words", ["Your details", "Email me news and offers", "Payment method", "Pay $19.00 with Apple Pay", "Payment complete", "We sent your receipt and your access to", "Open it now"].every((w) => co.includes(w)))
  /* Added (wave 13). */
  check("checkout: no subheading under the headline, no eyebrow", !/cmc-sub|story-eyebrow/.test(co))
  /* Changed on purpose (landing round): the desktop picture is the website checkout as app/(storelib)/checkout/site/site-checkout.tsx draws it, in its own words. */
  check("checkout: the real desktop checkout, by card and by Google Pay", (co.match(/class="cdx"/g) ?? []).length === 2 && ["Pay Maya Ellis Studio", "Contact information", "Email me with news and offers", "Shipping method", "Payment method", "Add promotion code", "Total due", "Pay $88.36", "Continue shopping"].every((w) => co.includes(w)))
  check("checkout: the desktop checkout's totals add up", co.includes("$77.00") && co.includes("$6.00") && co.includes("$5.36") && (32 + 26 + 19 === 77) && Math.round((77 + 6 + 5.36) * 100) === 8836)
  check("checkout: five currencies with their real flags", ["US", "EU", "GB", "JP", "CA"].every((f) => co.includes(`/flags/${f}.svg`)) && ["$19.00", "€17.50", "£15.00", "¥2,900", "C$26.00"].every((p) => co.includes(p)))
  check("checkout: the reminder and the sale note use the real emails' words", co.includes("You left Golden Hour presets at checkout") && co.includes("Still thinking it over?") && co.includes("Finish checkout") && co.includes("You sold Golden Hour presets for $19.00"))
  check("checkout: the phone is one labelled image to a screen reader", /role="img" aria-label="A Storelib checkout on a phone/.test(co))
  check("checkout: every floating product has a sharp and a pre-blurred file", /float-tee\.webp/.test(co) && /float-tee-blur\.webp/.test(co))

  const map = renderToStaticMarkup(createElement(SellEverywhereMap))
  check("map: its heading and a labelled map", map.includes("Your store never closes.") && /role="img" aria-label="A world map/.test(map))
  check("map: the dots are not in the HTML (built on the client)", !/M\d+\.5 \d+\.5h0/.test(map))
  /* Changed on purpose (wave 13): the owner asked for a contained card with a column of flags, a product card whose button is in that country's language and an "Order for" pill in its money, so the old city cards and their prices are gone. */
  check("map: orders in the buyers' money, as checkout charges it", ["£56.00", "32,00 €", "28,00 €", "US$ 26,00", "64,00 €"].every((p) => map.includes(p)) && SELL_COUNTRIES.every((c) => ["GBP", "EUR", "USD"].some((cur) => (c.total.includes("€") ? "EUR" : c.total.includes("£") ? "GBP" : "USD") === cur)))
  {
    /* Added (wave 13): each button is the storefront's own "Buy now", word for word, from its language's catalog. */
    const buyIn = (lang: string) => (lang.startsWith("en") ? "Buy now" : (read(`lib/i18n/catalog/${lang}.ts`).match(/^\s*"Buy now": "([^"]+)"/m) ?? [])[1])
    check("map: every button is the storefront's Buy now in that country's language", SELL_COUNTRIES.every((c) => map.includes(`>${c.buy}<`) && buyIn(c.lang) === c.buy), SELL_COUNTRIES.map((c) => [c.lang, c.buy, buyIn(c.lang)]))
    check("map: real flags for each country, from the site's own flag files", SELL_COUNTRIES.every((c) => map.includes(`/flags/${c.code}.svg`) && existsSync(join(ROOT, "public/flags", `${c.code}.svg`))))
    check("map: a contained card inside the page width, not a full-width black band", /\.cmm\{[^}]*background:#fff/.test(src.map) && /\.cmm-card\{[^}]*border-radius:32px/.test(src.map) && /\.cmm-wrap\{max-width:1400px/.test(src.map))
    check("map: the country changes only while the section is on screen, and never under reduced motion", /if \(!live\) return/.test(src.map) && /prefers-reduced-motion: reduce\)"\)\.matches\) return/.test(src.map) && /window\.clearInterval/.test(src.map))
    check("map: the product photos exist", SELL_COUNTRIES.every((c) => existsSync(join(ROOT, "public/home/sell-map", c.photo))))
  }

  const earn = renderToStaticMarkup(createElement(EarningsCalculator))
  check("calculator: its heading", earn.includes("See what your work could earn."))
  check("calculator: Start earning goes to /signup", /<a[^>]*href="\/signup"[^>]*>Start earning/.test(earn))
  check("calculator: price and sales sliders, typed fields, a plan choice", (earn.match(/type="range"/g) ?? []).length === 2 && earn.includes('aria-label="Selling price in dollars"') && earn.includes('aria-label="Sales a day"') && earn.includes(">Pro<"))
  check("calculator: the default month is $2,850", earn.includes("$2,850"))
  /* Added (wave 13): the owner asked for the pill and the subheading gone, and a smoother result than the bar chart. */
  check("calculator: no eyebrow pill and no subheading", !/story-eyebrow|Earnings calculator|The math uses/.test(earn))
  check("calculator: one smooth line of the year, drawn in by a transform, not bars", /cme-line/.test(earn) && !/cme-bar/.test(earn) && /@keyframes cme-draw\{from\{transform:scaleX\(1\)\}to\{transform:scaleX\(0\)\}\}/.test(src.earn))
  check("/signup exists", existsSync(join(ROOT, "app/(storelib)/(auth)/signup")) || readdirSync(join(ROOT, "app/(storelib)"), { recursive: true }).some((f) => String(f).replace(/\\/g, "/").endsWith("signup/page.tsx")))
}

console.log("\nCommerce: the map's land mask")
{
  const d = commerceLandPath()
  const dots = (d.match(/M/g) ?? []).length
  check("1,220 bytes of mask, 160 x 61 cells", Buffer.from(COMMERCE_LAND.b64, "base64").length === (COMMERCE_LAND.cols / 8) * COMMERCE_LAND.rows)
  check("about 3,000 land dots", dots === 2991, dots)
}

console.log("\nCommerce: motion and performance rules")
{
  for (const k of ["how", "checkout", "map", "earn"] as const) {
    const s = src[k]
    check(`${k}: a client component with a named export`, s.startsWith('"use client"') && /export function [A-Z]\w+\(/.test(s))
    check(`${k}: a reduced motion path`, s.includes("prefers-reduced-motion:reduce"))
    check(`${k}: loops pause offscreen (data-commerce-live)`, k === "earn" || s.includes("[data-commerce-live]"))
    check(`${k}: no universal selector toggled to pause loops`, !/data-commerce-live\][^{]*\*/.test(s))
    check(`${k}: no backdrop blur and no live filter on images`, !/backdrop-filter/.test(s) && !/filter:\s*blur/.test(s))
    check(`${k}: no scroll listener of its own outside the fallback`, k === "checkout" ? (s.match(/addEventListener\("scroll"/g) ?? []).length === 1 && s.includes('CSS.supports?.("animation-timeline: view()")') : !s.includes('"scroll"'))
  }
  check("checkout: scroll scene on a view timeline with transforms", src.checkout.includes("view-timeline-name:--cmc") && src.checkout.includes("animation-timeline:--cmc"))
  /* Added (wave 13): the orbit and the phone. */
  check("checkout: the products orbit on one baked lap that closes on itself, paused off screen", /animation:cmc-lap var\(--lap\) linear infinite both/.test(src.checkout) && /const x = -Math\.cos\(t\)/.test(src.checkout) && /const y = Math\.sin\(t\)/.test(src.checkout) && /const turn = t \* 5/.test(src.checkout) && /\.cmc-track\[data-commerce-live\] \.cmc-lap/.test(src.checkout) && /animation-play-state:paused\}/.test(src.checkout))
  {
    const css = CHECKOUT_STYLES.map((x) => x.css).join("\n")
    const lap = css.match(/@keyframes cmc-lap\{([\s\S]*?)\}\n/)?.[1] ?? ""
    const stops = [...lap.matchAll(/([\d.]+)%\{transform:([^;]+);opacity:([\d.]+)\}/g)]
    check("checkout: the lap's first and last frames are the same (no seam), transform and opacity only", stops.length === 41 && stops[0][2] === stops[40][2] && stops[0][3] === stops[40][3] && !/(width|height|top|left|margin|filter)\s*:/.test(lap), stops.length)
  }
  check("checkout: the phone is sized from the viewport alone (nothing measured, so it never shifts)", !/ResizeObserver|--cmc-copy|offsetHeight/.test(src.checkout) && /--pw:min\(/.test(src.checkout))
  check("checkout: the phone is on screen from the start and moves into place (no rise from below the stage)", /animation-range:entry 55% contain 24%/.test(src.checkout) && !/62svh/.test(src.checkout))
  check("checkout: keyframes animate transform and opacity only", [...src.checkout.matchAll(/@keyframes [\w-]+\{([^@]*?)\}\}/g)].every((m) => !/(width|height|top|left|margin|background|box-shadow|filter)\s*:/.test(m[1])))
  check("kit: counting writes text, not React state", src.kit.includes("node.textContent = next"))
  check("no section names the reference site", Object.values(src).every((s) => !/shopify|fourthwall/i.test(s)))
}

console.log("\nCommerce: images")
{
  const dir = join(ROOT, "public/home/commerce")
  const files = existsSync(dir) ? readdirSync(dir) : []
  check("public/home/commerce holds webp only", files.length > 0 && files.every((f) => f.endsWith(".webp")), files)
  const total = files.reduce((n, f) => n + statSync(join(dir, f)).size, 0)
  check("the set is under 6 MB (it is far under)", total < 6 * 1024 * 1024 && total < 400 * 1024, total)
  check("each image is under 60 KB", files.every((f) => statSync(join(dir, f)).size < 60 * 1024))
  const all = Object.values(src).join("\n")
  const named = new Set<string>()
  for (const m of all.matchAll(/\$\{IMG\}\/([\w-]+\.webp)/g)) named.add(m[1])
  for (const m of all.matchAll(/img: "([\w-]+\.webp)"/g)) named.add(m[1])
  for (const m of all.matchAll(/\$\{IMG\}\/float-\$\{f\.id\}(-blur)?\.webp/g)) for (const id of ["cap", "vinyl", "tee", "box", "course", "member"]) named.add(`float-${id}${m[1] ?? ""}.webp`)
  const missing = [...named].filter((f) => !files.includes(f))
  check("every image the code names exists", named.size >= 10 && missing.length === 0, missing)
  check("nothing hotlinked", !/https?:\/\/[^"'`\s]*\.(webp|png|jpe?g)|images\.unsplash\.com/.test(all))
  const imgs = (all.match(/<img\b/g) ?? []).length
  const howDir = join(ROOT, "public/home/how")
  const howFiles = existsSync(howDir) ? readdirSync(howDir) : []
  check("public/home/how holds the five merch photos, webp, each under 30 KB", howFiles.length === 5 && howFiles.every((f) => /^merch-[a-z]+\.webp$/.test(f) && statSync(join(howDir, f)).size < 30 * 1024), howFiles)
  check("images are lazy and decode off the main thread", imgs > 10 && imgs === (all.match(/loading="lazy"/g) ?? []).length && imgs === (all.match(/decoding="async"/g) ?? []).length, imgs)
}

/* Added (wave 13): one branch deleted public/home/showcase/lt-field.webp while how-it-works still drew it, and the live page asked for it and got a 404. Every picture or video a marketing component names by a root path is a file under public. */
console.log("\nMarketing: every named picture is a file")
{
  const walk = (d: string): string[] => readdirSync(join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : /\.(tsx?|css)$/.test(e.name) ? [join(d, e.name)] : []))
  const named = new Set<string>()
  for (const f of walk("components/marketing")) {
    for (const m of read(f).matchAll(/["'`(](\/(?:home|marketing|brand|images|img)\/[A-Za-z0-9._/-]+\.(?:webp|png|jpe?g|svg|avif|mp4|webm))["'`)]/g)) named.add(m[1])
  }
  const missing = [...named].filter((p) => !existsSync(join(ROOT, "public", p)))
  check("every picture a marketing component names is in public", named.size >= 3 && missing.length === 0, { named: named.size, missing })
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
