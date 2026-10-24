/**
 * THE ONEPAGE AS SERVED ON storelib.me, AND THE WAY BACK TO IT (round 11)
 *
 * Round 10's lesson: every check passed on storelib.com while storelib.me said
 * "Not found". So every request here is first put to the OnePage host's own
 * router (lib/onepage/host-route onePageRoute, which proxy.ts obeys) with Host
 * storelib.me, and only a request it lets through is handed to the route,
 * over the journey harness (tests/_journey: the real handlers, an in-memory
 * PostgREST, a Stripe world).
 *
 *   return     the OnePage address a checkout or product page goes back to:
 *              exactly a OnePage, never anywhere else (no open redirect)
 *   links      a OnePage link is the final storelib.com address, one hop,
 *              carrying the way back
 *   checkout   checkoutReturns honours a storelib.me OnePage as `cancel`, and
 *              a OnePage on the creator's own verified domain, and nothing else
 *   instant    the window's whole purchase, every call routed as storelib.me
 *              routes it: facts, a code, the PaymentIntent, confirm, free
 */
import "./_journey/env"
import { Journey } from "./_journey/harness"
import { instantOrderBody } from "../lib/onepage/product-block"
import { onePageRoute } from "../lib/onepage/host-route"
import { onePageOutboundHref, onePageReturnTarget, platformHref } from "../lib/onepage/return-address"
import { checkoutReturns, onePageReturnFor } from "../lib/checkout/site-hosts"
import { handoffCard } from "../lib/platform/open-in-app"
import { appleAppSiteAssociation, opensInApp } from "../lib/platform/app-links"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 700)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)

/** What storelib.me does with this request, exactly as proxy.ts asks it. */
function onMe(method: string, pathAndQuery: string) {
  const [pathname, query] = pathAndQuery.split("?")
  return onePageRoute({ host: "storelib.me", pathname, search: query ? `?${query}` : "", method, mainDomain: "storelib.com" })
}

async function main() {
  section("1. The address Back returns to: a OnePage, and nothing that only looks like one")
  const ok: Array<[string, string]> = [
    ["https://storelib.me/mara", "https://storelib.me/mara"],
    ["https://storelib.me/mara?utm_source=ig", "https://storelib.me/mara?utm_source=ig"],
    ["https://storelib.me/mara#product-pack", "https://storelib.me/mara"],
    ["https://storelib.me/mara.sounds", "https://storelib.me/mara.sounds"],
    ["https://storelib.com/mara/links", "https://storelib.com/mara/links"],
  ]
  for (const [raw, want] of ok) check(`${raw} goes back to ${want}`, onePageReturnTarget(raw) === want, onePageReturnTarget(raw))
  const refused = [
    "https://evil.com/mara",
    "https://storelib.me.evil.com/mara",
    "https://evilstorelib.me/mara",
    "http://storelib.me/mara",
    "https://storelib.me:8443/mara",
    "https://user:pw@storelib.me/mara",
    "https://storelib.me@evil.com/mara",
    "//evil.com/mara",
    "/mara",
    "javascript:alert(1)",
    "https://storelib.me/",
    "https://storelib.me/mara/",
    "https://storelib.me/mara/links",
    "https://storelib.me/a/b",
    "https://storelib.me/checkout",
    "https://storelib.me/app",
    "https://storelib.me/%2F%2Fevil.com",
    "https://storelib.me/..",
    "https://storelib.me/ma ra",
    "https://storelib.me\\@evil.com/mara",
    "https://storelib.com/mara",
    "https://storelib.com/checkout/links",
    "https://mara.example/links",
    `https://storelib.me/${"a".repeat(3000)}`,
  ]
  for (const raw of refused) check(`refused: ${raw.slice(0, 60)}`, onePageReturnTarget(raw) === null, onePageReturnTarget(raw))
  check("a creator's own domain only when it is theirs, and only its /links", onePageReturnTarget("https://mara.example/links", { ownHosts: ["mara.example"] }) === "https://mara.example/links" && onePageReturnTarget("https://mara.example/shop", { ownHosts: ["mara.example"] }) === null && onePageReturnTarget("https://other.example/links", { ownHosts: ["mara.example"] }) === null)

  section("2. A OnePage link is the final address: one navigation, carrying the way back")
  const back = "https://storelib.me/mara?utm_source=ig"
  const toCheckout = onePageOutboundHref("/checkout?productId=p1", back)
  check("the checkout on storelib.com itself, with cancel=<the OnePage>", toCheckout === `https://storelib.com/checkout?productId=p1&cancel=${encodeURIComponent(back)}`, toCheckout)
  const toPage = onePageOutboundHref("/p/tech-pack", back)
  check("the product page on storelib.com itself, with back=<the OnePage>", toPage === `https://storelib.com/p/tech-pack?back=${encodeURIComponent(back)}`, toPage)
  check("before the page knows its own address (the server's drawing), still the final address", onePageOutboundHref("/checkout?productId=p1", null) === "https://storelib.com/checkout?productId=p1")
  check("a receipt, the terms, a library: the platform's own host", platformHref("/receipt/abc") === "https://storelib.com/receipt/abc" && platformHref("/terms") === "https://storelib.com/terms")
  check("anything that is not a platform path is left as it is", platformHref("#") === "#" && platformHref("https://x.example/") === "https://x.example/" && platformHref("//evil.com") === "//evil.com")
  const r = onMe("GET", "/checkout?productId=p1")
  check("(the old relative link was a 308 off storelib.me first)", r?.kind === "redirect" && r.location === "https://storelib.com/checkout?productId=p1", r)
  check("a product link with the way back stays on the web on an iPhone, not the app", (appleAppSiteAssociation().applinks.details[0].components[0] as Record<string, unknown>)["?"] !== undefined && opensInApp("/p/tech-pack"))

  section("3. The checkout's Back: the OnePage, checked on the server")
  const j = await Journey.start()
  const seller = await j.signUp("maker@example.com", { name: "Mara Maker" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "mara" } })
  const creator = j.rows("creators")[0]
  const cid = creator.id as string
  const a = await checkoutReturns({ creatorId: cid, cancel: "https://storelib.me/mara?utm_source=ig" })
  check("cancel=storelib.me/mara is where Back goes", a.cancel === "https://storelib.me/mara?utm_source=ig" && a.success === null, a)
  const b = await checkoutReturns({ creatorId: cid, cancel: "https://evil.com/mara" })
  check("cancel=evil.com is dropped: Back goes to the product as before", b.cancel === null && b.success === null, b)
  const c = await checkoutReturns({ creatorId: cid, cancel: "https://storelib.me/mara/../../evil.com/x" })
  check("a path that walks out of the name is dropped", c.cancel === null, c)
  const walked = await checkoutReturns({ creatorId: cid, cancel: "https://storelib.me/mara/../other" })
  check("  and one that walks to another name is read as the address it is: still a OnePage on storelib.me", walked.cancel === "https://storelib.me/other", walked)
  j.db.insert("custom_domains", { creator_id: cid, domain: "mara.example", status: "active" }, {})
  const d = await checkoutReturns({ creatorId: cid, cancel: "https://mara.example/links" })
  check("the OnePage on the creator's own verified domain", d.cancel === "https://mara.example/links", d)
  const e = await checkoutReturns({ creatorId: cid, cancel: "https://notmara.example/links" })
  check("somebody else's domain is dropped", e.cancel === null, e)
  check("the product page's back= the same way", (await onePageReturnFor(cid, "https://storelib.me/mara")) === "https://storelib.me/mara" && (await onePageReturnFor(cid, "https://mara.example/links")) === "https://mara.example/links" && (await onePageReturnFor(cid, "https://evil.com/x")) === null && (await onePageReturnFor(cid, undefined)) === null)

  section("4. Instant checkout, bought as storelib.me serves it")
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Mara Sounds", supportEmail: "hello@mara.example", defaultCountry: "US" } })
  await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "individual", country: "US" } })
  const acct = j.rows("creators")[0].stripe_account_id as string
  j.world.activate(acct)
  await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct })
  const [pack] = j.db.insert("products", { creator_id: cid, type: "digital", title: "Tech House Pack", slug: "tech-house-pack", description: "<p>Pack</p>", status: "published", archived: false, price_cents: 2000, thumbnail_url: "https://cdn.example.com/p.jpg", pay_what_you_want: false }, {})
  const [guide] = j.db.insert("products", { creator_id: cid, type: "digital", title: "Free Guide", slug: "free-guide", description: "<p>Guide</p>", status: "published", archived: false, price_cents: 0, thumbnail_url: null, pay_what_you_want: false }, {})
  await j.call("POST /api/coupons", { as: seller, body: { code: "HALF", discount_type: "percentage", discount_value: 50 } })

  /** A request the page makes, refused here exactly when storelib.me would refuse it. */
  const served = async (route: string, opts: { body?: unknown } = {}) => {
    const [method, path] = route.split(" ")
    const decision = onMe(method, path)
    check(`  storelib.me lets ${method} ${path.split("?")[0]} through`, decision?.kind === "next", decision)
    if (decision?.kind !== "next") return { status: 404, json: null as any }
    return j.call(route, { ...opts, host: "storelib.me" })
  }

  const facts = await served(`GET /api/onepage/product?id=${pack.id}`)
  check("the window reads the product's facts", facts.status === 200 && facts.json?.checkout?.instant === true, { status: facts.status, body: facts.json })
  const code = await served("POST /api/coupons/validate", { body: { code: "half", productId: pack.id, variantId: null, customPriceCents: null, pricing: null } })
  check("the code is checked: 10.00 off", code.json?.ok === true && code.json?.discountCents === 1000, code.json)
  const started = await served("POST /api/checkout/stripe-session", { body: instantOrderBody({ productId: pack.id as string, couponCode: "HALF", email: "bea@example.com", name: "Bea Buyer" }, false) })
  check("the PaymentIntent is made, for 10.00", started.status === 200 && typeof started.json?.clientSecret === "string", { status: started.status, body: started.json })
  if (started.json?.paymentIntentId) j.world.payIntent(started.json.paymentIntentId)
  const confirmed = await served("POST /api/checkout/confirm-payment", { body: { paymentIntentId: started.json?.paymentIntentId, clientSecret: started.json?.clientSecret } })
  check("confirm-payment makes the order and answers its receipt", confirmed.status === 200 && typeof confirmed.json?.receiptToken === "string", { status: confirmed.status, body: confirmed.json })
  check("one order, 10.00", j.rows("orders").filter((o) => o.buyer_email === "bea@example.com").length === 1 && j.rows("orders").find((o) => o.buyer_email === "bea@example.com")?.amount_cents === 1000)
  const free = await served("POST /api/checkout/process", { body: instantOrderBody({ productId: guide.id as string, email: "cal@example.com", name: "Cal" }, true) })
  check("the free one: an order and its receipt", free.status === 200 && typeof free.json?.receiptToken === "string", { status: free.status, body: free.json })
  const receipt = onMe("GET", `/receipt/${confirmed.json?.receiptToken ?? "x"}`)
  check("the receipt link in the window is storelib.com's (storelib.me would only 308 it)", platformHref(`/receipt/${confirmed.json?.receiptToken}`).startsWith("https://storelib.com/receipt/") && receipt?.kind === "redirect")
  check("the platform's switches answer on storelib.me (the header asks on every page)", onMe("GET", "/api/platform/flags")?.kind === "next" && onMe("POST", "/api/platform/flags")?.kind === "not-found")
  check("nothing that reaches an account does", onMe("GET", "/api/account/settings")?.kind === "not-found" && onMe("POST", "/api/checkout/refund")?.kind === "not-found")

  section("5. No Open in Storelib card in the OnePage editor or its preview")
  const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0"
  const card = (path: string) => handoffCard({ ua, requestedWith: null, path, quietCookie: null, appSeenCookie: null, appStoreId: "123", signedIn: true })
  check("not on the editor", card("/app/onepage") === null && card("/app/onepage?tab=design") === null)
  check("not in the preview frame", card("/onepage-preview?embedded=1") === null)
  check("still where it belongs (a community, shared through Instagram)", card("/community/clay") !== null)

  console.log(`\n  server errors: ${JSON.stringify(j.serverErrors).slice(0, 600)}`)
  check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
