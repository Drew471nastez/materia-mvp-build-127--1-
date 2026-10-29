/**
 * ===========================================================================
 *  ROUND 44: THE SITEMAP ENGINE AT MILLIONS OF PAGES
 * ===========================================================================
 * PAGING    a file is a slice of the id space, read a thousand rows after
 *           the last id seen, never by offset; a server that answers fewer
 *           than a thousand rows does not end a file early; a slice stops at
 *           the protocol's 50,000; the slices of a table cover every row
 *           exactly once.
 * CHUNKS    how many files the index names, the names (N-of-M), and the old
 *           names (products-3.xml) still answering.
 * ESCAPING  every address RFC 3986 and XML clean: `&`, other alphabets, a
 *           space, a stray `%`, a host in another alphabet; 50 MB at most.
 * LASTMOD   a row's own date, the same on every read, never the time of the
 *           read.
 * 503       a read or a count that failed is a 503 with Retry-After and
 *           no-store, never a shorter file or an index without a kind.
 * ROBOTS    the dashboards and private flows are closed, with or without a
 *           query; every public page and the files Google draws them with
 *           are open; a built site's theme CSS and JS are open under /api/.
 * INDEXNOW  publishing, changing, taking down and deleting a product, a
 *           profile, a OnePage, a community, a blog post and a website each
 *           announce, after the answer.
 * SQL       part 343 follows the run-now rules.
 */
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { stripComments } from "./_source"
import {
  PLATFORM_DISALLOW,
  SITE_ALLOW,
  SITE_DISALLOW,
  SITEMAP_CHUNK,
  SITEMAP_MAX_BYTES,
  SITEMAP_MAX_URLS,
  chunkFileName,
  chunkIdRange,
  sitemapChunks,
  sitemapLoc,
  urlsetXml,
  type SitemapEntry,
} from "@/lib/seo/indexing"
import {
  EVERY_ID,
  SitemapReadFailed,
  creatorsSitemap,
  parseSitemapName,
  productsSitemap,
  readKeyset,
  sitemapIndex,
  urlsetWithinLimit,
  websitesSitemap,
} from "@/lib/seo/sitemaps"
import { sitemapCommunityCount, sitemapCommunitiesListed } from "@/lib/communities/server/public"
import { robotsTxt as siteRobotsTxt } from "@/lib/website-builder/site-seo"
import { announceAddresses, blogPostAddresses, communityAddresses } from "@/lib/seo/announce-pages"
import { onePageRoute } from "@/lib/onepage/host-route"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
  }
}
const section = (s: string) => console.log(`\n${s}`)
const raw = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(raw(p))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
type Row = Record<string, Any>

/* ── A PostgREST in memory, with the row cap a real one has ─────────────── */

interface FakeOptions {
  /** Rows PostgREST answers per request at most (`max_rows`): 1,000 on Supabase. */
  maxRows?: number
  /** Every read of these tables fails, as a blip that does not pass would. */
  failWith?: Record<string, { code?: string; message: string }>
}

/**
 * Enough of the query builder for lib/seo/sitemaps.ts: select (with a count
 * and the two embeds the sitemaps read), eq, neq, is, in, gt, gte, lt, not,
 * or (the `a.in.(…),b.in.(…)` the OnePage read sends), order, limit, range.
 * Rows come back in the order asked, at most `maxRows` to a request, and
 * every request is logged with whether it skipped rows by offset.
 */
function postgrest(tables: Record<string, Row[]>, options: FakeOptions = {}) {
  const maxRows = options.maxRows ?? 1000
  const log: { table: string; offset: number; limit: number | null; count: boolean }[] = []
  const embeds: Record<string, (row: Row) => Any> = {
    "products.creators": (row) => (tables.creators ?? []).find((c) => c.id === row.creator_id) ?? null,
    "store_theme_installs.store_theme_settings": (row) => (tables.store_theme_settings ?? []).filter((s) => s.install_id === row.id),
  }
  const inList = (v: Any): string[] => (Array.isArray(v) ? v.map(String) : String(v).replace(/^\(|\)$/g, "").split(","))
  const test = (kind: string, col: string, val: Any, row: Row): boolean => {
    const v = row[col]
    switch (kind) {
      case "eq":
        return v !== null && v !== undefined && String(v) === String(val)
      case "neq":
        return v === null || v === undefined || String(v) !== String(val)
      case "is":
        return val === null ? v === null || v === undefined : v === val
      case "not.is":
        return !(val === null ? v === null || v === undefined : v === val)
      case "in":
        return v !== null && v !== undefined && inList(val).includes(String(v))
      case "gt":
        return v !== null && v !== undefined && String(v) > String(val)
      case "gte":
        return v !== null && v !== undefined && String(v) >= String(val)
      case "lt":
        return v !== null && v !== undefined && String(v) < String(val)
      default:
        throw new Error(`fake postgrest: ${kind} is not known`)
    }
  }
  const orTerms = (expr: string) => {
    const out: string[] = []
    let depth = 0
    let at = 0
    for (let i = 0; i < expr.length; i++) {
      if (expr[i] === "(") depth++
      else if (expr[i] === ")") depth--
      else if (expr[i] === "," && depth === 0) {
        out.push(expr.slice(at, i))
        at = i + 1
      }
    }
    out.push(expr.slice(at))
    return out.map((t) => /^([\w]+)\.(in|eq)\.(.*)$/.exec(t.trim())).filter(Boolean) as RegExpExecArray[]
  }

  function from(table: string) {
    const s = { select: "*", count: false, head: false, filters: [] as Array<[string, string, Any]>, order: null as null | { col: string; asc: boolean }, limit: null as number | null, offset: 0, single: false }
    const run = () => {
      log.push({ table, offset: s.offset, limit: s.limit, count: s.count })
      const failure = options.failWith?.[table]
      if (failure) return { data: null, error: failure, count: null }
      let rows = (tables[table] ?? []).filter((r) =>
        s.filters.every(([kind, col, val]) => (kind === "or" ? orTerms(String(val)).some((m) => test(m[2], m[1], m[3], r)) : test(kind, col, val, r))),
      )
      if (s.count && s.head) return { data: null, error: null, count: rows.length }
      for (const m of s.select.matchAll(/(\w+)(!inner)?\(/g)) {
        const join = embeds[`${table}.${m[1]}`]
        if (!join) continue
        rows = rows.map((r) => ({ ...r, [m[1]]: join(r) }))
        if (m[2]) rows = rows.filter((r) => r[m[1]] !== null)
      }
      if (s.order) {
        const { col, asc } = s.order
        rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1))
      }
      const take = Math.min(s.limit ?? Infinity, maxRows)
      const data = rows.slice(s.offset, s.offset + take).map((r) => ({ ...r }))
      if (s.single) return { data: data[0] ?? null, error: null }
      return { data, error: null, count: s.count ? rows.length : null }
    }
    const b: Any = {
      select: (cols = "*", opts?: { count?: string; head?: boolean }) => ((s.select = cols), (s.count = !!opts?.count), (s.head = !!opts?.head), b),
      eq: (c: string, v: Any) => (s.filters.push(["eq", c, v]), b),
      neq: (c: string, v: Any) => (s.filters.push(["neq", c, v]), b),
      is: (c: string, v: Any) => (s.filters.push(["is", c, v]), b),
      in: (c: string, v: Any) => (s.filters.push(["in", c, v]), b),
      gt: (c: string, v: Any) => (s.filters.push(["gt", c, v]), b),
      gte: (c: string, v: Any) => (s.filters.push(["gte", c, v]), b),
      lt: (c: string, v: Any) => (s.filters.push(["lt", c, v]), b),
      not: (c: string, op: string, v: Any) => (s.filters.push([`not.${op}`, c, v]), b),
      or: (expr: string) => (s.filters.push(["or", "", expr]), b),
      order: (col: string, o?: { ascending?: boolean }) => ((s.order = { col, asc: o?.ascending !== false }), b),
      limit: (n: number) => ((s.limit = n), b),
      range: (a: number, z: number) => ((s.offset = a), (s.limit = z - a + 1), b),
      maybeSingle: () => ((s.single = true), b),
      then: (resolve: (v: Any) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve().then(run).then(resolve, reject),
    }
    return b
  }
  return { from, log, tables }
}

/** Ids as gen_random_uuid makes them, sorted as Postgres sorts a uuid. */
const ids = (n: number) => Array.from({ length: n }, () => randomUUID()).sort()

/** A world of creators who each sell `per` products, `n` products in all. */
function shop(n: number, per = 100, extra: Partial<Row> = {}) {
  const creatorIds = ids(Math.ceil(n / per))
  const creators = creatorIds.map((id, i) => ({ id, user_id: `u-${i}`, cover_url: null, banned_at: null }))
  const profiles = creators.map((c, i) => ({ id: c.user_id, username: `maker${i}`, avatar_url: null, spam_state: null }))
  const products = ids(n).map((id, i) => ({
    id,
    slug: `pack-${i}`,
    status: "published",
    type: "digital",
    community_id: null,
    archived: false,
    creator_id: creators[i % creators.length].id,
    updated_at: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
    thumbnail_url: null,
    gallery_urls: null,
    ...extra,
  }))
  return { creators, profiles, products, custom_domains: [] as Row[], website_addresses: [] as Row[], store_theme_installs: [] as Row[], store_theme_settings: [] as Row[] }
}

const quietly = async <T>(fn: () => Promise<T>): Promise<T> => {
  const e = console.error
  console.error = () => {}
  try {
    return await fn()
  } finally {
    console.error = e
  }
}

async function main() {
  section("A file is read by id, a thousand rows after the last one seen, never by offset")
  {
    const table = ids(2500).map((id) => ({ id }))
    const db = postgrest({ t: table })
    const rows = await readKeyset<Row & { id: string }>((page) => page(db.from("t").select("id")), EVERY_ID, "t")
    check("past the 1,000 a request is answered with, every row is read", rows.length === 2500 && new Set(rows.map((r) => r.id)).size === 2500)
    check("  in id order, with no offset asked for", rows.every((r, i) => i === 0 || rows[i - 1].id < r.id) && db.log.every((l) => l.offset === 0 && l.limit === 1000))
    check("  three full pages and an empty one that ends it", db.log.length === 4, db.log.length)

    const stingy = postgrest({ t: table }, { maxRows: 700 })
    const all = await readKeyset<Row & { id: string }>((page) => page(stingy.from("t").select("id")), EVERY_ID, "t")
    check("a PostgREST that answers 700 to a request does not end the file at its first short page", all.length === 2500, all.length)

    const big = ids(SITEMAP_MAX_URLS + 700).map((id) => ({ id }))
    const capped = await quietly(() => readKeyset<Row & { id: string }>((page) => page(postgrest({ t: big }).from("t").select("id")), EVERY_ID, "t"))
    check("past 50,000 rows a file stops at the protocol's 50,000", capped.length === SITEMAP_MAX_URLS && SITEMAP_MAX_URLS === 50_000)

    const range = chunkIdRange(1, 4)
    const slice = await readKeyset<Row & { id: string }>((page) => page(postgrest({ t: table }).from("t").select("id")), range, "t")
    check("a slice reads only its own ids", slice.length > 0 && slice.every((r) => r.id >= range.lo! && r.id < range.hi!))

    let calls = 0
    const flaky = await readKeyset<{ id: string }>(
      async () => {
        calls++
        return calls === 1 ? { data: null, error: { message: "blip" } } : { data: [], error: null }
      },
      EVERY_ID,
      "flaky",
    )
    check("a blip is asked again", flaky.length === 0 && calls === 2)
    let thrown: unknown = null
    await quietly(async () => {
      try {
        await readKeyset<{ id: string }>(async () => ({ data: null, error: { message: "down" } }), EVERY_ID, "down")
      } catch (e) {
        thrown = e
      }
    })
    check("a read that fails twice is thrown, never handed back as fewer rows", thrown instanceof SitemapReadFailed)

    const stuck = await readKeyset<{ id: string }>(async () => ({ data: [{ id: "a" }], error: null }), EVERY_ID, "stuck")
    check("a page that does not move forward ends the read instead of asking for ever", stuck.length <= 2)
  }

  section("The slices of a table, and the index that names them")
  {
    check("one file for none and up to ten thousand, then one per ten thousand",
      sitemapChunks(0) === 1 && sitemapChunks(SITEMAP_CHUNK) === 1 && sitemapChunks(SITEMAP_CHUNK + 1) === 2 && sitemapChunks(1_000_000) === 100 && sitemapChunks(5_000_001) === 501)
    const of = 7
    const slices = Array.from({ length: of }, (_, i) => chunkIdRange(i, of))
    check("the first slice starts at the start, the last ends at the end", slices[0].lo === null && slices[of - 1].hi === null)
    check("each slice ends where the next begins: no id falls between two", slices.every((s, i) => i === of - 1 || s.hi === slices[i + 1].lo))
    check("the bounds are ids Postgres compares as uuids", slices.slice(1).every((s) => /^[0-9a-f]{8}-0000-0000-0000-000000000000$/.test(s.lo!)))
    check("one slice of one is everything", JSON.stringify(chunkIdRange(0, 1)) === JSON.stringify({ lo: null, hi: null }))
    check("a name carries its slice count", chunkFileName("products", 3, 16) === "products-3-of-16.xml")
    check("the route reads the new names",
      JSON.stringify(parseSitemapName("products-3-of-16.xml")) === JSON.stringify({ kind: "products", chunk: 3, of: 16 }) && parseSitemapName("onepages-0-of-2.xml")?.kind === "onepages")
    check("and the old ones, from an index read before round 44", JSON.stringify(parseSitemapName("creators-2.xml")) === JSON.stringify({ kind: "creators", chunk: 2 }))
    check("a slice past the count, or a count of none, is not a file", parseSitemapName("products-16-of-16.xml") === null && parseSitemapName("products-0-of-0.xml") === null && parseSitemapName("products-1-of-x.xml") === null)
    const me = onePageRoute({ host: "storelib.me", pathname: "/sitemap/onepages-1-of-3.xml", search: "", method: "GET", userAgent: "Mozilla/5.0", mainDomain: "storelib.com", platformSubdomains: ["www"] })
    check("storelib.me serves its files under the new names", me?.kind === "next", me)

    const world = shop(60_000, 100)
    const db = postgrest(world)
    const index = await sitemapIndex(db as Any)
    const productFiles = index.map((e) => e.url).filter((u) => u.includes("/sitemap/products-"))
    check("60,000 products are six files in the index", productFiles.length === 6 && productFiles[5] === "https://storelib.com/sitemap/products-5-of-6.xml", productFiles)
    check("  beside pages, creators and websites", index[0].url === "https://storelib.com/sitemap/pages.xml" && index.some((e) => e.url.endsWith("/creators-0-of-1.xml")) && index.some((e) => e.url.endsWith("/websites-0-of-1.xml")))
    const files: SitemapEntry[][] = []
    for (let i = 0; i < 6; i++) files.push(await productsSitemap(i, 6, db as Any))
    const urls = files.flat().map((e) => e.url)
    check("the six files list every product exactly once", urls.length === 60_000 && new Set(urls).size === 60_000, urls.length)
    check("  each well under 50,000 addresses, about ten thousand", files.every((f) => f.length > 8_000 && f.length < 12_000), files.map((f) => f.length))
    const productReads = db.log.filter((l) => l.table === "products" && !l.count && l.limit === 1000)
    check("  and no request skipped rows by offset", productReads.length > 60 && productReads.every((l) => l.offset === 0))
    const one = await productsSitemap(5, undefined, db as Any)
    check("an old name (products-5.xml) is counted afresh and answers the same slice", JSON.stringify(one) === JSON.stringify(files[5]))

    const creators = await creatorsSitemap(0, 1, db as Any)
    check("a creator's product count reads past a thousand of their products", creators.length === 600, creators.length)
  }

  section("Removal: what is taken down or deleted is gone from the next read")
  {
    const world = shop(3000, 50)
    const db = postgrest(world)
    const before = await productsSitemap(0, 1, db as Any)
    world.products[10].status = "draft"
    world.products[20].status = "archived"
    const gone = world.products.splice(30, 1)[0]
    world.products[40].type = "physical"
    const after = await productsSitemap(0, 1, db as Any)
    const left = new Set(after.map((e) => e.url))
    check("an unpublished, an archived, a deleted and a physical product are not listed", before.length === 3000 && after.length === 2996 && !left.has(`https://storelib.com/maker${10 % 60}/pack-10`) && !left.has(`https://storelib.com/maker${30 % 60}/${gone.slug}`))
    world.creators[0].banned_at = "2026-10-01T00:00:00Z"
    const banned = await productsSitemap(0, 1, db as Any)
    const maker0 = after.filter((e) => e.url.startsWith("https://storelib.com/maker0/")).length
    check("a banned creator's products leave with the ban", maker0 > 0 && banned.length === after.length - maker0 && !banned.some((e) => e.url.startsWith("https://storelib.com/maker0/")))
  }

  section("Every address is RFC 3986 and XML clean")
  {
    check("other alphabets and spaces are percent encoded", sitemapLoc("https://storelib.com/maría/café pack") === "https://storelib.com/mar%C3%ADa/caf%C3%A9%20pack")
    check("what is already encoded is left as it is", sitemapLoc("https://storelib.com/caf%C3%A9?q=a%20b") === "https://storelib.com/caf%C3%A9?q=a%20b" && sitemapLoc(sitemapLoc("https://storelib.com/ü")) === sitemapLoc("https://storelib.com/ü"))
    check("a stray % is encoded, a valid one is not", sitemapLoc("https://storelib.com/100%-cotton") === "https://storelib.com/100%25-cotton")
    check("a host in another alphabet is written in punycode", sitemapLoc("https://bücher.de/x") === "https://xn--bcher-kva.de/x")
    check("an emoji is four bytes, encoded whole", sitemapLoc("https://storelib.com/🎨") === "https://storelib.com/%F0%9F%8E%A8")
    const xml = urlsetXml([
      { url: "https://storelib.com/a?x=1&y=<2>", lastModified: "2026-09-01T10:00:00Z", images: ["https://cdn.example.com/a&b.png", "https://cdn.example.com/é.png"] },
      { url: "https://storelib.com/café" },
      { url: "https://storelib.com/caf%C3%A9" },
    ])
    check("& is &amp; in an address and in a picture's", xml.includes("<loc>https://storelib.com/a?x=1&amp;y=%3C2%3E</loc>") && xml.includes("<image:loc>https://cdn.example.com/a&amp;b.png</image:loc>"))
    check("a picture's address is encoded like a page's", xml.includes("<image:loc>https://cdn.example.com/%C3%A9.png</image:loc>"))
    check("café and caf%C3%A9 are one address, listed once", (xml.match(/caf%C3%A9/g) ?? []).length === 1)
    check("no bare & and nothing outside ASCII is left in the file", !/&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml) && !/[^\x09\x0a\x0d\x20-\x7e]/.test(xml))
    check("the image namespace is declared", xml.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'))

    const pictures = Array.from({ length: 10 }, (_, i) => `https://cdn.storelib.com/media/products/${"x".repeat(80)}/${i}.png`)
    const heavy = Array.from({ length: SITEMAP_MAX_URLS }, (_, i) => ({ url: `https://storelib.com/maker/${"p".repeat(40)}-${i}`, lastModified: "2026-09-01T10:00:00Z", images: pictures }))
    check("fifty thousand pages with ten pictures each would pass 50 MB", Buffer.byteLength(urlsetXml(heavy)) > SITEMAP_MAX_BYTES)
    const fit = await quietly(async () => urlsetWithinLimit(heavy))
    check("  so the file is written without its pictures, inside the limit, every address kept", Buffer.byteLength(fit) <= SITEMAP_MAX_BYTES && !fit.includes("<image:image>") && (fit.match(/<url>/g) ?? []).length === SITEMAP_MAX_URLS)
    check("a file inside the limit keeps its pictures", urlsetWithinLimit(heavy.slice(0, 10)).includes("<image:image>"))
  }

  section("lastmod is the row's own date, the same on every read")
  {
    const world = shop(1200, 100)
    world.products[0].updated_at = null
    const db = postgrest(world)
    const first = urlsetXml(await productsSitemap(0, 1, db as Any))
    await new Promise((r) => setTimeout(r, 15))
    const second = urlsetXml(await productsSitemap(0, 1, db as Any))
    check("two reads a moment apart are the same file", first === second)
    const today = new Date().toISOString().slice(0, 10)
    check("no address carries the day it was read", !first.includes(`<lastmod>${today}`))
    check("a product's date is its updated_at", first.includes(`<lastmod>${world.products[5].updated_at}</lastmod>`))
    check("a row without a date carries none", /<url><loc>https:\/\/storelib\.com\/maker0\/pack-0<\/loc><\/url>/.test(first))
    const creators = await creatorsSitemap(0, 1, db as Any)
    const maker0 = creators.find((c) => c.url === "https://storelib.com/maker0")
    const newest = world.products.filter((p) => p.creator_id === world.creators[0].id).map((p) => p.updated_at).filter(Boolean).sort().pop()
    check("a creator page's date is its newest product's", maker0?.lastModified === newest, { got: maker0?.lastModified, newest })
  }

  section("A read or a count that failed is a 503, never a shorter file")
  {
    const world = shop(500, 50)
    const down = postgrest(world, { failWith: { products: { message: "connection reset" } } })
    let thrown: unknown = null
    await quietly(async () => {
      try {
        await productsSitemap(0, 1, down as Any)
      } catch (e) {
        thrown = e
      }
    })
    check("a products read that fails twice is SitemapReadFailed", thrown instanceof SitemapReadFailed)
    thrown = null
    await quietly(async () => {
      try {
        await sitemapIndex(postgrest(world, { failWith: { store_theme_installs: { message: "timeout" } } }) as Any)
      } catch (e) {
        thrown = e
      }
    })
    check("an index whose websites count failed is SitemapReadFailed, not an index without websites", thrown instanceof SitemapReadFailed)
    thrown = null
    await quietly(async () => {
      try {
        await websitesSitemap(0, 1, postgrest({ ...world, store_theme_installs: [{ id: randomUUID(), creator_id: world.creators[0].id, status: "published" }] }, { failWith: { website_addresses: { message: "timeout" } } }) as Any)
      } catch (e) {
        thrown = e
      }
    })
    check("a website name read that fails is a failed file, not every renamed site at its old name", thrown instanceof SitemapReadFailed)
    const noTable = await websitesSitemap(0, 1, postgrest({ ...world, store_theme_installs: [{ id: randomUUID(), creator_id: world.creators[0].id, status: "published" }] }, { failWith: { website_addresses: { code: "42P01", message: 'relation "public.website_addresses" does not exist' } } }) as Any)
    check("  while no table yet (before its part) is the username, as it always was", noTable.length === 1 && noTable[0].url === "https://maker0.storelib.com/", noTable)
    check("a communities count that failed is null, not 0", (await sitemapCommunityCount(postgrest({}, { failWith: { communities: { message: "timeout" } } }) as Any)) === null)
    check("  before part 81 it is 0", (await sitemapCommunityCount(postgrest({}, { failWith: { communities: { code: "42P01", message: "relation does not exist" } } }) as Any)) === 0)
    check("  and the index turns null into a 503", /if \(n === null\) \{[\s\S]{0,80}throw new SitemapReadFailed\("communities"\)/.test(code("lib/seo/sitemaps.ts")))

    /* The routes themselves, against a database that does not answer. */
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://placeholder.supabase.co"
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= "placeholder"
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new Error("offline")
    }) as typeof fetch
    try {
      const { GET: file } = await import("@/app/sitemap/[name]/route")
      const { GET: index } = await import("@/app/sitemap.xml/route")
      const res = await quietly(() => file(new Request("https://storelib.com/sitemap/products-0-of-1.xml"), { params: Promise.resolve({ name: "products-0-of-1.xml" }) }))
      check("the file route answers 503 with Retry-After and no-store", res.status === 503 && res.headers.get("Retry-After") === "600" && res.headers.get("Cache-Control") === "no-store")
      const old = await quietly(() => file(new Request("https://storelib.com/sitemap/creators-0.xml"), { params: Promise.resolve({ name: "creators-0.xml" }) }))
      check("  so does an old name whose count fails", old.status === 503)
      const idx = await quietly(() => index())
      check("  and the index", idx.status === 503 && idx.headers.get("Cache-Control") === "no-store")
      const missing = await file(new Request("https://storelib.com/sitemap/products-9-of-2.xml"), { params: Promise.resolve({ name: "products-9-of-2.xml" }) })
      check("a name that is not a file is a 404", missing.status === 404)
    } finally {
      globalThis.fetch = realFetch
    }
    const route = code("app/sitemap/[name]/route.ts")
    check("a file that was read is held at the edge an hour and served stale while it is read again", /"public, s-maxage=3600, stale-while-revalidate=86400"/.test(route) && /urlsetWithinLimit\(entries\)/.test(route))
  }

  section("Communities are read a whole slice at a time, their domains asked 150 at a time")
  {
    const list = ids(400).map((id) => ({ id, creator_id: "c1", slug: `s-${id.slice(0, 6)}`, updated_at: null, cover_url: null }))
    const sizes: number[] = []
    const db = {
      from: (table: string) => {
        const b: Any = {
          select: () => b,
          eq: () => b,
          in: (_c: string, v: string[]) => (sizes.push(v.length), b),
          then: (resolve: (v: Any) => unknown) =>
            Promise.resolve(resolve({ data: table === "custom_domains" ? [{ target_id: list[399].id, creator_id: "c1" }] : [{ community_id: list[0].id }], error: null })),
        }
        return b
      },
    }
    const listed = await sitemapCommunitiesListed(db, list)
    check("no lookup names more than 150 ids", sizes.length === 6 && sizes.every((n) => n <= 150), sizes)
    check("one on its own domain and one waiting to be deleted are left out, the rest are listed", listed.length === 398 && !listed.some((c) => c.slug === list[0].slug || c.slug === list[399].slug))
    const maps = code("lib/seo/sitemaps.ts")
    check("the communities file reads its slice by id", /readKeyset<SitemapCommunityRow>\(\(page\) => page\(sitemapCommunityQuery\(admin\)\), range, "communities"\)/.test(maps) && !/sitemapCommunities\(chunk \* SITEMAP_CHUNK/.test(maps))
  }

  section("robots.txt keeps the dashboards out and every public page open")
  {
    /* Google's reading: the longest matching rule wins, Allow on a tie; `*` is any run, `$` the end. */
    const verdict = (allow: string[], disallow: string[], path: string): boolean => {
      const len = (rules: string[]) =>
        Math.max(-1, ...rules.filter((r) => new RegExp("^" + r.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$|\$$/, "$")).test(path)).map((r) => r.length))
      return len(allow) >= len(disallow)
    }
    const open = (p: string) => verdict(["/"], PLATFORM_DISALLOW, p)
    const closed = [
      "/app", "/app/products", "/admin", "/admin/seo", "/dashboard", "/account", "/account/library", "/checkout", "/checkout?product=1", "/checkout/x",
      "/api/track-view", "/website-builder", "/website-builder/editor/1", "/onepage-preview", "/onepage-preview?id=1", "/receipt/abc", "/order-help/1",
      "/downloads", "/downloads?token=x", "/library", "/team/join?token=abc", "/team/join", "/stripe-done", "/stripe-done?account=1", "/unsubscribe?token=abc",
      "/w/mara", "/store/mara/themes/1/editor", "/purchase?session=1", "/access/1", "/pay?x=1", "/review?token=1",
    ]
    check("the app, admin, dashboards, checkout, previews, receipts, downloads, library and team invites are closed", closed.every((p) => !open(p)), closed.filter(open))
    const public_ = [
      "/", "/pricing", "/features", "/faq", "/blog", "/blog/how-to-sell", "/explore", "/explore/design", "/explore?type=communities", "/developers", "/help",
      "/mara", "/mara/pack", "/mara/links", "/community/clay-club", "/teamwork", "/apparel", "/libraryofsound", "/checkouts-club", "/stripes", "/payton", "/review-joe",
      "/signup", "/sitemap.xml", "/sitemap/products-0-of-1.xml", "/robots.txt",
    ]
    check("every public page, and a handle that starts like a route, is open", public_.every(open), public_.filter((p) => !open(p)))
    const assets = ["/_next/static/chunks/app.js", "/_next/static/css/app.css", "/_next/image?url=%2Fmedia%2Fx.png&w=640", "/media/store-builder-images/x.png", "/favicon.ico", "/icon.png", "/apple-icon.png", "/fonts/inter.woff2"]
    check("and the scripts, styles, fonts and pictures Google draws them with", assets.every(open), assets.filter((p) => !open(p)))
    check("app/robots.ts writes those rules and names the index", /disallow: PLATFORM_DISALLOW/.test(code("app/robots.ts")) && /sitemap: "https:\/\/storelib\.com\/sitemap\.xml"/.test(code("app/robots.ts")))

    const site = siteRobotsTxt("https://mara.storelib.com", true)
    const allow = [...site.matchAll(/^Allow: (.+)$/gm)].map((m) => m[1])
    const disallow = [...site.matchAll(/^Disallow: (.+)$/gm)].map((m) => m[1])
    const siteOpen = (p: string) => verdict(allow, disallow, p)
    check("a built site's theme CSS, JS and pictures are open under /api/", allow.includes(SITE_ALLOW[0]) && siteOpen("/api/site-theme/assets/1/h-abc/theme.css") && siteOpen("/api/site-theme/assets/1/h-abc/app.js"))
    check("  while the rest of its /api/, previews, search, cart and account stay closed",
      ["/api/site-account", "/api/site-theme/site/mara", "/preview/tok", "/search?q=mug", "/cart", "/account"].every((p) => !siteOpen(p)) && SITE_DISALLOW[0] === "/api/")
    check("  and its pages are open", ["/", "/products/mug", "/about", "/collections/all"].every(siteOpen))
  }

  section("IndexNow: every publish, change, take down and delete announces, after the answer")
  {
    check("a community's address, under each slug it had", JSON.stringify(communityAddresses("clay", "clay-club", "clay", null)) === JSON.stringify(["https://storelib.com/community/clay", "https://storelib.com/community/clay-club"]))
    check("a blog post's address and the blog it is listed on", JSON.stringify(blogPostAddresses("how-to-sell")) === JSON.stringify(["https://storelib.com/blog/how-to-sell", "https://storelib.com/blog"]) && blogPostAddresses(undefined).length === 0)

    const sent: Array<{ url: string; body: Any }> = []
    const realFetch = globalThis.fetch
    const before = process.env.INDEXNOW_KEY
    process.env.INDEXNOW_KEY = "3f1c9a7e2b8d4c6f"
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.startsWith("https://api.indexnow.org/")) {
        sent.push({ url, body: JSON.parse(String(init?.body)) })
        return new Response(null, { status: 202 })
      }
      throw new Error("offline")
    }) as typeof fetch
    try {
      await announceAddresses(communityAddresses("clay-club-r44"))
      check("announcing a community posts it to IndexNow, with the host's key file", sent.length === 1 && sent[0].body.host === "storelib.com" && sent[0].body.keyLocation === "https://storelib.com/3f1c9a7e2b8d4c6f.txt" && sent[0].body.urlList[0] === "https://storelib.com/community/clay-club-r44", sent)
      await announceAddresses(communityAddresses("clay-club-r44"))
      check("  and not twice in ten minutes", sent.length === 1)
      process.env.INDEXNOW_KEY = ""
      await announceAddresses(blogPostAddresses("r44-post"))
      check("  and nothing at all without a key", sent.length === 1)
    } finally {
      globalThis.fetch = realFetch
      if (before === undefined) delete process.env.INDEXNOW_KEY
      else process.env.INDEXNOW_KEY = before
    }

    const after = /after\(\(\) => announce(?:Addresses)?\(/
    const events: Array<[string, string, RegExp]> = [
      ["a product saved, published or taken down", "app/api/seo/indexnow/route.ts", /after\(\(\) => announce\(\(\) => productAddresses\(productId, creatorId\)\)\)/],
      ["a product deleted", "app/api/seo/indexnow/route.ts", /after\(\(\) => announce\(\(\) => removedProductAddresses\(slug, creatorId\)\)\)/],
      ["a profile changed", "app/api/creator-profile/route.ts", /after\(\(\) => announce\(\(\) => profileAddresses\(announcedCreator\)\)\)/],
      ["a OnePage published", "app/api/onepage/publish/route.ts", /after\(\(\) => announce\(\(\) => onePageAddresses\(owner\)\)\)/],
      ["a website published or taken down", "app/api/website-builder/themes/[installId]/publish/route.ts", /after\(\(\) => announce\(\(\) => websiteAddresses\(announced\)\)\)/],
      ["a website release restored", "app/api/website-builder/themes/[installId]/releases/[releaseId]/restore/route.ts", /after\(\(\) => announce\(\(\) => websiteAddresses\(creatorId\)\)\)/],
      ["a community published or taken back to a draft", "app/api/app/community/[id]/route.ts", /const slug = done\.community\.slug\s*after\(\(\) => announceAddresses\(communityAddresses\(slug\)\)\)/],
      ["a live community's settings or slug changed", "app/api/app/community/[id]/route.ts", /const slugs = \[gate\.community\.slug, done\.community\.slug\]\s*after\(\(\) => announceAddresses\(communityAddresses\(\.\.\.slugs\)\)\)/],
      ["a community archived", "app/api/app/community/[id]/archive/route.ts", /after\(\(\) => announceAddresses\(communityAddresses\(slug\)\)\)/],
      ["a community deleted", "app/api/app/community/[id]/delete/route.ts", /after\(\(\) => announceAddresses\(communityAddresses\(slug\)\)\)/],
      ["a blog post published", "app/api/admin/blog/posts/route.ts", /if \(data\?\.is_published\) \{[\s\S]{0,80}after\(\(\) => announceAddresses\(blogPostAddresses\(slug\)\)\)/],
      ["a blog post changed, renamed or unpublished", "app/api/admin/blog/posts/[id]/route.ts", /const slugs = \[before\?\.slug, data\?\.slug\]\s*after\(\(\) => announceAddresses\(blogPostAddresses\(\.\.\.slugs\)\)\)/],
      ["a blog post deleted", "app/api/admin/blog/posts/[id]/route.ts", /after\(\(\) => announceAddresses\(blogPostAddresses\(gone\)\)\)/],
    ]
    for (const [what, file, pattern] of events) check(`  ${what} (${file})`, pattern.test(code(file)) && after.test(code(file)))
    const community = code("app/api/app/community/[id]/route.ts")
    check("  each only once the change was saved", community.indexOf("announceAddresses(communityAddresses(slug))") > community.indexOf("if (!done.ok)") &&
      code("app/api/app/community/[id]/delete/route.ts").indexOf("announceAddresses(") > code("app/api/app/community/[id]/delete/route.ts").indexOf("if (!done.ok)"))
    const light = code("lib/seo/announce-pages.ts")
    check("the community and blog routes load IndexNow alone, not the sitemaps", /from "\.\/indexnow"/.test(light) && !/sitemaps|announce"|site-seo/.test(light))
    check("Google is not pinged: its sitemap ping was retired in 2023", !/google\.com\/ping|\/ping\?sitemap/.test(code("lib/seo/indexnow.ts") + light + code("lib/seo/announce.ts")))
  }

  section("SQL part 343 follows the run-now rules")
  {
    const file = "343_sitemap_indexes.sql"
    const part = raw(`supabase/sql/run-now/${file}`)
    const lines = part.trimEnd().split("\n")
    check("line 1 is the summary, safe to run again", /^\/\* Sitemap indexes \(round 44\).*Safe to run again\. \*\/$/.test(lines[0]))
    check("one statement per line, notify last", lines.slice(1).every((l) => l.trim().endsWith(";")) && lines[lines.length - 1] === "notify pgrst, 'reload schema';")
    const statements = lines.slice(1).join("\n")
    check("only adds indexes, each IF NOT EXISTS", !/DROP |DELETE FROM|^UPDATE |TRUNCATE|ALTER TABLE|CREATE TABLE/im.test(statements) && (statements.match(/CREATE INDEX IF NOT EXISTS/g) ?? []).length === 4 && !/CREATE INDEX (?!IF NOT EXISTS)/.test(statements))
    for (const [name, def] of [
      ["products_sitemap_idx", "ON public.products (id) WHERE status = 'published'"],
      ["products_sitemap_creator_idx", "ON public.products (creator_id, id) WHERE status = 'published'"],
      ["store_theme_installs_sitemap_idx", "ON public.store_theme_installs (id) WHERE status = 'published'"],
      ["communities_sitemap_idx", "ON public.communities (id) WHERE status = 'published' AND deleted_at IS NULL"],
    ]) {
      check(`  ${name}, skipped when it is there or its table is not`, part.includes(`CREATE INDEX IF NOT EXISTS ${name} ${def};`) && part.includes(`IF to_regclass('public.${name}') IS NOT NULL THEN RETURN; END IF;`) &&
        raw("supabase/sql/RUN_SITEMAP_INDEXES_CONCURRENTLY.sql").includes(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${name} ${def};`))
    }
    check("the migration copy is the part, byte for byte", raw("supabase/migrations/20271101_sitemap_indexes.sql") === part)
    check("its README row and its check after column", raw("supabase/sql/run-now/README.md").includes(`| \`${file}\` |`) && /as p343_sitemap_indexes[,;]/.test(raw("supabase/sql/run-now/99_check_after.sql")))
    check("in the built files and the parts record", raw("supabase/sql/run-four/3_of_4_latest.sql").includes(`-- part ${file}`) && raw("lib/admin/sql-parts.generated.ts").includes(`part: "343", file: "${file}"`))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
