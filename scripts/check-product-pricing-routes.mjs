/** Actual list-price route and marketplace converter with deterministic DB/FX. */
import assert from "node:assert/strict"
import { build } from "esbuild"
const id = "11111111-1111-4111-8111-111111111111",
  creator = "22222222-2222-4222-8222-222222222222"
const fx = {
  asOf: new Date().toISOString().slice(0, 10),
  rates: { RON: 5, USD: 1.1 },
}
const mocks = {
  "server-only": "",
  "next/server": `export class NextResponse extends Response{static json(body,init={}){return new NextResponse(JSON.stringify(body),{...init,headers:{'content-type':'application/json',...init.headers}})}}`,
  "@/lib/supabase/public-read": `export const createPublicReadClient=()=>globalThis.priceDb`,
  "@/lib/supabase/admin": `export const createAdminClient=()=>globalThis.priceDb`,
  "@/lib/markets/fx-server": `export const cachedRates=async()=>globalThis.priceFx;export const latestRates=cachedRates;export const refreshRates=async()=>({ok:true})`,
}
const load = async (path) => {
  const result = await build({
    entryPoints: [path],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    logLevel: "warning",
    plugins: [
      {
        name: "boundaries",
        setup(b) {
          b.onResolve({ filter: /.*/ }, (a) =>
            Object.hasOwn(mocks, a.path)
              ? { path: a.path, namespace: "fixture" }
              : undefined,
          )
          b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
            contents: mocks[a.path],
            loader: "js",
          }))
        },
      },
    ],
  })
  return import(
    "data:text/javascript;base64," +
      Buffer.from(result.outputFiles[0].text).toString("base64")
  )
}
const base = {
  id,
  creator_id: creator,
  type: "digital",
  status: "published",
  price_cents: 9900,
  marketplace_usd_cents: 5000,
  marketplace_usd_approved_at: "2026-11-06",
}
const variants = [
  {
    id: "v1",
    product_id: id,
    name: "Free",
    price_cents: 0,
    active: true,
    available: true,
  },
  {
    id: "v2",
    product_id: id,
    name: "Pro",
    price_cents: 1000,
    active: true,
    available: true,
  },
]
let selected = ""
const reads = []
globalThis.priceFx = fx
globalThis.priceDb = {
  rpc: async (_name, { p_products }) => ({
    data: variants.filter((v) => p_products.includes(v.product_id)),
    error: null,
  }),
  from(table) {
    let filters = []
    const q = new Proxy(
      {},
      {
        get(_, key) {
          if (key === "then")
            return (resolve) => {
              reads.push({ table, filters })
              const data =
                table === "store_settings"
                  ? [{ creator_id: creator, currency: "RON" }]
                  : table === "products"
                    ? [base]
                    : []
              resolve({
                data: data.filter((row) =>
                  filters.every(([k, v]) =>
                    Array.isArray(v) ? v.includes(row[k]) : row[k] === v,
                  ),
                ),
                error: null,
              })
            }
          return (...args) => {
            if (key === "select") selected = args[0]
            if (key === "eq" || key === "in") filters.push(args)
            return q
          }
        },
      },
    )
    return q
  },
}
const prior = process.env.MARKETPLACE_USD
process.env.MARKETPLACE_USD = creator
try {
  const { GET } = await load("app/api/products/prices/route.ts")
  let r = await GET(
    new Request(
      `https://storelib.com/api/products/prices?ids=${id}&context=store`,
    ),
  )
  assert.equal(r.status, 200)
  assert.equal(r.headers.get("cache-control"), "no-store")
  let p = (await r.json()).prices[0]
  assert.equal(p.currency, "RON")
  assert.equal(p.price_cents, 0)
  assert.equal(p.variant_max_price_cents, 1000)
  assert.equal(p.marketplace_usd_cents, null)
  r = await GET(
    new Request(
      `https://storelib.com/api/products/prices?ids=${id}&context=marketplace`,
    ),
  )
  p = (await r.json()).prices[0]
  assert.equal(p.currency, "USD")
  assert.equal(
    p.price_cents,
    0,
    "A paid product-level dollar override cannot replace a Free variant",
  )
  assert.equal(p.variant_min_price_cents, 0)
  assert.equal(
    p.variant_max_price_cents,
    220,
    "Each range endpoint is converted exactly once",
  )
  const { productPageQuote } = await load("lib/money/marketplace-server.ts")
  const row = {
    ...base,
    price_cents: 0,
    variant_count: 2,
    variant_min_price_cents: 0,
    variant_max_price_cents: 1000,
    marketplace_usd_cents: null,
    marketplace_usd_approved_at: null,
  }
  const quote = await productPageQuote(row, "RON")
  assert.equal(quote.currency, "USD")
  assert.equal(quote.convert(row).variant_max_price_cents, 220)
  assert.ok(
    reads.some(
      (q) =>
        q.table === "products" &&
        q.filters.some(([k, v]) => k === "status" && v === "published"),
    ),
  )
  assert.deepEqual(
    (
      await (
        await GET(
          new Request("https://storelib.com/api/products/prices?ids=invalid"),
        )
      ).json()
    ).prices,
    [],
  )
  console.log(
    "Product price route passed: bounded published rows, Free variant precedence, paid-base override isolation, separate store/USD contexts and range conversion on cards/product pages",
  )
} finally {
  if (prior === undefined) delete process.env.MARKETPLACE_USD
  else process.env.MARKETPLACE_USD = prior
  delete globalThis.priceDb
  delete globalThis.priceFx
}
