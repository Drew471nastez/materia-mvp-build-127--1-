/**
 * Limit sales for downloads, round 21.
 *
 * The product editor's "Limit sales" toggle for something that does not
 * ship was never saved or enforced. Now it is a total cap on copies sold
 * (products.sales_limit, SQL part 150):
 *
 *   THE WORDS     one module says them everywhere (lib/products/sales-limit)
 *   THE HOLD      a checkout holds a copy before anything is charged, in one
 *                 locked step in the database, so two buyers paying for the
 *                 last copy cannot both pass; the hold goes back when the
 *                 payment will not happen (lib/checkout/sales-limit). The
 *                 race itself is proven on Postgres by
 *                 scripts/sql-harness/sales-limit-race.sh (forty connections,
 *                 five copies, five holds given).
 *   OVER IT       a payment that still arrives over the cap is written as an
 *                 order, refunded and never fulfilled (lib/checkout/
 *                 sold-out-refund), and a refund in full gives the copy back
 *   THE EDITOR    the toggle and the number load and save; copies sold show
 *   THE SHOP      Sold out and no buy on the product page, the website, the
 *                 creator page and Explore; "Only N left" under ten
 *   BEFORE 150    nothing breaks: every read and write forgives a missing
 *                 column or function
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { FEW_LEFT, MAX_SALES_LIMIT, SOLD_OUT, capsSales, copiesLeft, fewLeftText, missingSalesLimit, readSalesLimit, salesSoldOut, soldOfText, soldOutMessage, typedSalesLimit } from "../lib/products/sales-limit"
import { copiesSold, salesStandings } from "../lib/products/sales-standings"
import { CLAIM_HOLD_SECONDS, SALE_HOLDER_KEY, SALE_HOLD_SECONDS, claimSale, holdBasket, holdSale, limitOf, readLimits, releaseHeldCopies, saleHolderForEmail } from "../lib/checkout/sales-limit"
import { priceCart } from "../lib/checkout/pricing"
import { productSectionData } from "../lib/products/product-section-data"
import { initialForm, snapshotOf, snapshotOfForm, type LoadedProduct } from "../app/app/products/new/editor-form"
import { packItems } from "../lib/checkout/cart-items"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

type Row = Record<string, unknown>
type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>

/** Tables for `from`, and an `rpc` that answers as the test says and writes down every call. */
function fakeDb(tables: Record<string, Row[]>, rpc?: Rpc) {
  const calls: { fn: string; args: Record<string, unknown> }[] = []
  return {
    calls,
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = []
      const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), chain),
        neq: () => chain,
        is: () => chain,
        in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), chain),
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: rows(), error: null }),
      }
      return chain
    },
    ...(rpc
      ? {
          rpc: async (fn: string, args: Record<string, unknown>) => {
            calls.push({ fn, args })
            return rpc(fn, args)
          },
        }
      : {}),
  }
}

const P = "11111111-1111-4111-8111-111111111111"
const Q = "22222222-2222-4222-8222-222222222222"
const R = "33333333-3333-4333-8333-333333333333"

async function main() {
  console.log("\nThe words and the arithmetic, one module for every surface\n")
  check("a typed limit is a whole number from 1 to 1,000,000", readSalesLimit("100") === 100 && readSalesLimit(7.9) === 7 && readSalesLimit("2000000") === MAX_SALES_LIMIT)
  check("nothing, zero, words and true are no limit", [null, undefined, "", "0", 0, -5, "abc", true].every((v) => readSalesLimit(v) === null))
  check("the box takes digits only, no leading zero, seven at most", typedSalesLimit("0a1,2 3") === "123" && typedSalesLimit("12345678") === "1234567")
  check("copies left count the held ones and never go below zero", copiesLeft({ limit: 10, sold: 7, held: 2 }) === 1 && copiesLeft({ limit: 5, sold: 9, held: 0 }) === 0)
  check("sold out when none is left for a new buyer", salesSoldOut({ limit: 3, sold: 2, held: 1 }) && !salesSoldOut({ limit: 3, sold: 2, held: 0 }) && !salesSoldOut(null))
  check(`"Only N left" under ${FEW_LEFT} only`, fewLeftText({ limit: 100, sold: 91, held: 0 }) === "Only 9 left" && fewLeftText({ limit: 100, sold: 90, held: 0 }) === null && fewLeftText({ limit: 5, sold: 5, held: 0 }) === null)
  check("the editor's line reads 12 of 100 sold", soldOfText(12, 100) === "12 of 100 sold" && soldOfText(1200, 5000) === "1,200 of 5,000 sold")
  check("the checkout's refusal starts with Sold out and names the product", soldOutMessage("Sample pack").startsWith(SOLD_OUT) && soldOutMessage("Sample pack").includes("Sample pack") && soldOutMessage(null) === "Sold out. Every copy has been sold.")
  check("a thing that ships has no total cap (stock and most per order instead)", !capsSales("physical") && capsSales("digital") && capsSales("course"))
  check("the missing column is recognised as before part 150", missingSalesLimit({ code: "42703" }) && missingSalesLimit({ code: "PGRST204" }) && !missingSalesLimit({ code: "23505" }) && !missingSalesLimit(null))
  check("a row read with * gives its limit, a row without the column none", limitOf({ sales_limit: 50 }) === 50 && limitOf({ title: "x" }) === null)

  console.log("\nThe hold: asked of the database, never a new way to fail a payment\n")
  {
    const yes = fakeDb({}, async () => ({ data: true, error: null }))
    check("a copy held answers yes, with the buyer's holder, one copy and 35 minutes", (await holdSale(yes, P, "e:abc")) === true && yes.calls[0]?.fn === "hold_product_sale" && yes.calls[0].args.p_quantity === 1 && yes.calls[0].args.p_seconds === SALE_HOLD_SECONDS)
    const no = fakeDb({}, async () => ({ data: false, error: null }))
    check("no copy left answers no", (await holdSale(no, P, "e:abc")) === false)
    const before = fakeDb({}, async () => ({ data: null, error: { code: "PGRST202", message: "function not found" } }))
    check("before part 150 (no function) the payment goes on as before", (await holdSale(before, P, "e:abc")) === true)
    const thrown = fakeDb({}, async () => { throw new Error("network") })
    check("a database that cannot be asked does not refuse a payment", (await holdSale(thrown, P, "e:abc")) === true)
    check("a client with no rpc at all sells as before", (await holdSale(fakeDb({}), P, "e:abc")) === true)
    check("the holder is the buyer's address hashed, the same address the same holder", saleHolderForEmail("A@B.co ") === saleHolderForEmail("a@b.co") && !saleHolderForEmail("a@b.co").includes("@"))
  }
  {
    const db = fakeDb({ products: [{ id: P, sales_limit: null }] }, async () => ({ data: false, error: null }))
    check("at the order: a product with no limit is never held or refused", (await claimSale(db, P, "e:x")) === true && db.calls.length === 0)
    const limited = fakeDb({ products: [{ id: P, sales_limit: 5 }] }, async () => ({ data: true, error: null }))
    check("a limited one takes its copy again, kept while the order is written", (await claimSale(limited, P, "e:x", 2)) === true && limited.calls[0]?.args.p_seconds === CLAIM_HOLD_SECONDS && limited.calls[0]?.args.p_quantity === 2)
    const gone = fakeDb({ products: [{ id: P, sales_limit: 5 }] }, async () => ({ data: false, error: null }))
    check("and is told no when the copy went to somebody else meanwhile", (await claimSale(gone, P, "e:x")) === false)
    const limits = await readLimits(fakeDb({ products: [{ id: P, sales_limit: 5 }, { id: Q, sales_limit: null }] }), [P, Q])
    check("a basket's limits in one read, the unlimited left out", limits.size === 1 && limits.get(P) === 5)
  }
  {
    const room = new Map([[P, 1], [Q, 0]])
    const db = fakeDb({}, async (fn, args) => {
      if (fn === "hold_product_sale") return { data: (room.get(String(args.p_product)) ?? 1) > 0, error: null }
      return { data: null, error: null }
    })
    const r = await holdBasket(db, [{ productId: P, quantity: 1, title: "Pack" }, { productId: R, quantity: 2, title: "Free" }, { productId: Q, quantity: 1, title: "Last run" }], [P, Q], "s:abc")
    check("a basket holds only its limited lines and names the one with no copy left", r.ok === false && r.title === "Last run", r)
    check("and gives back the copy it had already held", db.calls.some((c) => c.fn === "release_product_sale" && c.args.p_product === P) && !db.calls.some((c) => c.args.p_product === R))
    const twice = fakeDb({}, async () => ({ data: true, error: null }))
    await holdBasket(twice, [{ productId: P, quantity: 1 }, { productId: P, quantity: 2 }], [P], "s:abc")
    check("two lines of one product (two options) hold their copies together, once", twice.calls.length === 1 && twice.calls[0].args.p_quantity === 3)
  }
  {
    const db = fakeDb({}, async () => ({ data: null, error: null }))
    await releaseHeldCopies(db, { product_id: P, [SALE_HOLDER_KEY]: "e:abc" })
    check("a cancelled product payment gives its copy back", db.calls.length === 1 && db.calls[0].fn === "release_product_sale" && db.calls[0].args.p_holder === "e:abc")
    const basket = fakeDb({}, async () => ({ data: null, error: null }))
    await releaseHeldCopies(basket, { cart: "1", ...packItems([{ productId: P, variantId: null, quantity: 1, priceCents: 500 }, { productId: Q, variantId: null, quantity: 1, priceCents: 700 }]), [SALE_HOLDER_KEY]: "s:abc" })
    check("an expired basket page gives back each product's copies", basket.calls.map((c) => c.args.p_product).sort().join() === [P, Q].sort().join())
    const none = fakeDb({}, async () => ({ data: null, error: null }))
    await releaseHeldCopies(none, { product_id: P })
    check("a payment that held nothing gives nothing back", none.calls.length === 0)
  }

  console.log("\nCounted from the orders, on the server\n")
  {
    const db = fakeDb({}, async () => ({ data: [{ product_id: P, sales_limit: 100, sold: 12, held: 3 }, { product_id: Q, sales_limit: null, sold: 0, held: 0 }], error: null }))
    const s = await salesStandings(db, [P, Q, "not-a-uuid"])
    check("each limited product's limit, sold and held", s.get(P)?.limit === 100 && s.get(P)?.sold === 12 && s.get(P)?.held === 3 && !s.has(Q))
    check("only ids are asked about", JSON.stringify(db.calls[0]?.args.p_products) === JSON.stringify([P, Q]))
    const refused = fakeDb({}, async () => ({ data: null, error: { code: "42501", message: "permission denied" } }))
    check("a client that may not ask (anon) shows nothing as limited", (await salesStandings(refused, [P])).size === 0)
    check("no rpc, no standings", (await salesStandings(fakeDb({}), [P])).size === 0)
    check("copies sold for the editor, any product", (await copiesSold(fakeDb({}, async () => ({ data: 7, error: null })), P)) === 7 && (await copiesSold(fakeDb({}, async () => ({ data: null, error: { code: "PGRST202" } })), P)) === null)
  }

  console.log("\nThe basket leaves out a product whose run is sold\n")
  {
    const products = [
      { id: P, title: "Sample pack", slug: "pack", price_cents: 900, type: "digital", status: "published", creator_id: "c1", thumbnail_url: null },
      { id: Q, title: "Presets", slug: "presets", price_cents: 500, type: "digital", status: "published", creator_id: "c1", thumbnail_url: null },
    ]
    const standings = [{ product_id: P, sales_limit: 100, sold: 100, held: 0 }, { product_id: Q, sales_limit: 10, sold: 4, held: 6 }]
    const db = fakeDb({ products, product_variants: [], entitlements: [] }, async (fn) => (fn === "product_sales_status" ? { data: standings, error: null } : { data: null, error: null }))
    const r = await priceCart(db, { items: [{ productId: P }, { productId: Q }] })
    check("every copy sold: left out and named", r.ok === true && r.dropped.includes("Sample pack") && !r.lines.some((l) => l.item.productId === P), r)
    check("copies all held by payments in progress: kept, for the hold at the checkout to decide", r.ok === true && r.lines.some((l) => l.item.productId === Q))
    check("and the limited products are named for the route to hold", r.ok === true && r.limited.sort().join() === [P, Q].sort().join())
    const before = fakeDb({ products, product_variants: [], entitlements: [] }, async () => ({ data: null, error: { code: "PGRST202" } }))
    const b = await priceCart(before, { items: [{ productId: P }, { productId: Q }] })
    check("before part 150 the basket is priced exactly as before", b.ok === true && b.lines.length === 2 && b.limited.length === 0)
  }

  console.log("\nThe website's product page\n")
  {
    const row = { id: P, type: "digital", title: "Sample pack", price_cents: 900 }
    const soldOutDb = fakeDb({}, async () => ({ data: [{ product_id: P, sales_limit: 100, sold: 100, held: 0 }], error: null }))
    const out = await productSectionData(soldOutDb, row)
    check("every copy sold: nothing left to buy (Sold out, the button off)", out.inventory_left === 0)
    const fewDb = fakeDb({}, async () => ({ data: [{ product_id: P, sales_limit: 100, sold: 97, held: 0 }], error: null }))
    check("three left says three", (await productSectionData(fewDb, row)).inventory_left === 3)
    const plentyDb = fakeDb({}, async () => ({ data: [{ product_id: P, sales_limit: 100, sold: 10, held: 0 }], error: null }))
    check("plenty left says nothing", (await productSectionData(plentyDb, row)).inventory_left === null)
    const variantDb = fakeDb({ product_variants: [{ id: "v1", product_id: P, name: "Basic", price_cents: 900, position: 0 }] }, async () => ({ data: [{ product_id: P, sales_limit: 1, sold: 1, held: 0 }], error: null }))
    const withVariants = await productSectionData(variantDb, row)
    check("a sold run with options: every option unavailable", (withVariants.variants ?? []).length === 1 && withVariants.variants!.every((v) => v.available === false), withVariants.variants)
    const anon = await productSectionData(fakeDb({}), row)
    check("a client that cannot count changes nothing", anon.inventory_left === null)
  }

  console.log("\nThe editor\n")
  {
    const loaded = (sales?: LoadedProduct["sales"]): LoadedProduct => ({ product: { id: P, title: "Pack", type: "digital", status: "published" }, assets: [], variants: [], ...(sales ? { sales } : {}) })
    const on = initialForm(loaded({ limit: 100, sold: 12, missing: false }))
    check("a saved limit opens on, with its number", on.limitSalesEnabled === true && on.salesLimit === "100")
    const off = initialForm(loaded({ limit: null, sold: 3, missing: false }))
    check("no limit opens off and empty", off.limitSalesEnabled === false && off.salesLimit === "")
    check("an old database (no sales read) opens off", initialForm(loaded()).limitSalesEnabled === false)
    check("a product with a limit opens saved, not unsaved", snapshotOfForm(on) === snapshotOf(on))
    check("and changing the number is a change", snapshotOf({ ...on, salesLimit: "50" }) !== snapshotOfForm(on))
    check("a new product opens with the toggle off", initialForm(null).limitSalesEnabled === false && initialForm(null).salesLimit === "")

    const editor = read("app/app/products/new/product-editor.tsx")
    const loader = read("app/app/products/load-editor.ts")
    check("the limit is saved in a request of its own, so the product saves before part 150", /update\(\{ sales_limit: limit \}\)/.test(editor) && editor.indexOf("sales_limit: limit") > editor.indexOf("custom_fields: storedCustomFields"))
    check("only for something that does not ship, and only when it changed", /productType !== "physical"\) \{\s*const limit = limitSalesEnabled \? readSalesLimit\(salesLimit\) : null\s*if \(limit !== savedSalesLimit\.current\)/.test(editor))
    check("a database without the column says which part to run, and everything else is saved", editor.includes("Limit sales needs its database update: run SQL part 150 in Supabase."))
    check("on with no number is refused with the reason", editor.includes('showToast("Enter how many copies can be sold")'))
    check("copies sold are shown against the number typed, from the server's count", editor.includes("soldOfText(copiesSoldCount, typed)") && editor.includes('data-sales-sold=""'))
    check("the physical branch keeps its own most per order, the download toggle sits in the other branch", editor.indexOf('title="Up to"') === -1 && editor.indexOf("data-physical-settings") < editor.indexOf('data-sales-limit=""') && /productType === "physical" \? \(/.test(editor))
    check("the loader reads the limit in its own request, and the count with the server's client", loader.includes('select("sales_limit")') && loader.includes("copiesSold(createAdminClient(), id)") && !/PRODUCT_COLUMNS =\s*"[^"]*sales_limit/.test(loader))
  }

  console.log("\nEvery checkout holds, and a payment over the cap is refunded\n")
  {
    const session = read("app/api/checkout/stripe-session/route.ts")
    check("the product checkout holds a copy before the PaymentIntent exists", session.indexOf("holdSale(admin, product.id, saleHolder)") > 0 && session.indexOf("holdSale(admin, product.id, saleHolder)") < session.indexOf("stripe.paymentIntents.create(params")) /* Changed on purpose (billing reliability): the create now carries an idempotency key, stripe.paymentIntents.create(params, { idempotencyKey }). */
    check("and refuses with Sold out, 409, code sold_out", /soldOutMessage\(product\.title\), code: "sold_out" \}, \{ status: 409 \}/.test(session))
    check("its holder rides on the payment, and goes back if the payment cannot start", session.includes("[SALE_HOLDER_KEY]: saleHolder") && session.includes("releaseSale(admin, product.id, saleHolder)"))
    for (const [file, label] of [["app/api/checkout/process/route.ts", "the free checkout"], ["app/api/checkout/quick-free/route.ts", "the quick free claim"]] as const) {
      const src = read(file)
      check(`${label} holds before its order and lets go once the order counts it`, src.includes("holdSale(admin, product.id, saleHolder, 1, CLAIM_HOLD_SECONDS)") && src.includes("releaseSale(admin, product.id, saleHolder)") && src.includes('code: "sold_out"'))
    }
    const cart = read("app/api/checkout/cart/route.ts")
    check("the basket's Stripe page holds every limited line, expires before the hold, and carries the holder", cart.includes("holdBasket(admin, lines.map(") && cart.includes("holder || saleHolder ? { expires_at:") && cart.includes("[SALE_HOLDER_KEY]: saleHolder"))
    const site = read("app/api/checkout/site/route.ts")
    check("the website's own checkout holds before its PaymentIntent, and for a free basket", (site.match(/holdBasket\(admin, priced\.lines/g) ?? []).length === 2 && site.includes("[SALE_HOLDER_KEY]: saleHolder"))
    const physical = read("lib/physical/checkout-server.ts")
    check("a cart that ships holds its downloads' copies, and any close gives them back", physical.includes("holdBasket(db, digitalLines.map(") && physical.includes("await releaseDownloadCopies(db, checkoutId)"))
    const webhook = read("app/api/stripe/webhook/route.ts")
    check("Stripe's cancelled payment and expired or failed basket page give the copies back", /payment_intent\.canceled[\s\S]{0,200}releaseHeldCopies/.test(webhook) && /checkout\.session\.expired" \|\| event\.type === "checkout\.session\.async_payment_failed"\) \{[\s\S]{0,200}releaseHeldCopies/.test(webhook))

    const fulfil = read("lib/checkout/fulfil-payment.ts")
    const claimAt = fulfil.indexOf("await claimSale(admin, productId, saleHolder)")
    const insertAt = fulfil.indexOf('admin.from("orders").insert(row)')
    check("the order takes its copy again before it is written", claimAt > 0 && claimAt < insertAt)
    check("over the cap: the order is written (money was taken), marked, refunded, not fulfilled", /if \(!withinLimit\) await markSoldOut\(admin, order\.id\)\s*if \(!withinLimit\) return refundedOverLimit\(/.test(fulfil) && /* Round AE: steps recorded (lib/checkout/followups.ts). */ fulfil.indexOf("return refundedOverLimit(") < fulfil.indexOf('f.idempotent("entitlement"'))
    check("only the caller that made the order refunds (a raced second call reads the winner's)", fulfil.indexOf("const raced = await existingOrder") < fulfil.indexOf("if (!withinLimit) return refundedOverLimit("))
    check("a refund that failed is tried again by the next delivery, once", fulfil.includes("owesSoldOutRefund(admin, found.id)"))
    const refund = read("lib/checkout/sold-out-refund.ts")
    check("the refund is the Orders page's: whole, transfer reversed, one per order whatever retries", refund.includes("reverse_transfer: true") && refund.includes("idempotencyKey: `storelib-sold-out:${o.orderId}`") && refund.includes("syncChargeRefund(db, stripe, charge)") && !refund.includes("refundAirwallexOrder"))
    check("its reason reads sold_out, and the sync keeps it", refund.includes('SOLD_OUT_REASON = "sold_out"') && read("lib/stripe/refund-sync.ts").includes('refund.metadata?.refund_reason === "sold_out" ? "sold_out"'))
    const line = read("lib/checkout/fulfil-cart-item.ts")
    check("a basket line over the cap gets no library entry and no sales count", /if \(!withinLimit\) \{[\s\S]{0,300}return \{ status: "created", line: \{[^}]*soldOut: true/.test(line) && /* Changed on purpose (rel-commerce MEDIUM-3): the entry is written by ensureEntitlement now. */ line.indexOf("if (!withinLimit) {") < line.indexOf("ensureEntitlement(ctx.admin"))
    check("and is refunded after the basket's sale is on the ledger", read("lib/checkout/fulfil-cart-session.ts").indexOf("soldOutOwed(admin") > read("lib/checkout/fulfil-cart-session.ts").indexOf("await sideEffects(admin, {"))
  }

  console.log("\nThe shop says Sold out\n")
  {
    const wrapper = read("components/checkout/purchase-status-wrapper.tsx")
    check("the product page's buy box: Sold out in place of the buy button, a few left said under it", /sales\?\.soldOut \? \([\s\S]{0,300}disabled[\s\S]{0,400}Sold out[\s\S]{0,100}\) : \([\s\S]{0,40}<BuyButton/.test(wrapper) && wrapper.includes("{sales.fewLeft}"))
    const sticky = read("components/store-builder/sticky-add-to-cart.tsx")
    check("the sticky bar says Sold out and does not buy", sticky.includes('closed ? "Sold out"') && sticky.includes("if (closed) return") && (sticky.match(/disabled=\{closed\}/g) ?? []).length === 2)
    const page = read("app/(marketing)/p/[slug]/page.tsx")
    check("the product page counts on the server and hands both", page.includes("salesStanding(createAdminClient(), productId)") && (page.match(/sales=\{salesView\}/g) ?? []).length === 2 && (page.match(/soldOut=\{salesView\?\.soldOut \?\? false\}/g) ?? []).length === 2)
    check("and tells search engines it is out of stock", page.includes("soldOut(product) || salesView?.soldOut"))
    const shop = read("lib/website-builder/shop-products.ts")
    check("the website's cards: Sold out, no checkout, every option off", /* Changed on purpose (round 36): the standings are read beside the card's other reads, then laid over the stocked cards. */ shop.includes("salesStandingsOf(db, rows)") && shop.includes("standings ? withStandings(stocked, standings) : stocked") &&/tag: "Sold out", checkout_url: ""/.test(shop))
    check("the creator page's cards", read("app/(marketing)/u/[username]/page.tsx").includes("salesSoldOut(standings.get(p.id)) ? { sold_out: true }"))
    check("Explore and its category pages", read("app/(marketing)/explore/page.tsx").includes("salesSoldOut(standings.get(product.id))") && read("app/(marketing)/explore/[category]/page.tsx").includes("salesSoldOut(standings.get(product.id))"))
    check("the card says Sold out", read("components/explore/product-card.tsx").includes("{product.sold_out && (") && read("components/storefront/storefront-product-card.tsx").includes("sold_out: product.sold_out ?? null"))
    check("what the shop's client code imports carries no server only module", !read("lib/products/sales-standings.ts").includes("server-only") && !read("lib/website-builder/shop-products.ts").includes("checkout/sales-limit") && !read("lib/checkout/pricing.ts").includes('from "./sales-limit"'))
  }

  console.log("\nSQL part 150, by the run-now rules\n")
  {
    const sql = read("supabase/sql/run-now/150_products_sales_limit.sql")
    const lines = sql.trim().split("\n")
    check("one statement per line, the comment first, notify last", lines.every((l) => l.startsWith("/*") || /;$/.test(l)) && lines[lines.length - 1] === "notify pgrst, 'reload schema';")
    check("the column, and its check from 1 to 1,000,000, run twice safely", sql.includes("ADD COLUMN IF NOT EXISTS sales_limit integer") && sql.includes("DROP CONSTRAINT IF EXISTS products_sales_limit_check") && sql.includes("CHECK (sales_limit IS NULL OR (sales_limit >= 1 AND sales_limit <= 1000000))"))
    check("the hold locks the product's row (not its key, so orders can still be written beside it)", sql.includes("FOR NO KEY UPDATE") && /hold_product_sale[\s\S]*SECURITY DEFINER SET search_path = public/.test(sql))
    for (const fn of ["hold_product_sale(uuid, text, integer, integer)", "release_product_sale(uuid, text)", "product_sales_status(uuid[])", "product_copies_sold(uuid)"]) {
      check(`${fn.split("(")[0]}: server only`, sql.includes(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC;`) && sql.includes(`REVOKE ALL ON FUNCTION public.${fn} FROM anon, authenticated;`) && sql.includes(`GRANT EXECUTE ON FUNCTION public.${fn} TO service_role;`))
    }
    check("every function is SECURITY DEFINER with its search path set", (sql.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length === (sql.match(/SECURITY DEFINER SET search_path = public/g) ?? []).length)
    check("the holds table is closed to anon and signed in visitors", sql.includes("ALTER TABLE public.product_sale_holds ENABLE ROW LEVEL SECURITY;") && sql.includes("REVOKE ALL ON TABLE public.product_sale_holds FROM anon, authenticated;"))
    check("sold counts paid and partly refunded orders; a full refund gives the copy back", sql.includes("o.status = 'completed' OR (o.status = 'refunded' AND coalesce(o.refund_amount_cents, 0) > 0 AND o.refund_amount_cents < coalesce(o.amount_cents, 0))"))
    check("the migration is the part, byte for byte", read("supabase/migrations/20270106_products_sales_limit.sql") === sql)
    check("the README lists it, and the check after has its column", read("supabase/sql/run-now/README.md").includes("| `150_products_sales_limit.sql` |") && read("supabase/sql/run-now/99_check_after.sql").includes("as p150_products_sales_limit"))
  }

  console.log("\nCopy\n")
  {
    const files = ["lib/products/sales-limit.ts", "lib/products/sales-standings.ts", "lib/checkout/sales-limit.ts", "lib/checkout/sold-out-refund.ts", "supabase/sql/run-now/150_products_sales_limit.sql", "scripts/sql-harness/sales-limit-race.sh"]
    const banned = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b|—/i
    for (const f of files) check(`${f}: no em dashes and none of the banned words`, !banned.test(read(f)))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
