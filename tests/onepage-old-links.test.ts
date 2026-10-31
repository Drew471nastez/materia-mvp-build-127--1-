/**
 * ===========================================================================
 *  EVERY OLD ONEPAGE ADDRESS LEADS SOMEWHERE REAL, FOR EVERY CREATOR
 * ===========================================================================
 * Measured on production before this: dj-danut.storelib.com/links answered a
 * 308 to storelib.me/dj-danut, and that answered 404, while the creator page
 * storelib.com/dj-danut answered 200. andrewrullz and lucadragoste, whose
 * OnePages exist, worked. Pinned here:
 *
 *   THE RESOLVER    lib/onepage/resolve-address, with fixtures for each
 *                   case: slug equals username, slug differs, a hyphenated
 *                   username, any case, a renamed account, a renamed page, a
 *                   chain of renames, a loop, an account with no OnePage, a
 *                   draft, two rows, and a name nobody has.
 *   THE LOOKUP      lib/onepage/address-lookup, through a real supabase-js
 *                   client against a small PostgREST stand in, so the
 *                   filters it sends are the ones answered.
 *   THE PROXY       proxy.ts itself, handed dj-danut shaped data through
 *                   that same stand in: every old address, one hop, the
 *                   query kept, and working creators answered byte for byte
 *                   as before.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createClient } from "@supabase/supabase-js"
import { oldAddressRedirect, resolveOnePageAddress, type OnePageAddress, type OnePageAddressLookup } from "@/lib/onepage/resolve-address"
import { supabaseOnePageLookup } from "@/lib/onepage/address-lookup"
import { onePageRoute } from "@/lib/onepage/host-route"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`)
  }
}
const show = (x: unknown) => JSON.stringify(x)
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ─── The data, shaped like production ─────────────────────────────────── */

type Row = Record<string, any>
const DB: Record<string, Row[]> = {
  profiles: [
    /* An account from before onboarding made a OnePage: a creator page, no OnePage row. */
    { id: "u-danut", username: "dj-danut" },
    { id: "u-andrew", username: "andrewrullz" },
    { id: "u-luca", username: "lucadragoste" },
    /* A page saved under an address that is not the username. */
    { id: "u-mara", username: "mara" },
    /* A OnePage that was never published. */
    { id: "u-draft", username: "draftie" },
    /* Two published rows for one creator (maybeSingle over them was an error, read as none). */
    { id: "u-twice", username: "twice" },
    /* A page found only by the login that owns it. */
    { id: "u-owner", username: "owner-only" },
    /* Renamed to an account that has no OnePage. */
    { id: "u-plain", username: "plain-now" },
    /* Holds a name somebody else used to have. */
    { id: "u-holder", username: "taken-name" },
    { id: "u-chain", username: "chain-c" },
  ],
  creators: [
    { id: "c-danut", user_id: "u-danut" },
    { id: "c-andrew", user_id: "u-andrew" },
    { id: "c-luca", user_id: "u-luca" },
    { id: "c-mara", user_id: "u-mara" },
    { id: "c-draft", user_id: "u-draft" },
    { id: "c-twice", user_id: "u-twice" },
    { id: "c-plain", user_id: "u-plain" },
    { id: "c-holder", user_id: "u-holder" },
    { id: "c-chain", user_id: "u-chain" },
  ],
  onepages: [
    { id: "op-andrew", slug: "andrewrullz", status: "published", seller_id: "c-andrew", creator_id: "c-andrew", owner_id: "u-andrew" },
    { id: "op-luca", slug: "lucadragoste", status: "published", seller_id: "c-luca", creator_id: "c-luca", owner_id: "u-luca" },
    { id: "op-mara", slug: "mara-lind", status: "published", seller_id: "c-mara", creator_id: "c-mara", owner_id: "u-mara" },
    { id: "op-draft", slug: "draftie", status: "draft", seller_id: "c-draft", creator_id: "c-draft", owner_id: "u-draft" },
    { id: "op-twice-1", slug: "twice-one", status: "published", seller_id: "c-twice", creator_id: null, owner_id: "u-twice" },
    { id: "op-twice-2", slug: "twice-2", status: "published", seller_id: "c-twice", creator_id: null, owner_id: "u-twice" },
    { id: "op-owner", slug: "owners-page", status: "published", seller_id: null, creator_id: null, owner_id: "u-owner" },
    { id: "op-axb", slug: "axb", status: "published", seller_id: null, creator_id: null, owner_id: "u-nobody" },
    { id: "op-chain", slug: "chain-c", status: "published", seller_id: "c-chain", creator_id: "c-chain", owner_id: "u-chain" },
  ],
  username_history: [
    { old_username: "oldmara", new_username: "mara", changed_at: "2026-05-01T00:00:00Z" },
    { old_username: "plain-then", new_username: "plain-now", changed_at: "2026-05-01T00:00:00Z" },
    { old_username: "taken-name", new_username: "mara", changed_at: "2026-04-01T00:00:00Z" },
    { old_username: "chain-a", new_username: "chain-b", changed_at: "2026-03-01T00:00:00Z" },
    { old_username: "chain-b", new_username: "chain-c", changed_at: "2026-04-01T00:00:00Z" },
    { old_username: "loop-a", new_username: "loop-b", changed_at: "2026-03-01T00:00:00Z" },
    { old_username: "loop-b", new_username: "loop-a", changed_at: "2026-04-01T00:00:00Z" },
  ],
  onepage_slug_history: [{ onepage_id: "op-mara", old_slug: "mara-old", changed_at: "2026-06-01T00:00:00Z" }],
}

/* ─── The same data as an in-memory lookup, for the resolver on its own ── */

const same = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase()
function memoryLookup(db = DB): OnePageAddressLookup<Row> & { asked: string[] } {
  const asked: string[] = []
  const published = (r: Row) => r.status === "published"
  const newest = (rows: Row[]) => [...rows].sort((a, b) => String(b.changed_at).localeCompare(String(a.changed_at)))[0]
  return {
    asked,
    async pageBySlug(name) {
      asked.push(`slug:${name}`)
      return db.onepages.find((r) => published(r) && same(r.slug, name)) ?? null
    },
    async accountByUsername(name) {
      asked.push(`account:${name}`)
      const p = db.profiles.find((r) => same(r.username, name))
      return p ? { id: p.id, username: p.username } : null
    },
    async pageOfAccount(id) {
      asked.push(`owner:${id}`)
      const c = db.creators.find((r) => r.user_id === id)
      return (
        (c && db.onepages.find((r) => published(r) && (r.seller_id === c.id || r.creator_id === c.id))) ??
        db.onepages.find((r) => published(r) && r.owner_id === id) ??
        null
      )
    },
    async renamedUsername(name) {
      asked.push(`renamed:${name}`)
      return newest(db.username_history.filter((r) => same(r.old_username, name)))?.new_username ?? null
    },
    async renamedSlug(name) {
      asked.push(`reslugged:${name}`)
      const h = newest(db.onepage_slug_history.filter((r) => same(r.old_slug, name)))
      const page = h && db.onepages.find((r) => r.id === h.onepage_id && published(r))
      return page?.slug ?? null
    },
  }
}

const is = (a: OnePageAddress<Row>, kind: string, fields: Record<string, unknown> = {}) =>
  a.kind === kind && Object.entries(fields).every(([k, v]) => (k === "page" ? (a as any).page?.id === v : (a as any)[k] === v))

async function resolver() {
  console.log("\nThe resolver, case by case")
  const r = (name: string) => resolveOnePageAddress(name, memoryLookup())

  check("slug equals username: the page, by its address", is(await r("andrewrullz"), "page", { page: "op-andrew", via: "slug", name: "andrewrullz" }), show(await r("andrewrullz")))
  check("the other working creator too", is(await r("lucadragoste"), "page", { page: "op-luca", via: "slug" }))
  check("slug differs from the username: the page, by the account", is(await r("mara"), "page", { page: "op-mara", via: "username", name: "mara" }), show(await r("mara")))
  check("and still at its own address", is(await r("mara-lind"), "page", { page: "op-mara", via: "slug" }))
  check("any case finds it, and the name comes back lower case", is(await r("Mara-Lind"), "page", { page: "op-mara", name: "mara-lind" }) && is(await r("ANDREWRULLZ"), "page", { page: "op-andrew", name: "andrewrullz" }))
  check("a hyphenated username with no OnePage: its creator page", is(await r("dj-danut"), "creator", { username: "dj-danut" }), show(await r("dj-danut")))
  check("in any case", is(await r("DJ-Danut"), "creator", { username: "dj-danut" }))
  check("a draft is not served: its creator page", is(await r("draftie"), "creator", { username: "draftie" }))
  check("two published rows for one creator is still their page", is(await r("twice"), "page", { page: "op-twice-1" }))
  check("a page found only by the login that owns it", is(await r("owner-only"), "page", { page: "op-owner", via: "username" }))
  check("a renamed account: moved to the new name, permanently", is(await r("oldmara"), "moved", { name: "mara", via: "username" }), show(await r("oldmara")))
  check("a renamed page address: moved to the address it has now", is(await r("mara-old"), "moved", { name: "mara-lind", via: "slug" }), show(await r("mara-old")))
  check("renamed to an account with no OnePage: that creator page", is(await r("plain-then"), "creator", { username: "plain-now" }))
  check("a chain of renames is followed to the end", is(await r("chain-a"), "moved", { name: "chain-c" }), show(await r("chain-a")))
  check("a loop of renames ends as not found, not a redirect loop", is(await r("loop-a"), "missing"))
  check("the person who holds a name now wins over whoever held it before", is(await r("taken-name"), "creator", { username: "taken-name" }))
  check("a name nobody has, then or now, is not found", is(await r("nobody-here"), "missing"))
  check("_ is a letter, not a wildcard: a_b is not axb", is(await r("a_b"), "missing") && is(await r("axb"), "page", { page: "op-axb" }))

  const lookup = memoryLookup()
  const bad = await Promise.all(["", "../app", "a/b", "%2F%2Fevil.com", "-x", "x".repeat(65)].map((n) => resolveOnePageAddress(n, lookup)))
  check("a name that cannot be one is not found before anything is asked", bad.every((a) => a.kind === "missing") && lookup.asked.length === 0, show(lookup.asked))

  const cheap = memoryLookup()
  await resolveOnePageAddress("andrewrullz", cheap)
  check("a working creator costs one question, no history read", cheap.asked.length === 1, show(cheap.asked))

  const failing: OnePageAddressLookup<Row> = { ...memoryLookup(), pageBySlug: async () => { throw new Error("down") } }
  let threw = false
  try {
    await resolveOnePageAddress("andrewrullz", failing)
  } catch {
    threw = true
  }
  check("a failed read is not mistaken for nobody: it throws for the caller to keep what it had", threw)

  console.log("\nThe redirect an old address answers with")
  const already = { location: "https://storelib.me/x?utm_source=ig", status: 308 as const }
  const ctx = { search: "?utm_source=ig", mainDomain: "storelib.com" }
  check("a page keeps the redirect it had, exactly", oldAddressRedirect({ kind: "page", name: "x", page: {}, via: "slug" }, already, ctx) === already)
  check("a name nobody has keeps it too (the 404 is at storelib.me)", oldAddressRedirect({ kind: "missing" }, already, ctx) === already)
  check("moved: 308 to storelib.me/{new}, query kept", show(oldAddressRedirect({ kind: "moved", name: "mara", via: "username" }, already, ctx)) === show({ location: "https://storelib.me/mara?utm_source=ig", status: 308 }))
  check("no OnePage: 307 to storelib.com/{username}, query kept", show(oldAddressRedirect({ kind: "creator", username: "Dj-Danut" }, already, ctx)) === show({ location: "https://storelib.com/dj-danut?utm_source=ig", status: 307 }))
}

/* ─── A PostgREST stand in, so supabase-js and the proxy run for real ──── */

let requests: string[] = []
let failEverything = false

function matches(value: unknown, filter: string): boolean {
  const dot = filter.indexOf(".")
  const op = filter.slice(0, dot)
  const arg = filter.slice(dot + 1)
  if (op === "eq") return value !== null && value !== undefined && String(value) === arg
  if (op === "ilike") {
    /* PostgREST's ILIKE: % any run, _ any one, a backslash makes the next one literal. */
    let re = ""
    for (let i = 0; i < arg.length; i++) {
      const c = arg[i]
      if (c === "\\" && i + 1 < arg.length) re += arg[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      else if (c === "%" || c === "*") re += ".*"
      else if (c === "_") re += "."
      else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    }
    return typeof value === "string" && new RegExp(`^${re}$`, "i").test(value)
  }
  throw new Error(`the stand in does not know ${op}`)
}

function answer(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://x")
  requests.push(`${url.pathname}${url.search}`)
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" })
    res.end(JSON.stringify(body))
  }
  if (failEverything) return send(500, { code: "XX000", message: "the database is down" })
  const table = url.pathname.replace(/^\/rest\/v1\//, "")
  const rows = DB[table]
  if (!rows) return send(404, { code: "PGRST205", message: `Could not find the table 'public.${table}' in the schema cache` })
  let out = rows.slice()
  for (const [key, value] of url.searchParams) {
    if (key === "select" || key === "limit" || key === "order" || key === "offset") continue
    out = out.filter((r) => matches(r[key], value))
  }
  const order = url.searchParams.get("order")
  if (order) {
    const [col, dir] = order.split(".")
    out.sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (dir === "desc" ? -1 : 1))
  }
  const limit = url.searchParams.get("limit")
  if (limit) out = out.slice(0, Number(limit))
  const cols = (url.searchParams.get("select") || "*").split(",").map((c) => c.trim())
  if (!cols.includes("*")) out = out.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null])))
  send(200, out)
}

async function throughSupabase(base: string) {
  console.log("\nThe lookup, through supabase-js")
  const supabase = createClient(base, "service-role-for-tests", { auth: { persistSession: false } })
  const lookup = supabaseOnePageLookup<Row>(supabase, "id, slug")
  const r = (name: string) => resolveOnePageAddress(name, lookup)

  check("dj-danut: an account with no OnePage, so its creator page", is(await r("dj-danut"), "creator", { username: "dj-danut" }), show(await r("dj-danut")))
  check("andrewrullz: the page, by its address", is(await r("andrewrullz"), "page", { page: "op-andrew" }))
  check("mara: the page saved under another address, by the account", is(await r("mara"), "page", { page: "op-mara", via: "username" }))
  check("any case", is(await r("LucaDragoste"), "page", { page: "op-luca" }) && is(await r("Dj-Danut"), "creator", { username: "dj-danut" }))
  check("a renamed account and a renamed page are moved", is(await r("oldmara"), "moved", { name: "mara" }) && is(await r("mara-old"), "moved", { name: "mara-lind" }))
  check("an old page address in any case (the history holds it lower case)", is(await r("Mara-OLD"), "moved", { name: "mara-lind", via: "slug" }))
  check("two published rows are one page, not an error read as none", is(await r("twice"), "page"))
  check("a draft is not served", is(await r("draftie"), "creator", { username: "draftie" }))
  check("_ is sent literal: a_b is not axb", is(await r("a_b"), "missing"))
  check("only the columns asked for come back", Object.keys(((await r("andrewrullz")) as any).page).sort().join(",") === "id,slug")

  const saved = DB.onepage_slug_history
  delete (DB as any).onepage_slug_history
  check("a database without the slug history yet still resolves the rest", is(await r("nobody-here"), "missing") && is(await r("oldmara"), "moved", { name: "mara" }))
  DB.onepage_slug_history = saved

  failEverything = true
  let threw = false
  try {
    await r("andrewrullz")
  } catch {
    threw = true
  }
  failEverything = false
  check("a database that answers with an error throws, never reads as nobody", threw)
}

/* ─── proxy.ts itself ─────────────────────────────────────────────────── */

async function throughProxy(base: string) {
  console.log("\nproxy.ts, with dj-danut shaped data")
  process.env.NEXT_PUBLIC_SUPABASE_URL = base
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-for-tests"
  const { proxy } = await import("@/proxy")
  const visit = async (url: string, userAgent = "Mozilla/5.0 (iPhone)") => {
    const request = new Request(url, { headers: { host: new URL(url).host, "user-agent": userAgent } }) as any
    request.nextUrl = new URL(url)
    const res: Response = await proxy(request)
    return { status: res.status, location: res.headers.get("location"), cache: res.headers.get("cache-control"), answer: res.headers.get("x-onepage-address") }
  }
  const expect = async (url: string, status: number, location: string, label: string, userAgent?: string) => {
    const got = await visit(url, userAgent)
    check(label, got.status === status && got.location === location, `${url} -> ${show(got)}`)
    return got
  }

  const danut = await expect("https://dj-danut.storelib.com/links", 307, "https://storelib.com/dj-danut", "dj-danut.storelib.com/links goes to the creator page, in one hop")
  check("temporary and never held, so it moves to the OnePage the day there is one", danut.cache === "no-store", show(danut))
  check("and says what the lookup answered", danut.answer === "creator", show(danut))
  /*
    Changed on purpose (round 45 leftovers): the trailing slash is the proxy's first answer now
    (lib/seo/one-hop.ts, next.config skipTrailingSlashRedirect), a 308 on the same host with the
    query kept, where Next used to answer it before the proxy ran. Live it was two hops before and is
    two hops now; the second is the same 307.
  */
  await expect("https://dj-danut.storelib.com/links/?utm_source=instagram&ref=bio", 308, "https://dj-danut.storelib.com/links?utm_source=instagram&ref=bio", "a trailing slash goes first, with the query kept")
  await expect("https://dj-danut.storelib.com/links?utm_source=instagram&ref=bio", 307, "https://storelib.com/dj-danut?utm_source=instagram&ref=bio", "with the query kept")
  await expect("https://storelib.com/dj-danut/links", 307, "https://storelib.com/dj-danut", "storelib.com/dj-danut/links too")
  await expect("https://storelib.com/l/dj-danut", 307, "https://storelib.com/dj-danut", "storelib.com/l/dj-danut too")
  await expect("https://storelib.com/dj-danut.links", 307, "https://storelib.com/dj-danut", "storelib.com/dj-danut.links too")
  await expect("https://storelib.com/l/DJ-Danut?utm_campaign=x", 307, "https://storelib.com/dj-danut?utm_campaign=x", "in any case")
  await expect("https://storelib.me/l/dj-danut", 307, "https://storelib.com/dj-danut", "storelib.me/l/dj-danut too")
  await expect("https://storelib.me/dj-danut/links", 307, "https://storelib.com/dj-danut", "storelib.me/dj-danut/links too")

  requests = []
  const andrew = await expect("https://andrewrullz.storelib.com/links", 308, "https://storelib.me/andrewrullz", "andrewrullz.storelib.com/links is exactly what it was")
  check("held for an hour at the edge, as before", andrew.cache === "public, max-age=3600", show(andrew))
  check("and cost one read", requests.length === 1, show(requests))
  check("and says it found the page", andrew.answer === "page", show(andrew))
  await expect("https://lucadragoste.storelib.com/links?utm_source=tt", 308, "https://storelib.me/lucadragoste?utm_source=tt", "lucadragoste.storelib.com/links is exactly what it was")
  await expect("https://storelib.com/mara/links", 308, "https://storelib.me/mara", "a page under another address still answers at the username")
  await expect("https://oldmara.storelib.com/links?ref=x", 308, "https://storelib.me/mara?ref=x", "an old username goes to the new one, one hop")
  await expect("https://storelib.com/l/mara-old", 308, "https://storelib.me/mara-lind", "an old page address goes to the one it has now")
  await expect("https://nobody-here.storelib.com/links", 308, "https://storelib.me/nobody-here", "a name nobody has keeps the redirect it had (the 404 is there)")

  requests = []
  await expect("https://dj-danut.storelib.com/links", 308, "https://storelib.com/dj-danut/links", "the native app keeps its own origin, as before", "Mozilla/5.0 Capacitor StorelibApp")
  check("and asks nothing", requests.length === 0, show(requests))

  failEverything = true
  const down = await expect("https://dj-danut.storelib.com/links", 308, "https://storelib.me/dj-danut", "a database that fails leaves the redirect as it was")
  check("and says the lookup failed", down.answer === "failed", show(down))
  failEverything = false

  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9"
  await expect("https://andrewrullz.storelib.com/links", 308, "https://storelib.me/andrewrullz", "so does one that cannot be reached")
  process.env.NEXT_PUBLIC_SUPABASE_URL = base
}

/* ─── The page address history, in the database ───────────────────────── */

function history() {
  console.log("\nThe database keeps a page's old addresses (SQL part 58)")
  const part = code("supabase/sql/run-now/58_onepage_old_addresses.sql")
  const lines = part.trimEnd().split("\n")
  check("a /* */ header saying what it does, then one statement per line", /^\/\*[^\n]*\*\/$/.test(lines[0]) && lines.slice(1).every((l) => /;$/.test(l.trim())) && !/^--/m.test(part))
  check("safe to run twice", /CREATE TABLE IF NOT EXISTS public\.onepage_slug_history/.test(part) && /CREATE INDEX IF NOT EXISTS/.test(part) && /CREATE OR REPLACE FUNCTION public\.onepages_keep_old_slug\(\)/.test(part) && /DROP TRIGGER IF EXISTS onepages_keep_old_slug ON public\.onepages; CREATE TRIGGER onepages_keep_old_slug AFTER UPDATE OF slug ON public\.onepages/.test(part))
  check("nothing where there is no onepages table", (part.match(/IF to_regclass\('public\.onepages'\) IS NULL/g) ?? []).length === 2)
  check("it keeps the old address in lower case, and only a real change (not a change of case)", /lower\(OLD\.slug\) IS DISTINCT FROM lower\(NEW\.slug\)/.test(part) && /VALUES \(OLD\.id, lower\(btrim\(OLD\.slug\)\)/.test(part))
  check("it never stops a save", /EXCEPTION WHEN OTHERS THEN RAISE WARNING 'onepages_keep_old_slug skipped/.test(part))
  check("server only: row level security on, no policy, nothing for anon or a signed in user", /ENABLE ROW LEVEL SECURITY/.test(part) && !/CREATE POLICY/.test(part) && /REVOKE ALL ON public\.onepage_slug_history FROM anon, authenticated/.test(part) && /REVOKE ALL ON FUNCTION public\.onepages_keep_old_slug\(\) FROM PUBLIC, anon, authenticated/.test(part))
  check("the check after names it", /as p58_onepage_old_addresses[,;]/.test(code("supabase/sql/run-now/99_check_after.sql")))
  check("the README lists it", /\| `58_onepage_old_addresses\.sql` \|/.test(code("supabase/sql/run-now/README.md")))
  check("and the bundles carry it", /-- part 58_onepage_old_addresses\.sql/.test(code("supabase/sql/run-four/3_of_4_latest.sql")) && /-- part 58_onepage_old_addresses\.sql/.test(code("supabase/sql/all-in-three/2_of_3_latest.sql")))
  const lookup = code("lib/onepage/address-lookup.ts")
  check("the lookup reads it by the lower cased name, which the index answers", /\.from\("onepage_slug_history"\)[\s\S]{0,300}\.eq\("old_slug", name\.toLowerCase\(\)\)/.test(lookup))
}

/* ─── The wiring ──────────────────────────────────────────────────────── */

function wiring() {
  console.log("\nOne resolver, three callers")
  const proxy = code("proxy.ts")
  check("the proxy resolves an old address before answering it", /onePage\.onePage \? await oldOnePageTarget\(onePage\.onePage, onePage, search\) : null/.test(proxy))
  check("with the same resolver and lookup as the page", /resolveOnePageAddress\(name, supabaseOnePageLookup\(supabase, "id, slug"\)\)/.test(proxy))
  /* Changed on purpose (round 42): the client also takes the proxy's fetch with its deadline (PROXY_DB), spread before its own auth. Still no session, nothing persisted. */
  check("with no session: its own client, persisting nothing", /createClient\(supabaseUrl, supabaseKey, \{ (?:\.\.\.PROXY_DB, )?auth: \{ persistSession: false/.test(proxy))
  check("and a slow database cannot hold the redirect", /ONEPAGE_LOOKUP_MS/.test(proxy) && /Promise\.race/.test(proxy))
  const found = code("lib/onepage/published-page.ts")
  check("the page reads the same resolver, once per request", /export const resolveOnePage = cache\(/.test(found) && /resolveOnePageAddress<any>\(slug, supabaseOnePageLookup/.test(found))
  check("and findPublishedOnePage (metadata, share image) is its page", /address\.kind === "page" \? address\.page : null/.test(found))
  const page = code("app/(marketing)/l/[slug]/page.tsx")
  check("the page sends a renamed name on, permanently", /if \(address\.kind === "moved"\)[\s\S]{0,700}permanentRedirect\(/.test(page))
  check("and an account with no OnePage to its creator page, temporarily", /if \(address\.kind === "creator"\)[\s\S]{0,500}redirect\(`\$\{creatorPageUrl\(address\.username, getMainDomain\(\)\)\}\$\{query\}`\)/.test(page))
  check("with the query", /queryOf\(await searchParams\)/.test(page) && /PublicOnePageRoute\(\{ params: asSlug\(params\), searchParams \}\)/.test(code("app/(marketing)/[sellername]/links/page.tsx")))
  check("the old username_history read in the page is gone, not doubled", !/from\("username_history"\)/.test(page))

  console.log("\nThe old addresses are the ones that carry the name")
  const route = (host: string, path: string, userAgent = "Mozilla/5.0") =>
    onePageRoute({ host, pathname: path, search: "", userAgent, mainDomain: "storelib.com", platformSubdomains: ["www", "app"] })
  const carries = (host: string, path: string) => (route(host, path) as any)?.onePage
  check("{name}.storelib.com/links", carries("dj-danut.storelib.com", "/links") === "dj-danut")
  check("storelib.com/{name}/links, /{name}.links and /l/{name}", carries("storelib.com", "/dj-danut/links") === "dj-danut" && carries("storelib.com", "/dj-danut.links") === "dj-danut" && carries("storelib.com", "/l/dj-danut") === "dj-danut")
  check("storelib.me/l/{name}, /{name}/links and /{name}.links", carries("storelib.me", "/l/dj-danut") === "dj-danut" && carries("storelib.me", "/dj-danut/links") === "dj-danut" && carries("storelib.me", "/dj-danut.links") === "dj-danut")
  check("storelib.me/{name} is the page itself and is not looked up twice", route("storelib.me", "/dj-danut")?.kind === "rewrite")
  check("tidying /Name to /name asks nothing", (route("storelib.me", "/DJ-Danut") as any)?.onePage === undefined)
  check("nor does the native app's redirect to its own origin", (route("storelib.com", "/l/dj-danut", "Capacitor") as any)?.onePage === undefined)
}

async function main() {
  await resolver()
  const server = createServer(answer)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    await throughSupabase(base)
    await throughProxy(base)
  } finally {
    server.close()
  }
  wiring()
  history()

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log("\nFailures:\n" + failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
