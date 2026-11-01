/**
 * ===========================================================================
 *  RELIABILITY WAVE 3, THE LEFTOVERS (round rel3-leftovers)
 * ===========================================================================
 *   SMOKE-APP  the signed out redirect from /app (and /sell) is never kept by
 *              a shared cache: "private, no-store", through the real proxy.
 *
 * Each section names the finding it pins (docs/reliability/AUDIT.md).
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
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
void read

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-fixture-key"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-fixture-key"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
process.env.NEXT_PUBLIC_SITE_URL = "https://storelib.com"

/** Nothing here may reach the network: every request answers 503 and is counted. */
const network: string[] = []
globalThis.fetch = (async (input: RequestInfo | URL) => {
  network.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
  return new Response(JSON.stringify({ message: "offline fixture" }), { status: 503, headers: { "content-type": "application/json" } })
}) as typeof fetch

/* ── SMOKE-APP ───────────────────────────────────────────────────────────── */

async function signedOutRedirectsArePrivate() {
  console.log("\nSMOKE-APP. The sign in redirect from /app is the visitor's own answer, never a shared cache's")
  const { proxy } = await import("@/proxy")
  const { NextRequest } = await import("next/server")
  const ask = async (url: string) => {
    const res = (await proxy(new NextRequest(url, { headers: { host: new URL(url).host, accept: "text/html" } }) as never)) as Response
    return { status: res.status, location: res.headers.get("location"), cache: res.headers.get("cache-control") }
  }
  const app = await ask("https://storelib.com/app")
  check("/app signed out: a 307 to /login carrying the page", app.status === 307 && /\/login\?next=%2Fapp$/.test(app.location ?? ""), app)
  check("  marked private, no-store (Vercel's default was public, max-age=0)", app.cache === "private, no-store", app)
  const deep = await ask("https://storelib.com/app/products?tab=drafts")
  check("/app/products signed out: the same", deep.status === 307 && deep.cache === "private, no-store", deep)
  const sell = await ask("https://storelib.com/sell")
  check("/sell signed out: a 307 to sign up, private, no-store", sell.status === 307 && /\/signup\?intent=sell/.test(sell.location ?? "") && sell.cache === "private, no-store", sell)
}

async function run() {
  await signedOutRedirectsArePrivate()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
