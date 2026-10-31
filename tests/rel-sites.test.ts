/**
 * ===========================================================================
 *  PUBLIC SITES WHEN THE DATABASE IS SLOW OR AWAY (round rel-sites)
 * ===========================================================================
 * A read that failed or did not answer is not "there is nothing here". Each
 * section is one public surface or publish path, driven through its real code
 * with Supabase answered by a scripted fetch:
 *
 *   AI sites (<slug>.storelib.com)   503 + Retry-After on a failed read, never 404 or 301; the last live copy held
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

async function run() {
  const realFetch = globalThis.fetch
  try {
    await aiSites()
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
