/**
 * ===========================================================================
 *  CHECKOUT SPEED (TRACK X2): FEWER WAITS BEFORE THE FIRST FRAME, STRIPE
 *  ASKED FOR WITH THE PAGE, THE PHYSICAL CART PRICED ON THE SERVER
 * ===========================================================================
 *   SERVER     the product checkout asks the store's reads beside the
 *              creator's, and shares its product, creator and profile reads
 *              with the tab's metadata; the website checkout reads its host
 *              once per request (layout and page), and the shop's reads start
 *              before the cart is read; the host lookup asks its independent
 *              reads together (held against a timed fake database).
 *   STRIPE     every checkout with a card form writes a preload of
 *              Stripe.js into the head, before its Suspense; the
 *              preload's address is the one @stripe/stripe-js injects.
 *   PHYSICAL   the cart in the link is priced before the first frame through
 *              the quote route itself, and the page takes that answer instead
 *              of its own first ask only while nothing it would ask differs;
 *              Stripe.js is warmed on idle before Pay, never in the shell.
 *   HEIGHTS    the card form's places are held before Stripe draws them, and
 *              the form says when it is ready (data-payment-ready).
 *
 * Timings: scripts/check-checkout-speed.mjs.
 * Run with:  npx tsx tests/checkout-speed-x.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"
import { renderToString } from "react-dom/server"
import { siteOwnerOfHost } from "@/lib/site-accounts/hosts"
import { firstQuoteBody, sameAsFirstQuote } from "@/lib/physical/first-quote"
import { STRIPE_JS_URL, stripeEarly } from "@/app/(storelib)/checkout/parts/stripe-early"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* A database whose every read takes 15ms, counting how many are in flight at once. */
function timedDb(rows: { liveAi?: boolean; owner?: boolean; published?: boolean; banned?: boolean }) {
  let inFlight = 0
  let most = 0
  let reads = 0
  const answer = (table: string, eqs: Record<string, unknown>) => {
    if (table === "site_deployments") return rows.liveAi ? { storage_prefix: "x/" } : null
    if (table === "profiles") return rows.owner === false ? null : { id: "user-1" }
    if (table === "creators" && "user_id" in eqs) return { id: "creator-1" }
    if (table === "creators" && "slug" in eqs) return null
    if (table === "creators" && "id" in eqs) return { id: "creator-1", banned_at: rows.banned ? "2026-01-01" : null }
    if (table === "store_theme_installs") return rows.published === false ? null : { id: "install-1" }
    return null
  }
  const db = {
    from(table: string) {
      const eqs: Record<string, unknown> = {}
      const q: Record<string, unknown> = {}
      const self = () => q
      for (const m of ["select", "in", "limit", "order", "maybeSingle", "single"]) q[m] = self
      q.eq = (k: string, v: unknown) => {
        eqs[k] = v
        return q
      }
      q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => {
        reads++
        inFlight++
        most = Math.max(most, inFlight)
        return new Promise((r) => setTimeout(r, 15)).then(() => {
          inFlight--
          return { data: answer(table, eqs), error: null }
        }).then(ok, bad)
      }
      return q
    },
  }
  return { db, stats: () => ({ most, reads }) }
}

async function main() {
  const RULES = { mainDomain: "storelib.com", sitesDomain: "storelib.com" }

  section("The website host is placed with its independent reads together")
  {
    const t = timedDb({})
    const t0 = Date.now()
    const owner = await siteOwnerOfHost(t.db, "maya.storelib.com", RULES)
    const took = Date.now() - t0
    check("a published website still belongs to its creator", owner?.creatorId === "creator-1" && owner.kind === "subdomain", owner)
    check("two reads are in flight at once", t.stats().most >= 2, t.stats())
    check("three rounds of reads, not five (15ms each)", took < 70, { took, ...t.stats() })
    check("a live AI site is still no website", (await siteOwnerOfHost(timedDb({ liveAi: true }).db, "maya.storelib.com", RULES)) === null)
    check("nothing published is still no website", (await siteOwnerOfHost(timedDb({ published: false }).db, "maya.storelib.com", RULES)) === null)
    check("a banned creator is still no website", (await siteOwnerOfHost(timedDb({ banned: true }).db, "maya.storelib.com", RULES)) === null)
    check("a name nobody owns is still no website", (await siteOwnerOfHost(timedDb({ owner: false }).db, "maya.storelib.com", RULES)) === null)
  }

  section("The product checkout: the store's reads beside the creator's, one read each for the tab")
  {
    const page = read("app/(storelib)/checkout/page.tsx")
    const storeAt = page.indexOf("const storeReads = early(")
    const creatorAt = page.indexOf("readCreatorRow(product.creator_id),")
    check("the store's reads start before the creator and options are awaited", storeAt > 0 && creatorAt > storeAt)
    check("and are awaited where they were used", /= await storeReads/.test(page))
    check("they are the same reads as before", ["loadCheckoutConfig(checkoutAdmin(), storeId", "loadTaxForCheckout(checkoutAdmin(), storeId", "headers(),", "loadStoreName(checkoutAdmin(), storeId)", "readStoreCurrency(checkoutAdmin(), storeId"].every((s) => page.slice(storeAt, creatorAt).includes(s)))
    check("Back's address starts with them", page.indexOf("const returnsRead = early(checkoutReturns(") > storeAt && /\breturnsRead,\n\s*\]\)/.test(page))
    check("a membership leaves before any of it is asked", page.indexOf('if (product.type === "membership") return membershipCheckoutContent') < storeAt)
    const productAt = page.indexOf("await readPublishedProduct(productId)")
    check("who is signed in, what they own and the options start with the product read", ["const userRead = early(", "const ownedEarly = early(", "const variantEarly = early(", "const variantsEarly = early("].every((s) => page.indexOf(s) > 0 && page.indexOf(s) < productAt))
    check("ownership is still only acted on after the product is known to be published", page.indexOf("if (error || !product)") < page.indexOf("rowsOwn("))
    check("the server's reads now wait in three rounds: product, creator, profile", /const \[creatorRead, variantRead, user, variantsRead\] = await Promise\.all\(\[\n\s*readCreatorRow\(product\.creator_id\),/.test(page))
    check("product, creator and profile are cached for the request", /const readPublishedProduct = cache\(/.test(page) && /const readCreatorRow = cache\(/.test(page) && /const readCreatorProfile = cache\(/.test(page))
    const meta = page.slice(page.indexOf("export async function generateMetadata"))
    check("the tab's metadata uses the same cached reads", /readPublishedProduct\(params\.productId\)/.test(meta) && /readCreatorRow\(product\.creator_id\)/.test(meta) && /readCreatorProfile\(creator\.user_id\)/.test(meta) && !/supabase\.from\("products"\)/.test(meta))
    check("the published rule stays on the product read", /readPublishedProduct = cache\(async \(productId: string\) => \{[\s\S]{0,200}\.eq\("status", "published"\)/.test(page))
  }

  section("The website checkout: its host once, the shop's reads before the cart")
  {
    const page = read("app/(storelib)/checkout/site/page.tsx")
    const layout = read("app/(storelib)/checkout/site/layout.tsx")
    const server = read("lib/checkout/site-checkout-server.ts")
    check("the host is read once per request (React cache)", /export const siteOfThisHost = cache\(/.test(server))
    check("the layout and the page both use it", /siteOfThisHost\(/.test(layout) && /siteOfThisHost\(h\.get\("host"\)\)/.test(page) && !/siteOfHost\(/.test(page))
    const cartAt = page.indexOf("if (items.length === 0 && params.productId)")
    check("the brand, settings, readiness, languages and market start before the cart is read", ["const brandRead", "const configRead", "const readyRead", "const languagesRead", "const marketRead"].every((s) => page.indexOf(s) > 0 && page.indexOf(s) < cartAt))
    check("a Buy button's product and first option are read together", /const \[\{ data: product \}, firstRead\] = await Promise\.all\(/.test(page))
    check("the shop rule still holds on the product before its option is used", page.indexOf("if (!p || p.creator_id !== site.creatorId) notFound()") < page.indexOf("const variantId = params.variantId ?? "))
    check("the final wait is the same list, now of started reads", /brandRead,\n\s*configRead,\n\s*buyerRead,\n\s*readyRead,\n\s*quoteRead,/.test(page))
  }

  section("Stripe.js asked for with the page")
  {
    const pure = read("node_modules/@stripe/stripe-js/dist/pure.js")
    const train = /var RELEASE_TRAIN = '([a-z0-9]+)'/.exec(pure)?.[1]
    check("the preload is the address @stripe/stripe-js injects", !!train && STRIPE_JS_URL === `https://js.stripe.com/${train}/stripe.js`, { train, STRIPE_JS_URL })
    const Page = () => {
      stripeEarly({ script: true })
      return React.createElement("html", null, React.createElement("head"), React.createElement("body", null, "checkout"))
    }
    const html = renderToString(React.createElement(Page))
    check("the head gets the script preload", html.includes(`rel="preload" href="${STRIPE_JS_URL}" as="script"`) || (html.includes('rel="preload"') && html.includes(STRIPE_JS_URL)), html.slice(0, 500))
    check("and no preconnects to hosts only Stripe's own frames call (a partitioned socket nobody uses)", !/api\.stripe\.com|m\.stripe\.network/.test(html), html.slice(0, 500))
    const Physical = () => {
      stripeEarly({ script: false })
      return React.createElement("html", null, React.createElement("head"), React.createElement("body", null, "x"))
    }
    const phys = renderToString(React.createElement(Physical))
    check("the physical checkout connects but does not fetch the file", /rel="preconnect" href="https:\/\/js\.stripe\.com"/.test(phys) && !phys.includes(STRIPE_JS_URL), phys.slice(0, 400))
    const product = read("app/(storelib)/checkout/page.tsx")
    const main = product.slice(product.indexOf("export default async function CheckoutPage"))
    check("the product checkout asks before its Suspense, not after its reads", main.indexOf("stripeEarly({ script: true })") > 0 && main.indexOf("stripeEarly({ script: true })") < main.indexOf("<Suspense"))
    check("the website checkout asks in its first frame and its page", /stripeEarly\(\{ script: true \}\)/.test(read("app/(storelib)/checkout/site/loading.tsx")) && /stripeEarly\(\{ script: true \}\)/.test(read("app/(storelib)/checkout/site/page.tsx")))
    check("the physical checkout opens the connections only", /stripeEarly\(\{ script: false \}\)/.test(read("app/(storelib)/checkout/physical/page.tsx")))
    const client = read("app/(storelib)/checkout/checkout-client.tsx")
    check("the checkout's ways out are read ahead only once the card form is ready", /const cancelWait = afterPaymentReady\(\(\) => \{[\s\S]{0,200}requestIdleCallback\(warm, \{ timeout: 2000 \}\)/.test(client) && /\}, WARM_WITHOUT_FORM_MS\)/.test(client))
    check("the card form says so when Stripe calls it ready", /setPaymentReady\(true\)\n\s*setFailed\(false\)\n[\s\S]{0,120}notePaymentReady\(\)/.test(read("app/(storelib)/checkout/parts/stripe-pay.tsx")))
    /* Changed on purpose (round 51): the checkout's shared ui, words and Stripe loader moved to components/checkout/parts, so a website's stylesheet is built from website code only (tests/site-root-r52). */
    const loader = read("components/checkout/parts/stripe-loader.ts")
    check("Stripe.js still runs only through loadStripe from the pure entry", /import\("@stripe\/stripe-js\/pure"\)/.test(loader) && !/<script/.test(read("app/(storelib)/checkout/parts/stripe-early.ts")))
  }

  section("The physical cart, priced before the first frame")
  {
    const page = read("app/(storelib)/checkout/physical/page.tsx")
    const client = read("app/(storelib)/checkout/physical/physical-checkout.tsx")
    check("the page asks the quote route itself (its checks and limits)", /import\("@\/app\/api\/physical\/checkout\/quote\/route"\)/.test(page) && /await POST\(/.test(page))
    check("only for a cart in the link, started before the shop's reads", page.indexOf("const quoteRead = ") > 0 && page.indexOf("const quoteRead = ") < page.indexOf("checkoutBrand(db, shop)"))
    check("the buyer's address goes with it for the rate limit", /"x-forwarded-for", "x-real-ip"/.test(page))
    const suspenseAt = page.indexOf("<Suspense")
    check("the shop's bar is sent at once and the priced order streams in after it", suspenseAt > 0 && /<ShopBar brand=\{brand\} backTo=\{null\} shopUrl=\{shopUrl\} \/>/.test(page) && /const quote = use\(quoteRead\)/.test(page.slice(page.indexOf("function PricedCheckout"))))
    check("a redirect to the website's own checkout is still decided before anything is sent", page.indexOf("redirect(legacyBasketTarget(") > 0 && page.indexOf("redirect(legacyBasketTarget(") < suspenseAt)
    check("a failed answer leaves the page to ask as before", /if \(!res\.ok\) return null/.test(page) && /catch \{\n\s*return null/.test(page))
    const bodyKeys = Object.keys(firstQuoteBody("s", [], "RO")).sort()
    const asked = /body: JSON\.stringify\(\{ shopId, items, couponCode: appliedCode, country: address\.country, region: address\.region, postalCode: postalForQuote, city: cityForQuote, deliveryOptionId: optionId, email,/.test(client)
    check("the server asks with the same fields the page sends", asked && JSON.stringify(bodyKeys) === JSON.stringify(["city", "country", "couponCode", "deliveryOptionId", "email", "items", "postalCode", "region", "shopId"]), bodyKeys)
    check("the page starts with the server's order on screen", /useState<Quote \| null>\(\(initialQuote\?\.quote as Quote \| undefined\) \?\? null\)/.test(client) && /useState<LinkItem\[\] \| null>\(initialQuote\?\.items \?\? null\)/.test(client))
    check("and takes it instead of its first ask only while nothing differs", /sameAsFirstQuote\(served,/.test(client) && /serverQuote\.current = null/.test(client))

    const items = [{ productId: "11111111-1111-4111-8111-111111111111", variantId: null, quantity: 1 }]
    const first = { items, country: "RO" }
    const now = { items: [{ ...items[0] }], couponCode: null, country: "RO", region: "", postalCode: "", city: "", deliveryOptionId: null, cash: false }
    check("the same cart, country and nothing typed is the server's ask", sameAsFirstQuote(first, "ship-1", now))
    check("the delivery the answer chose is still the same ask", sameAsFirstQuote(first, "ship-1", { ...now, deliveryOptionId: "ship-1" }))
    check("another delivery is a new ask", !sameAsFirstQuote(first, "ship-1", { ...now, deliveryOptionId: "ship-2" }))
    check("a code is a new ask", !sameAsFirstQuote(first, "ship-1", { ...now, couponCode: "TEN" }))
    check("another country is a new ask", !sameAsFirstQuote(first, "ship-1", { ...now, country: "DE" }))
    check("a postal code or a city is a new ask", !sameAsFirstQuote(first, "ship-1", { ...now, postalCode: "010" }) && !sameAsFirstQuote(first, "ship-1", { ...now, city: "Cluj" }))
    check("cash on delivery is a new ask", !sameAsFirstQuote(first, "ship-1", { ...now, cash: true }))
    check("another quantity is a new ask", !sameAsFirstQuote(first, "ship-1", { ...now, items: [{ ...items[0], quantity: 2 }] }))
    check("Stripe.js is warmed on idle once the order is on screen, never in the app's shell", /if \(!hasQuote \|\| isCapacitorShell\(\)\) return/.test(client) && /requestIdleCallback\(warm/.test(client))
    check("a warm that fails is forgotten, so Pay asks afresh", /getStripePromise\(\)\.catch\(\(\) => resetStripePromise\(\)\)/.test(client))
  }

  section("What waits for the card form runs once it is ready, or after the fallback")
  {
    const target = new EventTarget()
    const g = globalThis as unknown as { window?: unknown }
    g.window = Object.assign(target, { setTimeout, clearTimeout })
    const { afterPaymentReady, notePaymentReady } = await import("@/components/checkout/parts/stripe-loader")
    let early = 0
    let late = 0
    let cancelled = 0
    afterPaymentReady(() => early++, 10_000)
    const cancel = afterPaymentReady(() => cancelled++, 10_000)
    cancel()
    check("nothing runs before the form is ready", early === 0)
    notePaymentReady()
    check("ready runs what waited, once", early === 1)
    notePaymentReady()
    check("a second ready runs nothing again", early === 1)
    check("a cancelled wait never runs", cancelled === 0)
    afterPaymentReady(() => late++, 10_000)
    check("asked after the form is ready, it runs at once", late === 1)
    delete g.window
  }

  section("The card form's place is held, and it says when it is ready")
  {
    const pay = read("app/(storelib)/checkout/parts/stripe-pay.tsx")
    check("before the type size is known, the form's whole height is held", /if \(fontSize === null\) return <div aria-hidden className="min-h-\[420px\]" \/>/.test(pay))
    check("the wallets' row is held at a button's height while asked", /min-h-\[44px\] rounded-\[8px\]/.test(pay))
    check("the card form's place is held at 200px", /className=\{cn\("min-h-\[200px\]", cashOn && "hidden"\)\}/.test(pay))
    check("ready is written on the page when Stripe says so", /data-payment-ready=\{paymentReady \? "" : undefined\}/.test(pay))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
