/**
 * ===========================================================================
 *  ROUND AE4: LEFTOVERS FROM EARLIER AUDITS
 * ===========================================================================
 * Each block is one leftover, checked by what the code does, not how it is
 * written, wherever it can be run here:
 *
 *   the store's one logo (receipts, the Logo card and the checkout agree on
 *   an imported theme, and the name falls back to the profile's display name)
 *   the Last 30 days line kept under the account that is signed in
 *   the owner's hand-off token: two minutes, and once on each host
 *   an order with no currency: the store's currency on its day, everywhere
 *   the "could not be converted" count: only sales the figure would add
 *   a spreadsheet formula behind a space, a tab or a line break
 *   a second free claim by a buyer who owns two of the product's options
 *   what a customer spent, less refunds
 */
import "./_usd"
import { readFileSync } from "node:fs"
import { fakeDb } from "./_fake-db"

process.env.ANALYTICS_OWN_SECRET = process.env.ANALYTICS_OWN_SECRET || "a-test-secret-that-is-long-enough-for-hmac"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")

const SHOP = "c0000000-0000-4000-8000-0000000000a4"
const USER = "u0000000-0000-4000-8000-0000000000a4"

async function main() {
  console.log("\nThe store's logo, one answer for receipts, the Logo card and the checkout\n")
  {
    const { storeIdentity } = await import("@/lib/store/identity-server")
    const { checkoutBrand } = await import("@/lib/checkout/brand-server")
    const imported = () =>
      fakeDb({
        creators: [{ id: SHOP, display_name: "andrewrullz", username: "andrew", slug: "andrew", avatar_url: "https://img.example/face.jpg", support_email: "hi@shop.example", user_id: USER }],
        profiles: [{ id: USER, display_name: "Andrew Rull", username: "andrew", avatar_url: "https://img.example/face.jpg" }],
        store_settings: [{ creator_id: SHOP }],
        store_theme_installs: [{ id: "i9", creator_id: SHOP, status: "published", store_theme_settings: { settings: { compat: { kind: "shopify", theme: "Dawn" }, shopify: { logo: "shopify://shop_images/offgrid.png" } } } }],
        store_theme_custom_files: [{ install_id: "i9", path: "shopify/config/assets.json", content: JSON.stringify({ "offgrid.png": "https://cdn.example/offgrid.png" }) }],
      })
    const id = await storeIdentity(imported(), SHOP)
    check("an imported theme's logo signs receipts and order emails, not the owner's photo", id.logoUrl === "https://cdn.example/offgrid.png" && id.logoFrom === "website", id)
    const card = await storeIdentity(imported(), SHOP, { skipStoreLogo: true, logoOnly: true })
    check("  and is what the Logo card in Store details says stands in", card.logoUrl === "https://cdn.example/offgrid.png" && card.logoFrom === "website", card)
    const brand = await checkoutBrand(imported(), SHOP)
    check("  the same picture the checkout's header shows", brand.imageUrl === id.logoUrl && brand.kind === "logo", brand)
    check("  under the profile's display name, at checkout and on receipts alike", id.name === "Andrew Rull" && brand.name === "Andrew Rull", { id: id.name, brand: brand.name })

    const own = fakeDb({
      creators: [{ id: SHOP, display_name: "x", username: "andrew", avatar_url: null, user_id: USER }],
      profiles: [{ id: USER, display_name: "Andrew Rull" }],
      store_settings: [{ creator_id: SHOP, store_name: "Offgrid", logo_url: "https://cdn.example/store.png" }],
      store_theme_installs: [{ id: "i9", creator_id: SHOP, status: "published", store_theme_settings: { settings: { logo_url: "https://cdn.example/site.png" } } }],
    })
    const [a, b] = [await storeIdentity(own, SHOP), await checkoutBrand(own, SHOP)]
    check("a logo chosen in Store details is the one both use", a.logoUrl === "https://cdn.example/store.png" && b.imageUrl === "https://cdn.example/store.png" && a.name === "Offgrid" && b.name === "Offgrid", { a: a.logoUrl, b: b.imageUrl })

    const hostile = fakeDb({ creators: [{ id: SHOP, display_name: "X", avatar_url: "javascript:alert(1)", user_id: null }], store_settings: [{ creator_id: SHOP, logo_url: "//evil.example/x.png" }] })
    const h = await storeIdentity(hostile, SHOP)
    check("  only https or a path on storelib.com, on receipts too", h.logoUrl === null, h.logoUrl)
  }

  console.log("\nThe Last 30 days line, kept under the account that is looking\n")
  {
    const { summaryKey } = await import("@/lib/analytics/summary")
    const a = summaryKey("user-a", "website:w1", "Europe/Bucharest")
    const b = summaryKey("user-b", "website:w1", "Europe/Bucharest")
    check("two accounts on one tab keep their numbers apart", !!a && !!b && a !== b, { a, b })
    check("  and a line not told whose numbers they are keeps none", summaryKey(null, "website:w1", "UTC") === null && summaryKey("", "website:w1", "UTC") === null)
    const line = read("components/app/analytics-summary-line.tsx")
    check("  read and written only under that key, and asked again when the account changes", /const kept = key \? keptSummary\(key\) : null/.test(line) && /if \(key\) keepSummary\(key, s\)/.test(line) && /\}, \[property, account\]\)/.test(line) && /storelib\.analytics\.summary\.v2/.test(line))
    check("  the website builder says whose", /account=\{access\.viewer\}/.test(read("app/app/website-builder/page.tsx")) /* Changed on purpose (round 42 team): the viewer key, the owner's id or a member's id and the store's */ && /account=\{account\}/.test(read("app/app/website-builder/website-builder-client.tsx")))
  }

  console.log("\nThe owner's hand-off: two minutes, and once on each host\n")
  {
    const { signOwnHandoff, consumeOwnHandoff, readOwnToken, HANDOFF_TTL_MS } = await import("@/lib/analytics/own-marker")
    const db = fakeDb({ rate_limit_hits: [] })
    const now = Date.now()
    const t = String(signOwnHandoff(SHOP, now))
    check("a hand-off is good for two minutes, no longer", HANDOFF_TTL_MS === 2 * 60_000 && readOwnToken(t, "hand", now + 119_000) === SHOP && readOwnToken(t, "hand", now + 121_000) === null)
    check("  its first use on a host leaves the owner out", (await consumeOwnHandoff(db, t, "shop.example", now)) === SHOP)
    check("  the same link opened again there (a copied one) marks nobody", (await consumeOwnHandoff(db, t, "shop.example", now)) === null)
    check("  the owner opening another of their sites with it is still left out", (await consumeOwnHandoff(db, t, "ana.storelib.com", now)) === SHOP)
    check("  two tokens are two uses", (await consumeOwnHandoff(db, String(signOwnHandoff(SHOP, now)), "shop.example", now)) === SHOP)
    const legacy = Buffer.from(JSON.stringify({ k: "hand", c: SHOP, e: now + 60_000 }), "utf8").toString("base64url")
    const { createHmac } = await import("node:crypto")
    const key = createHmac("sha256", String(process.env.ANALYTICS_OWN_SECRET)).update("storelib.own-marker.v1").digest()
    const unnamed = `${legacy}.${createHmac("sha256", key).update(legacy).digest("hex")}`
    check("  a hand-off from before they had a name of their own is not taken", readOwnToken(unnamed, "hand", now) === null && (await consumeOwnHandoff(db, unnamed, "x.example", now)) === null)
    const down = fakeDb({}, { failInsert: { rate_limit_hits: { code: "42P01", message: "relation does not exist" } } })
    check("  a database that cannot write it down still leaves the owner out", (await consumeOwnHandoff(down, String(signOwnHandoff(SHOP, now)), "shop.example", now)) === SHOP)
    const site = read("lib/analytics/own-site.ts")
    const refresh = Number(/export const REFRESH_MS = (\d+(?:_\d+)?)/.exec(site)?.[1].replace(/_/g, ""))
    check("the app asks for a new one before the last runs out, and never links an old one", refresh > 0 && refresh < HANDOFF_TTL_MS && /window\.setInterval\(primeOwnMarker/.test(site) && /Date\.now\(\) - mintedAt > TOKEN_USABLE_MS\) return siteUrl/.test(site))
    check("the tracker and the marker route both take it once", /consumeOwnHandoff\(db, handoff, handoffHost\(body\.href/.test(read("lib/analytics/collect.ts")) && /consumeOwnHandoff\(createAdminClient\(\), given, here\.host\)/.test(read("app/api/analytics/own/route.ts")))
  }

  console.log("\nAn order with no currency is in what the store sold in that day\n")
  {
    const { currencyAtFrom } = await import("@/lib/store/currency-at")
    const { withOrderCurrency } = await import("@/lib/store/currency-at-read")
    const { toOrderRow } = await import("@/lib/orders/load-rows")
    const { inStoreCurrency } = await import("@/lib/money/report-currency-server")
    const changes = [
      { created_at: "2026-03-01T00:00:00Z", from_currency: "USD", to_currency: "EUR" },
      { created_at: "2026-06-01T00:00:00Z", from_currency: "EUR", to_currency: "RON", restored_at: "2026-06-02T00:00:00Z" },
      { created_at: "2026-07-01T00:00:00Z", from_currency: "EUR", to_currency: "RON" },
    ]
    const at = currencyAtFrom("RON", changes)
    check("the store's currency on each day, from its changes and undos", at("2026-01-10T00:00:00Z") === "USD" && at("2026-04-01T00:00:00Z") === "EUR" && at("2026-06-01T12:00:00Z") === "RON" && at("2026-06-20T00:00:00Z") === "EUR" && at("2026-08-01T00:00:00Z") === "RON", [at("2026-01-10T00:00:00Z"), at("2026-04-01T00:00:00Z"), at("2026-06-01T12:00:00Z"), at("2026-06-20T00:00:00Z"), at("2026-08-01T00:00:00Z")])
    check("  a store that never changed: its currency now", currencyAtFrom("RON", [])("2020-01-01T00:00:00Z") === "RON")

    const legacy = { id: "o1", product_id: "p1", amount_cents: 2500, status: "completed", created_at: "2026-08-01T10:00:00Z", currency: null }
    check("  (it was the platform's dollars on Orders)", toOrderRow(legacy, undefined).currency === "USD")
    const lei = fakeDb({ store_settings: [{ creator_id: SHOP, currency: "RON" }], store_currency_changes: [] })
    const [filled] = await withOrderCurrency(lei, SHOP, [legacy])
    check("Orders reads a lei store's old order as lei, as Analytics does", toOrderRow(filled, undefined).currency === "RON" && legacy.currency === null, filled)
    const report = await inStoreCurrency(lei, SHOP, [legacy], "RON", { rates: async () => [] })
    check("  Analytics adds it as lei, and still counts it as one with no currency recorded", report.rows[0].amount_cents === 2500 && report.unknown === 1 && report.converted === 0)

    const changed = fakeDb({ store_settings: [{ creator_id: SHOP, currency: "RON" }], store_currency_changes: [{ creator_id: SHOP, created_at: "2026-07-01T00:00:00Z", from_currency: "EUR", to_currency: "RON" }] })
    const old = { ...legacy, created_at: "2026-05-04T10:00:00Z", amount_cents: 1000 }
    const [euro] = await withOrderCurrency(changed, SHOP, [old])
    check("an old order from before the store moved from euros to lei is in euros on Orders", toOrderRow(euro, undefined).currency === "EUR", euro)
    const converted = await inStoreCurrency(changed, SHOP, [old], "RON", { rates: async () => [{ asOf: "2026-05-04", rates: { EUR: 1, RON: 5, USD: 1.1 } }] })
    check("  and converted from euros in Analytics, at that day's rate", converted.converted === 1 && converted.rows[0].amount_cents === 5000 && converted.unknown === 1, converted)
    const pagedSrc = read("lib/orders/paged.ts")
    check("  every read of Orders, its export, search and Customers fill it the same way", /return withOrderCurrency\(db, creatorId, ownRows\(out\)\)/.test(pagedSrc) && /withOrderCurrency\(admin, creatorId, ordersData\)/.test(read("lib/orders/load-rows.ts")) && /withOrderCurrency\(db, creatorId, rows\)/.test(read("lib/search/app-search.ts")) && /withOrderCurrency\(admin, creator\.id, readRows/.test(read("app/app/customers/page.tsx")))
  }

  console.log("\nThe 'could not be converted' count is of the figure's own sales\n")
  {
    const { unconvertedIncluded } = await import("@/lib/analytics/unconverted-count")
    const window = { start: Date.parse("2026-09-01T00:00:00Z"), end: Date.parse("2026-10-01T00:00:00Z") }
    const row = (id: string, created_at: string, status: string) => ({ id, product_id: "p", amount_cents: 1000, status, created_at, currency: "JPY" })
    const left = [
      row("a", "2026-09-10T00:00:00Z", "completed"),
      row("b", "2026-09-11T00:00:00Z", "refunded"),
      row("c", "2026-08-31T12:00:00Z", "completed"),
      row("d", "2026-09-12T00:00:00Z", "pending"),
      row("e", "2026-09-13T00:00:00Z", "failed"),
      row("f", "2026-08-01T00:00:00Z", "completed"),
    ]
    check("only lines placed in the period, of orders that are sales", unconvertedIncluded(left, window) === 2, unconvertedIncluded(left, window))
    check("  none left out: none to say", unconvertedIncluded([], window) === 0 && unconvertedIncluded(undefined, window) === 0)
    check("  Analytics' report and its sales cards count it so", /unconvertedIncluded\(inStore\.left, counted \?\? spans\[spans\.length - 1\]\)/.test(read("lib/analytics/report-read.ts")) && /* Changed on purpose (r52): with the community's sales for every place (lib/analytics/community-sales). */ /readOrders\(admin, spans, q\.creatorId, q\.product, q\.window, \{ community: q\.selector\.type === "all" \}\)/.test(read("lib/analytics/report-answer.ts")) && /unconvertedIncluded\(inStore\.left as unknown as Array<\{ created_at: string \}>, q\.span\)/.test(read("lib/analytics/commerce-server.ts")))
  }

  console.log("\nA formula behind a space, a tab or a line break is text in an export\n")
  {
    const { startsLikeFormula } = await import("@/lib/csv/formula-guard")
    const { csvCell } = await import("@/lib/orders/export-csv")
    const { cell } = await import("@/lib/analytics/export-csv")
    const runs = ["=1+1", " =1+1", "  +SUM(A1)", "\t=1", "\r=1", "\n=1", " -2+3", "@x", "\u00a0=1", "\u3000=1", "\uff1d1+1"]
    check("every way a spreadsheet would still run it is caught", runs.every(startsLikeFormula), runs.filter((r) => !startsLikeFormula(r)))
    check("  and ordinary text is left alone", !["Ana Pop", "a=b", "12", " hello", ""].some(startsLikeFormula))
    check("Orders' export writes \" =1+1\" as text", csvCell(" =1+1") === `"' =1+1"` && csvCell("\t=1") === `"'\t=1"`, csvCell(" =1+1"))
    check("Analytics' export too, and its numbers stay numbers", cell(" =HYPERLINK(1)") === "' =HYPERLINK(1)" && cell(-12.5) === "-12.5" && cell("-3") === "-3", cell(" =HYPERLINK(1)"))
    check("the tax report shares the guard", /s = guardFormula\(s\)/.test(read("lib/tax/report-model.ts")))
  }

  console.log("\nA buyer who owns two options of a free product gets no second order\n")
  {
    const db = fakeDb({ entitlements: [{ id: "e1", buyer_id: USER, product_id: "p1", variant_id: "v1" }, { id: "e2", buyer_id: USER, product_id: "p1", variant_id: "v2" }] })
    const single = await db.from("entitlements").select("id").eq("buyer_id", USER).eq("product_id", "p1").maybeSingle()
    check("(maybeSingle answers two rows with an error and no row, which read as not owned)", single.data === null && !!single.error)
    const many = await db.from("entitlements").select("id").eq("buyer_id", USER).eq("product_id", "p1").limit(1)
    check("  one of them, asked for as one", Array.isArray(many.data) && many.data.length === 1)
    const route = read("app/api/checkout/quick-free/route.ts")
    const ownCheck = route.slice(route.indexOf('.from("entitlements")'), route.indexOf("if (existingEntitlement)"))
    check("the quick free claim asks for any one, never maybeSingle", /\.limit\(1\)/.test(ownCheck) && !/maybeSingle/.test(ownCheck) && /const existingEntitlement = Array\.isArray\(owned\) \? owned\[0\] \?\? null : null/.test(route))
  }

  console.log("\nWhat a customer spent, less what they got back\n")
  {
    const { customerSpent } = await import("@/lib/customers/spent")
    const rows = [
      { buyer_email: "Ana@x.com", status: "completed", amount_cents: 5000, refund_amount_cents: null },
      { buyer_email: "ana@x.com", status: "refunded", amount_cents: 3000, refund_amount_cents: null },
      { buyer_email: "ana@x.com", status: "partially_refunded", amount_cents: 2000, refund_amount_cents: 500 },
      { buyer_email: "ana@x.com", status: "failed", amount_cents: 9000, refund_amount_cents: null },
      { buyer_email: "bo@x.com", status: "refunded", amount_cents: 1000, refund_amount_cents: 99999 },
    ]
    const kept = customerSpent(rows, false)
    check("the kept total less every refund on their orders", kept({ email: "ana@x.com", total_spent_cents: 10000 }) === 6500, kept({ email: "ana@x.com", total_spent_cents: 10000 }))
    check("  never below nothing, a refund never more than its payment", kept({ email: "bo@x.com", total_spent_cents: 1000 }) === 0)
    const fromOrders = customerSpent(rows, true)
    check("from the orders when some are in another currency: paid less refunded", fromOrders({ email: "ANA@x.com" }) === 6500, fromOrders({ email: "ANA@x.com" }))
    check("the Customers page draws it", /const spentOf = customerSpent\(inStore\.rows as SpentRow\[\], mixed\)/.test(read("app/app/customers/page.tsx")))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}
void main()
