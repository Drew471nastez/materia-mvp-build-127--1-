/**
 * Round AX (track AX-1): the session cookie under `__Host-`, so a site published on <slug>.storelib.com can no
 * longer plant its owner's session in a visitor's browser (login CSRF) by setting `sb-<ref>-auth-token` with
 * Domain=storelib.com. Behavioural: real Cookie headers with duplicates, the real @supabase/ssr server client,
 * the browser adapter against a cookie jar that follows the browser's rules. The real proxy is measured by
 * scripts/check-session-cookies-ax.mjs.
 */
import { readFileSync } from "node:fs"
/* Next's own cookie parser (the one NextRequest.cookies uses); next/server itself is stubbed in suites. */
import edgeCookies from "next/dist/compiled/@edge-runtime/cookies/index.js"
import { createServerClient } from "@supabase/ssr"
import {
  cookiePairs,
  HOST_PREFIX,
  isSessionCookieName,
  outgoingName,
  plantedExpiries,
  plantedPaths,
  sessionView,
  writesHostCookies,
} from "@/lib/supabase/host-session"
import { readSessionFromCookies, sessionCookieChunks, sessionCookieRemovals, sessionCookieWrites } from "@/lib/supabase/session-jar"
import { carriesSignIn } from "@/lib/auth/no-session-paths"
import { mayBeSignedIn } from "@/lib/auth/session-hint"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const code = (p: string) => readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
const KEY = "sb-abcdefgh-auth-token"
const HOST = `${HOST_PREFIX}${KEY}`
/* One clock for the whole run, so a value built twice is the same value. */
const T0 = Math.floor(Date.now() / 1000)
const now = () => T0
const sessionOf = (who: string, expiresIn = 3000) => ({ access_token: `at-${who}`, token_type: "bearer", expires_in: 3600, expires_at: now() + expiresIn, refresh_token: `rt-${who}`, user: { id: who, aud: "authenticated", role: "authenticated", email: `${who}@example.com`, app_metadata: {}, user_metadata: {} } })
const stored = (who: string) => `base64-${Buffer.from(JSON.stringify(sessionOf(who)), "utf8").toString("base64url")}`
const shown = (pairs: { name: string; value: string }[], name: string) => pairs.filter((c) => c.name === name).map((c) => c.value)

async function main() {
  console.log("\nThe hole, as it was: two cookies with one name, and Next keeps whichever came last")
  {
    const header = `${KEY}=${stored("planter")}; ${KEY}=${stored("visitor")}`
    check("Next's own parser hides the second copy (one value per name)", new edgeCookies.RequestCookies(new Headers({ cookie: header })).getAll().filter((c) => c.name === KEY).length === 1)
    check("cookiePairs keeps both, in the order sent", cookiePairs(header).filter((c) => c.name === KEY).length === 2)
    check("and decodes values as the browser sent them", cookiePairs("a=b%20c; d=e")[0].value === "b c" && cookiePairs("a=b%20c; d=e")[1].value === "e")
  }

  console.log("\nRead: the __Host- copy wins and the old name is never trusted beside it")
  {
    const v = sessionView(cookiePairs(`${KEY}=${stored("planter")}; ${HOST}=${stored("visitor")}; other=1`), KEY)
    check("Supabase is shown the __Host- value under its own name", shown(v.cookies, KEY).length === 1 && shown(v.cookies, KEY)[0] === stored("visitor"))
    check("the planted old name is marked shadowed (to expire), never migrated", v.shadowed.includes(KEY) && v.migrate.length === 0)
    check("other cookies pass through untouched", shown(v.cookies, "other")[0] === "1")
    const chunked = sessionView(cookiePairs(`${HOST}.0=aa; ${HOST}.1=bb; ${KEY}=${stored("planter")}`), KEY)
    check("a chunked __Host- session is shown as Supabase's chunks, and a planted whole one is ignored", shown(chunked.cookies, `${KEY}.0`)[0] === "aa" && shown(chunked.cookies, `${KEY}.1`)[0] === "bb" && shown(chunked.cookies, KEY).length === 0)
    const planterFirst = sessionView(cookiePairs(`${HOST}=${stored("visitor")}; ${KEY}.0=x; ${KEY}.1=y`), KEY)
    check("planted chunks beside a whole __Host- session are ignored too", shown(planterFirst.cookies, `${KEY}.0`).length === 0 && planterFirst.shadowed.length === 2)
  }

  console.log("\nRead: only the old name (a browser from before this round): nobody is signed out")
  {
    const v = sessionView(cookiePairs(`${KEY}=${stored("visitor")}`), KEY)
    check("the session is read", shown(v.cookies, KEY)[0] === stored("visitor"))
    check("and listed to move to __Host-", v.migrate.length === 1 && v.migrate[0].name === KEY && v.migrate[0].value === stored("visitor"))
    const chunks = sessionView(cookiePairs(`${KEY}.0=aa; ${KEY}.1=bb`), KEY)
    check("chunked old-name sessions too", chunks.migrate.map((c) => c.name).join(",") === `${KEY}.0,${KEY}.1` && shown(chunks.cookies, `${KEY}.1`)[0] === "bb")
  }

  console.log("\nRead: the old name twice, or in two shapes, and no __Host- copy: neither is adopted")
  {
    for (const [label, header] of [
      ["planted first", `${KEY}=${stored("planter")}; ${KEY}=${stored("visitor")}`],
      ["planted last", `${KEY}=${stored("visitor")}; ${KEY}=${stored("planter")}`],
      ["a planted chunk twice", `${KEY}.0=aa; ${KEY}.1=bb; ${KEY}.0=zz`],
      ["a planted whole value beside the visitor's chunks", `${KEY}.0=aa; ${KEY}.1=bb; ${KEY}=${stored("planter")}`],
    ] as const) {
      const v = sessionView(cookiePairs(header), KEY)
      check(`${label}: nothing is shown to Supabase, nothing migrated, all marked tossed`, v.cookies.every((c) => !c.name.startsWith(KEY)) && v.migrate.length === 0 && v.tossed.length > 0)
    }
    const fromJar = sessionView([{ name: KEY, value: stored("planter") }], KEY, [KEY])
    check("a duplicate counted in the raw header is honoured when the values come from Next's one-per-name jar", fromJar.cookies.length === 0 && fromJar.tossed.includes(KEY))
    const verifier = sessionView(cookiePairs(`${KEY}-code-verifier=a; ${KEY}-code-verifier=b`), KEY)
    check("the PKCE verifier is guarded the same way", verifier.tossed.includes(`${KEY}-code-verifier`) && verifier.cookies.length === 0)
    const hostVerifier = sessionView(cookiePairs(`${KEY}-code-verifier=planted; ${HOST}-code-verifier=mine`), KEY)
    check("and a __Host- verifier wins over a planted one", shown(hostVerifier.cookies, `${KEY}-code-verifier`)[0] === "mine")
    check("the marker of the earlier move is not a session cookie", sessionView(cookiePairs("sb-host-only=1; sb-host-only=1"), KEY).tossed.length === 0)
  }

  console.log("\nThe stored session as the phone and the business switch read it (session-jar)")
  {
    check("the __Host- copy", (await readSessionFromCookies(KEY, `${KEY}=${stored("planter")}; ${HOST}=${stored("visitor")}`))?.includes('"visitor"') === true)
    check("an old-name session alone", (await readSessionFromCookies(KEY, `${KEY}=${stored("visitor")}`))?.includes('"visitor"') === true)
    check("the old name twice: nothing", (await readSessionFromCookies(KEY, `${KEY}=${stored("planter")}; ${KEY}=${stored("visitor")}`)) === null)
  }

  console.log("\nWrite: __Host- on HTTPS with the old name expired; the old name on http://localhost")
  {
    const secure = sessionCookieWrites(KEY, JSON.stringify(sessionOf("visitor")), `${KEY}=${stored("visitor")}`, true)
    const set = secure.filter((l) => !/max-age=0/.test(l))
    check("the session is written under __Host-", set.length >= 1 && set.every((l) => l.startsWith(`${HOST}`)))
    check("with the attributes a __Host- cookie needs (path=/, secure, no domain)", set.every((l) => /; path=\/;/.test(l) && /; secure/.test(l) && !/domain=/i.test(l)))
    check("and the old name is expired", secure.some((l) => l.startsWith(`${KEY}=;`) && /max-age=0/.test(l)))
    const local = sessionCookieWrites(KEY, JSON.stringify(sessionOf("visitor")), "", false)
    check("http://localhost keeps the old name, no secure", local.length === 1 && local[0].startsWith(`${KEY}=`) && !/secure/.test(local[0]))
    const held = sessionCookieWrites(KEY, JSON.stringify(sessionOf("visitor")), `${HOST}=${stored("visitor")}`, false)
    check("a browser already holding __Host- is written __Host- even when asked as not secure", held.some((l) => l.startsWith(`${HOST}=`) && /secure/.test(l)))
    const big = JSON.stringify({ ...sessionOf("visitor"), user: { ...sessionOf("visitor").user, user_metadata: { blob: "x".repeat(5000) } } })
    const chunks = sessionCookieChunks(KEY, big, [`${KEY}`, `${HOST}.2`], true)
    check("a large session is chunked under __Host-, stale chunks and every old name expired", chunks.set.length >= 2 && chunks.set.every((c) => c.name.startsWith(`${HOST}.`)) && chunks.expire.includes(KEY) && (chunks.set.length > 2 || chunks.expire.includes(`${HOST}.2`)))
    const gone = sessionCookieRemovals(KEY, `${KEY}=a; ${HOST}=b; ${HOST}.0=c; other=1`, false)
    check("sign out removes both names, the __Host- ones with secure", gone.length === 3 && gone.filter((l) => l.startsWith(HOST_PREFIX)).every((l) => /secure/.test(l)) && !gone.some((l) => l.startsWith("other")))
    check("outgoingName moves only the session's names", outgoingName(KEY, KEY, true) === HOST && outgoingName(`${KEY}.1`, KEY, true) === `${HOST}.1` && outgoingName("sl_lang", KEY, true) === "sl_lang" && outgoingName(KEY, KEY, false) === KEY)
    check("writesHostCookies: https yes, localhost no, plain http no", writesHostCookies({ https: true, localhost: false, pairs: [], key: KEY }) && !writesHostCookies({ https: true, localhost: true, pairs: [], key: KEY }) && !writesHostCookies({ https: false, localhost: false, pairs: [], key: KEY }))
  }

  console.log("\nCleaning up a planted copy touches only what a subdomain could have set")
  {
    const lines = plantedExpiries([KEY], "storelib.com", "/app/products")
    check("every line names Domain=.storelib.com and Max-Age=0", lines.length > 0 && lines.every((l) => /Domain=\.storelib\.com/.test(l) && /Max-Age=0/.test(l)))
    check("on / and every parent of the page", ["/", "/app", "/app/", "/app/products"].every((p) => lines.some((l) => l.includes(`Path=${p};`))))
    check("bounded on a deep path", plantedPaths("/" + Array.from({ length: 40 }, (_, i) => `s${i}`).join("/")).length <= 17)
  }

  console.log("\nThe real @supabase/ssr server client, through the view")
  {
    const clientFor = (header: string) => {
      const pairs = cookiePairs(header)
      return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, "anon", {
        cookies: { getAll: () => sessionView(pairs, KEY).cookies, setAll: () => {} },
      })
    }
    const quiet = console.warn
    console.warn = () => {}
    try {
      const a = await clientFor(`${KEY}=${stored("planter")}; ${HOST}=${stored("visitor")}`).auth.getSession()
      check("a planted old name beside the visitor's __Host- session: Supabase sees the visitor", a.data.session?.user?.id === "visitor")
      const b = await clientFor(`${KEY}=${stored("planter")}; ${KEY}=${stored("visitor")}`).auth.getSession()
      check("the old name twice: Supabase sees nobody (not the planter)", b.data.session === null)
      const c = await clientFor(`${KEY}=${stored("visitor")}`).auth.getSession()
      check("an old-name session alone: still signed in", c.data.session?.user?.id === "visitor")
    } finally {
      console.warn = quiet
    }
  }

  console.log("\nThe browser client, against a cookie jar with the browser's own rules")
  {
    type Jar = { name: string; value: string; domain: string | null; path: string; secure: boolean; at: number }[]
    const jar: Jar = []
    let tick = 0
    const loc = { protocol: "https:", hostname: "storelib.com", pathname: "/app/products" }
    const write = (line: string, fromHost: string) => {
      const [pair, ...attrs] = line.split(";").map((s) => s.trim())
      const eq = pair.indexOf("=")
      const name = pair.slice(0, eq)
      const value = pair.slice(eq + 1)
      let domain: string | null = null
      let path = "/"
      let secure = false
      let maxAge: number | null = null
      for (const a of attrs) {
        const [k, v = ""] = a.split("=")
        const key = k.toLowerCase()
        if (key === "domain") domain = v.replace(/^\./, "").toLowerCase()
        else if (key === "path") path = v
        else if (key === "secure") secure = true
        else if (key === "max-age") maxAge = Number(v)
      }
      if (domain && fromHost !== domain && !fromHost.endsWith(`.${domain}`)) return
      if (name.startsWith("__Host-") && (!secure || domain || path !== "/" || fromHost !== loc.hostname)) return
      const hostOnly = domain === null
      const id = (c: Jar[number]) => c.name === name && c.path === path && (hostOnly ? c.domain === null : c.domain === domain)
      const at = jar.findIndex(id)
      if (at >= 0) jar.splice(at, 1)
      if (maxAge !== null && maxAge <= 0) return
      jar.push({ name, value, domain: hostOnly ? null : domain, path, secure, at: tick++ })
      if (hostOnly && fromHost !== loc.hostname) jar.pop()
    }
    const read = () =>
      jar
        .filter((c) => loc.pathname === c.path || loc.pathname.startsWith(c.path.endsWith("/") ? c.path : `${c.path}/`) || c.path === "/")
        .sort((a, b) => b.path.length - a.path.length || a.at - b.at)
        .map((c) => `${c.name}=${c.value}`)
        .join("; ")
    const g = globalThis as unknown as { document?: unknown; location?: unknown }
    g.document = { get cookie() { return read() }, set cookie(line: string) { write(line, loc.hostname) } }
    g.location = loc
    const { browserSessionCookies } = await import("../lib/supabase/client")

    /* The visitor's own old-name session (host-only), then a published site plants its owner's beside it. */
    write(`${KEY}=${stored("visitor")}; path=/; max-age=1000; samesite=lax; secure`, "storelib.com")
    write(`${KEY}=${stored("planter")}; domain=storelib.com; path=/app; max-age=1000`, "evil.storelib.com")
    write(`${KEY}=${stored("planter")}; domain=storelib.com; path=/; max-age=1000`, "evil.storelib.com")
    check("(the jar now sends the old name three times, the planter's first)", cookiePairs(read()).filter((c) => c.name === KEY).length === 3 && cookiePairs(read())[0].value === stored("planter"))
    const first = browserSessionCookies.getAll()
    check("the browser client is shown the visitor's own session", shown(first, KEY)[0] === stored("visitor"))
    check("the planted copies are gone from the jar, on every path", !jar.some((c) => c.domain === "storelib.com"))
    check("the visitor's session now sits under __Host- (secure, host-only, path /)", jar.some((c) => c.name === HOST && c.value === encodeURIComponent(stored("visitor")) && c.secure && c.domain === null && c.path === "/"))
    check("and the old name is gone", !jar.some((c) => c.name === KEY))

    write(`${KEY}=${stored("planter")}; domain=storelib.com; path=/; max-age=1000`, "evil.storelib.com")
    write(`${HOST}=${stored("planter")}; path=/; secure; max-age=1000`, "evil.storelib.com")
    write(`${HOST}=${stored("planter")}; domain=storelib.com; path=/; secure; max-age=1000`, "evil.storelib.com")
    check("a published site cannot set or replace the __Host- cookie", jar.filter((c) => c.name === HOST).length === 1 && jar.find((c) => c.name === HOST)?.value === encodeURIComponent(stored("visitor")))
    check("a later plant under the old name is ignored", shown(browserSessionCookies.getAll(), KEY)[0] === stored("visitor"))

    browserSessionCookies.setAll([{ name: KEY, value: stored("renewed"), options: { path: "/", maxAge: 400 * 86400, sameSite: "lax", secure: true } }])
    check("a renewal is written under __Host-", jar.find((c) => c.name === HOST)?.value === encodeURIComponent(stored("renewed")))
    browserSessionCookies.setAll([{ name: KEY, value: "", options: { path: "/", maxAge: 0, sameSite: "lax", secure: true } }])
    check("sign out removes the __Host- cookie", !jar.some((c) => c.name === HOST))

    /* Local development: http://localhost cannot hold a __Host- cookie. */
    jar.length = 0
    loc.protocol = "http:"
    loc.hostname = "localhost"
    process.env.NEXT_PUBLIC_MAIN_DOMAIN = "localhost:3000"
    const writeLocal = (line: string) => write(line, "localhost")
    writeLocal(`${KEY}=${stored("dev")}; path=/; max-age=1000`)
    check("localhost: the old-name session is read as before", shown(browserSessionCookies.getAll(), KEY)[0] === stored("dev"))
    browserSessionCookies.setAll([{ name: KEY, value: stored("dev2"), options: { path: "/", maxAge: 1000, sameSite: "lax", secure: false } }])
    check("localhost: written under the old name, no __Host-", jar.length === 1 && jar[0].name === KEY && jar[0].value === encodeURIComponent(stored("dev2")))
    process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
  }

  console.log("\nEvery reader knows the new name")
  {
    check("carriesSignIn (proxy, own-visit, in-app card) sees a __Host- session", carriesSignIn([HOST]) && carriesSignIn([`${HOST}.0`]) && carriesSignIn([KEY]) && !carriesSignIn(["sl_lang"]))
    check("mayBeSignedIn (public pages) sees a __Host- session", mayBeSignedIn(`a=1; ${HOST}.0=x`) && mayBeSignedIn(`${KEY}=x`) && !mayBeSignedIn("a=1"))
    check("isSessionCookieName", isSessionCookieName(HOST) && isSessionCookieName(`${KEY}.2`) && !isSessionCookieName("sb-host-only"))
    const proxy = code("proxy.ts")
    check("proxy: Supabase reads the raw header through sessionView", /getAll\(\) \{\s*return sessionView\(cookiePairs\(request\.headers\.get\("cookie"\)\), sessionKey\)\.cookies/.test(proxy))
    check("proxy: renewals go out under outgoingName, the old name expired", /supabaseResponse\.cookies\.set\(out, value,/.test(proxy) && /if \(out !== name\) supabaseResponse\.cookies\.set\(name, "", \{ path: "\/", maxAge: 0/.test(proxy))
    check("proxy: the move runs before every retire, which skips the session's names", (proxy.match(/sealSession\((redirect|supabaseResponse)\)\s*retireDomainScopedCookies\(\1, request, retireSkips\)/g) || []).length === 3)
    check("proxy: the move is GET/HEAD only, never on /auth or /api/auth", /\(method !== "GET" && method !== "HEAD"\) \|\| path\.startsWith\("\/auth\/"\) \|\| path\.startsWith\("\/api\/auth\/"\)/.test(proxy))
    check("proxy: retire re-issues nothing it is told to skip", /if \(skip\(cookie\.name\)\) continue/.test(proxy))
    const server = code("lib/supabase/server.ts")
    check("server client: reads through sessionView with duplicates counted from the raw header", /sessionView\(cookieStore\.getAll\(\)\.map\([^\n]*\), key, duplicated\)\.cookies/.test(server) && /cookiePairs\(headerStore\.get\("cookie"\)\)/.test(server))
    check("server client: writes under outgoingName", /cookieStore\.set\(out, value, enhancedOptions\)/.test(server))
    check("browser client: given the cookie methods", /cookies: browserSessionCookies/.test(code("lib/supabase/client.ts")))
    const logout = code("app/api/auth/logout/route.ts")
    check("log out expires __Host- cookies (with secure) and a planted old name at the domain", /\(\?:__Host-\)\?sb-/.test(logout) && /maxAge: 0, secure: true/.test(logout) && /plantedExpiries\(legacy/.test(logout))
    check("the business switch writes the session under __Host- on HTTPS", /sessionCookieChunks\(key, storedSessionJson\(session\), pairs\.map\(\(p\) => p\.name\), host\)/.test(code("lib/businesses/session-cookies.ts")))
    check("the sign in evidence check reads the __Host- name", /jar\.get\(`__Host-\$\{key\}`\)/.test(code("lib/auth/session-read.ts")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
