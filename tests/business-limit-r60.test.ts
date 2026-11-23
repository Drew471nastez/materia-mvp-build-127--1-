/**
 * ROUND 60: A LOGIN'S BUSINESS LIMIT, SET PER ACCOUNT BY STORELIB
 *
 * Three businesses a login is the rule (lib/businesses/rules MAX_BUSINESSES).
 * Storelib can give one login more, or no limit, with a row in
 * public.business_limits (SQL part 446): business_limit NULL or no row is the
 * rule, -1 no limit, 1 to 10000 that many. This suite holds:
 *
 *   rules    businessLimitOf and canAddBusiness read the number the way the
 *            database's business_limit_of does; the sentence says the number.
 *   route    the real app/api/businesses route handler (GET and POST) with
 *            Supabase's admin client, the session check and the rate limiter
 *            swapped for stand-ins (scripts/push-test-stubs.mjs): a login
 *            with no row stops at three, a login with -1 makes a fourth and
 *            a fifth and is never told it has three, a login at 4 stops at
 *            four, and a read that fails is the rule, never more.
 *   handoff  a claim link: a recipient with -1 and three businesses is not
 *            "limit"; without the row it is.
 *   the SQL  part 446: a server only table (row level security on, no
 *            policy, nothing granted to anon or authenticated), the trigger
 *            and the handoff counting to business_limit_of, no address in
 *            it, and nothing in the app that writes the table.
 *
 * What a normal user can do against the real database is proven on
 * Postgres 16 by scripts/check-business-limit-sql.sh (33 checks).
 */
import { register } from "node:module"
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { fakeDb } from "./_fake-db"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`)
  }
}
const root = process.cwd()
const read = (f: string) => readFileSync(join(root, f), "utf8")

/* ── Stand-ins: the admin client is the in-memory PostgREST, who is signed in is a global, nothing is rate limited ── */
const dir = mkdtempSync(join(tmpdir(), "business-limit-r60-"))
const stub = (name: string, source: string) => {
  const file = join(dir, `${name}.mjs`)
  writeFileSync(file, source)
  return pathToFileURL(file).href
}
register(pathToFileURL(join(root, "scripts/push-test-stubs.mjs")).href, {
  parentURL: import.meta.url,
  data: {
    stubs: {
      "@/lib/supabase/admin": stub("admin", "export const createAdminClient = () => globalThis.__admin\n"),
      "@/lib/auth/route-user": stub(
        "route-user",
        `export const routeUser = async () => (globalThis.__who ? { kind: "user", user: globalThis.__who } : { kind: "signed_out" })
export const authUnavailableResponse = () => new Response(JSON.stringify({ error: "Try again" }), { status: 503 })
`,
      ),
      "@/lib/api/rate-limit": stub("rate-limit", "export const rateLimit = async () => null\nexport const addressSubject = () => null\n"),
    },
  },
})

type Row = Record<string, unknown>
const g = globalThis as unknown as { __admin: unknown; __who: { id: string; email: string } | null }
const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`
const OWNER = id(1)
let made = 100

function world(opts: { limits?: Row[]; members?: number; failLimits?: boolean; owner?: string } = {}) {
  const owner = opts.owner ?? OWNER
  const links: Row[] = []
  for (let i = 0; i < (opts.members ?? 0); i++) links.push({ owner_id: owner, member_id: id(owner === OWNER ? 10 + i : 50 + i), created_at: `2026-01-0${i + 1}T00:00:00Z` })
  const db = fakeDb(
    { business_links: links, business_limits: opts.limits ?? [], profiles: [], creators: [] },
    opts.failLimits ? { failWith: { business_limits: { code: "42P01", message: 'relation "public.business_limits" does not exist' } } } : {},
  )
  const created: string[] = []
  const admin = {
    from: db.from,
    rpc: db.rpc,
    auth: {
      admin: {
        createUser: async ({ email }: { email: string }) => {
          const uid = id(made++)
          created.push(uid)
          return { data: { user: { id: uid, email } }, error: null }
        },
        deleteUser: async () => ({ data: null, error: null }),
        getUserById: async (uid: string) => ({ data: { user: { id: uid, email: `${uid}@example.com` } }, error: null }),
        /* No session is minted here: the route answers 202 with the new business's id, after it was made and linked. */
        generateLink: async () => ({ data: null, error: { message: "not in this suite" } }),
      },
    },
  }
  g.__admin = admin
  g.__who = { id: owner, email: "owner@example.com" }
  return { db, created }
}

async function main() {
  const rules = await import("@/lib/businesses/rules")
  const { businessLimitOf, canAddBusiness, limitReached, LIMIT_REACHED, MAX_BUSINESSES, linkRefusal } = rules

  console.log("\nThe rule and the exception, one reading")
  check("no row, NULL or anything odd is the rule (three)", [undefined, null, "5", 0, -2, 2.5, 10001, NaN].every((v) => businessLimitOf(v) === MAX_BUSINESSES) && MAX_BUSINESSES === 3)
  check("-1 is no limit", businessLimitOf(-1) === null)
  check("1 to 10000 is that many", businessLimitOf(1) === 1 && businessLimitOf(7) === 7 && businessLimitOf(10000) === 10000)
  check("at the rule: one and two may add, three may not", canAddBusiness(1) && canAddBusiness(2) && !canAddBusiness(3))
  check("with no limit: three, ten and a thousand may add", canAddBusiness(3, null) && canAddBusiness(10, null) && canAddBusiness(1000, null))
  check("with 5: four may add, five may not", canAddBusiness(4, 5) && !canAddBusiness(5, 5))
  check("the rule's sentence is unchanged", limitReached() === LIMIT_REACHED && LIMIT_REACHED === "You already have three businesses, the most one login can have.")
  check("a login's own number is said as its own", limitReached(5) === "You already have five businesses, the most this login can have." && limitReached(12) === "You already have 12 businesses, the most this login can have.")
  check("the database's refusal at a login's own number says that number", linkRefusal({ code: "23514", message: "One login can have at most 5 businesses" }, 5) === limitReached(5))
  check("no em dash and none of the banned words in the new sentences", ![limitReached(5), limitReached(1)].some((s) => /—|unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(s)))

  const route = await import("@/app/api/businesses/route")
  const get = async () => {
    const res = await route.GET(new Request("https://storelib.com/api/businesses"))
    return { status: res.status, body: (await res.json()) as { businesses: { userId: string; limit: number | null }[]; canAdd: boolean; limit: number | null } }
  }
  const post = async () => {
    const res = await route.POST(new Request("https://storelib.com/api/businesses", { method: "POST" }))
    return { status: res.status, body: (await res.json()) as { error?: string; userId?: string } }
  }

  console.log("\nThe route, a login with no row: three and no more")
  {
    const { db, created } = world({ members: 1 })
    const a = await get()
    check("GET with two: canAdd, limit 3 on the answer and on every row", a.status === 200 && a.body.canAdd === true && a.body.limit === 3 && a.body.businesses.length === 2 && a.body.businesses.every((b) => b.limit === 3), a.body)
    const made1 = await post()
    check("POST: the third is made and linked to the login's first", made1.status === 202 && made1.body.userId === created[0] && db.tables.business_links.some((r) => r.owner_id === OWNER && r.member_id === created[0]), made1)
    const b = await get()
    check("GET with three: canAdd false, limit 3", b.body.canAdd === false && b.body.limit === 3 && b.body.businesses.length === 3, b.body)
    const refused = await post()
    check("POST a fourth: 409 with the rule's sentence, no account made, nothing linked", refused.status === 409 && refused.body.error === LIMIT_REACHED && created.length === 1 && db.tables.business_links.length === 2, refused)
    check("  the limit was read from business_limits by the login's first account", db.log.some((l) => l.table === "business_limits" && l.op === "select" && l.filters.some((f) => f[0] === "eq" && f[1] === "user_id" && f[2] === OWNER)))
  }

  console.log("\nThe route, a login Storelib gave no limit (-1)")
  {
    const { db, created } = world({ members: 2, limits: [{ user_id: OWNER, business_limit: -1 }] })
    const a = await get()
    check("GET with three: canAdd, limit null (no limit), on every row", a.body.canAdd === true && a.body.limit === null && a.body.businesses.every((b) => b.limit === null), a.body)
    const four = await post()
    const five = await post()
    const six = await post()
    check("POST three times: the fourth, fifth and sixth are made and linked", [four, five, six].every((r) => r.status === 202) && created.length === 3 && db.tables.business_links.filter((r) => r.owner_id === OWNER).length === 5, [four.status, five.status, six.status])
    const b = await get()
    check("GET with six: still canAdd, never told three", b.body.canAdd === true && b.body.limit === null && b.body.businesses.length === 6, { n: b.body.businesses.length, canAdd: b.body.canAdd })
    /* From the second business: the limit is still the login's first account's. */
    g.__who = { id: id(10), email: "x@example.com" }
    const fromMember = await post()
    check("from a business that is not the first, the login's -1 still holds, and the new one is linked to the first", fromMember.status === 202 && db.tables.business_links.some((r) => r.owner_id === OWNER && r.member_id === fromMember.body.userId), fromMember)
  }

  console.log("\nThe route, a login at 4, and a read that fails")
  {
    const { created } = world({ members: 2, limits: [{ user_id: OWNER, business_limit: 4 }] })
    check("with 4: the fourth is made", (await post()).status === 202 && created.length === 1)
    const refused = await post()
    check("  the fifth is refused with four in the sentence", refused.status === 409 && refused.body.error === limitReached(4) && created.length === 1, refused)
  }
  {
    const { created } = world({ members: 2, limits: [{ user_id: OWNER, business_limit: -1 }], failLimits: true })
    const a = await get()
    const refused = await post()
    check("business_limits not there (part 446 not run) or failing: the rule, never more", a.body.limit === 3 && a.body.canAdd === false && refused.status === 409 && created.length === 0, { limit: a.body.limit, status: refused.status })
  }
  {
    /* Another login's -1 is not this one's. */
    const { created } = world({ members: 2, limits: [{ user_id: id(99), business_limit: -1 }] })
    check("a row for another login changes nothing here", (await post()).status === 409 && created.length === 0)
  }

  console.log("\nA claim link (lib/handoff/rules claimStateOf)")
  {
    const { claimStateOf } = await import("@/lib/handoff/rules")
    const handoff = { id: id(500), business_user_id: id(501), creator_id: null, from_owner_id: id(502), recipient_email: null, keep_founder: false, founder_access: "full", ttl_days: 7, status: "pending", expires_at: "2099-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" }
    const viewer = (limit: number | null | undefined) => ({ loginId: OWNER, sessionId: OWNER, email: "owner@example.com", emailVerified: true, groupIds: [OWNER, id(10), id(11)], ...(limit === undefined ? {} : { limit }) })
    const at = (limit: number | null | undefined) => claimStateOf({ token: "k7m2-x9qp-4hfd-w3nc", handoff: handoff as never, business: { name: "Shop", avatarUrl: null }, stillFounders: true, viewer: viewer(limit), blockers: [], now: Date.parse("2026-06-01T00:00:00Z") }).kind
    check("three businesses and no row: limit", at(undefined) === "limit" && at(3) === "limit", [at(undefined), at(3)])
    check("three businesses and -1: not limit, ready", at(null) === "ready", at(null))
    check("three businesses and 4: ready", at(4) === "ready")
    const handoffServer = read("lib/handoff/server.ts")
    check("viewerOf reads the login's limit with the same client", /const limit = await businessLimitFor\(loginId, deps\.db\)/.test(handoffServer) && /groupIds: groupIds\(group, sessionUser\.id\), limit \}/.test(handoffServer))
  }

  console.log("\nThe menu")
  const switcher = read("components/app/business-switcher.tsx")
  check("the account menu counts to the login's own limit from its rows, the rule when a row has none",
    /const limit: BusinessLimit = businesses\.length > 0 && businesses\[0\]\.limit !== undefined \? businesses\[0\]\.limit : MAX_BUSINESSES/.test(switcher) && /const canAdd = canAddBusiness\(businesses\.length, limit\)/.test(switcher))
  check("  and a press past it says the login's own number", /setError\(limitReached\(limit\)\)/.test(switcher) && !/LIMIT_REACHED\)/.test(switcher))

  console.log("\nSQL part 446")
  const part = read("supabase/sql/run-now/446_business_limit_per_account.sql")
  const twin = read("supabase/migrations/20271446_business_limit_per_account.sql")
  check("the migration is the same text", part === twin)
  check("one whole statement per line, /* */ comments only, no blank lines",
    part.split("\n").filter((l) => l.length).every((l) => (l.startsWith("/*") ? /\*\/\s*$/.test(l) : /;\s*$/.test(l))) && !/^--/m.test(part) && !/\n\n/.test(part))
  check("a nullable integer, -1 or 1 to 10000, keyed by the account and gone with it",
    /create table if not exists public\.business_limits \(user_id uuid primary key references auth\.users\(id\) on delete cascade, business_limit integer,/.test(part) && /check \(business_limit is null or business_limit = -1 or business_limit between 1 and 10000\)/.test(part))
  check("row level security on, and no policy at all on it", /alter table public\.business_limits enable row level security;/.test(part) && !/create policy[^\n]*business_limits/i.test(part))
  check("nothing for the browser keys, everything for the service role",
    /revoke all on public\.business_limits from public, anon, authenticated;/.test(part) && /grant all on public\.business_limits to service_role;/.test(part) && !/grant [^\n]* on public\.business_limits to (anon|authenticated)/i.test(part))
  check("business_limit_of: three unless the row says otherwise, callable by the service role only",
    /coalesce\(\(select l\.business_limit from public\.business_limits l where l\.user_id = p_owner\), 3\)/.test(part) && /revoke all on function public\.business_limit_of\(uuid\) from public, anon, authenticated;/.test(part))
  check("  the 3 there is MAX_BUSINESSES", MAX_BUSINESSES === 3)
  check("the trigger counts to it, -1 skipping the count, the lock per login kept",
    /v_max := public\.business_limit_of\(new\.owner_id\); if v_max <> -1 and 1 \+ \(select count\(\*\) from public\.business_links where owner_id = new\.owner_id and member_id <> new\.member_id\) >= v_max then/.test(part) && /pg_advisory_xact_lock\(hashtextextended\('business_links ' \|\| new\.owner_id::text, 0\)\)/.test(part) && /errcode = 'check_violation', constraint = 'business_links_limit'/.test(part))
  check("the handoff's fixed 3 is rewritten to the same function, only while it is there", /position\('if 1 \+ v_count >= 3 then' in v_def\) = 0 then return/.test(part) && /'if public\.business_limit_of\(p_recipient\) <> -1 and 1 \+ v_count >= public\.business_limit_of\(p_recipient\) then'/.test(part))
  check("  and that text is in part 376 exactly once", (read("supabase/sql/run-now/376_business_handoff.sql").match(/if 1 \+ v_count >= 3 then/g) ?? []).length === 1)
  check("no email address in the part", !/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(part))

  console.log("\nNothing in the app writes the limit")
  const walk = (d: string): string[] => readdirSync(join(root, d)).flatMap((f) => {
    const p = `${d}/${f}`
    if (f === "node_modules" || f.startsWith(".")) return []
    return statSync(join(root, p)).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : []
  })
  const code = ["app", "components", "lib"].flatMap(walk)
  const naming = code.filter((f) => /from\(\s*["'`]business_limits["'`]/.test(read(f)))
  check("only lib/businesses/server.ts reaches the business_limits table", naming.length === 1 && naming[0] === "lib/businesses/server.ts", naming)
  const server = read("lib/businesses/server.ts")
  check("  and only reads it", /\.from\("business_limits"\)\.select\("business_limit"\)\.eq\("user_id", ownerId\)\.maybeSingle\(\)/.test(server) && !/from\("business_limits"\)\.(insert|update|upsert|delete)/.test(server))
  check("no email address is written into the limit code", !/@[a-z0-9-]+\.(com|io|app|me)\b/i.test(read("lib/businesses/rules.ts").replace(/@\/lib\/[^\s"]+/g, "")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
