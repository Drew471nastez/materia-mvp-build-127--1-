/**
 * ===========================================================================
 *  A WEBSITE'S CHECKOUT, ON THE WEBSITE'S OWN ADDRESS
 * ===========================================================================
 * Check out on a creator's website (a built site's cart or Buy button, an
 * imported Shopify theme's /checkout) used to land on storelib.com, first on
 * Stripe's own page, then on a branded page with Stripe's embedded form. It
 * is served on the website's own host now (https://<site host>/checkout),
 * drawn as the Explore checkout is, and paid in Storelib's own card form.
 * What has to hold:
 *
 *   HOSTS      the checkout, its thank you page and the receipts answer on a
 *              website's subdomain and on its connected domain; the old
 *              links are sent on; the shop is the HOST's, from the database
 *   PRICES     every number is the server's: the page's quote and Pay's
 *              PaymentIntent come from the same function, a sent price is
 *              never read, another shop's product is refused
 *   SETTINGS   Settings › Checkout changes the website checkout and the
 *              Explore checkout the same way: the fields, the news box, an
 *              account first and a confirmed address
 *   CONSENT    only a ticked box (on a store that shows it) subscribes
 *   STRIPE     never Stripe's page: a PaymentIntent with the connected
 *              account and Storelib's fee, the webhook writing it once
 */
import { readFileSync, existsSync } from "node:fs"
import {
  SITE_CHECKOUT_PATH,
  basketTitle,
  fieldPlan,
  legacyBasketTarget,
  missingField,
  onWebsiteHost,
  readSiteCheckoutParams,
  sameSitePath,
  siteCheckoutHref,
  siteCheckoutRouteFor,
  siteGate,
  siteSignInHref,
  siteThanksHref,
} from "@/lib/checkout/site-checkout"
import { siteOfHost } from "@/lib/checkout/site-checkout-server"
import { priceSiteCart, siteQuote } from "@/lib/checkout/site-quote-server"
import { priceCart } from "@/lib/checkout/pricing"
import { checkoutConfig, DEFAULT_CHECKOUT, type CheckoutConfig, type FieldRule } from "@/lib/store/checkout-config"
import { planContact } from "@/lib/contacts/checkout-contact"
import { decodeItems } from "@/lib/physical/cart-link"
import { FakeSupabase } from "./fake-supabase"
import { stripComments } from "./_source"
import { shopMoneyIn } from "@/lib/store/shop-money"
import { minimumChargeMinor, sellingCurrencyOf } from "@/lib/store/selling-currency"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))

const uuid = (n: number) => `${String(n).padStart(8, "0")}-2222-4222-8222-222222222222`
const SHOP = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const A = uuid(1)
const B = uuid(2)
const V = uuid(3)

function sitesDb(): FakeSupabase {
  const db = new FakeSupabase()
  db.table("profiles", {}, [
    { id: "u-andrew", username: "andrews", email: "a@storelib.test" },
    { id: "u-other", username: "otherone", email: "o@storelib.test" },
  ])
  db.table("creators", {}, [
    { id: SHOP, user_id: "u-andrew", slug: "andrews" },
    { id: OTHER, user_id: "u-other", slug: "otherone" },
  ])
  db.table("store_theme_installs", {}, [{ id: "install-1", creator_id: SHOP, status: "published", sort_order: 0 }])
  db.table("site_deployments", {}, [])
  db.table("custom_domains", {}, [
    { creator_id: SHOP, domain: "andrew.shop", status: "active", purpose: "website" },
    { creator_id: SHOP, domain: "waiting.shop", status: "pending", purpose: "website" },
  ])
  return db
}

/** Tables answering select/eq/in/order/limit/maybeSingle and a plain await (the pricing reads). */
function pricingDb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      const filters: ((r: Record<string, unknown>) => boolean)[] = []
      const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), chain),
        in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), chain),
        ilike: () => chain,
        limit: () => chain,
        order: () => chain,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        single: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: rows(), error: null }),
      }
      return chain
    },
  }
}
const product = (id: string, creator: string, price: number, over: Record<string, unknown> = {}) => ({
  id,
  title: `Item ${id.slice(7, 8)}`,
  slug: `item-${id.slice(7, 8)}`,
  price_cents: price,
  pay_what_you_want: false,
  pwyw_min_price_cents: null,
  thumbnail_url: null,
  type: "digital",
  status: "published",
  creator_id: creator,
  ...over,
})

async function main() {
  process.env.PHYSICAL_COMMERCE_ENABLED = "0"

  console.log("\nThe checkout's address is the website's")
  {
    const href = siteCheckoutHref({
      items: [
        { productId: A, variantId: null, quantity: 1 },
        { productId: B, variantId: V, quantity: 2 },
      ],
      back: "/cart",
      couponCode: " SAVE10 ",
      wholeCart: true,
      visit: { from: "instagram", utm_source: "ig", touches: "t1" },
    })
    const url = new URL(href, "https://andrews.storelib.com")
    const p = readSiteCheckoutParams(url.searchParams)
    check("a relative /checkout on the page's own host", href.startsWith(`${SITE_CHECKOUT_PATH}?`) && url.host === "andrews.storelib.com")
    check("ids and quantities only, back, the code and the whole cart come back as they went", p.items.length === 2 && p.items[1].variantId === V && p.items[1].quantity === 2 && p.back === "/cart" && p.couponCode === "SAVE10" && p.wholeCart && !/price/i.test(href), p)
    check("the visit's source rides in the same keys a Buy button uses", url.searchParams.get("ref") === "instagram" && url.searchParams.get("utm_source") === "ig" && url.searchParams.get("sl_at") === "t1")
    check("no shop in the link: the shop is the host's", !url.searchParams.has("shop"))
    const abs = siteCheckoutHref({ origin: "https://andrew.shop", items: [{ productId: A, variantId: null, quantity: 1 }] })
    check("on a connected domain, the domain's own /checkout", abs.startsWith("https://andrew.shop/checkout?items="))
    const buy = readSiteCheckoutParams(new URLSearchParams({ productId: A, variantId: V, customPrice: "1500", cancel: "/products/item", discountCode: "HI" }))
    check("a Buy button's link reads as one product, its option, its amount and where Back goes", buy.productId === A && buy.variantId === V && buy.customPriceCents === 1500 && buy.back === "/products/item" && buy.couponCode === "HI" && !buy.wholeCart)
    const hostile = readSiteCheckoutParams(new URLSearchParams({ return: "https://evil.example/cart", productId: "nope", customPrice: "-5" }))
    check("Back to another host, a product that is not an id, a negative amount: nothing", hostile.back === null && hostile.productId === null && hostile.customPriceCents === null)
    check("Back is a path on this site, never the API, never another host", sameSitePath("/api/x", "a.storelib.com") === null && sameSitePath("//evil.com/x", "a.storelib.com") === null && sameSitePath("https://a.storelib.com/cart?x=1", "a.storelib.com") === "/cart?x=1" && sameSitePath("https://b.storelib.com/cart", "a.storelib.com") === null)
    check("the thank you page is on the site too, told to empty the cart only for a whole cart", siteThanksHref("tok_abc") === "/checkout/thanks/tok_abc" && siteThanksHref("tok_abc", { whole: true }) === "/checkout/thanks/tok_abc?cart=1")
    check("signing in comes back to this checkout (a long cart falls back to the whole cart's /checkout)", siteSignInHref("/checkout?items=abc") === "/account/login?return=%2Fcheckout%3Fitems%3Dabc" && siteSignInHref(`/checkout?items=${"x".repeat(600)}`) === "/account/login?return=%2Fcheckout")
    check("a cart writes the site's own link on a website, the platform's on storelib.com and previews", onWebsiteHost("andrews.storelib.com", "storelib.com") && onWebsiteHost("www.andrew.shop", "storelib.com") && !onWebsiteHost("storelib.com", "storelib.com") && !onWebsiteHost("x.vercel.app", "storelib.com") && !onWebsiteHost("localhost", "localhost:3000"))
    check("a cart's one line summary", basketTitle(["Hoodie"]) === "Hoodie" && basketTitle(["Hoodie", "Cap", "Mug"]) === "Hoodie and 2 more" && basketTitle([]) === "Your order")
  }

  console.log("\nWhat the website's host does with a checkout address")
  {
    const r = (path: string, search = "", method = "GET") => siteCheckoutRouteFor(path, search, method, "andrews.storelib.com")
    check("/checkout is the website's checkout, rewritten on this host", JSON.stringify(r("/checkout", "?items=x")) === JSON.stringify({ kind: "rewrite", path: "/checkout/site?items=x" }) && r("/checkout/")?.kind === "rewrite")
    check("a theme form that posts to /checkout is sent on as a GET (303)", JSON.stringify(r("/checkout", "?a=1", "POST")) === JSON.stringify({ kind: "redirect", to: "/checkout?a=1", status: 303 }))
    check("the thank you page is rewritten on this host; a token that is not one is left alone", JSON.stringify(r("/checkout/thanks/abcdefgh12345678")) === JSON.stringify({ kind: "rewrite", path: "/checkout/site/thanks/abcdefgh12345678" }) && r("/checkout/thanks/<x>") === null)
    check("the receipt and a shipped order's page are served on the site", r("/receipt/abc")?.kind === "pass" && r("/checkout/physical/order/abc")?.kind === "pass")
    const items = "W1siMDAwMDAwMDEtMjIyMi00MjIyLTgyMjItMjIyMjIyMjIyMjIyIiwiIiwxXV0"
    const old = r("/checkout/cart", `?shop=${SHOP}&items=${items}&return=${encodeURIComponent("https://andrews.storelib.com/cart")}&code=SAVE&cart=1`)
    const oldUrl = old?.kind === "redirect" ? new URL(old.to, "https://andrews.storelib.com") : null
    check("an old /checkout/cart link on the site goes to /checkout with its cart, Back and code", !!oldUrl && oldUrl.pathname === "/checkout" && decodeItems(oldUrl.searchParams.get("items"))[0]?.productId === A && oldUrl.searchParams.get("return") === "/cart" && oldUrl.searchParams.get("code") === "SAVE" && oldUrl.searchParams.get("cart") === "1", old)
    const phys = r("/checkout/physical", `?shop=${SHOP}&items=${items}&return=${encodeURIComponent("https://evil.example/cart")}`)
    const physUrl = phys?.kind === "redirect" ? new URL(phys.to, "https://andrews.storelib.com") : null
    check("an old /checkout/physical link too, Back to another host dropped", !!physUrl && physUrl.pathname === "/checkout" && !physUrl.searchParams.has("return"), phys)
    check("anything else under /checkout stays the platform's", r("/checkout/receipt") === null && r("/explore") === null)
    const target = new URL(legacyBasketTarget("https://andrew.shop", new URLSearchParams({ items, return: "https://andrew.shop/cart", cart: "1" }), "andrew.shop"))
    check("storelib.com/checkout/cart is sent on to the shop's own site, the cart kept", target.origin === "https://andrew.shop" && target.pathname === "/checkout" && target.searchParams.get("return") === "/cart" && target.searchParams.get("cart") === "1")
  }

  console.log("\nThe shop is whoever the host belongs to")
  {
    const db = sitesDb()
    process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
    process.env.NEXT_PUBLIC_SITES_HOST = "storelib.com"
    const sub = await siteOfHost(db, "andrews.storelib.com")
    check("a subdomain with a published website is that creator's", sub?.creatorId === SHOP && sub.origin === "https://andrews.storelib.com" && sub.kind === "subdomain", sub)
    const custom = await siteOfHost(db, "www.andrew.shop")
    check("a verified connected domain is that creator's, at www", custom?.creatorId === SHOP && custom.origin === "https://www.andrew.shop" && custom.kind === "custom", custom)
    check("a domain still waiting for DNS has no checkout", (await siteOfHost(db, "waiting.shop")) === null)
    check("storelib.com itself has no website checkout", (await siteOfHost(db, "storelib.com")) === null)
    check("nor a preview deployment, nor localhost, nor nothing", (await siteOfHost(db, "x.vercel.app")) === null && (await siteOfHost(db, "localhost:3000")) === null && (await siteOfHost(db, "")) === null)
    check("a creator with nothing published has no website checkout", (await siteOfHost(db, "otherone.storelib.com")) === null)
  }

  console.log("\nEvery number is the server's, and one shop's")
  {
    const db = pricingDb({ products: [product(A, SHOP, 1500), product(B, SHOP, 2500)], coupons: [] })
    const items = [{ productId: A, variantId: null, quantity: 1, priceCents: 1 }, { productId: B, variantId: null, quantity: 1, customPriceCents: 1 }]
    const q = await siteQuote(db, SHOP, { items })
    const direct = await priceCart(db, { items, buyerId: null, handOff: false })
    check("the page's quote is the basket's own pricing, a sent price never read", q.ok === true && direct.ok === true && q.quote.totals.totalCents === 4000 && q.quote.totals.totalCents === direct.totalCents, q)
    const pay = await priceSiteCart(db, SHOP, { items })
    check("and Pay prices with the same function: the PaymentIntent's amount is the quote's total", pay.priced.ok === true && q.ok === true && pay.priced.totalCents === q.quote.totals.totalCents && pay.decision.kind === "pay")
    check("the summary has each line's title and price, a download once", q.ok === true && q.quote.lines.length === 2 && q.quote.lines[0].title === "Item 1" && q.quote.lines.every((l) => l.quantity === 1 && !l.requiresShipping) && q.quote.kind === "digital")
    const otherDb = pricingDb({ products: [product(A, SHOP, 1500), product(B, OTHER, 2500)] })
    const mixed = await siteQuote(otherDb, SHOP, { items: [{ productId: A }, { productId: B }] })
    check("another shop's product under this site is refused (the seller guard)", mixed.ok === false && /one shop/i.test(mixed.error), mixed)
    const foreign = await siteQuote(pricingDb({ products: [product(B, OTHER, 2500)] }), SHOP, { items: [{ productId: B }] })
    check("a cart that is all another shop's is refused on this site", foreign.ok === false, foreign)
    const tiny = await siteQuote(pricingDb({ products: [product(A, SHOP, 30)] }), SHOP, { items: [{ productId: A }] })
    /* Changed on purpose: the smallest card payment is Stripe's in the store's currency (2 lei, 50 cents). */
    check("under the smallest card payment is refused before any form", tiny.ok === false && tiny.error.includes(shopMoneyIn(minimumChargeMinor(sellingCurrencyOf(null)), sellingCurrencyOf(null))), tiny)
    const ships = await siteQuote(pricingDb({ products: [product(A, SHOP, 1500, { type: "physical" })] }), SHOP, { items: [{ productId: A }] })
    check("while physical commerce is off, a product that ships is left out, never charged", ships.ok === false, ships)
    const badCode = await priceSiteCart(db, SHOP, { items, couponCode: "NOPE" })
    check("a code that does not fit is said, and the cart priced without it", !!badCode.couponError && badCode.priced.ok === true && badCode.priced.totalCents === 4000)
    check("and Pay refuses rather than charging without a code the page showed taken", /couponError\) return json\(\{ error: couponError, field: "code" \}, 400\)/.test(code("app/api/checkout/site/route.ts")))
  }

  console.log("\nSettings › Checkout › Customer information, every option, both checkouts")
  {
    const rules: FieldRule[] = ["off", "optional", "required"]
    let matrix = true
    for (const company of rules)
      for (const phone of rules)
        for (const address2 of rules)
          for (const nameFields of ["last_only", "first_and_last"] as const) {
            const config: CheckoutConfig = { ...DEFAULT_CHECKOUT, company, phone, address2, nameFields }
            const digital = fieldPlan(config, { ships: false })
            const shipped = fieldPlan(config, { ships: true })
            const pickup = fieldPlan(config, { ships: true, pickup: true })
            const ok =
              digital.company === "off" && digital.phone === "off" && digital.address2 === "off" && !digital.address &&
              shipped.company === company && shipped.phone === phone && shipped.address2 === address2 && shipped.address &&
              pickup.company === "off" && pickup.address2 === "off" && pickup.phone === phone && !pickup.address &&
              digital.splitName === (nameFields === "first_and_last") && shipped.splitName === digital.splitName
            if (!ok) {
              matrix = false
              console.log("   matrix broke at", { company, phone, address2, nameFields })
            }
            const filled = { email: "a@b.co", first: "Jane", last: "Smith", company: "Co", phone: "+40 712 345 678", line2: "4B" } /* Changed on purpose (the owner: a phone is checked as a number, so a real one): was "123". */
            const empty = { email: "a@b.co", first: "Jane", last: "", company: "", phone: "", line2: "" }
            const want = nameFields === "first_and_last" ? "last" : company === "required" ? "company" : phone === "required" ? "phone" : address2 === "required" ? "line2" : null
            if (missingField(shipped, filled) !== null || missingField(shipped, empty) !== want) {
              matrix = false
              console.log("   missing broke at", { company, phone, address2, nameFields, got: missingField(shipped, empty), want })
            }
          }
    check("company, phone, address line 2 (off, optional, required) and the name (one field or two): 54 combinations, digital, shipped and pickup", matrix)
    check("an email is always asked", missingField(fieldPlan(DEFAULT_CHECKOUT, { ships: false }), { email: "nope", first: "Jane", last: "" }) === "email")
    check("a digital order never asks for a company, a phone or an apartment, whatever the store says", missingField(fieldPlan({ ...DEFAULT_CHECKOUT, company: "required", phone: "required", address2: "required" }, { ships: false }), { email: "a@b.co", first: "Jane", last: "" }) === null)
    check("the news box is the store's switch", fieldPlan({ ...DEFAULT_CHECKOUT, marketingOptIn: true }, { ships: false }).newsBox && !fieldPlan({ ...DEFAULT_CHECKOUT, marketingOptIn: false }, { ships: false }).newsBox)

    const site = code("app/checkout/site/site-checkout.tsx")
    const explore = code("app/checkout/checkout-client.tsx")
    check("the website checkout draws the plan: Full name or First and Last, company, apartment and phone as the store asks", /plan\.company !== "off"/.test(site) && /plan\.address2 !== "off"/.test(site) && /plan\.phone !== "off"/.test(site) && /id="checkout-first"/.test(site) && /id="checkout-last"/.test(site) && /id="checkout-name"/.test(site))
    check("the Explore checkout asks First and Last apart too when the store asks for both", /splitName \? \(/.test(explore) && /id="checkout-first"/.test(explore) && /id="checkout-last"/.test(explore) && /nameFields === "first_and_last"/.test(explore))
    check("both put the unticked news box under the email, in the same words", /Email me with news and offers/.test(site) && /Email me with news and offers/.test(explore) && /useState\(false\)/.test(site) && explore.indexOf('id="checkout-news"') < explore.indexOf('id="checkout-first"'))
  }

  console.log("\nAn account first, and a confirmed address: on the website, the website's own account")
  {
    const buyer = { email: "jane@x.co", name: "Jane" }
    const off = checkoutConfig({})
    const account = checkoutConfig({ requireAccount: true })
    const confirmed = checkoutConfig({ requireConfirmedEmail: true })
    check("off: a guest pays, and a signed in buyer's address is not forced", siteGate(off, null).kind === "open" && JSON.stringify(siteGate(off, buyer)) === JSON.stringify({ kind: "open", lockedEmail: null }))
    check("Require customers to sign in: a guest is asked to sign in on the website first", siteGate(account, null).kind === "sign-in")
    check("signed in, the order goes to that account's address", JSON.stringify(siteGate(account, buyer)) === JSON.stringify({ kind: "open", lockedEmail: "jane@x.co" }))
    check("Require a confirmed email address implies an account, and the sign in code is the confirmation", confirmed.requireAccount && siteGate(confirmed, null).kind === "sign-in" && JSON.stringify(siteGate(confirmed, buyer)) === JSON.stringify({ kind: "open", lockedEmail: "jane@x.co" }))
    const route = code("app/api/checkout/site/route.ts")
    check("the route asks the same rule before any payment is made, from the site's session cookie, and uses the account's address", /siteBuyerOfRequest\(admin, request, site\.creatorId\)/.test(route) && /siteGate\(config, buyer\)/.test(route) && /gate\.lockedEmail \?\? clean\(body\.email/.test(route) && route.indexOf("contactOf(request, admin, site, body") < route.indexOf("stripe.paymentIntents.create"))
    check("a held checkout counts the website account as an account, and its address as confirmed", /config\.requireAccount && !input\.buyerId && !input\.buyerSignedIn/.test(code("lib/physical/checkout-server.ts")) && /buyerEmailConfirmed: contact\.signedIn/.test(route))
    const explore = code("app/api/checkout/stripe-session/route.ts")
    check("the Explore checkout keeps its rule: a Storelib account, its email confirmed", /checkoutConfig\.requireAccount && !user/.test(explore) && /checkoutConfig\.requireConfirmedEmail && !user\?\.email_confirmed_at/.test(explore))
    const page = code("app/checkout/site/page.tsx")
    check("the page reads the website's own session cookie for this host and creator", /sessionCookieName\(site\.host\)/.test(page) && /needsSignIn=\{gate\.kind === "sign-in"\}/.test(page))
    check("the sign in link goes to the website's own sign in page, back to this checkout", /siteSignInHref\(here\)/.test(code("app/checkout/site/site-checkout.tsx")))
  }

  console.log("\nOnly a ticked box subscribes")
  {
    const route = code("app/api/checkout/site/route.ts")
    check("the website checkout reads the box only when the store shows it", /optedIn: config\.marketingOptIn && body\.emailOptIn === true/.test(route) && /email_opt_in: contact\.optedIn \? "true" : "false"/.test(route))
    check("the stripe-session and the free checkout no longer take a yes for a box the store hides", /email_opt_in: checkoutConfig\.marketingOptIn && body\.emailOptIn === true/.test(code("app/api/checkout/stripe-session/route.ts")) && /basis: config\.marketingOptIn && body\.emailOptIn === true \? "ticked" : "none"/.test(code("app/api/checkout/process/route.ts")))
    const fulfil = code("lib/checkout/fulfil-cart-session.ts")
    check("the paid basket records the tick on the contact campaigns read (subscribers), never a buyer who did not tick", /consent: metadata\.email_opt_in === "true" \? "ticked" : "none"/.test(fulfil) && /recordCartCustomer\(ctx, s\.paidTotal, s\.firstOrderId, s\.created\[0\]\?\.productId \?\? null, s\.consent \?\? "none"\)/.test(fulfil))
    const now = "2026-10-11T00:00:00.000Z"
    const ticked = planContact(null, { creatorId: SHOP, email: "a@b.co", basis: "ticked", bought: true }, now)
    const none = planContact(null, { creatorId: SHOP, email: "a@b.co", basis: "none", bought: true }, now)
    check("ticked: subscribed (campaigns); not ticked: a customer (never campaigns)", ticked.kind === "insert" && ticked.row.status === "subscribed" && none.kind === "insert" && none.row.status === "customer")
    check("a start with a tick joins the list at Pay, as the Explore checkout's does", /recordCheckoutContactAndWelcome\(admin, \{ creatorId: site\.creatorId, email: contact\.email/.test(route) && /basis: "ticked", bought: false/.test(route))
  }

  console.log("\nA started checkout is kept for its reminder")
  {
    const route = code("app/api/checkout/site/route.ts")
    check("only while Abandoned checkouts is on, with the email, the first line and the PaymentIntent", /if \(contact\.config\.abandonedRecovery\)/.test(route) && /recordCheckoutStart\(admin, \{/.test(route) && /paymentIntentId: s\.paymentIntentId/.test(route))
    check("both a cart of downloads and a cart that ships record it", (route.match(/recordStart\(admin, contact, site, \{/g) ?? []).length === 2)
    check("the whole cart and the site's address are kept beside it (SQL part 127), and a database without the column only loses that", /basket: \{ items: s\.items\.slice\(0, 50\), site: site\.origin/.test(route) && /42703\|PGRST204/.test(route))
    const part = read("supabase/sql/run-now/127_checkout_start_basket.sql")
    check("part 127 adds the column, safe to run twice, and is copied byte for byte", /ADD COLUMN IF NOT EXISTS basket jsonb/.test(part) && /DROP CONSTRAINT IF EXISTS checkout_starts_basket_shape/.test(part) && part.trim().endsWith("notify pgrst, 'reload schema';") && read("supabase/migrations/20261011_checkout_start_basket.sql") === part)
    check("and the check after has its column", /as p127_checkout_start_basket/.test(read("supabase/sql/run-now/99_check_after.sql")))
  }

  console.log("\nNever Stripe's page: Storelib's form, the connected account, Storelib's fee")
  {
    const route = code("app/api/checkout/site/route.ts")
    check("a cart of downloads is a PaymentIntent: destination charge, application fee, the methods the form loaded", /* Changed on purpose (billing reliability): keyed on its exact params (lib/stripe/resilience). */ /stripe\.paymentIntents\.create\(params, \{ idempotencyKey: stripeIdempotencyKey\("site-intent"/.test(route) && /transfer_data: \{ destination: account \}/.test(route) && /application_fee_amount: fee\.platformFeeCents/.test(route) && /payment_method_types: methodsFrom\(body\.paymentMethods\)/.test(route) && !/checkout\.sessions\.create/.test(route))
    check("the readiness rule and the code's place before any payment", /checkoutReadyForCreator\(site\.creatorId\)/.test(route) && /holdCouponUse\(admin, coupon\.id, holder\)/.test(route) && route.indexOf("holdCouponUse(admin, coupon.id, holder)") < route.indexOf("stripe.paymentIntents.create(params")) /* Changed on purpose (billing reliability): the create carries an idempotency key now. */
    check("a call on any host that is not a website is refused", /if \(!site\) return json\(\{ error: "Open the checkout from the shop's website\." \}, 403\)/.test(route))
    const physical = code("lib/physical/checkout-server.ts")
    check("a cart that ships: the held checkout, paid by a PaymentIntent made once per checkout", /stripe\.paymentIntents\.create\(params, \{ idempotencyKey: `physical-intent:\$\{c\.checkoutId\}` \}\)/.test(physical) && /physical_intent: "1"/.test(physical) && /application_fee_amount: c\.fee\.platformFeeCents/.test(physical))
    check("changing the order cancels that payment and lets its stock and code go", /stripe\.paymentIntents\.cancel\(c\.stripe_payment_intent_id\)/.test(physical) && /releaseCheckout\(db, c\.id, "cancelled"/.test(physical))
    const hook = code("app/api/stripe/webhook/route.ts")
    check("the webhook writes both kinds once, before the product checkout's own handler, never a Checkout Session's PaymentIntent twice", hook.indexOf("isCartIntent(pi)") > 0 && hook.indexOf("isCartIntent(pi)") < hook.indexOf("isCheckoutIntent(pi)") && /physical\.isPhysicalIntent\(pi\)/.test(hook))
    const fulfil = code("lib/checkout/fulfil-cart-session.ts")
    check("the buyer's browser needs the client secret, and the basket mark, to be handed a receipt", /sameSecret\(pi\.client_secret, opts\.clientSecret\)/.test(fulfil) && /pi\.metadata\?\.cart === "1" && pi\.metadata\?\.site_basket === "1"/.test(fulfil))
    const ui = code("app/checkout/site/site-checkout.tsx")
    check("the page uses Storelib's own form (StripePay), never Stripe's embedded or hosted page", /<StripePay/.test(ui) && !/EmbeddedCheckout/.test(ui) && !/window\.location\.href = data\.url/.test(ui))
    check("the old embedded basket page is gone; storelib.com/checkout/cart only sends its links on", !existsSync("app/checkout/cart/basket-checkout.tsx") && !/EmbeddedCheckout/.test(code("app/checkout/cart/page.tsx")) && /legacyBasketTarget\(origin, q/.test(code("app/checkout/cart/page.tsx")))
  }

  console.log("\nThe website's carts and buttons go to their own checkout")
  {
    const theme = code("lib/storelib-theme/compat/site.ts")
    /* Changed on purpose: the cart's discount code goes on to the checkout too (couponCode), round cart-1023. */
    /* Changed on purpose (round BC): Back is the page the press was on (backOf, the cart when none is known), not always the cart. */
    /* Changed on purpose (round AF): the address is built first, so a whole cart too long to carry goes on through its cookie. */
    check("an imported theme's checkout hands its lines to /checkout on its own host", /const href = siteCheckoutHref\(\{ items, back, wholeCart: whole, note, attributes, couponCode: code \|\| null \}\)/.test(theme) && /return redirect\(href\)/.test(theme) && /back = "\/cart"\): SiteResponse/.test(theme) && !/basketCheckoutHref\(/.test(theme))
    const proxy = code("proxy.ts")
    check("the proxy serves it on a subdomain and on a connected website domain", (proxy.match(/siteCheckoutFor\(request, /g) ?? []).length === 2 && /pathname === "\/checkout" && \(request\.nextUrl\.searchParams\.has\("items"\)/.test(proxy))
    check("Apple Pay's domain file is the file on every host", /pathname === "\/\.well-known\/apple-developer-merchantid-domain-association"\) return NextResponse\.next\(\)/.test(proxy))
    const cartRoute = code("app/api/checkout/cart/route.ts")
    check("the cart route answers a website with its own checkout, a cart that ships included", (cartRoute.match(/siteCheckoutHref\(\{/g) ?? []).length === 2)
    check("a built site's cart and drawer send a cart that ships to the site's own checkout", /siteCheckoutHref\(\{ items: checkoutItems\(lines\)/.test(code("components/website-builder/cart-page-body.tsx")) && /siteCheckoutHref\(\{ items: checkoutItems\(lines\)/.test(code("lib/website-builder/cart-checkout.ts")))
    const page = code("app/checkout/site/page.tsx")
    check("a membership or a community's tier keeps the Explore checkout on storelib.com", /p\.type === "membership" \|\| p\.community_id/.test(page) && /redirect\(`https:\/\/\$\{getMainDomain\(\)\}\/checkout\?/.test(page))
    check("a product of another shop under this site is not found", /p\.creator_id !== site\.creatorId\) notFound\(\)/.test(page))
    const thanks = code("app/checkout/site/thanks/[token]/page.tsx")
    check("after paying: the thank you page on the site, the receipt one press away on the site, the cart emptied", /siteOfHost\(admin/.test(thanks) && /`\/receipt\/\$\{encodeURIComponent\(token\)\}`/.test(thanks) && /ClearCart/.test(thanks) && /referrer: "no-referrer"/.test(thanks))
    const fulfil = code("lib/checkout/fulfil-cart-session.ts")
    check("the emailed receipt link opens on the website, the seller's links stay on Storelib", /receiptBaseUrl: s\.buyerBaseUrl \?\? null/.test(fulfil) && /baseUrl: s\.baseUrl,\n\s+sale:/.test(fulfil))
    const mail = code("lib/email.tsx")
    check("  and the email takes that address as it is, past SITE_URL, for the receipt and the invoice only", /const receiptUrl = \(path: string\) => \(siteBase \? new URL\(path, siteBase\)\.toString\(\) : buildUrl\(path, baseUrl\)\)/.test(mail) && /receiptUrl\(`\/receipt\/\$\{encodeURIComponent\(receiptToken\)\}`\)/.test(mail) && /receiptUrl\(`\/api\/checkout\/invoice\?token=/.test(mail))
  }

  console.log("\nReview fixes: free products, open payments, hosts that serve a checkout")
  {
    const freeDb = pricingDb({ products: [product(A, SHOP, 0), product(B, SHOP, 0, { pay_what_you_want: true, pwyw_min_price_cents: 0 })] })
    const free = await siteQuote(freeDb, SHOP, { items: [{ productId: A }] })
    check("a free product's Buy button is a free order on the site, priced $0 by the server", free.ok === true && free.quote.totals.totalCents === 0 && free.quote.lines.length === 1, free)
    const pwyw = await priceSiteCart(freeDb, SHOP, { items: [{ productId: B }] })
    check("  a pay what you want product with a $0 minimum and no amount named is free too", pwyw.decision.kind === "free" && pwyw.priced.ok === true && pwyw.priced.coupon === null)
    const named = await priceSiteCart(freeDb, SHOP, { items: [{ productId: B, customPriceCents: 1200 }] })
    check("  and with an amount named it is paid, at that amount", named.decision.kind === "pay" && named.priced.ok === true && named.priced.totalCents === 1200)
    const mixedDb = pricingDb({ products: [product(A, SHOP, 0), product(B, SHOP, 2500)] })
    const mixed = await priceSiteCart(mixedDb, SHOP, { items: [{ productId: A }, { productId: B }] })
    check("  a free line beside a paid one: one payment for the paid one, the free one written at $0", mixed.decision.kind === "pay" && mixed.priced.ok === true && mixed.priced.totalCents === 2500 && mixed.priced.lines.length === 2)
    const stripePage = await priceCart(freeDb, { items: [{ productId: A }] })
    check("  Stripe's pages still never take a $0 line (keepFree is the site checkout's alone)", stripePage.ok === true && stripePage.lines.length === 0)
    const route = code("app/api/checkout/site/route.ts")
    check("  the free action takes it with or without a code, the price checked again on the server", /decision\.kind !== "free" \|\| priced\.ok === false \|\| priced\.totalCents !== 0/.test(route) && /couponId: coupon\?\.id \?\? null/.test(route))

    const sweep = code("lib/checkout/site-payment-sweep.ts")
    check("open payments are closed after their holds: a held checkout's PaymentIntent is cancelled before its stock goes back", /\.is\("stripe_session_id", null\)/.test(sweep) && /\.lt\("expires_at"/.test(sweep) && sweep.indexOf("await cancelled(c.stripe_payment_intent_id)") < sweep.indexOf("await releaseCheckout(db, c.id"))
    check("  an unpaid basket PaymentIntent older than the code's hold is cancelled and its place given back", /metadata\['site_basket'\]:'1' AND status:'\$\{status\}' AND created<\$\{before\}/.test(sweep) && /releaseCouponHold\(db, pi\.metadata\.coupon_id/.test(sweep))
    const cron = code("app/api/cron/physical/route.ts")
    check("  every ten minutes, physical commerce on or off", cron.indexOf("cancelStaleSitePayments(db") > 0 && cron.indexOf("cancelStaleSitePayments(db") < cron.indexOf("isPhysicalCommerceEnabled()"))
    check("  a held checkout past its hold is never paid into again, and the page makes a new one after 25 minutes", /new Date\(existing\.expires_at\)\.getTime\(\) > Date\.now\(\)/.test(code("lib/physical/checkout-server.ts")) && /INTENT_REUSE_MS = 25 \* 60_000/.test(code("app/checkout/site/site-checkout.tsx")))
    check("  a changed name, phone, note or news box is a new held checkout, never stale details", /body\.firstName, body\.lastName, body\.phone, body\.buyerNote, (body\.cartAttributes, )?body\.emailOptIn\]\)/.test(code("app/checkout/site/site-checkout.tsx")))
    check("the confirm call is rate limited like the other payment calls", /async function confirm[\s\S]{0,600}rateLimit\(\{ bucket: "payment", subjects: \[addressSubject\(request\)\]/.test(route))

    const proxy = code("proxy.ts")
    check("an imported theme's site hands /receipt to Storelib's receipt, not the theme's 404", /if \(pathname === "\/receipt" \|\| pathname\.startsWith\("\/receipt\/"\)\) return false/.test(proxy))
    check("a subdomain serves the checkout only for a published website", /!\(await hasLiveAiSite\(subdomain\)\) && \(await hasPublishedWebsite\(subdomain\)\)\) \{\s*const checkout = await siteCheckoutFor/.test(proxy))
    const r = (path: string, search = "") => siteCheckoutRouteFor(path, search, "GET", "andrews.storelib.com")
    check("the page's inside address asked for directly goes to /checkout, behind the site's password", JSON.stringify(r("/checkout/site", "?items=x")) === JSON.stringify({ kind: "redirect", to: "/checkout?items=x", status: 302 }) && JSON.stringify(r("/checkout/site/thanks/abcdefgh12345678")) === JSON.stringify({ kind: "redirect", to: "/checkout/thanks/abcdefgh12345678", status: 302 }))
    check("a preview link's cart keeps the platform's checkout", !onWebsiteHost("andrews.storelib.com", "storelib.com", "/preview/tok/cart") && onWebsiteHost("andrews.storelib.com", "storelib.com", "/cart"))
    const { servingSiteOrigin, firstServingSite } = await import("@/lib/checkout/site-checkout-server")
    const db = sitesDb()
    check("only a published website of this shop serves its checkout", (await servingSiteOrigin(db, SHOP, "https://andrews.storelib.com")) === "https://andrews.storelib.com" && (await servingSiteOrigin(db, OTHER, "https://andrews.storelib.com")) === null && (await servingSiteOrigin(db, OTHER, "https://otherone.storelib.com")) === null && (await servingSiteOrigin(db, SHOP, "https://waiting.shop")) === null)
    check("  the shop's connected domain is preferred when a link names no site", (await firstServingSite(db, SHOP, ["andrews.storelib.com", "www.andrew.shop"])) === "https://www.andrew.shop" && (await firstServingSite(db, OTHER, ["otherone.storelib.com"])) === null)
    const cartRoute = code("app/api/checkout/cart/route.ts")
    check("the cart route, the old basket page and the physical page choose the site's checkout only when it serves one", /const siteServes = siteOrigin !== platformOrigin && !!\(await servingSiteOrigin\(admin, creatorId, siteOrigin\)\)/.test(cartRoute) && (cartRoute.match(/if \(siteServes\) \{/g) ?? []).length === 2 && /siteOrigin: siteServes \? siteOrigin : undefined/.test(cartRoute) && /firstServingSite\(admin, shop/.test(code("app/checkout/cart/page.tsx")) && /<SiteProblem/.test(code("app/checkout/cart/page.tsx")) && /await servingSiteOrigin\(db, shop, site\.origin\)/.test(code("app/checkout/physical/page.tsx")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log("\nFailures:\n" + failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
