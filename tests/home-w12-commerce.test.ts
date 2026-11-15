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
import { HowItWorks, HOW_PRODUCTS, HOW_HEADING } from "@/components/marketing/home/how-it-works"
import { CheckoutScene, CHECKOUT_STYLES } from "@/components/marketing/home/checkout-scene"
import { SellEverywhereMap, SELL_MAP, SELL_COUNTRIES, sellMapPath } from "@/components/marketing/home/sell-everywhere-map"
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
  // Changed on purpose (landing round 8): the card is titled "Local in 7 currencies" (the owner's words), the count from the code.
  check("the checkout card names the count from the code, not a typed number", /title: `Local in \$\{COMMERCE_CURRENCY_COUNT\} currencies`/.test(src.checkout) && /`\$\{COMMERCE_CURRENCY_COUNT\} currencies`/.test(src.checkout))
  const m = commerceMonth("download", 19, 5, "free")
  check("a month of $19 downloads, 5 a day: 150 orders, $2,850, $180 fees, $2,670 kept", m.orders === 150 && m.revenue === 285000 && m.fees === 18000 && m.keep === 267000, m)
  const mp = commerceMonth("tee", 30, 10, "pro")
  check("Pro takes its $29 off the month, merch its production", mp.keep === 300 * 3000 - 300 * 115 - 300 * 1250 - 2900 && mp.planCost === 2900, mp)
  check("every product's default price is inside its slider", COMMERCE_PRODUCTS.every((p) => p.min <= p.price && p.price <= p.max))
  check("every merch default leaves a profit", COMMERCE_PRODUCTS.every((p) => commerceSale(p.price * 100, p.id).profitCents > 0))
  check("money reads $15.75 and $2,850", commerceUsd(1575) === "$15.75" && commerceUsd(285000) === "$2,850")
  for (const [k, s] of Object.entries(src)) check(`${k}: example figures are labelled`, k === "kit" || k === "checkout" || /[Ee]xample/.test(s))
  /* Changed on purpose (landing round): the owner asked for the small print under How it works and under the checkout tabs to go (it only took space); the calculator still names Stripe's fee. */
/* Changed on purpose (landing round 7): the owner asked for the fee line under the calculator to go too. */
  check("the fee line under the calculator and the removed small print stay gone", !/card processing fee is separate/.test(src.earn) && !/cmh-fine|cmc-foot/.test(src.how + src.checkout))
}

console.log("\nCommerce: the sections render on the server")
{
  const how = renderToStaticMarkup(createElement(HowItWorks))
  /* Changed on purpose (landing round): the owner asked for less "fans" in the copy. */
  // Changed on purpose (landing round 7, the owner: "another heading, more clean and simple", two tones like section 3).
  // Changed on purpose (landing round 9): a new heading, the products card being gone.
  check("how it works: its heading", how.includes("Take tips. See what sells.") && HOW_HEADING.lead === "Take tips. See what sells." && HOW_HEADING.rest === "All on your own domain." && !/\bfans?\b/i.test(how.replace(/<style[\s\S]*?<\/style>/g, "")))
  /* Changed on purpose (landing round 3): a sixth tile, the creator's own domain, as the owner asked. */
  // Changed on purpose (landing round 7): four cards in section 3's two by two grid; the checkout and files tiles are gone.
  // Changed on purpose (landing round 9): three cards in one row (tips, the numbers, your own domain); the products and course cards repeated other sections.
  check("how it works: three cards", (how.match(/class="cmh-card /g) ?? []).length === 3)
  /* Changed on purpose (wave 13): the owner removed the profit picker, the "How it works" pill and the subheading. */
  check("how it works: no picker, no eyebrow, no subheading", !how.includes('role="radiogroup"') && !how.includes('type="range"') && !/story-eyebrow|What you keep on every sale|Merch with no stock to buy/.test(how))
  /* Changed on purpose (landing round): the merch tile became one shop's physical and digital products (a tee printed when ordered, an e-book sent when paid), as the owner asked. */
/* Changed on purpose (landing round 4): the owner wanted the blue tee and Weeknight Pasta gone: an embroidered cap and a night photography e-book. */
  // Changed on purpose (landing round 5): the owner did not like the cap: a $45 signed print (an example $14 print cost) and the $19 e-book.
  // Changed on purpose (landing round 7): the owner did not like Nadia Brooks's print: a $38 shop apron (an example $16 print cost) and $24 workbench plans.
  // Changed on purpose (landing round 8): the owner asked for "just a t-shirt" and the Cine Tones LUT pack: a $32 tee (an example $12.50 print cost) and the $29 pack.
  // Changed on purpose (landing round 9): section 3's two products as the shop's top products, with what section 3 says each made.
  check("how it works: the $29 LUT pack and the $32 tee as top products", how.includes("$11,194") && how.includes("$6,848") && HOW_PRODUCTS.length === 2 && HOW_PRODUCTS.map((p) => p.priceCents).join() === "2900,3200" && HOW_PRODUCTS.every((p) => how.includes(p.name)) && how.includes("/home/everything/tee.webp") && !how.includes("print-lasalle") && !how.includes("cap-yellow"))
  check("how it works: no You keep figures", !/You keep|Print cost/.test(how) && typeof calculateStorelibFee === "function") // Changed on purpose (landing round 9): they were the products card's.
  /* Changed on purpose (landing round): the course tile is the course player now (components/courses/course-player.tsx: "Lessons", "2 of 6 done"). */
/* Changed on purpose (landing round 4): the checkout tile is the live OnePage and its product sheet, captured (public/home/how/op-nadia*.webp), so its words are in the picture. */
  // Changed on purpose (landing round 7): no checkout or files tile any more; the course player keeps its real words.
  // Changed on purpose (landing round 9): the reports' own names (app/(storelib)/app/analytics).
  check("how it works: the tiles use the product's real words", ["Sales", "Top products", "Orders by country"].every((w) => how.includes(w)) && !how.includes("op-nadia") && !how.includes("Check out"))
  /* Added (landing round): the owner never wants the Golden Hour presets mockups again, nor the camera picture on the course. */
  check("how it works: no Golden Hour presets, no camera course picture, no purple gradient grounds", !/Golden Hour|golden-cover|course-camera|lt-field/i.test(how + src.how) && !/linear-gradient\(160deg,#4c1d95/.test(src.how))

  const co = renderToStaticMarkup(createElement(CheckoutScene))
  /* Changed on purpose (landing round 4): the headline's words come in one by one, each in its own span. */
  check("checkout: its own headline, not the reference's", co.replace(/<[^>]*>/g, "").includes("Checkout that turns a tap into a sale") && !/almost cheating/i.test(co))
  /* Changed on purpose (wave 13): a fifth tab, Order paid, as the owner asked; the closed panels are inert and hidden by visibility, not display:none, so all five share one box and switching tabs moves nothing below. */
/* Changed on purpose (landing round 4): four tabs, as the owner asked; Order paid is the end of Built to convert. */
  // Changed on purpose (landing round 8): a grid of four cards slides up over the phone, as in the owner's recording; no tabs.
  check("checkout: four cards, no tabs, each demo live only on screen", (co.match(/class="cmc-card"/g) ?? []).length === 4 && !/role="tab/.test(co) && /\.cmc-card\[data-commerce-live\]/.test(src.checkout))
  /* Changed on purpose (wave 13): the real instant checkout heads its fields "Your details" (components/checkout/instant-checkout.tsx), not "Contact". */
/* Changed on purpose (landing round 4): the phone no longer completes a payment as the page scrolls; Payment complete is the desktop checkout's. */
  /* Changed on purpose (landing round 7, the owner: "use the actual Storelib checkout, not the modal checkout"): the phone draws the full page checkout's words. */
  // Changed on purpose (landing round 8): the phone sells the Cine Tones LUT Pack ($29).
  check("checkout: the phone draws the real checkout's words", ["Contact information", "Email me with news and offers", "Payment method", "Add promotion code", "Total due", "Pay $29.00", "Payment complete", "Powered by Stripe"].every((w) => co.includes(w)))
  /* Added (wave 13). */
  check("checkout: no subheading under the headline, no eyebrow", !/cmc-sub|story-eyebrow/.test(co))
  /* Changed on purpose (landing round 3): the owner wants the wallets tab to be a phone and nothing else, so the second browser (the one with Google Pay) is gone; the tab's words still name both wallets. */
/* Changed on purpose (landing round 4): Built to convert is the website checkout on a computer again, as the owner asked. */
  check("checkout: the website checkout in a desktop browser, once, and both wallets named", (co.match(/class="cdx-win"/g) ?? []).length === 1 && co.includes("Apple Pay and Google Pay, built in"))
  // Changed on purpose (landing round 8): the owner: the shared product (the tee and the LUT pack) in all seven currencies.
  check("checkout: every currency with its real flag, the tee and the LUT pack priced in each", ["US", "EU", "GB", "CA", "AU", "JP", "RO"].every((f) => co.includes(`/flags/${f}.svg`)) && ["$32.00", "€30.00", "£26.00", "C$44.00", "A$49.00", "¥4,900", "149 lei", "$29.00", "¥4,400"].every((p) => co.includes(p)))
  /* Changed on purpose (landing round): the product is Maya Ellis's e-book, Weeknight Pasta, not the Golden Hour presets the owner found AI looking. */
/* Changed on purpose (landing round 4): new products; the seller's note is the in-app sale notification ("New sale: <total>", "<buyer> bought <thing> for <total>."). */
  // Changed on purpose (landing round 8): the LUT pack and the tee.
  /* Changed on purpose (landing round 9): the owner: in the reminder "put the black t-shirt example". */
  check("checkout: the reminder and the sale note use the real words", co.includes("You left Midnight Studio Tee at checkout") && co.includes("Still thinking it over?") && co.includes("Finish checkout") && co.includes("New sale: $71.88") && co.includes("Sam Rivera bought Midnight Studio Tee and 1 more for $71.88."))
  check("checkout: no Golden Hour presets anywhere, and less fans in the words", !/Golden Hour|golden-cover|Presets/.test(co + src.checkout) && !/\bfans?\b/i.test(co.replace(/<style[\s\S]*?<\/style>/g, "")))
  /* Changed on purpose (landing round 7): the label names the checkout page. */
  check("checkout: the phone is one labelled image to a screen reader", /role="img" aria-label="Storelib&#x27;s checkout page on a phone/.test(co))
  /* Changed on purpose (landing round): the orbiting products (the Golden preset box, the camera course, a purple membership card) are gone with the orbit. */
/* Changed on purpose (landing round 4): the owner asked for the products orbiting the phone back, none of them the Golden Hour box or the purple membership card, each crossfading to a pre-blurred file (never a live filter). */
  /* Changed on purpose (landing round 5): the orbit is gone, it stuttered under a finger. */
  /* Changed on purpose (landing round 7): the owner asked for the products around the phone back ("how they were before"), a new set of plain pictures on one transform loop, no blurred twins. */
  // Changed on purpose (landing round 8): the owner: "3D products, not images", turning on an axis as the page scrolls.
  check("checkout: real 3D objects stand around the phone, without blurred twins", /cmc-orbit/.test(co) && /\/home\/commerce\/obj-/.test(co) && !/-blur\.webp/.test(co + src.checkout) && !/filter:\s*blur/.test(src.checkout))

  const map = renderToStaticMarkup(createElement(SellEverywhereMap))
  /* Changed on purpose (landing round): the owner asked for a heading without "fans". */
  check("map: its heading and a labelled map", map.includes("Your store never closes.") && !/\bfans?\b/i.test(map.replace(/<style[\s\S]*?<\/style>/g, "")) && /role="img" aria-label="A world map/.test(map))
  check("map: the dots are not in the HTML (built on the client)", !/M\d+(\.5)? \d+(\.5)?h0/.test(map))
  /* Changed on purpose (landing round): the owner asked that switching country change the money only, so the countries are ones checkout charges in their own currency (USD, GBP, JPY, CAD, EUR, AUD), each written that country's way. */
  /* Changed on purpose (landing round 4): the owner asked for the product to change with the country, so each country has its own product and price (USD, EUR, JPY, CAD, AUD). */
  check("map: orders in the buyers' money, as checkout charges it", ["$32.00", "29,00 €", "¥4,800", "C$79.00", "24,00 €", "A$34.00"].every((p) => map.includes(p)) /* Changed on purpose (landing round 8): the Cine Tones LUT pack, a mobility course and a cookbook, priced as they are. */ && ["USD", "JPY", "CAD", "EUR", "AUD"].every((cur) => cur in CURRENCY_FEE_RULES))  /* Changed on purpose (landing round 5): three digital products, priced as they are. */
  {
    /* Changed on purpose (landing round 4): the owner reversed the first round's ask; the button speaks the country's language (Jetzt kaufen, 今すぐ購入, Acheter). */
    check("map: the button in the buyer's language", ["Buy now", "Jetzt kaufen", "今すぐ購入", "Acheter"].every((w) => map.includes(`>${w}</span>`)))
    check("map: real flags for each country, from the site's own flag files", SELL_COUNTRIES.every((c) => map.includes(`/flags/${c.code}.svg`) && existsSync(join(ROOT, "public/flags", `${c.code}.svg`))))
    /* Changed on purpose (landing round): the owner asked for a little less rounding (32px to 31px). */
    check("map: a contained card inside the page width, not a full-width black band", /\.cmm\{[^}]*background:#fff/.test(src.map) && /\.cmm-card\{[^}]*border-radius:31px/.test(src.map) && /\.cmm-wrap,\[data-landing-story\] \.cmm>\.cmm-wrap\{[^}]*max-width:var\(--home-max,2020px\)/.test(src.map))  /* Changed on purpose (landing round 7): inside the page's one width (--home-max), not the old 1400px. */
    /* Changed on purpose (landing round 8): the turn is timed by the lit flag's CSS line, which runs only while live and not at all under reduced motion; no timer in JavaScript. */
    check("map: the country changes only while the section is on screen, and never under reduced motion", /\.cmm-time\{[^}]*animation-play-state:paused\}/.test(src.map) && /\[data-commerce-live\] \.cmm-time\{animation-play-state:running\}/.test(src.map) && /prefers-reduced-motion:reduce\)\{[\s\S]*\.cmm-time\{animation:none\}/.test(src.map) && !/setInterval/.test(src.map))
    /* Changed on purpose (landing round 4): one product photograph per country. */
    check("map: each product photo exists", SELL_COUNTRIES.every((c) => existsSync(join(ROOT, "public/home/sell-map", c.photo)) && map.includes(`/home/sell-map/${c.photo}`)))
  }

  const earn = renderToStaticMarkup(createElement(EarningsCalculator))
  check("calculator: its heading", earn.includes("See what your work could earn."))
  check("calculator: Start earning goes to /signup", /<a[^>]*href="\/signup"[^>]*>Start earning/.test(earn))
  /* Changed on purpose (landing round 4): the owner removed the Free and Pro plan choice. */
  check("calculator: price and sales sliders, typed fields, no plan choice", (earn.match(/type="range"/g) ?? []).length === 2 && earn.includes('aria-label="Selling price in dollars"') && earn.includes('aria-label="Sales a day"') && !/cme-plan|>Pro</.test(earn))
  check("calculator: the default month is $2,850", earn.includes("$2,850"))
  /* Added (wave 13): the owner asked for the pill and the subheading gone, and a smoother result than the bar chart. */
  check("calculator: no eyebrow pill and no subheading", !/story-eyebrow|Earnings calculator|The math uses/.test(earn))
  /* Changed on purpose (landing round 4): the owner asked for the black result card to go; the total and three figures sit on the white panel, no chart. */
  check("calculator: no chart and no bars, the total and three figures", !/cme-line|cme-bar/.test(earn) && (earn.match(/<dt>/g) ?? []).length === 3)
  check("/signup exists", existsSync(join(ROOT, "app/(storelib)/(auth)/signup")) || readdirSync(join(ROOT, "app/(storelib)"), { recursive: true }).some((f) => String(f).replace(/\\/g, "/").endsWith("signup/page.tsx")))
}

console.log("\nCommerce: the map's land mask")
{
  /* Changed on purpose (landing round): the owner asked for a cleaner, more accurate map, so the mask is finer (1.5 degree cells from Natural Earth's 1:50m land). */
  const d = sellMapPath()
  const dots = (d.match(/M/g) ?? []).length
  check("2,700 bytes of mask, 240 x 90 cells", Buffer.from(SELL_MAP.b64, "base64").length === (SELL_MAP.cols / 8) * SELL_MAP.rows)
  check("about 7,200 land dots (one per 2 x 2 block on a phone)", dots === 7200 && (sellMapPath(2).match(/M/g) ?? []).length < 2000, dots)
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
    /* Changed on purpose (landing round): checkout has no scroll listener at all now (its steps come from an IntersectionObserver). */
    check(`${k}: no scroll listener of its own`, !s.includes('"scroll"'))
  }
  /* Changed on purpose (landing round): the owner found scrolling through the scene "very bad". The scroll no longer scrubs anything frame by frame: an IntersectionObserver sets data-step as bands cross the middle of the screen, and each step plays as a CSS transition of transform and opacity. Stricter than before: no scroll listener at all, no per-frame custom property, no 3D orbit. */
/* Changed on purpose (landing round 4): the phone rises and stays, the words come in, the tab cards rise over the phone: CSS view timelines (transform and opacity, on the compositor, reversible), and where a browser has none, two IntersectionObservers set two attributes and the same states play as transitions. Still no scroll listener and no layout read. */
  /* Changed on purpose (landing round 5): no scroll timelines; one observer starts a one-shot entrance, plain scroll does the rest. */
  // Changed on purpose (landing round 8): the objects turn on a scroll timeline (transform, run by the compositor).
  /* Changed on purpose (landing round 9): the observer watches the cards only; the timeline also brings the phone down and the headline in. */
  check("checkout: one observer for the cards, a scroll timeline for the scene, no scroll listener, no layout read", /animation-timeline:--cmc-t/.test(src.checkout) && /new IntersectionObserver/.test(src.checkout) && /data-cmc-over/.test(src.checkout) && !/addEventListener\("scroll"|getBoundingClientRect\(|requestAnimationFrame/.test(src.checkout))
  /* Changed on purpose (landing round 9): held only where scroll timelines exist. */
  // Changed on purpose (landing round 10): the cards are inside the track, starting the overlap short of the stage's foot, so the stage stays held behind them.
  check("checkout: a held stage, and the cards pulled up over it", /\.cmc-stage\{position:sticky;top:0\}/.test(src.checkout) && /\.cmc-track > \.cmc-cards\{margin-top:calc\(\$\{DWELL\} - \$\{OVERLAP\}\)\}/.test(src.checkout))
  check("checkout: no purple glow under the phone, no purple card art", !/rgba\(124,58,237/.test(src.checkout) && !/#8b5cf6,#4338ca/.test(src.checkout))
  check("checkout: the phone is sized from the viewport alone (nothing measured, so it never shifts)", !/ResizeObserver|--cmc-copy|offsetHeight/.test(src.checkout) && /--pw:min\(/.test(src.checkout))
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
  for (const m of all.matchAll(/\$\{IMG\}\/float-\$\{f\.id\}(-blur)?\.webp/g)) for (const id of ["ebook", "cap", "course", "tee", "club", "vinyl"]) named.add(`float-${id}${m[1] ?? ""}.webp`)
  const missing = [...named].filter((f) => !files.includes(f))
  /* Changed on purpose (landing round): the orbiting products and the Golden Hour pictures are gone, so the sections name fewer files. */
  check("every image the code names exists", named.size >= 1 && missing.length === 0, missing)
  check("nothing hotlinked", !/https?:\/\/[^"'`\s]*\.(webp|png|jpe?g)|images\.unsplash\.com/.test(all))
  const imgs = (all.match(/<img\b/g) ?? []).length
  const howDir = join(ROOT, "public/home/how")
  const howFiles = existsSync(howDir) ? readdirSync(howDir) : []
  /* Changed on purpose (landing round): the tee photo and the course's video still, webp, each under 30 KB, and nothing unused. */
/* Changed on purpose (landing round 4): the cap, the course's street still, and the captured OnePage and its sheet. */
  // Changed on purpose (landing round 5): the print instead of the captured OnePage; the cap picture stays for the checkout scene's currencies panel.
  // Changed on purpose (landing round 7): Linde Woodshop's five pictures; the cap and the print stay for the checkout scene; the street course still is gone.
  // Changed on purpose (landing round 8): the tee in place of the apron and the bench (the LUT pack's still is section 3's file).
  // Changed on purpose (landing round 9): the white tee and the lesson still are deleted with their cards.
  check("public/home/how holds the cap and print and the woodshop's two pictures, webp, each under 30 KB", howFiles.sort().join() === "cap-yellow.webp,linde-avatar.webp,print-lasalle.webp,site-workshop.webp" && howFiles.every((f) => statSync(join(howDir, f)).size < 30 * 1024), howFiles)
  /* Changed on purpose (landing round 4): the owner found the reminder demo slow to arrive; the pictures inside the checkout tabs' demos load eagerly (their panel is drawn only when shown), every other picture is lazy. */
  check("images are lazy (or eager inside a tab demo) and decode off the main thread", imgs > 10 && imgs === (all.match(/loading="(lazy|eager)"/g) ?? []).length && (all.match(/loading="eager"/g) ?? []).length <= 8 && imgs === (all.match(/decoding="async"/g) ?? []).length, imgs)
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
