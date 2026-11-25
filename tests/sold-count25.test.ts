/**
 * ===========================================================================
 *  ROUND 25: UNITS SOLD, VERIFIED, AS A THEME READS THEM
 * ===========================================================================
 * Materia's Sold counter reads product.metafields.custom.sold_count: a known
 * 0 shows 0, an absent one is unknown and hidden, and nothing is ever made
 * up. lib/products/sold-counts-server.ts counts it from paid order lines;
 * lib/storelib-theme/compat/objects.ts gives it to the theme. Run here
 * against a stand-in database that applies the filters it is asked for.
 *
 *   npm run test:push
 */
import { readCode } from "./_source"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}`)
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail)}`)
  }
}

type Row = Record<string, unknown>
/* A stand-in for the few PostgREST calls the count makes: in, eq (an embedded table's column too), order, range. */
function stubDb(tables: Record<string, Row[]>, fail: string[] = []) {
  return {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = []
      let from = 0
      let to = Infinity
      const q = {
        select: () => q,
        order: () => q,
        in: (col: string, values: unknown[]) => (filters.push((r) => values.includes(r[col])), q),
        eq: (col: string, value: unknown) => {
          const [embed, inner] = col.split(".")
          filters.push((r) => (inner ? (r[embed] as Row | undefined)?.[inner] === value : r[col] === value))
          return q
        },
        range: (a: number, b: number) => ((from = a), (to = b), q),
        then: (done: (v: { data: Row[] | null; error: unknown }) => unknown) => {
          if (fail.includes(table)) return Promise.resolve(done({ data: null, error: { code: "XX000", message: "down" } }))
          const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(from, to + 1)
          return Promise.resolve(done({ data: rows, error: null }))
        },
      }
      return q
    },
  }
}

async function main() {
  const { soldCounts } = await import("../lib/products/sold-counts-server")
  const { productObject } = await import("../lib/storelib-theme/compat/objects")
  const MUG = "p-mug"
  const TEE = "p-tee"
  const NEW = "p-new"
  const orders: Row[] = [
    { id: "o1", product_id: MUG, quantity: 2, status: "completed" },
    { id: "o2", product_id: MUG, quantity: 3, status: "partially_refunded" },
    { id: "o3", product_id: MUG, quantity: 4, status: "refunded" },
    { id: "o4", product_id: MUG, quantity: 5, status: "pending" },
    { id: "o5", product_id: MUG, quantity: 6, status: "disputed" },
    { id: "o6", product_id: MUG, quantity: 7, status: "voided" },
    { id: "o7", product_id: MUG, quantity: 8, status: "failed" },
    { id: "o8", product_id: TEE, quantity: null, status: "completed" },
    { id: "o9", product_id: "someone-elses", quantity: 9, status: "completed" },
  ]
  const returns: Row[] = [
    { order_id: "o2", quantity: 1, commerce_returns: { status: "completed" } },
    { order_id: "o1", quantity: 1, commerce_returns: { status: "requested" } },
  ]
  const counts = await soldCounts(stubDb({ orders, commerce_return_items: returns }), [MUG, TEE, NEW])

  console.log("\nWhat is counted (lib/products/sold-counts-server.ts)")
  check("paid lines count their units: 2, and 3 partly refunded less the 1 returned", counts?.get(MUG) === 4, counts && Object.fromEntries(counts))
  check("refunded in full, voided, pending, failed and disputed lines are not counted", counts?.get(MUG) === 4)
  check("a line with no quantity is one unit (a download)", counts?.get(TEE) === 1)
  check("a product with no paid unit is an explicit 0", counts?.get(NEW) === 0 && counts?.has(NEW) === true)
  check("only the products asked for: another store's product is never in it", counts !== null && !counts.has("someone-elses"))
  check("a return still being processed takes nothing away", counts?.get(MUG) === 4)
  check("orders that could not be read: unknown (null), never a short number", (await soldCounts(stubDb({ orders }, ["orders"]), [MUG])) === null)
  check("returns that could not be read: unknown too", (await soldCounts(stubDb({ orders, commerce_return_items: returns }, ["commerce_return_items"]), [MUG])) === null)

  console.log("\nWhat a theme reads (product.metafields.custom.sold_count)")
  const product = (settings: Record<string, unknown>) => productObject({ id: MUG, settings: { title: "Mug", slug: "mug", url: "/products/mug", price: "$10", ...settings } } as never) as { metafields: { custom: Record<string, { value: unknown; type: string }>; storelib: Record<string, { value: unknown }> } }
  const four = product({ sold_count: 4 })
  check("a count is a whole number field", four.metafields.custom.sold_count?.value === 4 && four.metafields.custom.sold_count.type === "number_integer" && four.metafields.storelib.sold_count?.value === 4)
  const zero = product({ sold_count: 0 })
  check("0 is said as 0, not left out", zero.metafields.custom.sold_count?.value === 0)
  const unknown = product({})
  check("not read: the field is absent, so the theme hides its counter", unknown.metafields.custom.sold_count === undefined)
  const typed = product({ sold_count: 3, fields: { sold_count: "9999" } })
  check("a custom field typed in by that name gives way to the verified count", typed.metafields.custom.sold_count?.value === 3)
  check("nothing that is not a whole number above -1 is given", product({ sold_count: -1 }).metafields.custom.sold_count === undefined && product({ sold_count: 2.5 }).metafields.custom.sold_count === undefined)

  console.log("\nRecent sales (round 26): the same paid orders, by when they were placed")
  {
    const { soldCountsWithWindows } = await import("../lib/products/sold-counts-server")
    const NOW = Date.parse("2026-11-25T12:00:00Z")
    const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString()
    const recent: Row[] = [
      { id: "r1", product_id: MUG, quantity: 2, status: "completed", created_at: ago(3) },
      { id: "r2", product_id: MUG, quantity: 1, status: "completed", created_at: ago(30) },
      { id: "r3", product_id: MUG, quantity: 4, status: "completed", created_at: ago(24 * 10) },
      { id: "r4", product_id: MUG, quantity: 5, status: "completed", created_at: ago(24 * 40) },
      { id: "r5", product_id: MUG, quantity: 9, status: "refunded", created_at: ago(1) },
      { id: "r6", product_id: TEE, quantity: 1, status: "completed", created_at: ago(2) },
    ]
    const back: Row[] = [{ order_id: "r1", quantity: 1, commerce_returns: { status: "completed" } }]
    const w = await soldCountsWithWindows(stubDb({ orders: recent, commerce_return_items: back }), [MUG, TEE, NEW], NOW)
    check("the last 24 hours count only lines placed then, less what came back", w?.get(MUG)?.h24 === 1, w && Object.fromEntries(w))
    check("7 days and 30 days take in the older lines, all time every paid one", w?.get(MUG)?.d7 === 2 && w?.get(MUG)?.d30 === 6 && w?.get(MUG)?.all === 11)
    check("a refunded line is in no window", w?.get(MUG)?.h24 === 1)
    check("a product with nothing recent is 0 in every window", JSON.stringify(w?.get(NEW)) === JSON.stringify({ all: 0, h24: 0, d7: 0, d30: 0 }))
    const recentProduct = product({ sold_count: 11, sold_count_24h: 1, sold_count_7d: 2, sold_count_30d: 6 })
    check("a theme reads them as custom.sold_count_24h, _7d and _30d", recentProduct.metafields.custom.sold_count_24h?.value === 1 && recentProduct.metafields.custom.sold_count_7d?.value === 2 && recentProduct.metafields.custom.sold_count_30d?.value === 6)
    const block = readCode("theme-packages/materia/base/snippets/review-sold-block.liquid")
    check("the Sold counter picks its window (24 hours by default) and hides a 0", /sold_window = st\.sold_window \| default: '24h'/.test(block) && /sold_count_24h/.test(block) && !/sold_count == 0 and sold_nondigits == blank/.test(block))
  }

  console.log("\nWhere it is read")
  const site = readCode("lib/website-builder/compat-site.ts")
  /* Changed on purpose (base round 26): the live site reads the count with its windows (last 24 hours, 7 and 30 days). */
  check("the live site reads it with its own client, held a minute under the shop's tag", /m\.soldCountsWithWindows\(admin as never, soldIds\)/.test(site) && /heldUnless\(\["compat-sold", creator\.creatorId\], \[creatorShopTag\(creator\.creatorId\)\], SHOP_HOLD_S, readSold/.test(site))
  check("and lays it on every card and every pickable product", /products: withSoldCounts\(products, sold\)/.test(site) && /pickable: withSoldCounts\(catalog, sold\)/.test(site))
  check("the count is server only", /^import "server-only"/.test(readCode("lib/products/sold-counts-server.ts").trimStart()))
  check("this suite runs with the others", readCode("scripts/run-push-tests.mjs").includes('"tests/sold-count25.test.ts"'))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

void main()
