/**
 * ===========================================================================
 *  ROUND 46: VISITS TO STORELIB'S OWN PAGES FROM AN AI ASSISTANT
 * ===========================================================================
 *   PATHS      only Storelib's own public pages, normalised; private, /api,
 *              a creator's page, a query or a file refused
 *   SOURCE     the landing address's utm_source first, then the page's
 *              label only when it is a known assistant
 *   BROWSER    one count per tab session per assistant and page, only with
 *              a yes to analytics (and when it is given later), never in a
 *              frame, a preview or /admin, never with a cookie
 *   ROUTE      the real handler with the database's fetch stubbed: only
 *              { p_source, p_path } reaches the database, never an address
 *              or a user agent; another site's request and an unknown
 *              assistant count nothing; always 204; quiet before part 350
 *   SQL        part 350: RLS on, service role only, idempotent, the copy
 *              in migrations byte identical, its README row and check column
 *   ADMIN      storelib.com visits, top pages, the run-350 line and the
 *              words saying where the numbers come from
 *
 * Run with:  npm run test:push
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import { stripComments } from "./_source"

import { AI_VISITS_LABEL, AI_VISIT_ROUTE, MARKETING_SECTIONS, aiVisitPath, aiVisitSource, countedHost } from "@/lib/attribution/ai-visits"
import { AI_SOURCE_KEYS } from "@/lib/attribution/ai-sources"
import { buildAiFunnel, LANDINGS_PER_ASSISTANT } from "@/lib/attribution/ai-funnel"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => stripComments(read(p))

/* ── A minimal browser for lib/attribution/ai-visit-browser ─────────────── */

type Sent = { url: string; init: RequestInit }
function fakeBrowser(opts: { host?: string; path?: string; search?: string; consent: boolean; framed?: boolean }) {
  const store = new Map<string, string>()
  const listeners = new Map<string, Set<(e: unknown) => void>>()
  const sent: Sent[] = []
  const at = Math.floor(Date.now() / 1000)
  const cookie = { value: opts.consent ? `storelib_consent=2.p0.a1.m0.${at}` : "" }
  const win: Record<string, unknown> = {
    location: { hostname: opts.host ?? "storelib.com", pathname: opts.path ?? "/alternatives/gumroad", search: opts.search ?? "", protocol: "https:" },
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size
      },
    },
    addEventListener: (t: string, fn: (e: unknown) => void) => {
      if (!listeners.has(t)) listeners.set(t, new Set())
      listeners.get(t)!.add(fn)
    },
    removeEventListener: (t: string, fn: (e: unknown) => void) => listeners.get(t)?.delete(fn),
    dispatchEvent: (e: { type: string }) => {
      for (const fn of listeners.get(e.type) ?? []) fn(e)
      return true
    },
  }
  win.self = win
  win.top = opts.framed ? {} : win
  const g = globalThis as unknown as Record<string, unknown>
  g.window = win
  g.document = { get cookie() { return cookie.value }, set cookie(v: string) { cookie.value = v } }
  g.sessionStorage = win.sessionStorage
  g.fetch = (url: string, init: RequestInit) => {
    sent.push({ url, init })
    return Promise.resolve(new Response(null, { status: 204 }))
  }
  const giveConsent = () => {
    cookie.value = `storelib_consent=2.p0.a1.m0.${at}`
    for (const fn of listeners.get("storelib:consent-changed") ?? []) fn({ type: "storelib:consent-changed" })
  }
  return { sent, store, giveConsent, listeners }
}

async function main() {
  /* ── Paths ─────────────────────────────────────────────────────────── */
  console.log("\nWhich storelib.com paths are counted\n")
  {
    check("the home page and a marketing page", aiVisitPath("/") === "/" && aiVisitPath("/alternatives/gumroad") === "/alternatives/gumroad" && aiVisitPath("/pricing") === "/pricing")
    check("lower case, no trailing slash", aiVisitPath("/Alternatives/Gumroad/") === "/alternatives/gumroad" && aiVisitPath("/BLOG/a-post") === "/blog/a-post")
    check("a query and a hash are cut off when not strict", aiVisitPath("/pricing?utm_source=chatgpt.com#plans") === "/pricing")
    check("a path with a query or a hash is refused when strict (what the route uses)", aiVisitPath("/pricing?utm_source=chatgpt.com", { strict: true }) === null && aiVisitPath("/pricing#x", { strict: true }) === null)
    check("private paths refused", ["/admin", "/admin/seo", "/app", "/app/products", "/checkout", "/dashboard", "/library", "/login", "/onboarding", "/sell", "/signup/verify", "/receipt/abc"].every((p) => aiVisitPath(p) === null))
    check("/api and /_next refused", aiVisitPath("/api/track/ai-visit") === null && aiVisitPath("/_next/static/x") === null)
    check("/sell/<use case> is a landing page, /sell is not", aiVisitPath("/sell/digital-art") === "/sell/digital-art" && aiVisitPath("/sell") === null)
    check("a creator's page on storelib.com is not Storelib's", ["/maya", "/p/some-product", "/c/some-community", "/community/some-community", "/u/maya", "/products/x", "/wishlist"].every((p) => aiVisitPath(p) === null))
    check("but /community itself is", aiVisitPath("/community") === "/community")
    check("a file, two slashes, a dot segment, an encoded oddity, a relative path refused", ["/blog/feed.xml", "//evil.com", "/blog//x", "/blog/../admin", "/blog/%3Cscript%3E", "pricing", "", " "].every((p) => aiVisitPath(p) === null))
    check("not a string is nothing", aiVisitPath(42) === null && aiVisitPath(null) === null && aiVisitPath({ path: "/" }) === null)
    check("at most 200 characters", aiVisitPath(`/blog/${"a".repeat(194)}`)?.length === 200 && aiVisitPath(`/blog/${"a".repeat(195)}`) === null)
    /* Changed on purpose (r52): Storelib's pages are under app/(storelib), the published websites' root is app/(site). */
    const appDirs = [...readdirSync(join(process.cwd(), "app/(storelib)")), ...readdirSync(join(process.cwd(), "app/(storelib)/(marketing)")), ...readdirSync(join(process.cwd(), "app/(storelib)/(auth)"))]
    const missing = MARKETING_SECTIONS.filter((s) => s && !appDirs.includes(s))
    check("every counted section is a real route under app/", missing.length === 0, missing)
  }

  /* ── Source ────────────────────────────────────────────────────────── */
  console.log("\nWhich assistant, decided on the server\n")
  {
    const ref = (s: string) => new URL(`https://storelib.com/alternatives/gumroad${s}`)
    check("utm_source on the landing address wins over the page's label", aiVisitSource({ refererUrl: ref("?utm_source=chatgpt.com"), clientSource: "perplexity" }) === "chatgpt")
    check("no tag: the page's label, when it is a known assistant", aiVisitSource({ refererUrl: ref(""), clientSource: "perplexity" }) === "perplexity")
    check("the Referer stripped on the second hop: the known label still counts", aiVisitSource({ refererUrl: null, clientSource: "claude" }) === "claude")
    check("an unknown label is never counted", aiVisitSource({ refererUrl: ref(""), clientSource: "made-up-bot" }) === null && aiVisitSource({ refererUrl: null, clientSource: "ChatGPT" }) === null && aiVisitSource({ refererUrl: null, clientSource: 1 }) === null)
    check("a tag that is not an assistant does not invent one", aiVisitSource({ refererUrl: ref("?utm_source=newsletter"), clientSource: null }) === null)
    check("every known key is accepted", AI_SOURCE_KEYS.every((k) => aiVisitSource({ refererUrl: null, clientSource: k }) === k))
    check("counted only on storelib.com: not a creator's host, not a preview deployment", countedHost("storelib.com", "storelib.com", true) && countedHost("www.storelib.com", "storelib.com", true) && !countedHost("maya.storelib.com", "storelib.com", true) && !countedHost("x.vercel.app", "storelib.com", true) && !countedHost("localhost", "storelib.com", true) && countedHost("localhost:3000", "storelib.com", false))
  }

  /* ── The browser ───────────────────────────────────────────────────── */
  console.log("\nOne count per tab session, only with consent\n")
  {
    const b = await import("@/lib/attribution/ai-visit-browser")
    let env = fakeBrowser({ consent: true })
    b.noteAiVisit("chatgpt", "/alternatives/gumroad")
    b.noteAiVisit("chatgpt", "/alternatives/gumroad")
    check("sent once for the same assistant and page", env.sent.length === 1, env.sent.length)
    const body = JSON.parse(String(env.sent[0]?.init.body ?? "{}"))
    check("to the route, with { source, path } and nothing else", env.sent[0]?.url === AI_VISIT_ROUTE && Object.keys(body).sort().join(",") === "path,source" && body.source === "chatgpt" && body.path === "/alternatives/gumroad")
    check("no cookie goes with it", env.sent[0]?.init.credentials === "omit")
    b.noteAiVisit("chatgpt", "/pricing")
    check("another page is another count", env.sent.length === 2)
    /* A reload: a new document (memory gone), the same tab session. */
    b.resetAiVisitMemory()
    const kept = new Map(env.store)
    env = fakeBrowser({ consent: true })
    for (const [k, v] of kept) env.store.set(k, v)
    b.noteAiVisit("chatgpt", "/alternatives/gumroad")
    check("a reload in the same tab session is not another visit", env.sent.length === 0)

    b.resetAiVisitMemory()
    env = fakeBrowser({ consent: false })
    b.noteAiVisit("perplexity", "/pricing")
    check("no consent: nothing sent and nothing stored", env.sent.length === 0 && env.store.size === 0)
    env.giveConsent()
    check("a yes given later on the page sends it then, once", env.sent.length === 1)
    env.giveConsent()
    check("  and only once", env.sent.length === 1)

    b.resetAiVisitMemory()
    env = fakeBrowser({ consent: true, framed: true })
    b.noteAiVisit("chatgpt", "/pricing")
    check("never inside a frame", env.sent.length === 0)
    b.resetAiVisitMemory()
    env = fakeBrowser({ consent: true, path: "/admin/audience" })
    b.noteAiVisit("chatgpt", "/pricing")
    check("never in /admin", env.sent.length === 0)
    b.resetAiVisitMemory()
    env = fakeBrowser({ consent: true, search: "?preview=1" })
    b.noteAiVisit("chatgpt", "/pricing")
    check("never on a preview", env.sent.length === 0)
    b.resetAiVisitMemory()
    env = fakeBrowser({ consent: true, host: "maya.storelib.com" })
    b.noteAiVisit("chatgpt", "/pricing")
    check("never on a creator's host", env.sent.length === 0)
    b.resetAiVisitMemory()
    env = fakeBrowser({ consent: true })
    b.noteAiVisit("chatgpt", "/checkout")
    b.noteAiVisit(null, "/pricing")
    check("a private path or no assistant sends nothing", env.sent.length === 0)

    const browser = code("lib/attribution/ai-visit-browser.ts")
    check("consent is asked at the moment of sending", /if \(!hasConsent\("analytics"\)\) return false\s*markSent\(key\)/.test(browser))
    const capture = code("components/attribution/capture-platform-touch.tsx")
    check("the capture counts only an arrival that names an assistant, after the frame, preview and /admin checks", /if \(touch\?\.ai_source\) noteAiVisit\(touch\.ai_source, touch\.landing_path\)/.test(capture) && capture.indexOf("window.self !== window.top") < capture.indexOf("noteAiVisit("))
    check("the touch is still stored only with consent", /if \(!hasConsent\("analytics"\)\) return touch\s*const kept = readStore\(now\)\s*kept\[PLATFORM_SCOPE\]/.test(code("lib/attribution/browser.ts")))
    check("saying no clears this tab's note too", /sessionStorage\.removeItem\(k\)/.test(code("lib/consent/client.ts")))
  }

  /* ── The route ─────────────────────────────────────────────────────── */
  console.log("\nThe route: aggregate only, always 204\n")
  {
    const env = process.env as Record<string, string | undefined>
    env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co"
    env.SUPABASE_SERVICE_ROLE_KEY = "placeholder"
    env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
    const calls: { url: string; body: string; headers: string }[] = []
    let answer: () => Response = () => new Response("null", { status: 200, headers: { "Content-Type": "application/json" } })
    ;(globalThis as Record<string, unknown>).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
      calls.push({ url, body: typeof init?.body === "string" ? init.body : input instanceof Request ? await input.clone().text() : "", headers: [...h.entries()].map(([k, v]) => `${k}: ${v}`).join("\n") })
      return answer()
    }
    const { POST } = await import("@/app/api/track/ai-visit/route")
    const { NextRequest } = await import("next/server")
    let ip = 1
    const post = (body: unknown, headers: Record<string, string> = {}) =>
      POST(
        new NextRequest("https://storelib.com/api/track/ai-visit", {
          method: "POST",
          body: typeof body === "string" ? body : JSON.stringify(body),
          headers: {
            host: "storelib.com",
            origin: "https://storelib.com",
            referer: "https://storelib.com/alternatives/gumroad?utm_source=chatgpt.com",
            "sec-fetch-site": "same-origin",
            "user-agent": "Mozilla/5.0 (Macintosh) UA-MARKER",
            "x-forwarded-for": `203.0.113.${ip++}`,
            cookie: "visitor_id=COOKIE-MARKER",
            ...headers,
          },
        }),
      )
    let res = await post({ source: "perplexity", path: "/alternatives/gumroad" })
    const rpc = calls.find((c) => c.url.includes("/rest/v1/rpc/bump_platform_ai_visit"))
    check("answers 204 with nothing set", res.status === 204 && !res.headers.get("set-cookie"))
    check("calls bump_platform_ai_visit", !!rpc, calls.map((c) => c.url))
    const sentBody = JSON.parse(rpc?.body || "{}")
    check("with the server's assistant (the landing tag), not the page's label", sentBody.p_source === "chatgpt" && sentBody.p_path === "/alternatives/gumroad")
    check("and only { p_source, p_path }: no address, no user agent, no cookie", Object.keys(sentBody).sort().join(",") === "p_path,p_source" && !calls.some((c) => /203\.0\.113|UA-MARKER|COOKIE-MARKER/.test(c.body + c.headers + c.url)))

    const before = calls.length
    res = await post({ source: "chatgpt", path: "/pricing" }, { "sec-fetch-site": "cross-site", origin: "https://evil.example" })
    check("another site's request counts nothing", res.status === 204 && calls.length === before)
    await post({ source: "chatgpt", path: "/pricing" }, { referer: "https://evil.example/x" })
    check("a Referer from elsewhere counts nothing", calls.length === before)
    await post({ source: "chatgpt", path: "/pricing" }, { host: "maya.storelib.com", origin: "https://maya.storelib.com", referer: "https://maya.storelib.com/" })
    check("a creator's host counts nothing", calls.length === before)
    await post({ source: "madeup", path: "/pricing" }, { referer: "https://storelib.com/pricing" })
    check("an unknown assistant counts nothing", calls.length === before)
    await post({ source: "chatgpt", path: "/admin" })
    await post({ source: "chatgpt", path: "/pricing?x=1" })
    await post({ source: "chatgpt", path: "/api/track/ai-visit" })
    check("a private, query or /api path counts nothing", calls.length === before)
    res = await post("not json")
    check("a body that is not JSON: 204, nothing", res.status === 204 && calls.length === before)
    res = await post({ source: "claude", path: "/pricing" }, { referer: "" })
    check("Referer stripped: the known label still counts", calls.length === before + 1 && JSON.parse(calls[calls.length - 1].body).p_source === "claude")

    /* Before part 350: the function is missing; the route answers 204 and stops asking for a while. */
    answer = () => new Response(JSON.stringify({ code: "PGRST202", message: "Could not find the function public.bump_platform_ai_visit" }), { status: 404, headers: { "Content-Type": "application/json" } })
    res = await post({ source: "chatgpt", path: "/pricing" })
    const after = calls.length
    const res2 = await post({ source: "chatgpt", path: "/features" })
    check("before part 350: 204, and the next count does not ask again", res.status === 204 && res2.status === 204 && calls.length === after)

    const route = code("app/api/track/ai-visit/route.ts")
    check("the route never reads the user agent, cookies or the address itself", !/user-agent|cookies|x-forwarded-for|x-real-ip|\.ip\b/.test(route))
    check("limited per address with the shared limiter, memory first", /rateLimit\(\{ bucket: "ai-visit", subjects: \[addressSubject\(req\)\], windows: LIMITS\.aiVisit, memoryFirst: true \}\)/.test(route))
    check("writes through the RPC only, never a table", /\.rpc\("bump_platform_ai_visit"/.test(route) && !/\.from\(/.test(route))
    const csp = read("vercel.json")
    check("same origin, so connect-src 'self' already allows it", /connect-src 'self'/.test(csp) && AI_VISIT_ROUTE.startsWith("/api/"))
  }

  /* ── SQL ───────────────────────────────────────────────────────────── */
  console.log("\nPart 350\n")
  {
    const sql = read("supabase/sql/run-now/350_platform_ai_visits.sql")
    const mig = readdirSync(join(process.cwd(), "supabase/migrations")).find((f) => /^2027\d{4}_platform_ai_visits\.sql$/.test(f))
    check("a byte identical copy in migrations", !!mig && read(`supabase/migrations/${mig}`) === sql)
    check("the table, its key and its checks, if not exists", /CREATE TABLE IF NOT EXISTS public\.platform_ai_visits \(day date NOT NULL, ai_source text NOT NULL CHECK \(ai_source ~ '\^\[a-z_\]\{2,20\}\$'\), landing_path text NOT NULL CHECK \(char_length\(landing_path\) BETWEEN 1 AND 200/.test(sql) && /PRIMARY KEY \(day, ai_source, landing_path\)/.test(sql))
    check("row level security on, no policy for anyone", /ALTER TABLE public\.platform_ai_visits ENABLE ROW LEVEL SECURITY/.test(sql) && !/CREATE POLICY/i.test(sql))
    check("the table: nothing for anon or authenticated, all for the service role", /REVOKE ALL ON public\.platform_ai_visits FROM PUBLIC, anon, authenticated/.test(sql) && /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.platform_ai_visits TO service_role/.test(sql))
    check("the function: executable by the service role only", /REVOKE ALL ON FUNCTION public\.bump_platform_ai_visit\(text, text\) FROM PUBLIC, anon, authenticated/.test(sql) && /GRANT EXECUTE ON FUNCTION public\.bump_platform_ai_visit\(text, text\) TO service_role/.test(sql) && !/GRANT EXECUTE[^;]*(anon|authenticated)/.test(sql))
    check("  not a definer function, so it can do nothing the service role cannot", /SECURITY INVOKER/.test(sql) && !/SECURITY DEFINER/.test(sql))
    check("adds one for today in UTC, as an upsert", /\(now\(\) AT TIME ZONE 'utc'\)::date/.test(sql) && /ON CONFLICT \(day, ai_source, landing_path\) DO UPDATE SET visits = v\.visits \+ 1/.test(sql))
    check("no column for a visitor, an address, a user agent or a referrer", !/\b(ip|ip_hash|user_agent|visitor_id|referrer|cookie)\b\s+(text|inet|uuid)/i.test(sql))
    check("safe to run again", /CREATE OR REPLACE FUNCTION/.test(sql) && /Safe to run again/.test(sql))
    check("its README row", /\| `350_platform_ai_visits\.sql` \|/.test(read("supabase/sql/run-now/README.md")))
    check("its column in the check after, RLS and anon refused", /as p350_platform_ai_visits[,;]/.test(read("supabase/sql/run-now/99_check_after.sql")) && /has_function_privilege\('anon', 'public\.bump_platform_ai_visit\(text, text\)', 'EXECUTE'\)/.test(read("supabase/sql/run-now/99_check_after.sql")))
    check("listed for the admin's schema check", /platform_ai_visits: \{ columns: \["day", "ai_source", "landing_path", "visits"\], later: true \}/.test(read("lib/admin/schema-expectations.ts")))
  }

  /* ── The admin ─────────────────────────────────────────────────────── */
  console.log("\nThe Audience view's AI assistants group\n")
  {
    const f = buildAiFunnel({
      views: [{ visitor_id: "a", referrer_domain: "chatgpt.com", utm_source: null }],
      siteVisits: [
        { ai_source: "chatgpt", landing_path: "/alternatives/gumroad", visits: 70 },
        { ai_source: "chatgpt", landing_path: "/alternatives/gumroad", visits: "50" },
        { ai_source: "chatgpt", landing_path: "/pricing", visits: 30 },
        { ai_source: "chatgpt", landing_path: "/", visits: 20 },
        { ai_source: "chatgpt", landing_path: "/features", visits: 10 },
        { ai_source: "perplexity", landing_path: "/", visits: 5 },
        { ai_source: "nobody", landing_path: "/", visits: 99 },
        { ai_source: "gemini", landing_path: "/", visits: -3 },
      ],
      signups: [{ user_id: "u1", first_ai_source: null, last_ai_source: "chatgpt" }],
      signupsAll: 10,
      paidUsers: new Set(["u1"]),
      saleUsers: new Set(),
    })
    const chat = f.rows.find((r) => r.key === "chatgpt")
    check("storelib.com visits per assistant, days added up; unknown and negative left out", chat?.siteVisits === 180 && f.siteVisits === 185 && !f.rows.some((r) => r.key === "gemini"))
    check("the funnel in one row: visits, sign ups, paid", chat?.siteVisits === 180 && chat?.signups === 1 && chat?.paidPlan === 1)
    const chatPages = f.landings.filter((l) => l.key === "chatgpt")
    check(`top ${LANDINGS_PER_ASSISTANT} pages per assistant, the most first`, chatPages.length === LANDINGS_PER_ASSISTANT && chatPages[0].path === "/alternatives/gumroad" && chatPages[0].visits === 120 && f.landings.some((l) => l.key === "perplexity"))
    check("before part 350: siteVisits is null, not 0", buildAiFunnel({ views: [], siteVisits: null, signups: [], signupsAll: 0, paidUsers: new Set(), saleUsers: new Set() }).siteVisits === null)

    const view = code("lib/admin/views/platform.ts")
    check("read from platform_ai_visits for the same 30 days, quiet when the table is missing", /from\("platform_ai_visits"\)/.test(view) && /\.gte\("day", since\.slice\(0, 10\)\)/.test(view) && /if \(missingTable\(error\)\) return null/.test(view))
    const panel = read("app/(storelib)/admin/_console/view-platform.tsx")
    check("the panel names where the numbers come from", AI_VISITS_LABEL === "Counted by Storelib, visitors who accepted analytics, where the assistant is known." && /\{AI_VISITS_LABEL\}/.test(panel))
    check("  says what to run before part 350", /Run SQL part 350 to count visits to storelib\.com\./.test(panel))
    check("  storelib.com visits, then sign ups, then paid", /storelib\.com visits, then `/.test(panel) && /Storelib sign ups, then \{num\(ai\.paidPlan\)\} on a paid plan/.test(panel))
    check("  the top pages per assistant", /label="Top storelib\.com pages per assistant"/.test(panel))
    check("  store views kept apart from storelib.com visits", /label: "Store views"/.test(panel) && /Page views on creators&apos; storefronts/.test(panel))
  }

  /* ── Copy ──────────────────────────────────────────────────────────── */
  console.log("\nThe words\n")
  {
    const files = ["app/(storelib)/admin/_console/view-platform.tsx", "lib/attribution/ai-visits.ts", "lib/attribution/ai-visit-browser.ts", "app/api/track/ai-visit/route.ts", "components/attribution/capture-platform-touch.tsx", "supabase/sql/run-now/350_platform_ai_visits.sql"]
    const text = files.map(read).join("\n")
    check("no em dash", !text.includes("—"))
    check("none of the banned words", !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform|passive income)\b/i.test(text))
    check("the probe that renders the panel exists", statSync(join(process.cwd(), "scripts/check-admin-ai-visits.mjs")).isFile())
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log("\nFailures:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
