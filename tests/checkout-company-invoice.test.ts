/**
 * "Buying for a business" is the store's choice (round chk-1021).
 *
 * Every checkout used to offer "Buying for a business" (in Romanian "Cumpăr
 * pentru o firmă"): a box that opens the company's name, tax number and
 * address for an invoice made out to it. Most buyers are people, and the
 * box is one more thing to read before Pay. Now it shows only where the
 * seller turns on Settings › Checkout › Company invoices: off for a new
 * store; SQL part 256 turned it on, once, for the stores that already had a
 * company order or their own tax number in Business details. Every checkout
 * draws it from the same setting, every route that takes the payment
 * ignores company details while it is off, and the editor's preview shows
 * it as the checkout does.
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { DEFAULT_CHECKOUT, checkoutConfig, mergeCheckout } from "@/lib/store/checkout-config"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nThe setting")
check("off for a new store", DEFAULT_CHECKOUT.businessInvoice === false && checkoutConfig(null).businessInvoice === false && checkoutConfig({}).businessInvoice === false)
check("on when the store turned it on, off when it turned it off", checkoutConfig({ businessInvoice: true }).businessInvoice === true && checkoutConfig({ businessInvoice: false }).businessInvoice === false)
check("anything but true or false is the default", checkoutConfig({ businessInvoice: "yes" }).businessInvoice === false && checkoutConfig({ businessInvoice: 1 }).businessInvoice === false)
check("a change from Settings keeps the rest", (() => { const m = mergeCheckout({ marketingOptIn: false, cashOnDelivery: true }, { businessInvoice: true }); return m.businessInvoice && !m.marketingOptIn && m.cashOnDelivery })())
check("kept in the checkout object Settings › Checkout already saves (part 109), no column of its own", /businessInvoice: bool\(o\.businessInvoice, DEFAULT_CHECKOUT\.businessInvoice\)/.test(read("lib/store/checkout-config.ts")))

console.log("\nSettings › Checkout")
const panel = read("components/app/settings/checkout-panel.tsx")
check("a Company invoices switch under Customer information, saved like every other", /label=\{tt\("Company invoices"\)\}/.test(panel) && /checked=\{config\.businessInvoice\}/.test(panel) && /change\(\{ businessInvoice: v \}\)/.test(panel))
check("it says what the buyer sees", /Adds “Buying for a business” to checkout\./.test(panel))
check("the admin's docs name it", /businessInvoice: "Company invoices"/.test(read("lib/admin/commerce-docs-facts.ts")))

console.log("\nEvery checkout draws it from the setting")
const client = read("app/(storelib)/checkout/checkout-client.tsx")
const site = read("app/(storelib)/checkout/site/site-checkout.tsx")
check("the product checkout (storelib.com, a creator's page, a OnePage)", /!isFree && checkoutConfig\.businessInvoice \? \(\s*<section aria-label="Invoice">/.test(client) && /business: businessOn && checkoutConfig\.businessInvoice \? business : null/.test(client) && /if \(!businessOn \|\| !checkoutConfig\.businessInvoice\) return null/.test(client))
check("the website's checkout, built or imported theme, digital or shipped", /!isFree && config\.businessInvoice \? \(\s*<section aria-label=\{ct\("Invoice"\)\}>/.test(site) && /business: businessOn && config\.businessInvoice \? business : null/.test(site) && /if \(!businessOn \|\| !config\.businessInvoice\) return null/.test(site))
check("the website's page hands it the store's settings", /config=\{checkoutConfigInMarket\(config, market\.charge\)\}/.test(read("app/(storelib)/checkout/site/page.tsx")) && /checkoutConfigInMarket<C extends \{ codFeeCents: number \}>\(config: C/.test(read("lib/markets/checkout-charge.ts")))
check("the editor's preview draws the website's checkout with the store's settings", /config=\{data\.config\}/.test(read("app/(storelib)/checkout/preview/preview-document.tsx")) && /loadCheckoutConfig\(db, creatorId\)/.test(read("lib/checkout-text/preview-server.ts")))

console.log("\nEvery route that takes the payment ignores it while it is off")
const siteRoute = read("app/api/checkout/site/route.ts")
const session = read("app/api/checkout/stripe-session/route.ts")
const cart = read("app/api/checkout/cart/route.ts")
check("the website's checkout", /if \(contact\.config\.businessInvoice && body\.business !== undefined && body\.business !== null\)/.test(siteRoute))
check("the product checkout: ignored, never refused, when off", /if \(!checkoutConfig\.businessInvoice\) business = null/.test(session) && /if \(business && business\.ok === false\) return NextResponse\.json/.test(session))
check("  checked after the store's settings are read", session.indexOf("if (!checkoutConfig.businessInvoice) business = null") > session.indexOf("const checkoutConfig = await loadCheckoutConfig(admin, creator.id)"))
check("Stripe's own page for a basket asks for a tax number only where it is on", /\.\.\.\(businessInvoice \? \{ tax_id_collection: \{ enabled: true \} \} : \{\}\)/.test(cart) && /businessInvoice = config\.businessInvoice/.test(cart))

console.log("\nStores that already relied on it keep it (SQL part 256)")
const sql = read("supabase/sql/run-now/256_company_invoices_setting.sql")
const lines = sql.split("\n").filter(Boolean)
check("one comment and one statement, one per line, then the API reloads", lines.length === 3 && lines[0].startsWith("/*") && /;\s*$/.test(lines[1]) && lines[2] === "notify pgrst, 'reload schema';")
check("needs part 109 and skips with a notice without it", /IF to_regclass\('public\.store_settings'\) IS NULL THEN RAISE NOTICE/.test(sql))
check("on for a store that has had an order with company details", /SELECT DISTINCT o\.creator_id, '\{"businessInvoice": true\}'::jsonb FROM public\.orders o JOIN public\.creators c ON c\.id = o\.creator_id WHERE o\.business_details IS NOT NULL/.test(sql))
check("on for a store with its own tax number in Business details", /coalesce\(btrim\(s\.legal ->> 'taxId'\), ''\) <> ''/.test(sql))
check("a store that chose either way is left as it chose", (sql.match(/NOT \((public\.store_settings|s)\.checkout \? 'businessInvoice'\)/g) ?? []).length === 2)
check("writes only that key, adding a settings row only where a store with company orders had none", /checkout = public\.store_settings\.checkout \|\| '\{"businessInvoice": true\}'::jsonb/.test(sql) && !/DELETE|DROP|orders SET/i.test(sql))
check("reads only the columns that exist (parts 32, 36, 153)", /column_name = 'business_details'/.test(sql) && /column_name = 'creator_id'/.test(sql) && /column_name = 'legal'/.test(sql))
check("the migration copy is the same", existsSync("supabase/migrations/20270205_company_invoices_setting.sql") && read("supabase/migrations/20270205_company_invoices_setting.sql") === sql)
check("the check after knows it", /as p256_company_invoices_setting[,;]/.test(read("supabase/sql/run-now/99_check_after.sql")))
check("the README and the bundles carry it", /`256_company_invoices_setting\.sql`/.test(read("supabase/sql/run-now/README.md")) && /-- part 256_company_invoices_setting\.sql/.test(read("supabase/sql/run-four/3_of_4_latest.sql")) && /"256_company_invoices_setting\.sql"/.test(read("lib/admin/sql-parts.generated.ts")))

console.log("\nThe words")
check("the buyer's words are in the checkout's dictionaries (Romanian: Cumpăr pentru o firmă)", /"Buying for a business": "Cumpăr pentru o firmă"/.test(read("lib/checkout-text/dict/ro.ts")))
check("Help says where it is turned on", /Company invoices in Settings > Checkout/.test(read("lib/help/physical-articles.ts")))
for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
  const cat = read(`lib/i18n/catalog/${lang}.ts`)
  check(`  ${lang}: the switch is translated`, /"Company invoices": "/.test(cat) && /"Adds “Buying for a business” to checkout\./.test(cat))
}

console.log("\nA cart that ships keeps the company too, on every order line (SQL part 259)")
{
  const site = read("app/api/checkout/site/route.ts")
  const server = read("lib/physical/checkout-server.ts")
  check("the website's checkout hands it to a cart that ships, as checked and only where the switch is on", /if \(ships\) return shippedIntent\(request, admin, site, body, contact, origin, attribution, business\?\.ok \? business\.value : null\)/.test(site) && /paymentMethods: body\.paymentMethods,\s*business,\s*\}\)/.test(site))
  check("  and to cash on delivery, by the same rule", /contact\.config\.businessInvoice && body\.business !== undefined && body\.business !== null \? checkBusiness\(body\.business\) : null/.test(site) && /business: business\?\.ok \? business\.value : null,\s*cashOnDelivery: true,/.test(site))
  check("the held checkout keeps it before a free or cash order is placed in the same call", server.indexOf('update({ business_details: business })') > 0 && server.indexOf('update({ business_details: business })') < server.indexOf("const done = await completeCheckout"))
  const sql = read("supabase/sql/run-now/259_checkout_business_details.sql")
  check("part 259: one column on the checkout, shaped like the order's, no rows changed", /ADD COLUMN IF NOT EXISTS business_details jsonb/.test(sql) && /pg_column_size\(business_details\) <= 4096\)\) NOT VALID/.test(sql) && !/UPDATE|DELETE/i.test(sql) && sql.trimEnd().endsWith("notify pgrst, 'reload schema';"))
  check("  its migration copy, its column in the check after, its README row", read("supabase/migrations/20270206_checkout_business_details.sql") === sql && /* Changed on purpose: later parts are checked after it. */ /as p259_checkout_business_details[,;]/.test(read("supabase/sql/run-now/99_check_after.sql")) && /`259_checkout_business_details\.sql`/.test(read("supabase/sql/run-now/README.md")))

  /* The paid checkout, for real: completeCheckout against a small stand in for the database. */
  type Row = Record<string, unknown>
  const company = { company: "Globex SRL", taxId: "RO12345678", country: "RO", line1: "Strada Lungă 4", line2: "", city: "Cluj-Napoca", postalCode: "400001", region: "Cluj" }
  function standIn(co: Row) {
    const orders: Row[] = []
    const writes: { table: string; values: Row; ids: unknown }[] = []
    const from = (table: string) => {
      const q: { op: string; values?: Row; filters: [string, string, unknown][]; select?: string } = { op: "select", filters: [] }
      const run = async (): Promise<{ data: unknown; error: null }> => {
        if (table === "commerce_checkouts" && q.op === "select") return { data: co, error: null }
        if (table === "commerce_checkouts" && q.op === "update") return { data: [], error: null }
        if (table === "orders" && q.op === "insert") {
          const row = { ...q.values, id: `o${orders.length + 1}` }
          orders.push(row)
          return { data: { id: row.id }, error: null }
        }
        if (table === "orders" && q.op === "update") {
          const ids = q.filters.find((f) => f[0] === "id" && f[1] === "in")?.[2] as string[] | undefined
          if (q.values && "business_details" in q.values) writes.push({ table, values: q.values, ids })
          for (const o of orders) if (ids?.includes(o.id as string)) Object.assign(o, q.values)
          return { data: null, error: null }
        }
        return { data: null, error: null }
      }
      const b: Record<string, unknown> = {
        select: (s?: string) => ((q.select = s), b),
        insert: (v: Row) => ((q.op = "insert"), (q.values = v), b),
        update: (v: Row) => ((q.op = "update"), (q.values = v), b),
        upsert: (v: Row) => ((q.op = "upsert"), (q.values = v), b),
        delete: () => ((q.op = "delete"), b),
        eq: (k: string, v: unknown) => (q.filters.push([k, "eq", v]), b),
        in: (k: string, v: unknown) => (q.filters.push([k, "in", v]), b),
        is: (k: string, v: unknown) => (q.filters.push([k, "is", v]), b),
        neq: () => b, gt: () => b, gte: () => b, lt: () => b, lte: () => b, not: () => b, or: () => b, order: () => b, limit: () => b, range: () => b,
        maybeSingle: () => run(),
        single: () => run(),
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => run().then(ok, bad),
      }
      return b
    }
    return { db: { from, rpc: async () => ({ data: null, error: null }) }, orders, writes }
  }
  const line = (type: string, title: string, unit: number, ships: boolean) => ({ product_id: `p-${title}`, variant_id: null, title, variant_name: null, sku: null, image_url: null, type, unit_cents: unit, quantity: 1, discount_cents: 0, requires_shipping: ships, location_id: null, weight_grams: ships ? 300 : 0, fulfillment_method: ships ? "self" : null })
  const checkout = (lines: Row[], business: unknown): Row => ({ id: "co1", creator_id: "c1", status: "paid", provider: "stripe", buyer_email: "ana@globex.test", buyer_name: "Ana Pop", buyer_id: null, currency: "RON", lines, shipping_cents: 1999, shipping_discount_cents: 0, tax_cents: 0, total_cents: 13999, platform_fee_cents: 0, shipping_rate: { tax_included: true }, shipping_address: { country: "RO" }, stripe_session_id: "pi_test_1", receipt_token: "r1", origin: null, attribution: null, business_details: business })
  try {
    const { completeCheckout } = await import("@/lib/physical/checkout-server")
    const paid = { checkoutId: "co1", sessionId: "pi_test_1", paymentIntentId: "pi_test_1", facts: null, baseUrl: "https://storelib.test" }
    const shipped = standIn(checkout([line("physical", "Mug", 12000, true)], company))
    await completeCheckout(shipped.db, paid)
    check("a shipped cart: the order line carries the company", shipped.orders.length === 1 && (shipped.orders[0].business_details as { company?: string } | undefined)?.company === "Globex SRL" && (shipped.orders[0].business_details as { taxId?: string }).taxId === "RO12345678", shipped.orders.map((o) => o.business_details))
    const mixed = standIn(checkout([line("physical", "Mug", 12000, true), line("digital", "Recipes", 2000, false)], company))
    await completeCheckout(mixed.db, paid)
    check("a mixed cart: the line that ships and the download both carry it, in one write", mixed.orders.length === 2 && mixed.orders.every((o) => (o.business_details as { company?: string } | undefined)?.company === "Globex SRL") && mixed.writes.length === 1 && (mixed.writes[0].ids as string[]).length === 2, mixed.writes)
    const none = standIn(checkout([line("physical", "Mug", 12000, true)], null))
    await completeCheckout(none.db, paid)
    check("a buyer who did not ask for an invoice: nothing written", none.orders.length === 1 && none.writes.length === 0 && !("business_details" in none.orders[0]))
    const junk = standIn(checkout([line("physical", "Mug", 12000, true)], { company: "" }))
    await completeCheckout(junk.db, paid)
    check("  nor for a stored value that is not a company", junk.writes.length === 0)
  } catch (e) {
    check("the paid checkout can be driven here", false, e instanceof Error ? e.message.slice(0, 300) : String(e))
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
