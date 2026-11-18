/**
 * ===========================================================================
 *  ROUND AX, TRACK 5, THROUGH THE REAL ROUTES (tests/_journey, strict)
 * ===========================================================================
 * A basket a discount code makes free, pressed again after its answer was
 * lost, and two sends of the same press in flight at once: one basket, one
 * receipt email, one sale notice, a one use code used once, a limited copy
 * taken once, nothing left held. Through a built site's cart
 * (app/api/checkout/cart) and the website's checkout (app/api/checkout/site,
 * free), over the in-memory PostgREST. A page from before this round (no
 * attempt id) writes a basket per press, as it did. The pure parts and the
 * wiring are in tests/free-basket-retry-ax.test.ts.
 */
import "./_journey/env"
import { Journey } from "./_journey/harness"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 700)}`}`)
}

function newProduct(j: Journey, creatorId: string, p: { title: string; priceCents: number; salesLimit?: number }): string {
  const slug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const [row] = j.db.insert("products", { creator_id: creatorId, type: "digital", title: p.title, slug, description: `<p>${p.title}</p>`, status: "published", archived: false, price_cents: p.priceCents, thumbnail_url: "https://cdn.example.com/p.jpg", pay_what_you_want: false, ...(p.salesLimit ? { sales_limit: p.salesLimit } : {}) }, {})
  return row.id as string
}

async function main() {
  const j = await Journey.start()
  const seller = await j.signUp("maker-ax@example.com", { name: "Mara Maker" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "mara-ax" } })
  const creator = j.rows("creators")[0]
  const creatorId = creator.id as string
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Mara Sounds", supportEmail: "hello@mara.example", defaultCountry: "US" } })
  const beats = newProduct(j, creatorId, { title: "Beat Pack", priceCents: 1500, salesLimit: 20 })
  const samples = newProduct(j, creatorId, { title: "Sample Pack", priceCents: 900 })
  const items = [{ productId: beats, quantity: 1 }, { productId: samples, quantity: 1 }]
  const code = async (name: string, limit: number) => {
    const made = await j.call("POST /api/coupons", { as: seller, body: { code: name, discount_type: "percentage", discount_value: 100, usage_limit: limit } })
    check(`a 100% code ${name} for ${limit} use${limit === 1 ? "" : "s"}`, made.status === 200 || made.status === 201, { status: made.status, body: made.json })
  }
  const lines = (email: string) => j.rows("orders").filter((o) => o.buyer_email === email)
  const baskets = (email: string) => new Set(lines(email).map((o) => o.stripe_session_id)).size
  const used = (name: string) => j.rows("coupons").find((c) => c.code === name)?.usage_count
  const held = () => j.rows("coupon_holds").length + j.rows("product_sale_holds").length
  const sellerMail = () => j.net.to("maker-ax@example.com").length + j.net.to("hello@mara.example").length
  const beatsSold = () => j.rows("orders").filter((o) => o.product_id === beats && o.status === "completed").length

  console.log("\n1. A built site's cart a code makes free, pressed again (app/api/checkout/cart)")
  await code("ONEBASKET", 1)
  const cartPress = (email: string, attemptId: string | undefined, couponCode: string) => ({
    items,
    couponCode,
    returnPath: "/cart",
    buyer: { firstName: "Bea", lastName: "Buyer", email, agreedToTerms: true },
    ...(attemptId ? { attemptId } : {}),
  })
  const bea = cartPress("bea@example.com", "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", "ONEBASKET")
  const s1 = sellerMail()
  const r1 = await j.call("POST /api/checkout/cart", { body: bea, headers: { "x-forwarded-for": "198.51.100.31" } })
  const beaMails = j.net.to("bea@example.com").length
  const s2 = sellerMail()
  check("the first press writes the basket: two lines, one receipt email", r1.status === 200 && r1.json?.free === true && typeof r1.json?.url === "string" && lines("bea@example.com").length === 2 && baskets("bea@example.com") === 1 && beaMails >= 1, { status: r1.status, body: r1.json, lines: lines("bea@example.com").length })
  /* Its answer never reached the page, and the buyer presses again. */
  const r2 = await j.call("POST /api/checkout/cart", { body: bea, headers: { "x-forwarded-for": "198.51.100.31" } })
  check("the same press again: one basket, not two", lines("bea@example.com").length === 2 && baskets("bea@example.com") === 1, lines("bea@example.com").map((o) => o.stripe_session_id))
  check("  answered with that basket's receipt, not \"That code has been used up\"", r2.status === 200 && r2.json?.url === r1.json?.url && r2.json?.free === true, { status: r2.status, body: r2.json })
  check("  no second receipt email, no second sale notice", j.net.to("bea@example.com").length === beaMails && sellerMail() === s2 && s2 > s1, { buyer: j.net.to("bea@example.com").map((m) => m.subject), seller: [s1, s2, sellerMail()] })
  check("  the one use code counted once, the limited copy once, nothing left held", used("ONEBASKET") === 1 && beatsSold() === 1 && held() === 0, { used: used("ONEBASKET"), sold: beatsSold(), holds: [j.rows("coupon_holds"), j.rows("product_sale_holds")] })
  const eve = await j.call("POST /api/checkout/cart", { body: cartPress("eve@example.com", "11111111-2222-4333-8444-555555555555", "ONEBASKET"), headers: { "x-forwarded-for": "198.51.100.32" } })
  check("somebody else's press still finds the code used up (the limit holds)", eve.status === 400 && lines("eve@example.com").length === 0, { status: eve.status, body: eve.json })

  await code("RACEBASKET", 1)
  const cal = cartPress("cal@example.com", "0f1e2d3c-4b5a-4968-8776-655443322110", "RACEBASKET")
  const c3 = sellerMail()
  /* Two sends of the same press in flight at once (a retry while the first is still being written). */
  const [x1, x2] = await Promise.all([
    j.call("POST /api/checkout/cart", { body: cal, headers: { "x-forwarded-for": "198.51.100.33" } }),
    j.call("POST /api/checkout/cart", { body: cal, headers: { "x-forwarded-for": "198.51.100.33" } }),
  ])
  check("two sends at once meet at the receipt tokens: one basket of two lines", lines("cal@example.com").length === 2 && baskets("cal@example.com") === 1, lines("cal@example.com").map((o) => [o.product_id, o.stripe_session_id]))
  check("  both answered with that basket", x1.status === 200 && x2.status === 200 && x1.json?.url === x2.json?.url, { a: [x1.status, x1.json], b: [x2.status, x2.json] })
  check("  one receipt email, one sale notice's worth", j.net.to("cal@example.com").length === beaMails && sellerMail() - c3 === s2 - s1, { buyer: j.net.to("cal@example.com").map((m) => m.subject), seller: sellerMail() - c3, first: s2 - s1 })
  check("  the code counted once, the copy once, nothing left held", used("RACEBASKET") === 1 && beatsSold() === 2 && held() === 0, { used: used("RACEBASKET"), sold: beatsSold(), holds: [j.rows("coupon_holds"), j.rows("product_sale_holds")] })

  await code("OLDPAGE", 5)
  const old = cartPress("dee@example.com", undefined, "OLDPAGE")
  await j.call("POST /api/checkout/cart", { body: old, headers: { "x-forwarded-for": "198.51.100.34" } })
  await j.call("POST /api/checkout/cart", { body: old, headers: { "x-forwarded-for": "198.51.100.34" } })
  check("a page from before this round (no attempt id) writes as it did: a basket per press", baskets("dee@example.com") === 2 && lines("dee@example.com").length === 4 && used("OLDPAGE") === 2, { baskets: baskets("dee@example.com"), lines: lines("dee@example.com").length, used: used("OLDPAGE") })
  const freshPress = await j.call("POST /api/checkout/cart", { body: { ...old, attemptId: "22222222-3333-4444-8555-666666666666" }, headers: { "x-forwarded-for": "198.51.100.34" } })
  check("a new press (a new attempt id) is a new basket", freshPress.status === 200 && baskets("dee@example.com") === 3, { status: freshPress.status, body: freshPress.json })

  console.log("\n2. The website's checkout a code makes free, pressed again (app/api/checkout/site, free)")
  j.db.insert("store_theme_installs", { creator_id: creatorId, status: "published", published_at: new Date().toISOString(), sort_order: 0, name: "Mara" }, {})
  const host = "mara-ax.storelib.com"
  const siteHeaders = { "x-forwarded-for": "198.51.100.41", origin: `https://${host}` }
  await code("SITEFREE", 1)
  const sitePress = { action: "free", items, couponCode: "SITEFREE", email: "fay@example.com", firstName: "Fay", lastName: "Reader", agreedToTerms: true, wholeCart: true, attemptId: "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d" }
  const quote = await j.call("POST /api/checkout/site", { host, headers: siteHeaders, body: { action: "quote", items, couponCode: "SITEFREE" } })
  check("the website's checkout prices the basket at 0 with the code", quote.status === 200 && quote.json?.totals?.totalCents === 0, { status: quote.status, totals: quote.json?.totals, error: quote.json?.error })
  const f3 = sellerMail()
  const [w1, w2] = await Promise.all([
    j.call("POST /api/checkout/site", { host, headers: siteHeaders, body: sitePress }),
    j.call("POST /api/checkout/site", { host, headers: siteHeaders, body: sitePress }),
  ])
  const fayMails = j.net.to("fay@example.com").length
  check("two sends at once: one basket of two lines", lines("fay@example.com").length === 2 && baskets("fay@example.com") === 1, { lines: lines("fay@example.com").length, a: [w1.status, w1.json], b: [w2.status, w2.json] })
  check("  both answered with its thank you page", w1.status === 200 && w2.status === 200 && typeof w1.json?.thanks === "string" && w1.json?.receiptToken === w2.json?.receiptToken, { a: [w1.status, w1.json], b: [w2.status, w2.json] })
  const w3 = await j.call("POST /api/checkout/site", { host, headers: siteHeaders, body: sitePress })
  check("the same press later: that basket, not \"That code has been used up\"", w3.status === 200 && w3.json?.receiptToken === w1.json?.receiptToken && lines("fay@example.com").length === 2, { status: w3.status, body: w3.json })
  check("  one receipt email, one sale notice's worth, the code once, nothing held", fayMails >= 1 && j.net.to("fay@example.com").length === fayMails && sellerMail() - f3 === s2 - s1 && used("SITEFREE") === 1 && held() === 0, { buyer: j.net.to("fay@example.com").length, seller: sellerMail() - f3, used: used("SITEFREE"), holds: held() })
  const otherSite = await j.call("POST /api/checkout/site", { host, headers: siteHeaders, body: { ...sitePress, email: "gus@example.com", firstName: "Gus", attemptId: "33333333-4444-4555-8666-777777777777" } })
  check("somebody else's press there still finds the code used up", otherSite.status === 400 && lines("gus@example.com").length === 0, { status: otherSite.status, body: otherSite.json })

  check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
