/**
 * ===========================================================================
 *  RELIABILITY WAVE 3, THE LEFTOVERS (round rel3-leftovers)
 * ===========================================================================
 *   SMOKE-APP  the signed out redirect from /app (and /sell) is never kept by
 *              a shared cache: "private, no-store", through the real proxy.
 *   SEC-11     /signup/verify carries the account id, never the email
 *              address: every redirect and the VERIFY_EMAIL email link; the
 *              page shows the address from this tab or the session, still
 *              takes an old link's `email` and takes it off the address bar.
 *
 * Each section names the finding it pins (docs/reliability/AUDIT.md).
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

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

/* ── SEC-11 ──────────────────────────────────────────────────────────────── */

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (f === "node_modules" || f.startsWith(".")) return []
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : []
  })
}

async function verifyLinksCarryNoAddress() {
  console.log("\nSEC-11. The sign up code page is opened by account id, never with the email address in its URL")
  const v = await import("@/lib/account/verify-address")
  const mem = new Map<string, string>()
  const fake = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, val: string) => void mem.set(k, val) }
  v.rememberVerifyAddress("u-1", "maya@example.com", fake)
  check("the address typed on signup or login is kept in this tab for that account", v.recallVerifyAddress("u-1", fake) === "maya@example.com")
  check("  and never handed to another account id", v.recallVerifyAddress("u-2", fake) === "")
  check("  no storage (private mode): nothing, no throw", v.recallVerifyAddress("u-1", null) === "" && (v.rememberVerifyAddress("u-1", "a@b.co", null), true))
  check("an old link's email comes off the address bar, the account id, code and carry stay",
    v.addressWithoutEmail("https://storelib.com/signup/verify?userId=u-1&email=maya%40example.com&code=123456&intent=sell") === "/signup/verify?userId=u-1&code=123456&intent=sell")
  check("  a link without one is left alone", v.addressWithoutEmail("https://storelib.com/signup/verify?userId=u-1") === null)
  check("the page shows the address masked", v.maskedAddress("maya@example.com") === "ma**@example.com")
  check("signupVerifyPath is the account id only", v.signupVerifyPath("u 1") === "/signup/verify?userId=u%201")

  const { CATALOG, Data } = await import("@/lib/notify/templates/catalog")
  const mail = CATALOG.VERIFY_EMAIL(new Data({ userId: "u-1", email: "maya@example.com" }) as never, {} as never) as { action?: { path: string }; inApp?: { actionPath?: string } }
  check("the VERIFY_EMAIL email's button opens the code page by account id, even when sent an address",
    mail.action?.path === "/signup/verify?userId=u-1" && mail.inApp?.actionPath === "/signup/verify?userId=u-1", mail.action)

  /* Every place that writes the address outside lib/auth (which the auth branch owns, see the log). */
  const writers = [...walk(join(process.cwd(), "app")), ...walk(join(process.cwd(), "lib")), ...walk(join(process.cwd(), "components"))]
    .map((f) => relative(process.cwd(), f))
    .filter((f) => !f.startsWith("lib/auth/"))
    .filter((f) => /signup\/verify\?[^`"'\n]*email=/.test(read(f)))
  check("no redirect or link outside lib/auth puts email= on /signup/verify", writers.length === 0, writers)

  const page = read("app/(auth)/signup/verify/page.tsx")
  check("the page asks for a code by account id only (the server mails the account's own address)",
    (page.match(/JSON\.stringify\(\{ userId \}\)/g) ?? []).length === 2 && !/JSON\.stringify\(\{ userId, email \}\)/.test(page))
  check("  opens without an address in its URL (only the account id is required)", /if \(!userId\) \{/.test(page) && !/!userId \|\| !email/.test(page))
  check("  still reads an old link's email once, then replaces the address without it",
    /useState\(\(\) => searchParams\.get\("email"\) \?\? ""\)/.test(page) && /addressWithoutEmail\(window\.location\.href\)/.test(page) && /window\.history\.replaceState/.test(page))
  check("  shows the session's address only when the session is this account", /user\?\.id === userId && user\.email/.test(page))
  check("  logs nothing about it", !/console\.(log|warn|error|info)\([^)]*email/.test(page))
  check("signup and login remember the typed address before opening the page",
    /rememberVerifyAddress\(data\.user\.id, trimmedEmail\)/.test(read("app/(auth)/signup/page.tsx")) && /rememberVerifyAddress\(userData\.id, trimmedEmail\)/.test(read("app/(auth)/login/page.tsx")))
}

async function run() {
  await signedOutRedirectsArePrivate()
  await verifyLinksCarryNoAddress()
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
