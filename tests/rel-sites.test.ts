/**
 * ===========================================================================
 *  PUBLIC SITES WHEN THE DATABASE IS SLOW OR AWAY (round rel-sites)
 * ===========================================================================
 * A read that failed or did not answer is not "there is nothing here". Each
 * section is one public surface or publish path, driven through its real code
 * with Supabase answered by a scripted fetch:
 *
 *   AI sites (<slug>.storelib.com)   503 + Retry-After on a failed read, never 404 or 301; the last live copy held
 *   Creator Pages (storelib.com/<h>)  a failed profile/creator read throws (error screen), never the gate's 308 or a 404
 *   OnePages (storelib.me/<name>)     a failed or slow lookup serves the last answer or throws, never "missing"
 *   AI site publish                   a switch that did not take puts the live version back
 *   AI site address                   a check that failed is "taken" (fail closed), never "free"
 *   Theme publish                     a cancelled publish (57014, PGRST002) is asked once more; two minutes, stated
 *   AI spend limits                   a count that cannot be read refuses the run (503, Try again), never unlimited
 *   Draft theme assets                the unpublished file only with the install's signed pass; published files untouched
 *   Theme sites' last good copy       kept by use, not by arrival; held name/install entries named to outlive a deploy
 *
 * Every true "missing" answer stays what it was.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.co"
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon"

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const TIMEOUT = () => json(500, { code: "57014", message: "canceling statement due to statement timeout", details: null, hint: null })

type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>
/** Supabase, answered by table (REST) or by "storage", every call counted. */
function fakeSupabase(routes: Record<string, Handler>) {
  const calls: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
    const rest = url.pathname.match(/\/rest\/v1\/(?:rpc\/)?([\w-]+)/)
    const key = rest ? rest[1] : url.pathname.includes("/storage/v1/") ? "storage" : url.pathname
    calls.push(`${(init?.method ?? "GET").toUpperCase()} ${key}`)
    const h = routes[key]
    if (!h) return json(404, { message: `no fake for ${key}` })
    return h(url, init)
  }) as typeof fetch
  return calls
}

async function aiSites() {
  console.log("\nA. An AI site's lookup that failed is a 503 to try again, never a 404 or a 301 (HIGH-2)")
  const { GET } = await import("@/app/(sites)/site/[slug]/[[...path]]/route")
  const visit = async (slug: string, path: string[] = []) => {
    const host = `${slug}.storelib.com`
    const req = new Request(`https://${host}/${path.join("/")}`, { headers: { host } })
    return GET(req as never, { params: Promise.resolve({ slug, path }) })
  }

  // 1. The deployments read times out, and the name belongs to a creator: before, a 404 at best, a 301 when the profile read answered.
  {
    const calls = fakeSupabase({
      site_deployments: () => TIMEOUT(),
      profiles: () => json(200, [{ username: "alpha" }]),
      creators: () => json(200, []),
    })
    const res = await visit("alpha")
    check("a timed out deployment read answers 503", res.status === 503, res.status)
    check("  with Retry-After and no-store", res.headers.get("retry-after") === "5" && res.headers.get("cache-control") === "no-store")
    check("  never the creator's permanent redirect", !res.headers.get("location"))
    check("  the read was asked again once (bounded, not forever)", calls.filter((c) => c.endsWith("site_deployments")).length === 2, calls)
    check("  the 503 carries the site's security headers", /frame-ancestors 'none'/.test(res.headers.get("content-security-policy") ?? ""))
  }

  // 2. No live site, and the creator-name read fails: before, a 404.
  {
    fakeSupabase({
      site_deployments: () => json(200, []),
      profiles: () => TIMEOUT(),
      creators: () => json(200, []),
    })
    const res = await visit("bravo")
    check("a failed creator-name read answers 503, not a 404", res.status === 503, res.status)
  }

  // 3. True missing, unchanged.
  {
    fakeSupabase({
      site_deployments: () => json(200, []),
      profiles: () => json(200, []),
      creators: () => json(200, []),
    })
    const res = await visit("charlie")
    check("a name nobody has is still a 404", res.status === 404, res.status)
  }

  // 4. The old subdomain of a creator, unchanged.
  {
    fakeSupabase({
      site_deployments: () => json(200, []),
      profiles: () => json(200, [{ username: "delta" }]),
      creators: () => json(200, []),
    })
    const res = await visit("delta", ["shop"])
    check("a creator's old subdomain still moves for good (301) when the reads answered", res.status === 301 && res.headers.get("location") === "https://storelib.com/delta/shop", [res.status, res.headers.get("location")])
  }

  // 5. A live site, then the database goes away: the prefix seen is served.
  {
    let down = false
    fakeSupabase({
      site_deployments: () => (down ? TIMEOUT() : json(200, [{ storage_prefix: "sites/s1/d1" }])),
      storage: (url) =>
        url.pathname.endsWith("/sites/s1/d1/index.html")
          ? new Response("<!doctype html><p>echo</p>", { status: 200, headers: { "content-type": "text/html" } })
          : json(400, { statusCode: "404", error: "not_found", message: "Object not found" }),
    })
    const first = await visit("echo")
    check("a live site is served", first.status === 200 && /echo/.test(await first.text()), first.status)
    down = true
    const held = await visit("echo")
    check("with the database away, the last live copy is served", held.status === 200 && /echo/.test(await held.text()), held.status)
    const heldMissing = await visit("echo", ["nope.js"])
    check("  a file the held copy has not is 503, not a 404 nobody confirmed", heldMissing.status === 503, heldMissing.status)
    const heldRobots = await visit("echo", ["robots.txt"])
    check("  robots.txt still has its default", heldRobots.status === 200, heldRobots.status)
  }

  // 6. Storage failing is not the file being missing.
  {
    let storage: () => Response = () => json(500, { statusCode: "500", error: "internal", message: "upstream" })
    fakeSupabase({
      site_deployments: () => json(200, [{ storage_prefix: "sites/s2/d1" }]),
      storage: () => storage(),
    })
    const failedRes = await visit("foxtrot")
    check("a Storage 5xx answers 503", failedRes.status === 503, failedRes.status)
    storage = () => json(400, { statusCode: "404", error: "not_found", message: "Object not found" })
    const missing = await visit("foxtrot", ["gone.png"])
    check("Storage saying the object is not there is still a 404", missing.status === 404, missing.status)
  }

  const route = read("app/(sites)/site/[slug]/[[...path]]/route.ts")
  check("every read of the route is bounded (abortSignal through siteRead or within)", (route.match(/\.abortSignal\(signal\)/g) ?? []).length >= 4 && /within<Blob>/.test(route))
}

async function creatorPages() {
  console.log("\nB. A Creator Page's failed read is never a permanent redirect or a 404 (HIGH-3)")
  const { readPublicRowStrict, readPublicRow } = await import("@/lib/security/public-rows")
  const { isSiteReadError } = await import("@/lib/website-builder/site-read")
  const { ensureStorefrontOrRedirectToMember } = await import("@/lib/profile/storefront-gate")
  const { loadProfileByUsername, loadCreatorForUser } = await import("@/lib/commerce/creator-page-data")

  /* A client whose every read answers what `answer` says for its table. */
  const clientOf = (answer: (table: string) => { data: unknown; error: unknown }) => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      for (const m of ["select", "eq", "ilike", "abortSignal"]) q[m] = () => q
      q.maybeSingle = async () => answer(table)
      return q
    },
  })
  const thrown = async (f: () => Promise<unknown>) => f().then(() => null, (e: unknown) => e)

  const err = await thrown(() => readPublicRowStrict(clientOf(() => ({ data: null, error: { code: "57014", message: "statement timeout" } })) as never, "creators", (q) => q.eq("user_id", "u1")))
  check("the strict read throws a SiteReadError for a failed read", isSiteReadError(err), String(err))
  check("  where the lenient read still answers null, as every other caller expects", (await readPublicRow(clientOf(() => ({ data: null, error: { code: "57014" } })) as never, "creators", (q) => q.eq("user_id", "u1"))) === null)
  check("the strict read answers null only for a row that is not there", (await readPublicRowStrict(clientOf(() => ({ data: null, error: null })) as never, "creators", (q) => q.eq("user_id", "u1"))) === null)
  const fallback = await readPublicRowStrict<{ id: string }>(
    clientOf((t) => (t === "creators_public" ? { data: null, error: { code: "42P01" } } : { data: { id: "c1", user_id: "u1", onboarding_completed: true }, error: null })) as never,
    "creators",
    (q) => q.eq("user_id", "u1"),
  )
  check("  before part 63 it reads the table, cut to public columns, as before", fallback?.id === "c1", fallback)

  // The gate through the real loaders, Supabase answered by the scripted fetch.
  {
    const calls = fakeSupabase({
      profiles_public: () => json(200, [{ id: "p1", username: "golf" }]),
      creators_public: () => TIMEOUT(),
    })
    const e = await thrown(() => ensureStorefrontOrRedirectToMember("golf"))
    check("a failed creator read in the storefront gate THROWS (error screen), never the 308 to /@handle", isSiteReadError(e), String(e))
    check("  the creator read was asked twice, then given up", calls.filter((c) => c.endsWith("creators_public")).length === 2, calls)
  }
  {
    fakeSupabase({ profiles_public: () => TIMEOUT(), creators_public: () => json(200, []) })
    const e = await thrown(() => ensureStorefrontOrRedirectToMember("hotel"))
    check("a failed profile read in the gate throws too, never a 404", isSiteReadError(e), String(e))
    check("  the lenient loaders other pages use still read a failure as none", (await loadProfileByUsername("hotel")) === null)
  }
  {
    fakeSupabase({ profiles_public: () => json(200, [{ id: "p2", username: "india" }]), creators_public: () => json(200, [{ id: "c2", user_id: "p2", onboarding_completed: true }]) })
    check("a live storefront passes the gate", (await thrown(() => ensureStorefrontOrRedirectToMember("india"))) === null)
    check("  and the lenient creator loader answers the row", ((await loadCreatorForUser("p2")) as { id?: string } | null)?.id === "c2")
  }
  {
    fakeSupabase({ profiles_public: () => json(200, []), creators_public: () => json(200, []) })
    check("a name nobody has passes the gate untouched (the page's own 404)", (await thrown(() => ensureStorefrontOrRedirectToMember("juliet"))) === null)
  }

  const page = read("app/(marketing)/u/[username]/page.tsx")
  check("the creator page's own profile and creator reads are the strict ones", /const profile = await loadProfileByUsernameStrict\(username\)/.test(page) && /const creator = await loadCreatorForUserStrict\(profile\.id\)/.test(page))
  check("  and a failed username-history read is not a 404", /if \(historyError\) throw new SiteReadError/.test(page))
}

async function onePages() {
  console.log("\nC. A OnePage lookup that failed is never \"not found\" (HIGH-4)")
  const { resolveOnePage } = await import("@/lib/onepage/published-page")
  const { isSiteReadError } = await import("@/lib/website-builder/site-read")
  const thrown = async (f: () => Promise<unknown>) => f().then(() => null, (e: unknown) => e)

  {
    fakeSupabase({ onepages: () => TIMEOUT(), profiles: () => json(200, []), creators: () => json(200, []) })
    const e = await thrown(() => resolveOnePage("kilo"))
    check("a failed lookup THROWS (the error screen), never { kind: missing }", isSiteReadError(e), String(e))
  }
  {
    fakeSupabase({ onepages: () => json(200, []), profiles: () => json(200, []), creators: () => json(200, []), username_history: () => json(200, []), onepage_slug_history: () => json(200, []) })
    const a = await resolveOnePage("lima")
    check("a name that answered nothing is still missing", a.kind === "missing", a)
  }
  {
    let down = false
    fakeSupabase({
      onepages: (url) => (down ? TIMEOUT() : url.searchParams.get("slug") === "eq.mike" ? json(200, [{ id: "o1", slug: "mike", status: "published", published_blocks: [] }]) : json(200, [])),
      profiles: () => json(200, []),
    })
    const first = await resolveOnePage("mike")
    check("a published page resolves", first.kind === "page", first.kind)
    down = true
    const held = await resolveOnePage("mike")
    check("with the database away, the last answer for the name is served", held.kind === "page" && (held as { page: { id: string } }).page.id === "o1", held.kind)
  }
  {
    /* A query that never answers: ended at its own deadline, and the lookup at its budget, not held for the database's time. */
    const started = Date.now()
    fakeSupabase({ onepages: (_url, init) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))) })
    /* A guard of our own: without one, a lookup that never settles leaves node nothing to wait for and it exits as if green. */
    let guard: ReturnType<typeof setTimeout> | undefined
    const e = await Promise.race([thrown(() => resolveOnePage("november")), new Promise((r) => { guard = setTimeout(() => r("still waiting after 12s"), 12_000) })])
    clearTimeout(guard)
    const took = Date.now() - started
    check("a lookup that hangs ends within its budget and throws", isSiteReadError(e) && took < 9000, [String(e), took])
  }
  const routes = ["app/(marketing)/[sellername]/links/share.png/route.tsx", "app/(marketing)/[sellername]/links/photo.jpg/route.ts"].map(read)
  check("the share image and photo answer 503 for a failed lookup, not a held 404", routes.every((r) => /findPublishedOnePage\(slug\)\.catch\(\(\) => undefined\)/.test(r) && /status: 503/.test(r)))
}

/**
 * site_deployments in memory, with the unique index on (site_id) WHERE
 * is_live, and a hook that can fail any statement before it runs.
 */
type Dep = { id: string; site_id: string; is_live: boolean; status: string; storage_prefix?: string }
function deploymentsDb(rows: Dep[], fail: (op: { kind: "select" | "update"; patch?: Record<string, unknown>; filters: Record<string, unknown> }) => { code: string; message: string } | null) {
  const log: string[] = []
  return {
    rows,
    log,
    from(table: string) {
      if (table !== "site_deployments") throw new Error(`unexpected table ${table}`)
      const filters: Record<string, unknown> = {}
      let kind: "select" | "update" = "select"
      let patch: Record<string, unknown> | undefined
      const matches = () => rows.filter((r) => Object.entries(filters).every(([k, v]) => (r as Record<string, unknown>)[k] === v))
      const run = async () => {
        const injected = fail({ kind, patch, filters })
        log.push(`${kind} ${JSON.stringify(patch ?? {})} ${JSON.stringify(filters)}${injected ? ` -> ${injected.code}` : ""}`)
        if (injected) return { data: null, error: injected }
        if (kind === "select") return { data: matches()[0] ?? null, error: null }
        const hit = matches()
        if (patch?.is_live === true) {
          for (const r of hit) if (rows.some((o) => o !== r && o.site_id === r.site_id && o.is_live)) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } }
        }
        for (const r of hit) Object.assign(r, patch)
        return { data: null, error: null }
      }
      const q: Record<string, unknown> = {
        select: () => ((kind = "select"), q),
        update: (p: Record<string, unknown>) => ((kind = "update"), (patch = p), q),
        eq: (k: string, v: unknown) => ((filters[k] = v), q),
        maybeSingle: () => run(),
        then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => run().then(ok, ko),
      }
      return q
    },
  }
}

async function aiSitePublish() {
  console.log("\nD. An AI site publish whose switch did not take puts the live version back (HIGH-1)")
  const { switchLiveDeployment, SWITCH_FAILED, SWITCH_RESTORE_FAILED } = await import("@/lib/sites/publish")
  const fields = { status: "ready", storage_prefix: "sites/s/new" }
  const fresh = (): Dep[] => [
    { id: "old", site_id: "s", is_live: true, status: "ready" },
    { id: "new", site_id: "s", is_live: false, status: "building" },
  ]
  const liveOf = (rows: Dep[]) => rows.filter((r) => r.is_live).map((r) => r.id)
  const quiet = console.error
  console.error = () => {}
  try {
    {
      const db = deploymentsDb(fresh(), () => null)
      const r = await switchLiveDeployment(db, "s", "new", fields)
      check("a switch that works makes the new deployment the only live one", r.ok && JSON.stringify(liveOf(db.rows)) === '["new"]' && db.rows[1].status === "ready", db.log)
    }
    {
      const db = deploymentsDb(fresh(), (op) => (op.kind === "update" && op.patch?.storage_prefix ? { code: "57014", message: "canceling statement due to statement timeout" } : null))
      const r = await switchLiveDeployment(db, "s", "new", fields)
      check("a new pointer that times out puts the old one back: the site stays live", !r.ok && JSON.stringify(liveOf(db.rows)) === '["old"]', db.log)
      check("  the new deployment is marked failed", db.rows[1].status === "failed" && db.rows[1].is_live === false)
      check("  and the creator is told the live version stayed", !r.ok && (r as { error: string }).error === SWITCH_FAILED)
    }
    {
      const db = deploymentsDb(fresh(), (op) => (op.kind === "update" && op.patch?.is_live === false ? { code: "57014", message: "timeout" } : null))
      const r = await switchLiveDeployment(db, "s", "new", fields)
      check("an old pointer that would not come down stops the publish with the old one live", !r.ok && JSON.stringify(liveOf(db.rows)) === '["old"]' && db.rows[1].status === "failed", db.log)
    }
    {
      const db = deploymentsDb(fresh(), (op) => (op.kind === "select" ? { code: "PGRST002", message: "schema cache" } : null))
      const r = await switchLiveDeployment(db, "s", "new", fields)
      check("a live read that failed changes no pointer at all", !r.ok && JSON.stringify(liveOf(db.rows)) === '["old"]', db.log)
    }
    {
      /* The new pointer's update took, but its answer was lost: the old one is refused by the unique index, and the re-read finds the new one live. */
      let lost = true
      const rows = fresh()
      const db = deploymentsDb(rows, (op) => {
        if (op.kind === "update" && op.patch?.storage_prefix && lost) {
          lost = false
          Object.assign(rows[1], op.patch, { is_live: true })
          return { code: "", message: "fetch failed" }
        }
        return null
      })
      const r = await switchLiveDeployment(db, "s", "new", fields)
      check("a new pointer that went up although its answer was lost counts as live, not failed", r.ok && JSON.stringify(liveOf(db.rows)) === '["new"]' && db.rows[1].status !== "failed", db.log)
    }
    {
      let restores = 0
      const db = deploymentsDb(fresh(), (op) => {
        if (op.kind === "update" && op.patch?.storage_prefix) return { code: "57014", message: "timeout" }
        if (op.kind === "update" && op.patch?.is_live === true && op.filters.id === "old") return restores++ === 0 ? { code: "", message: "fetch failed" } : null
        return null
      })
      const r = await switchLiveDeployment(db, "s", "new", fields)
      check("a restore that fails once is asked again", r.ok === false && restores === 2 && JSON.stringify(liveOf(db.rows)) === '["old"]', db.log)
    }
    {
      const db = deploymentsDb(fresh(), (op) => (op.kind === "update" && (op.patch?.storage_prefix || (op.patch?.is_live === true && op.filters.id === "old")) ? { code: "57014", message: "timeout" } : null))
      const r = await switchLiveDeployment(db, "s", "new", fields)
      check("a restore that never takes says so plainly (publish again)", !r.ok && (r as { error: string }).error === SWITCH_RESTORE_FAILED)
    }
    {
      const rows: Dep[] = [{ id: "first", site_id: "s", is_live: false, status: "building" }]
      const db = deploymentsDb(rows, () => null)
      const r = await switchLiveDeployment(db, "s", "first", fields)
      check("a site's first publish goes live with nothing to take down", r.ok && rows[0].is_live)
    }
  } finally {
    console.error = quiet
  }
  {
    const { goLive } = await import("@/lib/sites/publish")
    const quietLog = console.error
    console.error = () => {}
    try {
      /* Part 348 has not run: PostgREST does not know the function, and the two-step switch is used. */
      const missing = Object.assign(deploymentsDb(fresh(), () => null), { rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }) })
      const r1 = await goLive(missing, "s", "new", fields)
      check("before part 348 runs, the two-step switch with its way back is used", r1.ok && JSON.stringify(liveOf(missing.rows)) === '["new"]')
      /* Part 348 has run: one call, and the database does the switch. */
      const calls: unknown[] = []
      const rows = fresh()
      const oneStep = Object.assign(deploymentsDb(rows, () => null), {
        rpc: async (fn: string, args: Record<string, unknown>) => {
          calls.push([fn, args])
          rows[0].is_live = false
          rows[1].is_live = true
          return { data: true, error: null }
        },
      })
      const r2 = await goLive(oneStep, "s", "new", fields)
      check("after part 348, the switch is one call to switch_site_deployment", r2.ok && calls.length === 1 && (calls[0] as [string])[0] === "switch_site_deployment" && oneStep.log.length === 0, oneStep.log)
      /* The function failed: one transaction, so nothing changed; the new one is marked failed. */
      const failing = Object.assign(deploymentsDb(fresh(), () => null), { rpc: async () => ({ data: null, error: { code: "57014", message: "timeout" } }) })
      const r3 = await goLive(failing, "s", "new", fields)
      check("  a switch in one step that failed leaves the old version live and says so", !r3.ok && JSON.stringify(liveOf(failing.rows)) === '["old"]' && failing.rows[1].status === "failed")
    } finally {
      console.error = quietLog
    }
    const part = read("supabase/sql/run-now/348_site_switch_in_one_step.sql")
    check("part 348 is one transaction with a lock per site, refuses another site's deployment, service role only", /pg_advisory_xact_lock\(hashtextextended\('storelib-site-switch:'/.test(part) && /WHERE id = p_deployment AND site_id = p_site/.test(part) && /REVOKE ALL ON FUNCTION public\.switch_site_deployment\(uuid, uuid, jsonb\) FROM PUBLIC, anon, authenticated/.test(part) && /GRANT EXECUTE ON FUNCTION public\.switch_site_deployment\(uuid, uuid, jsonb\) TO service_role/.test(part))
    check("  and its migration copy is the same bytes", part === read("supabase/migrations/20271103_site_switch_in_one_step.sql"))
  }
  const publish = read("lib/sites/publish.ts")
  check("publishSite switches through goLive and checks the site row's update", /await goLive\(/.test(publish) && /if \(siteError\)/.test(publish))
}

async function slugCheck() {
  console.log("\nE1. An AI site's address check that failed stops the publish (MEDIUM-2)")
  const { ensureSlug, SlugCheckFailed } = await import("@/lib/sites/publish")
  const head = (count: number) => new Response(null, { status: 200, headers: { "content-range": `*/${count}` } })
  const site = { id: "s9", name: "Oscar", slug: null } as never
  const thrown = async (f: () => Promise<unknown>) => f().then(() => null, (e: unknown) => e)
  {
    const calls = fakeSupabase({
      sites: (_u, init) => ((init?.method ?? "GET").toUpperCase() === "PATCH" ? new Response(null, { status: 204 }) : head(0)),
      profiles: () => new Response(null, { status: 500, statusText: "canceling statement due to statement timeout" }),
      creators: () => head(0),
    })
    const e = await thrown(() => ensureSlug(site))
    check("a creator-name count that failed stops the publish, never reads as free", e instanceof SlugCheckFailed, String(e))
    check("  and no address is written", !calls.some((c) => c === "PATCH sites"), calls)
  }
  {
    fakeSupabase({
      sites: (_u, init) => ((init?.method ?? "GET").toUpperCase() === "PATCH" ? new Response(null, { status: 204 }) : head(0)),
      profiles: (u) => head(u.searchParams.get("username") === "eq.oscar" ? 1 : 0),
      creators: () => head(0),
    })
    const slug = await ensureSlug(site)
    check("a name a creator has is still skipped for the next free one", slug === "oscar-2", slug)
  }
  {
    fakeSupabase({
      sites: (_u, init) => ((init?.method ?? "GET").toUpperCase() === "PATCH" ? json(500, { code: "57014", message: "timeout" }) : head(0)),
      profiles: () => head(0),
      creators: () => head(0),
    })
    const e = await thrown(() => ensureSlug(site))
    check("an address that could not be kept stops the publish too (it would move on the next one)", e instanceof SlugCheckFailed, String(e))
  }
  check("publishSite answers the check's failure with Try again, not a 500", /if \(!\(e instanceof SlugCheckFailed\)\) throw e/.test(read("lib/sites/publish.ts")) && /return \{ ok: false, error: SLUG_CHECK_FAILED \}/.test(read("lib/sites/publish.ts")))
}

async function themePublish() {
  console.log("\nE2. A theme publish the database cancelled is asked once more (MEDIUM-1 b, c)")
  const { publishWithOneRetry } = await import("@/lib/website-builder/publish-retry")
  const scripted = (answers: Array<{ data: unknown; error: { code?: string; message?: string } | null }>) => {
    let n = 0
    return { call: async () => answers[Math.min(n++, answers.length - 1)], count: () => n }
  }
  {
    const s1 = scripted([{ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }, { data: { files: [] }, error: null }])
    const r = await publishWithOneRetry(s1.call)
    check("a statement timeout is asked once more, and the second answer is the publish's", !r.error && s1.count() === 2)
  }
  {
    const s2 = scripted([{ data: null, error: { code: "PGRST002", message: "schema cache" } }, { data: null, error: { code: "PGRST002" } }])
    const r = await publishWithOneRetry(s2.call)
    check("  once only: a second failure is the answer", r.error?.code === "PGRST002" && s2.count() === 2)
  }
  {
    const s3 = scripted([{ data: null, error: { code: "P0002", message: "not this creator's" } }])
    await publishWithOneRetry(s3.call)
    const s4 = scripted([{ data: null, error: { code: "", message: "fetch failed" } }])
    await publishWithOneRetry(s4.call)
    check("  a refusal, or an answer lost on the way (it may have taken), is never repeated", s3.count() === 1 && s4.count() === 1)
  }
  const route = read("app/api/website-builder/themes/[installId]/publish/route.ts")
  check("the publish route asks through it, and states its two minutes", /publishWithOneRetry\(\s*\(\) =>\s*admin\.rpc\("publish_theme_install"/.test(route) && /^export const maxDuration = 120$/m.test(route))
}

async function aiLimits() {
  console.log("\nE3. AI spend limits fail closed when the count cannot be read (MEDIUM-3)")
  const { agentRateLimit, publishRateLimit, themeAgentLimit, limitStatus, AI_LIMIT_UNREADABLE } = await import("@/lib/sites/rate-limit")
  const head = (count: number) => new Response(null, { status: 200, headers: { "content-range": `*/${count}` } })
  const quiet = console.warn
  console.warn = () => {}
  try {
    fakeSupabase({ site_agent_runs: () => new Response(null, { status: 500, statusText: "canceling statement due to statement timeout" }), site_deployments: () => new Response(null, { status: 500 }) })
    const refused = await agentRateLimit("c1")
    check("the code agent's count that failed refuses the run", refused === AI_LIMIT_UNREADABLE, refused)
    check("  answered 503 with a plain Try again, not a 429", limitStatus(refused ?? "") === 503 && /Try again/.test(AI_LIMIT_UNREADABLE))
    check("  a publish (no model) still goes on a failed count, as before", (await publishRateLimit("s1")) === null)
    fakeSupabase({ site_agent_runs: () => head(0) })
    check("  a count that answered under the limit lets the run go", (await agentRateLimit("c1")) === null)
    fakeSupabase({ site_agent_runs: () => head(6) })
    const over = await agentRateLimit("c1")
    check("  and one over it is still the 429 it was", over !== null && over !== AI_LIMIT_UNREADABLE && limitStatus(over) === 429)
  } finally {
    console.warn = quiet
  }
  const failing = { from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: null, error: { message: "timeout" } }) }) }) }) }
  check("the website builder's own count that failed refuses the run too", (await themeAgentLimit("c1", failing)) === AI_LIMIT_UNREADABLE)
  const none = { from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }
  check("  a creator with no website yet is not refused", (await themeAgentLimit("c1", none)) === null)
  const sitesAgent = read("app/api/sites/[siteId]/agent/route.ts")
  check("every AI route answers the limit's own status, and the one-run-per-site read that failed refuses", [sitesAgent, read("app/api/website-builder/themes/[installId]/agent/route.ts"), read("app/api/website-builder/themes/[installId]/sections/code/route.ts")].every((r) => /status: limitStatus\((limited|busy)\)/.test(r) && !/\{ error: (limited|busy) \}, \{ status: 429 \}/.test(r)) && /if \(activeError\) return NextResponse\.json\(\{ error: AI_LIMIT_UNREADABLE \}, \{ status: 503 \}\)/.test(sitesAgent))
}

async function draftAssets() {
  console.log("\nF. A theme's draft stylesheets and scripts need the install's signed pass (MEDIUM-5)")
  const { GET } = await import("@/app/api/site-theme/assets/[installId]/[version]/[...name]/route")
  const { draftAssetPass, isDraftAssetPass } = await import("@/lib/website-builder/draft-asset-pass")
  const { splitAssetVersion, withDraftPass } = await import("@/lib/storelib-theme/compat/draft-version")
  const A = "11111111-1111-4111-8111-111111111111"
  const B = "22222222-2222-4222-8222-222222222222"
  const asked: string[] = []
  fakeSupabase({
    store_theme_custom_files: (url) => {
      asked.push(url.searchParams.get("select") ?? "")
      return json(200, [{ path: "shopify/assets/theme.css", content: "body{color:live}", draft_content: "body{color:draft}" }])
    },
  })
  const get = async (version: string) => {
    const res = await GET(new Request(`https://storelib.com/api/site-theme/assets/${A}/${version}/theme.css`), { params: Promise.resolve({ installId: A, version, name: ["theme.css"] }) })
    return { status: res.status, body: await res.text(), cache: res.headers.get("cache-control") }
  }
  const pass = draftAssetPass(A)
  const open = await get("edit")
  check("the builder's old address with no pass is the PUBLISHED file, never the draft (and never a 404)", open.status === 200 && /live/.test(open.body) && !/draft/.test(open.body), open)
  check("  not cached either", open.cache === "private, max-age=0, must-revalidate")
  const own = await get(withDraftPass("edit", pass))
  check("with this install's pass, the draft", own.status === 200 && /draft/.test(own.body), own)
  const preview = await get(withDraftPass(`draft-${Date.now()}`, pass))
  check("  a preview's draft-<time> address with its pass, too", /draft/.test(preview.body))
  const other = await get(withDraftPass("edit", draftAssetPass(B)))
  check("another install's pass opens nothing here", /live/.test(other.body) && !/draft/.test(other.body))
  const forged = await get(withDraftPass("edit", "x".repeat(32)))
  check("  nor does a made-up one", /live/.test(forged.body))
  const published = await get("1730000000")
  check("a published address is unchanged: the live file, cached for a year", /live/.test(published.body) && published.cache === "public, max-age=31536000, immutable", published)
  check("  and never asks for the draft column", !asked[asked.length - 1].includes("draft_content"), asked)
  check("the pass is per install, fixed, and checked in constant time", draftAssetPass(A) === draftAssetPass(A) && draftAssetPass(A) !== draftAssetPass(B) && isDraftAssetPass(A, pass) && !isDraftAssetPass(B, pass) && !isDraftAssetPass(A, null))
  check("a draft version still reads as a draft with its pass, a published one never", splitAssetVersion(`edit.${pass}`).draft && splitAssetVersion(`draft-9.${pass}`).pass === pass && !splitAssetVersion("h-0123456789abcdef").draft && !splitAssetVersion("1730000000").draft)

  const files = read("app/api/website-builder/themes/[installId]/files/route.ts")
  const canvasFiles = read("components/website-builder/compat/compat-files.ts")
  const site = read("lib/website-builder/compat-site.ts")
  check("the owner's editor is handed the pass with the theme's files (owner or team only), and draws with it", /NextResponse\.json\(\{ files, asset_pass: draftAssetPass\(installId\) \}\)/.test(files) && /passes\.set\(installId, d\.asset_pass\)/.test(canvasFiles) && /\$\{draftAssetVersion\(installId\)\}/.test(read("components/website-builder/compat/compat-canvas.tsx")) && /\$\{draftAssetVersion\(installId\)\}/.test(read("components/website-builder/compat/compat-section-preview.tsx")))
  check("a preview link's page and the cover's page draw their assets with the pass", /withDraftPass\(`draft-\$\{Date\.now\(\)\}`, draftAssetPass\(row\.id\)\)/.test(site) && /compatThemeFor\(row\.id, withDraftPass\("edit", draftAssetPass\(row\.id\)\), rows, settings\)/.test(site))
  const route = read("app/api/site-theme/assets/[installId]/[version]/[...name]/route.ts")
  check("the draft settings drawn into a .css.liquid follow the same pass", /const draft = asked\.draft && isDraftAssetPass\(installId, asked\.pass\)/.test(route) && /installFiles\(admin, installId, draft\)/.test(route) && /const settings = \(draft \? s\?\.draft_settings/.test(route))
}

async function lastGoodCopies() {
  console.log("\nG. A theme site's last good copy is there for the sites being visited (production: 716 unavailable vs 199 served)")
  const { LastGood, keyedAs } = await import("@/lib/website-builder/last-good")
  const held = new LastGood<string>(3)
  held.remember("popular", "p")
  held.remember("b", "b")
  held.remember("c", "c")
  held.get("popular")
  held.remember("d", "d")
  check("a site still being visited is kept when newer ones arrive (first in, first out dropped it)", held.get("popular") === "p" && held.get("b") === undefined && held.size === 3)
  held.remember("c", "c2")
  check("  a fresh copy replaces the old one", held.get("c") === "c2")
  const a = keyedAs("site-name:v1", (n: string) => `x${n}`)
  const b = keyedAs("site-name:v1", (n: string) => `y${n}`)
  check("a held entry is named by its label, not its (minified) text, and still runs its function", a.toString() === b.toString() && a.toString() === "storelib-held:site-name:v1" && a("1") === "x1")
  const published = read("lib/website-builder/published-site.ts")
  const compat = read("lib/website-builder/compat-site.ts")
  check("the name lookup and the published install are held under fixed names", /unstable_cache\(keyedAs\("site-name:v1", \(\) => lookUpName\(lower\)\), \["site-name", lower\]/.test(published) && /\(v\) => v === null, "compat-install:v1"\)/.test(compat))
  check("both last good maps keep by use", /new LastGood<ShopLookup>\(500\)/.test(published) && /new LastGood<SiteData>\(200\)/.test(compat) && !/lastGood(Site)?\.keys\(\)\.next\(\)/.test(published + compat))
}

async function run() {
  const realFetch = globalThis.fetch
  try {
    await aiSites()
    await creatorPages()
    await onePages()
    await aiSitePublish()
    await slugCheck()
    await themePublish()
    await aiLimits()
    await draftAssets()
    await lastGoodCopies()
  } finally {
    globalThis.fetch = realFetch
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
