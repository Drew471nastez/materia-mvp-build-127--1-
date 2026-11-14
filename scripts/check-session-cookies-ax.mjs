/**
 * ===========================================================================
 *  THE SESSION UNDER `__Host-`, THROUGH THE REAL PROXY (round AX)
 * ===========================================================================
 * The same harness as scripts/check-session-proxy.mjs (proxy.ts bundled with
 * esbuild, the real next/server and @supabase/ssr, a stubbed Supabase), with
 * the Cookie headers a published site on <slug>.storelib.com can cause:
 *
 *   an old-name session, nothing else      kept, and moved to `__Host-` with
 *                                          the same value; nobody signed out
 *   a `__Host-` session and a planted      the `__Host-` one is read; the
 *   old-name one for another account      planted account is never asked for
 *   the old name twice (the visitor's      neither is read; only the domain
 *   own and a planted one)                 copy is expired, the host's stays
 *   a renewal of a `__Host-` session       written under `__Host-`
 *   plain http (local development)         the old name, as before
 *
 * Supabase's /auth/v1/user answers by the token it is shown, so which
 * session the proxy used is read from the account it asked about.
 *
 *   node scripts/check-session-cookies-ax.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createRequire } from "node:module"

const root = process.cwd()
const out = join(root, ".session-probe-ax")
mkdirSync(out, { recursive: true })
const empty = join(out, "empty.js")
writeFileSync(empty, "export {}\n")
const bundle = join(out, "proxy.cjs")

execFileSync(
  "pnpm",
  ["exec", "esbuild", join(root, process.env.PROXY_FILE ?? "proxy.ts"), "--bundle", "--platform=node", "--format=cjs", "--log-level=error",
   `--outfile=${bundle}`, `--alias:server-only=${empty}`, `--alias:@=${root}`,
   "--packages=external"],
  { stdio: ["ignore", "ignore", "inherit"] },
)

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"

const KEY = "sb-abcdefgh-auth-token"
const HOST = `__Host-${KEY}`
const now = () => Math.floor(Date.now() / 1000)
const userFor = (id) => ({ id, aud: "authenticated", role: "authenticated", email: `${id}@example.com`, app_metadata: {}, user_metadata: {} })
const session = (rt, expiresIn, id = "visitor") => ({
  access_token: `at-${rt}`, token_type: "bearer", expires_in: 3600, expires_at: now() + expiresIn, refresh_token: rt, user: userFor(id),
})
const b64url = (s) => Buffer.from(s, "utf8").toString("base64url")
const value = (s) => `base64-${b64url(JSON.stringify(s))}`

const asked = []
const calls = []
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url)
  calls.push(`${init.method ?? "GET"} ${url.pathname}`)
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  if (url.pathname === "/auth/v1/token") return json(session("rt-renewed", 3600))
  if (url.pathname === "/auth/v1/user") {
    const token = String(new Headers(init.headers).get("authorization") ?? "").replace(/^Bearer /, "")
    asked.push(token)
    return json(userFor(token === "at-evil" ? "planter" : "visitor"))
  }
  if (url.pathname.startsWith("/rest/v1/")) return json([])
  if (url.pathname.endsWith("/jwks.json")) return json({ keys: [] })
  throw new Error(`unexpected fetch ${url}`)
}

const require = createRequire(bundle)
const { NextRequest } = require("next/server")
const { proxy } = require(bundle)

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}

async function run(label, { url, cookie }) {
  asked.length = 0
  calls.length = 0
  const headers = new Headers({ host: new URL(url).host, "user-agent": "Mozilla/5.0" })
  headers.set("cookie", [cookie, "sb-host-only=1"].filter(Boolean).join("; "))
  const res = await proxy(new NextRequest(url, { headers }))
  const setCookies = res.headers.getSetCookie?.() ?? []
  console.log(`\n${label}   (${calls.length} calls to Supabase: ${calls.join(", ") || "none"}; asked about: ${asked.join(", ") || "nobody"})`)
  return {
    location: res.headers.get("location"),
    setCookies,
    hostSet: setCookies.filter((c) => c.startsWith(`${HOST}=`) && !/Max-Age=0/i.test(c)),
    legacyHostOnlyGone: setCookies.some((c) => c.startsWith(`${KEY}=;`) && /Max-Age=0/i.test(c) && !/Domain=/i.test(c)),
    legacyKept: setCookies.filter((c) => c.startsWith(`${KEY}=`) && !/Max-Age=0/i.test(c)),
    legacyDomainGone: setCookies.filter((c) => c.startsWith(`${KEY}=;`) && /Domain=\.storelib\.com/i.test(c) && /Max-Age=0/i.test(c)),
    override: res.headers.get("x-middleware-request-cookie") ?? "",
  }
}

const valueOf = (setCookie) => decodeURIComponent(setCookie.split(";")[0].slice(setCookie.indexOf("=") + 1))

try {
  {
    const mine = value(session("rt0", 3000))
    const r = await run("an old-name session, nothing else (a browser from before this round)", { url: "https://storelib.com/app/products", cookie: `${KEY}=${mine}` })
    expect(!r.location, "not sent to /login: nobody is signed out", r.location)
    expect(asked.every((t) => t === "at-rt0"), "the visitor's own session is read", asked.join(","))
    expect(r.hostSet.length === 1 && valueOf(r.hostSet[0]) === mine, "moved to __Host- with the same value", r.hostSet.join(" | ").slice(0, 160))
    expect(r.hostSet.every((c) => /Path=\//.test(c) && /Secure/i.test(c) && !/Domain=/i.test(c) && /Max-Age=\d{6,}/i.test(c)), "__Host- rules: Path=/, Secure, no Domain, persistent", r.hostSet.join(" | "))
    expect(r.legacyHostOnlyGone, "the old name is expired on the host", r.setCookies.join(" | ").slice(0, 300))
    expect(r.legacyKept.length === 0, "the old name is not re-issued", r.legacyKept.join(" | ").slice(0, 160))
  }
  {
    const r = await run("a __Host- session, and an old-name one planted for another account", {
      url: "https://storelib.com/app/products",
      cookie: `${KEY}=${value(session("evil", 3000, "planter"))}; ${HOST}=${value(session("rt0", 3000))}`,
    })
    expect(!r.location, "not sent to /login", r.location)
    expect(asked.length > 0 && asked.every((t) => t === "at-rt0"), "only the visitor's own __Host- session is read, never the planted one", asked.join(","))
    expect(r.hostSet.length === 0, "the __Host- session is not rewritten", r.hostSet.join(" | ").slice(0, 120))
    expect(r.legacyKept.length === 0 && r.legacyHostOnlyGone, "the planted old name is expired, never re-issued", r.setCookies.join(" | ").slice(0, 300))
  }
  {
    const r = await run("the old name twice: the visitor's own and a planted one (no __Host- yet)", {
      url: "https://storelib.com/app/products",
      cookie: `${KEY}=${value(session("evil", 3000, "planter"))}; ${KEY}=${value(session("rt0", 3000))}`,
    })
    expect(!asked.includes("at-evil"), "the planted account is never asked about", asked.join(","))
    expect(r.location?.startsWith("https://storelib.com/login"), "read as signed out for this request (not as the planter)", r.location)
    expect(r.hostSet.length === 0, "neither copy is moved to __Host-", r.hostSet.join(" | ").slice(0, 120))
    expect(r.legacyKept.length === 0, "neither copy is re-issued under the old name", r.legacyKept.join(" | ").slice(0, 160))
    expect(!r.legacyHostOnlyGone, "the host's own copy is left alone (it is moved over on the next page)", r.setCookies.join(" | ").slice(0, 300))
    const paths = r.legacyDomainGone.map((c) => (c.match(/Path=([^;]+)/) || [])[1])
    expect(["/", "/app", "/app/", "/app/products"].every((p) => paths.includes(p)), "the planted copy is expired at the domain on every path it could carry", paths.join(","))
  }
  {
    const r = await run("the next page after that: only the visitor's own copy is left", { url: "https://storelib.com/app/products", cookie: `${KEY}=${value(session("rt0", 3000))}` })
    expect(!r.location && asked.every((t) => t === "at-rt0"), "signed in as the visitor again", `${r.location} ${asked.join(",")}`)
    expect(r.hostSet.length === 1, "and moved to __Host-", r.hostSet.join(" | ").slice(0, 120))
  }
  {
    const r = await run("a __Host- session that has run out, renewed", { url: "https://storelib.com/app/products", cookie: `${HOST}=${value(session("rt0", -30))}` })
    expect(!r.location, "not sent to /login", r.location)
    const renewed = r.hostSet.map((c) => { try { return JSON.parse(Buffer.from(valueOf(c).replace(/^base64-/, ""), "base64url").toString("utf8")) } catch { return null } }).find(Boolean)
    expect(renewed?.refresh_token === "rt-renewed", "the renewal is written under __Host-", r.setCookies.join(" | ").slice(0, 200))
    expect(r.legacyKept.length === 0, "nothing under the old name", r.legacyKept.join(" | ").slice(0, 120))
    expect(r.override.includes(HOST), "the pages behind it are handed the __Host- cookie", r.override.slice(0, 80))
  }
  {
    const r = await run("plain http (local development keeps the old name)", { url: "http://storelib.com/app/products", cookie: `${KEY}=${value(session("rt0", -30))}` })
    expect(!r.location, "not sent to /login", r.location)
    expect(r.hostSet.length === 0, "no __Host- cookie on http", r.hostSet.join(" | ").slice(0, 120))
    expect(r.legacyKept.some((c) => valueOf(c).length > 20), "the renewal goes under the old name, as before", r.setCookies.join(" | ").slice(0, 200))
  }
  console.log(broken === 0 ? "\nall __Host- session checks passed\n" : `\n${broken} __Host- session checks failed\n`)
  process.exitCode = broken === 0 ? 0 : 1
} finally {
  rmSync(out, { recursive: true, force: true })
}
