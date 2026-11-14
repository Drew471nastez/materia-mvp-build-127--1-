/**
 * Round AX (track AX-3): a store's addresses are names, and only the server moves them.
 *
 * profiles.username (storelib.com/<name>), creators.slug (<name>.storelib.com)
 * and onepages.slug (storelib.me/<name>) used to be written from the browser by
 * /app Settings and the seller onboarding, past every rule on a name (format,
 * reserved words, phishing names, a given up name, a website's address). Now
 * both go through PATCH /api/profile/username { store: true }
 * (lib/profile/move-handle.ts), and part 462 makes the database refuse a
 * browser key write that changes either column.
 */
import { readFileSync } from "node:fs"
import { claimStoreHandle, moveStoreHandle } from "@/lib/profile/move-handle"
import { isValidUsername } from "@/lib/reserved-words"
import { stripComments } from "./_source"

let failed = 0
let passed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))

/* ── A small in-memory PostgREST: eq / ilike / is / limit / maybeSingle, update, insert, rpc. ── */
type Row = Record<string, any>
type Filter = (r: Row) => boolean
function makeDb(tables: Record<string, Row[]>, opts: { unique?: Record<string, string>; failUpdate?: Record<string, string>; websites?: string[] } = {}) {
  const writes: { table: string; op: string; values: Row }[] = []
  const like = (pattern: string, v: unknown) => typeof v === "string" && v.toLowerCase() === String(pattern).toLowerCase()
  function query(table: string) {
    const filters: Filter[] = []
    let op: "select" | "update" | "insert" = "select"
    let values: Row = {}
    let lim = Infinity
    let single = false
    const rows = () => (tables[table] ??= [])
    const run = () => {
      if (op === "insert") {
        writes.push({ table, op, values })
        rows().push({ ...values })
        return { data: null, error: null }
      }
      const hit = rows().filter((r) => filters.every((f) => f(r)))
      if (op === "update") {
        if (opts.failUpdate?.[table] && Object.prototype.hasOwnProperty.call(values, opts.failUpdate[table])) return { data: null, error: { code: "XX000", message: "refused" } }
        const key = opts.unique?.[table]
        if (key && key in values && rows().some((r) => !hit.includes(r) && String(r[key] ?? "").toLowerCase() === String(values[key] ?? "").toLowerCase() && values[key])) {
          return { data: null, error: { code: "23505", message: "duplicate" } }
        }
        for (const r of hit) Object.assign(r, values)
        writes.push({ table, op, values })
        return { data: hit, error: null }
      }
      const out = hit.slice(0, lim)
      return single ? { data: out[0] ?? null, error: null } : { data: out, error: null }
    }
    const q: any = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
      ilike: (c: string, v: string) => (filters.push((r) => like(v, r[c])), q),
      limit: (n: number) => ((lim = n), q),
      maybeSingle: () => ((single = true), q),
      update: (v: Row) => ((op = "update"), (values = v), q),
      insert: (v: Row) => ((op = "insert"), (values = v), q),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    }
    return q
  }
  return {
    tables,
    writes,
    from: (t: string) => query(t),
    rpc: async (fn: string, args: { p_handle: string }) => (fn === "website_handle_taken" ? { data: (opts.websites ?? []).includes(args.p_handle), error: null } : { data: null, error: null }),
  }
}

const ME = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const GONE = "33333333-3333-4333-8333-333333333333"

function store() {
  return makeDb(
    {
      profiles: [
        { id: ME, username: "mara" },
        { id: OTHER, username: "taken-name" },
      ],
      creators: [
        { id: "c-me", user_id: ME, slug: "mara" },
        { id: "c-other", user_id: OTHER, slug: "other-shop" },
      ],
      onepages: [{ id: "p-me", owner_id: ME, slug: "mara" }],
      username_history: [{ user_id: GONE, old_username: "given-up" }],
    },
    { unique: { profiles: "username" }, websites: ["a-website"] },
  )
}

async function main() {
  console.log("\nThe server move runs every rule on a name")
  {
    for (const bad of ["paypal-login", "apple-support", "admin", "ab", "Bad Name!", "x".repeat(31)]) {
      const db = store()
      const r = await moveStoreHandle(db, ME, bad)
      check(`refused: ${JSON.stringify(bad.length > 20 ? bad.slice(0, 8) + "..." : bad)}`, !r.ok && r.status === 400 && db.writes.length === 0, r)
    }
    check("the phishing names are what the rule says they are (sanity)", !isValidUsername("paypal-login").valid && !isValidUsername("apple-support").valid)
    for (const [name, why] of [
      ["taken-name", "another account's username"],
      ["TAKEN-NAME", "another account's username, in another case"],
      ["other-shop", "another store's address"],
      ["given-up", "a name somebody gave up (username_history)"],
      ["a-website", "a website's own address (website_handle_taken)"],
    ] as const) {
      const db = store()
      const r = await moveStoreHandle(db, ME, name)
      check(`taken: ${why}`, !r.ok && r.status === 409 && db.writes.length === 0, r)
    }
  }

  console.log("\nA rename moves the three addresses together and keeps the old one findable")
  {
    const db = store()
    const r = await moveStoreHandle(db, ME, "Mara-Studio")
    check("answers the new handle and the old one", r.ok && r.username === "mara-studio" && r.previous === "mara" && r.onepageMoved === true, r)
    check("the username moved", db.tables.profiles[0].username === "mara-studio")
    check("the store address moved", db.tables.creators[0].slug === "mara-studio")
    check("the OnePage moved", db.tables.onepages[0].slug === "mara-studio")
    check("username_history has the old name", db.tables.username_history.some((h) => h.user_id === ME && h.old_username === "mara" && h.new_username === "mara-studio"))
    check("nobody else's rows were touched", db.tables.creators[1].slug === "other-shop" && db.tables.profiles[1].username === "taken-name")
  }

  console.log("\nAn unchanged handle is never checked again and writes nothing new")
  {
    const db = store()
    const r = await moveStoreHandle(db, ME, "mara")
    check("same handle: ok, nothing moved, no history", r.ok && r.previous === null && db.writes.length === 0, { r, w: db.writes })
    const legacy = makeDb({ profiles: [{ id: ME, username: "support" }], creators: [{ id: "c", user_id: ME, slug: "support" }], onepages: [] })
    const kept = await moveStoreHandle(legacy, ME, "support")
    check("a name kept from before the rules (now reserved) still saves", kept.ok && legacy.writes.length === 0, kept)
    const drift = makeDb({ profiles: [{ id: ME, username: "mara" }], creators: [{ id: "c", user_id: ME, slug: "old-slug" }], onepages: [] })
    const fixed = await moveStoreHandle(drift, ME, "mara")
    check("a store address that drifted is brought back to the username, as Settings always did", fixed.ok && drift.tables.creators[0].slug === "mara" && !drift.writes.some((w) => w.table === "username_history"))
  }

  console.log("\nA store that cannot follow puts the username back")
  {
    const db = makeDb(
      { profiles: [{ id: ME, username: "mara" }], creators: [{ id: "c", user_id: ME, slug: "mara" }], onepages: [] },
      { failUpdate: { creators: "slug" } },
    )
    const r = await moveStoreHandle(db, ME, "mara-two")
    check("refused with a retry message", !r.ok && r.status === 500, r)
    check("the username is back to the old one", db.tables.profiles[0].username === "mara")
    check("no history row for a rename that did not happen", !(db.tables.username_history ?? []).length)
  }

  console.log("\nThe seller onboarding never stops on a name, and never gets one the rules refuse")
  {
    const db = store()
    const r = await claimStoreHandle(db, ME, "paypal-login")
    check("a refused name: the account keeps its own handle", r.ok && r.username === "mara" && db.tables.creators[0].slug === "mara", r)
    const fresh = makeDb({ profiles: [{ id: ME, username: null }, { id: OTHER, username: "jo-smith" }], creators: [], onepages: [] }, { unique: { profiles: "username" } })
    const got = await claimStoreHandle(fresh, ME, "jo-smith")
    check("a taken name with no handle yet: a free one made from it", got.ok && /^jo-smith-\d+$/.test(got.username ?? "") && fresh.tables.profiles[0].username === got.username, got)
    const phish = makeDb({ profiles: [{ id: ME, username: null }], creators: [], onepages: [] })
    const safe = await claimStoreHandle(phish, ME, "paypal-login")
    check("a phishing name with no handle yet: a neutral one, not a near copy", safe.ok && !/paypal|login/.test(safe.username ?? "") && isValidUsername(safe.username ?? "").valid, safe)
    const free = makeDb({ profiles: [{ id: ME, username: null }], creators: [], onepages: [] })
    const ok = await claimStoreHandle(free, ME, "mara-studio")
    check("a free name is the one on screen", ok.ok && ok.username === "mara-studio" && free.tables.profiles[0].username === "mara-studio", ok)
  }

  console.log("\nEvery browser write of the two columns is gone")
  {
    const settings = code("components/app/settings-form-new.tsx")
    const submit = settings.slice(settings.indexOf("const handleSubmit = async"), settings.indexOf("const handleSubmit = async") + 9000)
    check("Settings: the rename goes through the server with store: true", /fetchWithDeadline\("\/api\/profile\/username"/.test(submit) && /store: true/.test(submit))
    check("Settings: no browser write of profiles.username", !/\.from\("profiles"\)[\s\S]{0,40}\.update\(\{[^}]*\busername\b/.test(settings))
    check("Settings: no browser write of creators.slug", !/\.from\("creators"\)\.update\(\{[^}]*\bslug\b/.test(settings))
    check("Settings: no browser write of username_history or onepages.slug", !/from\("username_history"\)\.insert/.test(settings) && !/from\("onepages"\)[\s\S]{0,40}\.update\(\{ slug/.test(settings))
    check("Settings: only asked when the handle or the store address would change", /cleanUsername !== savedAddress\.current\.username \|\| cleanUsername !== savedAddress\.current\.slug/.test(submit))
    check("Settings: the CDN purge still gets the old handle, from the server's answer", /previousHandle = moved\.previous/.test(submit) && /previousHandle \? \{ previousHandle \}/.test(submit))

    const modal = code("components/app/creator-onboarding-modal.tsx")
    check("onboarding: the handle is claimed on the server", /body: JSON\.stringify\(\{ username: wanted, store: true, claim: true \}\)/.test(modal))
    check("onboarding: no browser write of profiles.username", !/\.from\("profiles"\)\s*\.update\(\{[^}]*\busername\b/.test(modal))
    check("onboarding: no browser update of creators.slug", !/\.from\("creators"\)\s*\.update\(\{[^}]*\bslug\b/.test(modal))
    check("onboarding: a new store row carries the claimed handle", (modal.match(/_slug = \(await claimStoreHandle\(wanted\)\) \|\| wanted/g) ?? []).length === 2)
    check("onboarding: the live check asks the server's rule, not only OnePages", /\/api\/profile\/username\?handle=/.test(modal.slice(modal.indexOf("const checkAvailability = async"), modal.indexOf("const checkAvailability = async") + 800)) && !/from\("onepages"\)\s*\.select\("id"\)\s*\.eq\("slug", slug\)/.test(modal))

    const route = code("app/api/profile/username/route.ts")
    check("the route: store moves run on the server key, for the session's own account", /body\?\.store === true/.test(route) && /moveStoreHandle\(db, user\.id, body\.username\)/.test(route) && /claimStoreHandle\(db, user\.id, body\.username\)/.test(route))
    check("the route: rate limited before the store move", route.indexOf("rateLimit(") > 0 && route.indexOf("rateLimit(") < route.indexOf("body?.store === true"))
    const fin = code("app/api/onboarding/finalize/route.ts")
    check("finalize: a new store's address is claimed through the rules, not the request's creatorSlug", /claimStoreHandle\(admin, userId/.test(fin) && /claimed\.ok \? claimed\.username/.test(fin))
  }

  console.log("\nPart 462 is in the database files")
  {
    const sql = read("supabase/sql/run-now/462_store_addresses_server_only.sql")
    check("one file, copied to migrations", sql === read("supabase/migrations/20271462_store_addresses_server_only.sql"))
    check("browser keys only, as parts 453 and 460 detect them", (sql.match(/current_user NOT IN \('authenticated', 'anon'\)/g) ?? []).length === 2)
    check("an unchanged value passes, in any case", /lower\(coalesce\(NEW\.username, ''\)\) = lower\(coalesce\(OLD\.username, ''\)\)/.test(sql) && /lower\(coalesce\(NEW\.slug, ''\)\) = lower\(coalesce\(OLD\.slug, ''\)\)/.test(sql))
    check("a store address may only be the account's own username", /storelib_own_username\(CASE WHEN TG_OP = 'UPDATE' THEN OLD\.user_id ELSE NEW\.user_id END\)/.test(sql))
    check("refused with a clear message and 42501", /RAISE EXCEPTION 'Change your username in Settings' USING ERRCODE = '42501'/.test(sql))
    check("triggers on the two columns only", /BEFORE INSERT OR UPDATE OF username ON public\.profiles/.test(sql) && /BEFORE INSERT OR UPDATE OF slug ON public\.creators/.test(sql))
    check("non destructive", !/\b(DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE|UPDATE public\.)/i.test(sql))
    check("check after and README list it", /p462_store_addresses_server_only/.test(read("supabase/sql/run-now/99_check_after.sql")) && /`462_store_addresses_server_only\.sql`/.test(read("supabase/sql/run-now/README.md")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
