/**
 * ===========================================================================
 *  WHAT THE PHONE'S SEARCH SCREEN FINDS AS YOU TYPE
 * ===========================================================================
 * lib/nav/quick-search.ts, driven with a fake Supabase client that records
 * what it was asked and answers from a small table, so the questions and the
 * shaping of the answers are both checked without a network.
 */
import { CREATOR_LIMIT, PRODUCT_LIMIT, cleanTerm, matchCategories, quickSearch } from "../lib/nav/quick-search"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`) }
}

console.log("\nThe word, made safe for a filter")
check("commas, brackets and wildcards are spaces", cleanTerm("a,b (c)*%\\d") === "a b c d", cleanTerm("a,b (c)*%\\d"))
check("and runs of space are one", cleanTerm("  lo   fi  ") === "lo fi")
check("an empty word stays empty", cleanTerm(" , ") === "")

console.log("\nCategories, without a round trip")
const design = matchCategories("design")
check("a word finds its category first", design.length > 0 && design[0].parent === null && /design/i.test(design[0].label), design)
check("categories link to their own page", design.every((c) => c.href.startsWith("/explore/")), design.map((c) => c.href))
check("nothing typed is nothing found", matchCategories("  ").length === 0)
check("at most four", matchCategories("e").length <= 4)

type Call = { table: string; select?: string; or?: string; opts?: unknown; eq?: [string, unknown][]; in?: [string, unknown[]]; limit?: number }
function fakeClient(rows: Record<string, any[]>, profiles: any[] = []) {
  const calls: Call[] = []
  return {
    calls,
    from(table: string) {
      const call: Call = { table, eq: [] }
      calls.push(call)
      const q: any = {
        select(s: string) { call.select = s; return q },
        or(f: string, opts?: unknown) { call.or = f; call.opts = opts; return q },
        eq(k: string, v: unknown) { call.eq!.push([k, v]); return q },
        in(k: string, v: unknown[]) { call.in = [k, v]; return q },
        limit(n: number) { call.limit = n; return q },
        then(resolve: (r: unknown) => void) {
          if (table === "profiles") return resolve({ data: profiles, error: null })
          const byCreator = !!(call.opts as any)?.referencedTable
          return resolve({ data: rows[byCreator ? "byCreator" : "byText"] ?? [], error: null })
        },
      }
      return q
    },
  }
}

const creator = (n: number) => ({ id: `c${n}`, user_id: `u${n}`, display_name: `Maria ${n}`, slug: `maria${n}`, username: null, avatar_url: `https://x/c${n}.png` })
const product = (id: string, c: number, extra: Record<string, unknown> = {}) => ({ id, title: `Pack ${id}`, slug: `pack-${id}`, thumbnail_url: `https://x/${id}.png`, price_cents: 1900, compare_at_cents: null, pay_what_you_want: false, pwyw_min_price_cents: null, creators: creator(c), ...extra })

async function main() {
  console.log("\nProducts and creators")
  const client = fakeClient(
    {
      byText: [product("a", 1), product("b", 2, { price_cents: 0 }), product("c", 1, { pay_what_you_want: true, pwyw_min_price_cents: 500 })],
      byCreator: [product("a", 1), product("d", 3), product("e", 3), product("f", 4), product("g", 5), product("h", 6)],
    },
    [{ id: "u3", avatar_url: "https://x/profile3.png", display_name: "Maria Three" }],
  )
  const r = await quickSearch(client, "mar,ia")
  const [text, byName] = client.calls
  check("asks titles and descriptions of published products", text.table === "products" && text.or === "title.ilike.%mar ia%,description.ilike.%mar ia%" && text.eq!.some(([k, v]) => k === "status" && v === "published"), text)
  check("and products by a creator whose name or handle says it", byName.or === "display_name.ilike.%mar ia%,username.ilike.%mar ia%,slug.ilike.%mar ia%" && (byName.opts as any)?.referencedTable === "creators" && byName.eq!.some(([k, v]) => k === "status" && v === "published"), byName)
  check("titles first, each product once, at most six", r.products.map((p) => p.id).join() === "a,b,c,d,e,f" && r.products.length === PRODUCT_LIMIT, r.products.map((p) => p.id))
  check("a product links to /<handle>/<slug> in discover mode", r.products[0].href === "/maria1/pack-a?layout=discover", r.products[0].href)
  check("with its picture, its creator and its price as every card writes it", r.products[0].thumb === "https://x/a.png" && r.products[0].creator === "Maria 1" && r.products[0].price === "$19.00" && r.products[1].price === "Free" && r.products[2].price === "$5.00+", r.products.slice(0, 3).map((p) => p.price))
  check("creators come from the name matches only, once each, at most three", r.creators.map((c) => c.handle).join() === "maria1,maria3,maria4" && r.creators.length === CREATOR_LIMIT, r.creators.map((c) => c.handle))
  check("a creator links to their page in discover mode", r.creators[0].href === "/maria1?layout=discover", r.creators[0].href)
  check("with the profile's photo and name where the profile has one", r.creators[1].avatar === "https://x/profile3.png" && r.creators[1].name === "Maria Three" && r.creators[0].avatar === "https://x/c1.png", r.creators)
  const photos = client.calls.find((c) => c.table === "profiles")
  check("the profiles are asked only for the creators shown", !!photos && JSON.stringify(photos.in) === JSON.stringify(["id", ["u1", "u3", "u4"]]), photos?.in)

  console.log("\nNothing typed, nothing asked")
  const idle = fakeClient({})
  const none = await quickSearch(idle, " ,, ")
  check("no request for an empty word", idle.calls.length === 0 && none.products.length === 0)

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
}
main()
