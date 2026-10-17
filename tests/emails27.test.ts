/**
 * ===========================================================================
 *  ROUND 27, EMAILS: THE WEBSITE, NOT THE CREATOR PAGE
 * ===========================================================================
 *   store link     lib/physical/store-link orderStoreUrl: the live website
 *                  the order was placed on (primary domain once active, else
 *                  the <name>.storelib.com address), the creator's website
 *                  when the order says nothing, "" with no live website;
 *                  never storelib.com, never storelib.com/<username>
 */
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
process.env.MAILGUN_API_KEY = "key-test"
process.env.MAILGUN_DOMAIN = "storelib.com"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
}

/* ── A database in memory: equality filters, in(), limit, one row or many ── */
type Row = Record<string, any>
class FakeDb {
  tables: Record<string, Row[]> = {}
  seq = 1
  rows(t: string) {
    return (this.tables[t] ??= [])
  }
  auth = { admin: { getUserById: async () => ({ data: { user: { email: "owner@andrew.test" } } }) } }
  from(table: string) {
    return new Query(this, table)
  }
  async rpc() {
    return { data: null, error: { code: "42883" } }
  }
}
class Query {
  filters: ((r: Row) => boolean)[] = []
  op: "select" | "insert" | "update" | "upsert" | "delete" = "select"
  payload: any = null
  max = Infinity
  wantOne = false
  constructor(private db: FakeDb, private table: string) {}
  select() {
    return this
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => r[c] === v)
    return this
  }
  neq(c: string, v: unknown) {
    this.filters.push((r) => r[c] !== v)
    return this
  }
  in(c: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[c]))
    return this
  }
  gt(c: string, v: string) {
    this.filters.push((r) => String(r[c] ?? "") > v)
    return this
  }
  gte(c: string, v: string) {
    this.filters.push((r) => String(r[c] ?? "") >= v)
    return this
  }
  lte(c: string, v: string) {
    this.filters.push((r) => String(r[c] ?? "") <= v)
    return this
  }
  is(c: string, v: unknown) {
    this.filters.push((r) => (r[c] ?? null) === v)
    return this
  }
  not() {
    return this
  }
  or() {
    return this
  }
  order() {
    return this
  }
  limit(n: number) {
    this.max = n
    return this
  }
  range() {
    return this
  }
  insert(p: any) {
    this.op = "insert"
    this.payload = p
    return this
  }
  update(p: any) {
    this.op = "update"
    this.payload = p
    return this
  }
  upsert(p: any) {
    this.op = "upsert"
    this.payload = p
    return this
  }
  delete() {
    this.op = "delete"
    return this
  }
  maybeSingle() {
    this.wantOne = true
    return this.run()
  }
  single() {
    this.wantOne = true
    return this.run()
  }
  then(res: (v: any) => any, rej?: (e: any) => any) {
    return this.run().then(res, rej)
  }
  private async run(): Promise<{ data: any; error: any }> {
    const rows = this.db.rows(this.table)
    const match = (r: Row) => this.filters.every((f) => f(r))
    if (this.op === "insert") {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r: Row) => ({ id: r.id ?? this.db.seq++, status: "pending", attempts: 0, max_attempts: 5, created_at: new Date().toISOString(), ...r }))
      rows.push(...list)
      return { data: this.wantOne ? list[0] : list, error: null }
    }
    if (this.op === "update") {
      const hit = rows.filter(match)
      for (const r of hit) Object.assign(r, this.payload)
      return { data: hit.map((r) => ({ id: r.id })), error: null }
    }
    if (this.op === "upsert") {
      rows.push({ ...(this.payload as Row) })
      return { data: null, error: null }
    }
    if (this.op === "delete") {
      this.db.tables[this.table] = rows.filter((r) => !match(r))
      return { data: null, error: null }
    }
    const found = rows.filter(match).slice(0, this.max)
    return { data: this.wantOne ? found[0] ?? null : found, error: null }
  }
}

const CREATOR = "c0000000-0000-4000-8000-000000000027"

/** A creator "andrewrullz" with a published website and, on request, domains. */
function siteDb(opts: { published?: boolean; domains?: Row[]; banned?: boolean; handle?: string } = {}): FakeDb {
  const db = new FakeDb()
  db.tables.creators = [{ id: CREATOR, user_id: "u27", slug: "andrewrullz", username: "andrewrullz", banned_at: opts.banned ? "2026-10-01T00:00:00Z" : null }]
  db.tables.profiles = [{ id: "u27", username: "andrewrullz" }]
  db.tables.store_theme_installs = opts.published === false ? [] : [{ id: "i27", creator_id: CREATOR, status: "published" }]
  db.tables.custom_domains = (opts.domains ?? []).map((d) => ({ creator_id: CREATOR, created_at: "2026-09-01T00:00:00Z", ...d }))
  db.tables.website_addresses = opts.handle ? [{ creator_id: CREATOR, handle: opts.handle }] : []
  db.tables.website_address_history = []
  db.tables.site_deployments = []
  return db
}

async function storeLink() {
  const { orderStoreUrl, storeHostCandidates, storeLinkOf, isPlatformHost } = await import("@/lib/physical/store-link")
  console.log("\nStore link: the live website the order was placed on\n")

  /* The pure half. */
  const c = storeHostCandidates({ primary: "www.andrew.ro", placed: "andrewrullz.storelib.com", hosts: ["andrewrullz.storelib.com", "andrew.ro", "www.andrew.ro", "storelib.com"], mainDomain: "storelib.com" })
  check("candidates: primary domain first, then other domains, then the subdomain the order was placed on; each once", JSON.stringify(c) === JSON.stringify(["www.andrew.ro", "andrew.ro", "andrewrullz.storelib.com"]), c)
  const placedCustom = storeHostCandidates({ primary: null, placed: "shop.andrew.ro", hosts: ["andrewrullz.storelib.com", "andrew.ro"], mainDomain: "storelib.com" })
  check("candidates: a custom domain the order was placed on comes before the creator's other addresses", placedCustom[0] === "shop.andrew.ro" && placedCustom.at(-1) === "andrewrullz.storelib.com", placedCustom)
  check("candidates: storelib.com and www.storelib.com are never one (only the creator page answers there)", storeHostCandidates({ placed: "storelib.com", hosts: ["www.storelib.com"], mainDomain: "storelib.com" }).length === 0)
  check("candidates: junk is dropped", storeHostCandidates({ placed: "javascript:alert(1)", hosts: ["", "a b.com", "x"], mainDomain: "storelib.com" }).length === 0)
  check("isPlatformHost: storelib.com yes, andrewrullz.storelib.com no", isPlatformHost("storelib.com", "storelib.com") && isPlatformHost("WWW.storelib.com:443", "storelib.com") && !isPlatformHost("andrewrullz.storelib.com", "storelib.com"))
  check("link: the origin alone for the home page", storeLinkOf("https://andrewrullz.storelib.com", null, "storelib.com") === "https://andrewrullz.storelib.com")
  check("link: a path is joined", storeLinkOf("https://www.andrew.ro", "/products/mug", "storelib.com") === "https://www.andrew.ro/products/mug")
  check("link: a protocol relative or full URL as path is not followed", storeLinkOf("https://www.andrew.ro", "//evil.com", "storelib.com") === "https://www.andrew.ro" && storeLinkOf("https://www.andrew.ro", "https://evil.com", "storelib.com") === "https://www.andrew.ro")
  check("link: storelib.com (the creator page's host) is never a store link", storeLinkOf("https://storelib.com", "/andrewrullz", "storelib.com") === "")
  check("link: not http(s) is nothing", storeLinkOf("javascript:alert(1)", null, "storelib.com") === "" && storeLinkOf(null, null, "storelib.com") === "")

  /* The database half. */
  const sub = await orderStoreUrl({ creator_id: CREATOR, origin: { surface: "website", site: "andrewrullz.storelib.com" } }, { db: siteDb() })
  check("placed on andrewrullz.storelib.com, no domain: https://andrewrullz.storelib.com", sub === "https://andrewrullz.storelib.com", sub)
  const none = await orderStoreUrl({ creator_id: CREATOR, origin: null }, { db: siteDb() })
  check("an order that does not say where (storelib.com checkout): the creator's website all the same", none === "https://andrewrullz.storelib.com", none)
  const own = await orderStoreUrl({ creatorId: CREATOR }, { db: siteDb({ handle: "andrew-shop" }) })
  check("a website with a name of its own answers at that name, not the username", own === "https://andrew-shop.storelib.com", own)
  const c2 = storeHostCandidates({ placed: "andrewrullz.storelib.com", handle: "andrew-shop", hosts: ["andrewrullz.storelib.com", "andrew-shop.storelib.com"], mainDomain: "storelib.com" })
  check("candidates: the subdomain the order was placed on, then the website's own name, then the rest", JSON.stringify(c2) === JSON.stringify(["andrewrullz.storelib.com", "andrew-shop.storelib.com"]), c2)
  const primary = await orderStoreUrl(
    { creator_id: CREATOR, origin: { surface: "website", site: "andrewrullz.storelib.com" } },
    { db: siteDb({ domains: [{ domain: "andrew.ro", status: "active", purpose: "website", is_primary: true }] }) },
  )
  check("with an active primary website domain: the domain at the host it is served at (www for an apex)", primary === "https://www.andrew.ro", primary)
  const verifying = await orderStoreUrl({ creator_id: CREATOR, origin: { surface: "website", site: "andrewrullz.storelib.com" } }, { db: siteDb({ domains: [{ domain: "andrew.ro", status: "verifying", purpose: "website", is_primary: true }] }) })
  check("a domain still being verified is not used: the subdomain", verifying === "https://andrewrullz.storelib.com", verifying)
  const pageDomain = await orderStoreUrl({ creator_id: CREATOR }, { db: siteDb({ domains: [{ domain: "andrew.page", status: "active", purpose: "creator_page", is_primary: true }] }) })
  check("a creator page domain is not the website: the subdomain", pageDomain === "https://andrewrullz.storelib.com", pageDomain)
  const path = await orderStoreUrl({ creator_id: CREATOR }, { db: siteDb(), path: "/products/mug" })
  check("a path on the website", path === "https://andrewrullz.storelib.com/products/mug", path)
  const unpublished = await orderStoreUrl({ creator_id: CREATOR, origin: { surface: "website", site: "andrewrullz.storelib.com" } }, { db: siteDb({ published: false }) })
  check("no published website: empty (the link is left out), never the creator page", unpublished === "", unpublished)
  const banned = await orderStoreUrl({ creator_id: CREATOR }, { db: siteDb({ banned: true }) })
  check("a banned store: empty", banned === "", banned)
  const foreign = await orderStoreUrl({ creator_id: CREATOR, origin: { surface: "website", site: "someone-else.com" } }, { db: siteDb() })
  check("an origin naming a host that is not this creator's is not followed", foreign === "https://andrewrullz.storelib.com", foreign)
  check("no creator: empty", (await orderStoreUrl({}, { db: siteDb() })) === "")
  const broken = { from: () => { throw new Error("down") } }
  check("a database that throws: empty, no throw", (await orderStoreUrl({ creator_id: CREATOR }, { db: broken })) === "")
}

async function main() {
  await storeLink()
  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
