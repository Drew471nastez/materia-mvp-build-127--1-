/**
 * ===========================================================================
 *  ROUND 48, OBSERVABILITY: ONE LINE PER FAILURE, NOTHING PRIVATE IN IT
 * ===========================================================================
 *   the scrubber (lib/net/scrub.ts)          tokens, keys, cookies, codes, cards out; addresses masked; ids kept
 *   the console guard (lib/net/console-guard) every server error line is one JSON line with route and rid
 *   onRequestError (instrumentation.ts)      one JSON line with route, method, status, rid, digest; Next's own print dropped
 *   error boundaries                          one per major segment, each keeps its layout, retries, reports its digest
 *   /api/health                               bounded, and nothing that reads as a secret in its answer
 *   scheduled jobs                            one run at a time (the cron_runs lease), every job's maxDuration said
 *   the smoke checks and the load scripts     the critical paths; local only where they must be
 *
 *   node scripts/run-push-tests.mjs (in the list as tests/obs-r48.test.ts)
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { scrubSecrets } from "@/lib/net/scrub"
import { guardLine, installConsoleGuard, isNextUncaughtPrint, NEXT_PRINT_HOLD_MS } from "@/lib/net/console-guard"
import { markLogged, wasLogged } from "@/lib/net/logged-once"
import { heldByEarlierRun, recordCronRun, reportError } from "@/lib/observability/report"
import { stripComments } from "./_source"
import RootError from "@/app/(storelib)/error"
import GlobalError from "@/app/global-error"
import MarketingError from "@/app/(storelib)/(marketing)/error"
import ShopError from "@/app/(storelib)/(marketing)/[sellername]/error"
import WebsiteError from "@/app/(site)/w/[username]/error"
import CheckoutError from "@/app/(storelib)/checkout/error"
import AuthError from "@/app/(storelib)/(auth)/error"
import AdminError from "@/app/(storelib)/admin/error"

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
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)?.slice(0, 800)}` : ""}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => stripComments(read(p))
const realFetch = globalThis.fetch
const real = { error: console.error, warn: console.warn }
const keepAlive = setInterval(() => {}, 1_000)

/* Shapes made up for the test: none is a real credential. */
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlLWZvci10ZXN0"
const STRIPE = "sk_" + "live_" + "abcdefghijklmnopqrstuvwx"
const WHSEC = "whsec_" + "abcdefghijklmnop1234"

function capture(): { lines: string[]; stop: () => void } {
  const lines: string[] = []
  console.error = (...a: unknown[]) => void lines.push(a.map(String).join(" "))
  console.warn = (...a: unknown[]) => void lines.push(a.map(String).join(" "))
  return { lines, stop: () => Object.assign(console, real) }
}
const json = (l: string) => {
  try {
    return JSON.parse(l) as Record<string, unknown>
  } catch {
    return null
  }
}

async function main() {
  console.log("\nThe scrubber: nothing private leaves in a log line")
  {
    const s = (x: string) => scrubSecrets(x)
    check("a JWT", s(`token ${JWT} here`) === "token [jwt] here", s(`token ${JWT} here`))
    check("a bearer header", s("Authorization: Bearer abcdefgh12345678xyz").includes("[token]") && !s("Authorization: Bearer abcdefgh12345678xyz").includes("abcdefgh123"))
    check("Stripe and webhook keys", s(`key ${STRIPE} and ${WHSEC}`) === "key [key] and [key]", s(`key ${STRIPE} and ${WHSEC}`))
    check("a Supabase session cookie's value", s("sb-abcd-auth-token=base64-eyJzZXNzaW9uIjoxfQ; path=/") .startsWith("sb-abcd-auth-token=[cookie]"), s("sb-abcd-auth-token=base64-eyJzZXNzaW9uIjoxfQ; path=/"))
    check("a whole Cookie header", !/secretvalue/.test(s('{"cookie":"theme=dark; session=secretvalue"}')), s('{"cookie":"theme=dark; session=secretvalue"}'))
    check("a password in JSON", !/hunter22/.test(s('{"email":"x","password":"hunter22"}')), s('{"email":"x","password":"hunter22"}'))
    check("an access or refresh token in a query string", !/abc123def/.test(s("/cb?refresh_token=abc123def&next=/app")) && s("/cb?refresh_token=abc123def&next=/app").includes("next=/app"))
    check("a sign in code in an address", s("/auth/callback?code=9f8e7d6c&next=/app") === "/auth/callback?code=[redacted]&next=/app", s("/auth/callback?code=9f8e7d6c&next=/app"))
    check("an address is masked, as lib/privacy/mask-email does", s("could not send to anna.lee@example.com") === "could not send to an***@example.com", s("could not send to anna.lee@example.com"))
    check("a card number (Luhn) goes", s("card 4242 4242 4242 4242 declined") === "card [card] declined", s("card 4242 4242 4242 4242 declined"))
    const keep = 'PGRST116 {"code":"PGRST116"} order 3f2b1c4d-1111-4111-8111-222222222222 at 1730000000000 for 2900 cents, /api/orders 500'
    check("ids, PostgREST codes, times, amounts and routes stay", s(keep) === keep, s(keep))
    check("an empty line is fine", s("") === "")
  }

  console.log("\nThe console guard: every server error line is one JSON line")
  {
    const ctx = { route: "/api/orders", rid: "iad1::abc-12345" }
    const l1 = json(guardLine("error", ["[orders] failed for", "anna@example.com", { status: 500, code: "PGRST301" }], ctx) ?? "")
    check("a plain console.error becomes one JSON line at its level", l1?.evt === "log" && l1.level === "error", l1)
    check("  with the route and the request id", l1?.route === "/api/orders" && l1.rid === "iad1::abc-12345", l1)
    check("  and its message, scrubbed", typeof l1?.msg === "string" && (l1.msg as string).includes("[orders] failed for") && (l1.msg as string).includes("an***@example.com") && (l1.msg as string).includes("PGRST301") && !(l1.msg as string).includes("anna@"), l1?.msg)
    const e = Object.assign(new Error(`upstream said ${JWT}`), { digest: "123456" })
    const l2 = json(guardLine("error", ["[x]", e], ctx) ?? "")
    check("an Error keeps its stack (scrubbed) and digest", typeof l2?.stack === "string" && l2.digest === "123456" && !String(l2.stack).includes("eyJ") && !String(l2.msg).includes("eyJ"), l2)
    check("the same Error a second time is dropped (logged once)", guardLine("error", [e], ctx) === null)
    const already = json(guardLine("warn", [JSON.stringify({ evt: "site_last_good_served", where: "creator", rid: null })], ctx) ?? "")
    check("a line that already is JSON keeps its fields and gains route and rid", already?.evt === "site_last_good_served" && already.where === "creator" && already.rid === "iad1::abc-12345" && already.route === "/api/orders", already)
    const outside = json(guardLine("warn", ["no request here"], null) ?? "")
    check("outside a request it has no route or rid, and is still a line", outside?.msg === "no request here" && !("rid" in outside) && !("route" in outside), outside)

    /* Installed for real, with a reader standing in for Next's request stores. */
    const seen: string[] = []
    const before = { error: console.error, warn: console.warn }
    console.error = (...a: unknown[]) => void seen.push(`E ${a.join(" ")}`)
    console.warn = (...a: unknown[]) => void seen.push(`W ${a.join(" ")}`)
    installConsoleGuard(() => ({ route: "/[sellername]", rid: "req-abcdefgh" }))
    console.error("[shop] read failed", new Error(`with ${STRIPE}`))
    console.warn("slow")
    /* Next's own print of an uncaught error comes BEFORE onRequestError (measured on a production build): held, then dropped once marked. */
    const reported = new Error("thrown in a route")
    const unreported = new Error("printed with nobody reporting it")
    check("Next's print is told apart, coloured or not", isNextUncaughtPrint("error", ["\x1b[31m\x1b[1m⨯\x1b[22m\x1b[39m", reported]) && !isNextUncaughtPrint("error", ["[x] failed", reported]) && !isNextUncaughtPrint("warn", ["⨯", reported]))
    const before2 = seen.length
    console.error("⨯", reported)
    console.error("⨯", unreported)
    markLogged(reported)
    check("  held, not written at once", seen.length === before2, seen.slice(before2))
    await new Promise((r) => setTimeout(r, NEXT_PRINT_HOLD_MS + 200))
    const held = seen.slice(before2)
    check("  after the hold: the reported one is dropped, the other is written once", held.length === 1 && held[0].includes("printed with nobody reporting it"), held)
    seen.length = 2
    const installedTwice = console.error
    installConsoleGuard(() => null)
    check("installed, console.error writes one scrubbed JSON line with the route", seen.length === 2 && seen[0].startsWith("E {") && json(seen[0].slice(2))?.route === "/[sellername]" && !seen[0].includes("sk_live"), seen)
    check("  console.warn too, at its own level", seen[1]?.startsWith("W {") && json(seen[1].slice(2))?.level === "warn", seen)
    check("  installed once per process", console.error === installedTwice)
    Object.assign(console, before)
    Object.assign(console, real)
    check("the guard is installed from instrumentation register(), Node runtime only", /export async function register\(\)[\s\S]*NEXT_RUNTIME === "nodejs"[\s\S]*installConsoleGuard\(\)/.test(code("instrumentation.ts")))
  }

  console.log("\nonRequestError: each uncaught error is one JSON line with route, status, rid and digest")
  {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.test"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-key"
    delete process.env.ALERT_WEBHOOK_URL
    delete process.env.ALERT_EMAIL
    const sent: { url: string; body: Record<string, unknown> | null }[] = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null })
      return new Response("false", { status: 200 })
    }) as typeof fetch
    const { onRequestError } = await import("@/instrumentation")
    const cap = capture()
    const err = Object.assign(new Error(`render failed for anna@example.com with ${JWT}`), { digest: "987654321" })
    await onRequestError(
      err,
      { path: "/satori/loop-pack-1?ref=x", method: "GET", headers: { "x-request-id": "iad1::req-55555" } },
      { routerKind: "App Router", routePath: "/[sellername]/[productSlug]", routeType: "render", renderSource: "react-server-components", revalidateReason: undefined } as never,
    )
    cap.stop()
    globalThis.fetch = realFetch
    const lines = cap.lines.map(json).filter(Boolean) as Record<string, unknown>[]
    const line = lines.find((l) => l.evt === "error_report")
    check("one JSON line", cap.lines.length === 1 && !!line, cap.lines)
    check("  with route, method, status 500, request id and digest", line?.route === "/[sellername]/[productSlug]" && line.method === "GET" && line.status === 500 && line.rid === "iad1::req-55555" && line.digest === "987654321" && line.where === "GET /[sellername]/[productSlug]", line)
    check("  and nothing private in it", !cap.lines[0]?.includes("anna@") && !cap.lines[0]?.includes("eyJ"), cap.lines[0])
    const row = sent.find((x) => x.url.endsWith("/rpc/storelib_note_error"))?.body ?? {}
    check("the error row has the same context, scrubbed", (row.p_context as Record<string, unknown>)?.status === 500 && !JSON.stringify(row).includes("eyJ") && !JSON.stringify(row).includes("anna@"), row)
    check("the error is marked logged, so Next's own print of it is dropped by the guard", wasLogged(err) && guardLine("error", [err], null) === null)
    check("a different error is still printed", guardLine("error", [new Error("other")], null) !== null)
    check("markLogged says when it already was", markLogged(err) === true && markLogged({}) === false)
    /* And reportError's own line for a caught error (a cron, a webhook) is JSON too. */
    globalThis.fetch = (async () => new Response("false", { status: 200 })) as typeof fetch
    const cap2 = capture()
    await reportError({ source: "webhook", where: "POST /api/stripe/webhook", error: new Error(`bad ${WHSEC}`), context: { status: 500 }, requestId: "iad1::wh-12345" })
    cap2.stop()
    globalThis.fetch = realFetch
    const l = json(cap2.lines[0] ?? "")
    check("reportError writes one JSON line for a caught error too", l?.evt === "error_report" && l.source === "webhook" && l.rid === "iad1::wh-12345" && l.status === 500 && !String(cap2.lines[0]).includes("whsec_"), cap2.lines)
  }

  console.log("\nError boundaries: one per major segment, keeping its layout")
  {
    const SEGMENTS: [string, string][] = [
      ["app/(storelib)/error.tsx", "everything without its own"],
      ["app/global-error.tsx", "the root layout itself"],
      ["app/(storelib)/app/error.tsx", "the dashboard (every /app screen, inside its shell)"],
      ["app/(storelib)/(marketing)/error.tsx", "home, pricing, features, blog, explore, /p, community index"],
      ["app/(storelib)/(marketing)/[sellername]/error.tsx", "a creator page and product page"],
      ["app/(storelib)/(marketing)/community/[slug]/error.tsx", "a community"],
      ["app/(storelib)/(marketing)/explore/error.tsx", "explore"],
      ["app/(site)/w/[username]/error.tsx", "a creator's website"],
      ["app/(storelib)/checkout/error.tsx", "checkout"],
      ["app/(storelib)/(auth)/error.tsx", "sign in and sign up"],
      ["app/(storelib)/account/error.tsx", "a buyer's account"],
      ["app/(storelib)/admin/error.tsx", "the admin"],
      ["app/(storelib)/website-builder/error.tsx", "the website builder"],
      ["app/(storelib)/sites/[siteId]/error.tsx", "the AI website editor"],
    ]
    for (const [p, what] of SEGMENTS) {
      const ok = existsSync(join(root, p))
      const src = ok ? read(p) : ""
      check(`${p} (${what})`, ok && src.trimStart().startsWith('"use client"') && /export default function/.test(src) && /reset/.test(src) && (/ErrorScreen/.test(src) || /\/api\/client-errors/.test(src)), { exists: ok })
    }
    /* Every top level segment with pages a person opens has a boundary of its own or sits under one above. */
    /* Changed on purpose (r52): Storelib's pages have a root of their own (app/(storelib)), and its boundary covers them; a website's pages have theirs (app/(site)/w/[username]/error.tsx). */
    const APP = join(root, "app", "(storelib)")
    const tops = readdirSync(APP, { withFileTypes: true }).filter((d) => d.isDirectory() && !["api", "@sheet"].includes(d.name)).map((d) => d.name)
    check("the root boundary covers every other top level segment", existsSync(join(APP, "error.tsx")) && tops.length > 10 && existsSync(join(root, "app/(site)/w/[username]/error.tsx")), tops.length)

    /* Rendered: each says what happened, offers Try again, and the digest to quote. */
    const err = Object.assign(new Error("boom"), { digest: "4242" })
    const RENDERED: [string, (p: { error: Error & { digest?: string }; reset: () => void }) => unknown, string][] = [
      ["app/(storelib)/error.tsx", RootError, 'href="/"'],
      ["app/(storelib)/(marketing)/error.tsx", MarketingError, 'href="/"'],
      ["app/(storelib)/(marketing)/[sellername]/error.tsx", ShopError, 'href="/"'],
      ["app/(site)/w/[username]/error.tsx", WebsiteError, 'href="/"'],
      ["app/(storelib)/checkout/error.tsx", CheckoutError, 'href="/"'],
      ["app/(storelib)/(auth)/error.tsx", AuthError, 'href="/login"'],
      ["app/(storelib)/admin/error.tsx", AdminError, 'href="/admin"'],
    ]
    for (const [p, C, home] of RENDERED) {
      let html = ""
      try {
        html = renderToStaticMarkup(createElement(C as never, { error: err, reset: () => {} }))
      } catch (e) {
        html = `threw: ${e instanceof Error ? e.message : String(e)}`
      }
      check(`${p} renders Try again, the way back and the digest`, html.includes("Try again") && html.includes(home) && html.includes("4242"), html.slice(0, 400))
    }
    /* On storelib.com the shop's way back is the shop; on its own domain ("/"), it is "/". */
    const g = globalThis as unknown as Record<string, unknown>
    g.__PUSH_TEST_PARAMS__ = { sellername: "satori", username: "satori" }
    g.__PUSH_TEST_PATHNAME__ = "/satori/loop-pack-1"
    const shopHtml = renderToStaticMarkup(createElement(ShopError as never, { error: err, reset: () => {} }))
    g.__PUSH_TEST_PATHNAME__ = "/w/satori/about"
    const siteHtml = renderToStaticMarkup(createElement(WebsiteError as never, { error: err, reset: () => {} }))
    g.__PUSH_TEST_PATHNAME__ = "/loop-pack-1"
    const ownDomain = renderToStaticMarkup(createElement(ShopError as never, { error: err, reset: () => {} }))
    delete g.__PUSH_TEST_PARAMS__
    delete g.__PUSH_TEST_PATHNAME__
    check("a shop's boundary goes back to the shop, on storelib.com and on its own domain", shopHtml.includes('href="/satori"') && ownDomain.includes('href="/"') && !ownDomain.includes('href="/satori"'))
    check("a website's boundary goes back to the website's home", siteHtml.includes('href="/w/satori"'))
    let gh = ""
    try {
      gh = renderToStaticMarkup(createElement(GlobalError as never, { error: err, reset: () => {} }))
    } catch (e) {
      gh = `threw: ${e instanceof Error ? e.message : String(e)}`
    }
    check("global-error renders its own <html> and <body> with Try again", gh.startsWith("<html") && gh.includes("<body") && gh.includes("Try again"), gh.slice(0, 200))
    check("ErrorScreen reports itself with its digest (/api/client-errors)", /\/api\/client-errors/.test(code("components/platform/error-screen.tsx")) && /digest/.test(code("lib/client-errors.ts")))
  }

  console.log("\n/api/health: bounded, and no secret in its answer")
  {
    const mod = code("app/api/health/route.ts")
    check("short deadlines and no-store", /HEALTH_DB_MS = 2_500/.test(mod) && /export const maxDuration = 10/.test(mod) && /"Cache-Control": "no-store"/.test(mod))
    const { GET } = await import("@/app/api/health/route")
    /* The database answers with an error that quotes a key and a token. */
    globalThis.fetch = (async () => new Response(JSON.stringify({ message: `JWT ${JWT} invalid for ${STRIPE}`, code: "PGRST301" }), { status: 401, headers: { "content-type": "application/json" } })) as typeof fetch
    const res = await GET()
    globalThis.fetch = realFetch
    const text = await res.text()
    check("a database error is \"down\" and its text is not repeated", res.status === 503 && /"status":"down"/.test(text) && !/eyJ|sk_live|PGRST301|supabase/i.test(text), text)
    const S = await import(pathToFileURL(join(root, "scripts/smoke-deploy.mjs")).href)
    check("the smoke check refuses a health answer that carries a secret", S.SECRET_SHAPES.test(`{"k":"${JWT}"}`) && S.SECRET_SHAPES.test(STRIPE) && !S.SECRET_SHAPES.test(text))
  }

  console.log("\nScheduled jobs: one run at a time, each bounded")
  {
    const now = Date.parse("2026-11-02T10:00:00Z")
    const lease = 60_000 + 30_000
    check("an earlier unfinished run inside the lease holds the job", heldByEarlierRun([{ id: 1, started_at: "2026-11-02T09:59:00Z", finished_at: null }], 2, lease, now))
    check("  a finished one does not", !heldByEarlierRun([{ id: 1, started_at: "2026-11-02T09:59:00Z", finished_at: "2026-11-02T09:59:30Z" }], 2, lease, now))
    check("  nor one the platform killed, once its lease is over", !heldByEarlierRun([{ id: 1, started_at: "2026-11-02T09:58:00Z", finished_at: null }], 2, lease, now))
    check("  nor a later one (two at once: the lower id goes ahead)", !heldByEarlierRun([{ id: 3, started_at: "2026-11-02T09:59:59Z", finished_at: null }], 2, lease, now))

    /* recordCronRun, end to end against a fake cron_runs: an overlapping run does nothing. */
    process.env.CRON_SECRET = "cron-secret-for-test"
    const patches: Record<string, unknown>[] = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes("/rest/v1/cron_runs") && init?.method === "POST") return new Response(JSON.stringify([{ id: 9 }]), { status: 201 })
      if (url.includes("/rest/v1/cron_runs") && init?.method === "PATCH") {
        patches.push(JSON.parse(String(init.body)))
        return new Response("[]", { status: 200 })
      }
      if (url.includes("/rest/v1/cron_runs")) return new Response(JSON.stringify([{ id: 8, started_at: new Date(Date.now() - 5_000).toISOString(), finished_at: null }]), { status: 200 })
      return new Response("false", { status: 200 })
    }) as typeof fetch
    let ran = 0
    const cap = capture()
    const req = new Request("https://example.test/api/cron/notify", { headers: { authorization: "Bearer cron-secret-for-test" } })
    const answer = await recordCronRun("/api/cron/notify", req, async () => {
      ran++
      return new Response("{}", { status: 200 })
    }, { maxDurationS: 60 })
    cap.stop()
    globalThis.fetch = realFetch
    delete process.env.CRON_SECRET
    check("a run that meets an earlier one still going does not run the job", ran === 0 && answer.status === 200 && /"skipped":true/.test(await answer.text()))
    check("  and writes itself down as skipped", patches.some((p) => p.ok === true && /skipped/.test(String(p.detail))), patches)

    /* Every scheduled job: the lease, and a maxDuration it is told. */
    const crons = (JSON.parse(read("vercel.json")).crons as { path: string }[]).map((c) => c.path)
    for (const path of crons) {
      const file = `app${path}/route.ts`
      const src = code(file)
      check(`${path}: says its maxDuration and runs inside the lease with it`, /export const maxDuration = \d+/.test(src) && new RegExp(`recordCronRun\\("${path.replace(/\//g, "\\/")}", request, [^\\n]*\\{ maxDurationS: maxDuration \\}\\)`).test(src))
    }
  }

  console.log("\nThe smoke checks cover the critical paths; the load scripts stay off production")
  {
    const S = await import(pathToFileURL(join(root, "scripts/smoke-deploy.mjs")).href)
    const all = S.plan("https://x.vercel.app", "demo", false, { creator: "satori", product: "satori/loop-pack-1", checkoutProduct: "p-1", domain: "https://shop.example.com" }) as { path?: string; url?: string; skip?: string }[]
    const has = (p: string) => all.some((c) => c.path === p || c.url === p)
    check("home, pricing, robots, sitemap, health's companions, login", ["/", "/pricing", "/robots.txt", "/sitemap.xml", "/login"].every(has))
    check("a creator page, a product page, a website, a checkout render and a custom domain", has("/satori") && has("/satori/loop-pack-1") && has("https://x.vercel.app/w/demo") && has("/checkout?productId=p-1") && has("https://shop.example.com"))
    const bare = S.plan("https://x.vercel.app", undefined) as { skip?: string }[]
    check("  each one not configured is a visible skip, never silent", ["SMOKE_CREATOR", "SMOKE_PRODUCT", "SMOKE_CHECKOUT_PRODUCT", "SMOKE_DOMAIN"].every((v) => bare.some((c) => c.skip === v)))
    const wf = read(".github/workflows/post-deploy.yml")
    check("the post-deploy workflow passes them", ["SMOKE_CREATOR", "SMOKE_PRODUCT", "SMOKE_CHECKOUT_PRODUCT", "SMOKE_DOMAIN"].every((v) => wf.includes(`${v}:`)))
    const L = await import(pathToFileURL(join(root, "scripts/load/scenarios.mjs")).href)
    check("scenarios.mjs still refuses production", L.refuseTarget("https://storelib.com") !== null && L.refuseTarget("https://shop.storelib.com") !== null && L.refuseTarget("http://127.0.0.1:3993") === null)
    const sc = L.buildScenarios({ pages: ["/", "/blog", "/sitemap.xml"], productPath: "/satori/loop-pack-1" }).map((x: { name: string }) => x.name)
    check("  and runs the pages and product scenarios", sc.includes("page:/") && sc.includes("page:/blog") && sc.includes("product"), sc)
    const bench = code("scripts/load/local-bench.mjs")
    check("local-bench only ever aims at 127.0.0.1", /const base = `http:\/\/127\.0\.0\.1:\$\{port\}`/.test(bench) && !/--base/.test(bench))
    const P = await import(pathToFileURL(join(root, "scripts/pre-push.mjs")).href)
    const listed = P.listedSuites(read("scripts/run-push-tests.mjs")) as string[]
    check("pre-push reads the suites from the runner, this one included", listed.includes("tests/obs-r48.test.ts") && listed.length > 50)
    const picked = P.suitesFor(["lib/net/scrub.ts"], ["tests/a.test.ts", "tests/b.test.ts"], (s: string) => (s === "tests/a.test.ts" ? 'import { scrubSecrets } from "@/lib/net/scrub"' : "nothing"))
    check("  and picks the suites that read a changed file", JSON.stringify(picked) === '["tests/a.test.ts"]', picked)
  }

  clearInterval(keepAlive)
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  Object.assign(console, real)
  globalThis.fetch = realFetch
  console.error(e)
  process.exit(1)
})
