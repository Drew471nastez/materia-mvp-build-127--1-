/**
 * ===========================================================================
 *  THE PROXY, RUN FOR REAL, AGAINST A SUPABASE THAT MISBEHAVES ON PURPOSE
 * ===========================================================================
 * proxy.ts decides on every request whether somebody is signed in, renews
 * their session when it has run out, and sends the renewed cookies back. A
 * mistake in any of those is a person signed out for no reason, so this runs
 * the real proxy (bundled with esbuild, with the real next/server and the
 * real @supabase/ssr) against a stubbed Supabase and reads the responses:
 *
 *   a live session                  passes, nothing rewritten
 *   an expired one, renewal works   passes, the renewed cookie is on the
 *                                   response AND on the request the pages see
 *   renewal cannot reach Supabase   passes, not /login, the stored session
 *                                   is not deleted
 *   Supabase answers 503            passes, not /login
 *   no session at all               /login
 *   a refresh token that was reused /login, and the redirect carries the
 *                                   cookie deletion with it
 *   a connected domain, renewed     the rewrite is the same one it would
 *                                   have been without the renewal
 *
 *   node scripts/check-session-proxy.mjs
 *   PROXY_FILE=some/older/proxy.ts node scripts/check-session-proxy.mjs   # the same checks on another version
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createRequire } from "node:module"

const root = process.cwd()
/* Inside the project, so the bundle resolves the project's own node_modules. */
const out = join(root, ".session-probe")
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

/* The name a browser holds since round AX (lib/supabase/host-session.ts); scripts/check-session-cookies-ax.mjs covers the move from the old one. */
const KEY = "__Host-sb-abcdefgh-auth-token"
const now = () => Math.floor(Date.now() / 1000)
const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "owner@example.com", app_metadata: {}, user_metadata: {} }
const session = (rt, expiresIn) => ({
  access_token: `at-${rt}`, token_type: "bearer", expires_in: 3600, expires_at: now() + expiresIn, refresh_token: rt, user,
})
const b64url = (s) => Buffer.from(s, "utf8").toString("base64url")
const cookieFor = (s) => `${KEY}=base64-${b64url(JSON.stringify(s))}`

/** What Supabase does next. Set per scenario. */
let supabase = { refresh: "ok", user: "ok" }
const calls = []
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url)
  calls.push(`${init.method ?? "GET"} ${url.pathname}${url.search}`)
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

  if (url.pathname === "/auth/v1/token") {
    if (supabase.refresh === "network") throw new TypeError("fetch failed")
    if (supabase.refresh === "reused") return json({ code: "refresh_token_already_used", error_code: "refresh_token_already_used", msg: "Invalid Refresh Token: Already Used" }, 400)
    return json(session("rt-renewed", 3600))
  }
  if (url.pathname === "/auth/v1/user") {
    if (supabase.user === "network") throw new TypeError("fetch failed")
    if (supabase.user === "503") return json({ message: "Service Unavailable" }, 503)
    return json(user)
  }
  if (url.pathname.startsWith("/rest/v1/")) {
    const table = url.pathname.slice("/rest/v1/".length)
    const wantsObject = String(new Headers(init.headers).get("accept") ?? "").includes("vnd.pgrst.object")
    const rows = {
      custom_domains: [{ creator_id: "c1", status: "active" }],
      creators: [{ id: "c1", user_id: "u1" }],
      profiles: [{ id: "u1", username: "andrew" }],
      store_theme_installs: [{ id: "i1" }],
      site_deployments: [],
      domain_redirects: [],
      username_history: [],
    }[table] ?? []
    if (wantsObject) return rows.length ? json(rows[0]) : json({ code: "PGRST116", message: "no rows" }, 406)
    return json(rows)
  }
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

async function run(label, { url, cookie, mode }) {
  supabase = mode
  calls.length = 0
  const headers = new Headers({ host: new URL(url).host, "user-agent": "Mozilla/5.0" })
  /* A browser that has already been through the host-only cookie migration
     (proxy.ts retireDomainScopedCookies), which is every browser by now. */
  headers.set("cookie", [cookie, "sb-host-only=1"].filter(Boolean).join("; "))
  const started = Date.now()
  const res = await proxy(new NextRequest(url, { headers }))
  const ms = Date.now() - started
  const setCookies = res.headers.getSetCookie?.() ?? []
  const authCookies = setCookies.filter((c) => c.startsWith(KEY) && !/Domain=/i.test(c))
  const override = res.headers.get("x-middleware-request-cookie") ?? ""
  console.log(`\n${label}   (${ms}ms, ${calls.length} calls to Supabase: ${calls.join(", ") || "none"})`)
  return { res, ms, authCookies, override, location: res.headers.get("location"), rewrite: res.headers.get("x-middleware-rewrite") }
}

const decode = (setCookie) => {
  const value = setCookie.split(";")[0].slice(setCookie.indexOf("=") + 1)
  try {
    return JSON.parse(Buffer.from(decodeURIComponent(value).replace(/^base64-/, ""), "base64url").toString("utf8"))
  } catch {
    return null
  }
}

try {
  {
    const r = await run("a live session on /app/products", { url: "https://storelib.com/app/products", cookie: cookieFor(session("rt0", 3000)), mode: { refresh: "ok", user: "ok" } })
    expect(!r.location, "not redirected", r.location)
    expect(r.authCookies.length === 0, "no session cookie rewritten", r.authCookies.join(" | "))
  }
  {
    const r = await run("an expired session, renewal works", { url: "https://storelib.com/app/products", cookie: cookieFor(session("rt0", -30)), mode: { refresh: "ok", user: "ok" } })
    expect(!r.location, "not redirected", r.location)
    const renewed = r.authCookies.map(decode).find(Boolean)
    expect(renewed?.refresh_token === "rt-renewed", "the renewed refresh token is on the response", r.authCookies.join(" | ").slice(0, 120))
    expect(r.authCookies.every((c) => /Max-Age=\d{6,}/i.test(c) && /SameSite=lax/i.test(c) && /Secure/i.test(c) && !/Domain=/i.test(c)),
      "persistent, lax, secure, host-only", r.authCookies.join(" | ").slice(0, 200))
    expect(r.override.includes(KEY) && r.override.includes(b64url(JSON.stringify(renewed ?? {})).slice(0, 40)),
      "and on the request the pages behind it read", r.override.slice(0, 120))
  }
  {
    const r = await run("an expired session, Supabase unreachable", { url: "https://storelib.com/app/products", cookie: cookieFor(session("rt0", -30)), mode: { refresh: "network", user: "ok" } })
    expect(!r.location, "not sent to /login", r.location)
    expect(!r.authCookies.some((c) => /Max-Age=0/i.test(c)), "the stored session is not deleted", r.authCookies.join(" | "))
  }
  {
    const r = await run("a live session, the auth service answers 503", { url: "https://storelib.com/app", cookie: cookieFor(session("rt0", 3000)), mode: { refresh: "ok", user: "503" } })
    expect(!r.location, "not sent to /login", r.location)
  }
  {
    const r = await run("no session at all", { url: "https://storelib.com/app/settings", cookie: "", mode: { refresh: "ok", user: "ok" } })
    expect(r.location?.startsWith("https://storelib.com/login"), "sent to /login", r.location)
  }
  {
    const r = await run("a refresh token Supabase says was reused", { url: "https://storelib.com/app", cookie: cookieFor(session("rt0", -30)), mode: { refresh: "reused", user: "ok" } })
    expect(r.location?.startsWith("https://storelib.com/login"), "sent to /login", r.location)
    expect(r.authCookies.some((c) => /Max-Age=0/i.test(c)), "and the redirect carries the cookie deletion", r.authCookies.join(" | "))
  }
  {
    const url = "https://www.shop-example.com/about"
    const plain = await run("a connected domain, live session", { url, cookie: cookieFor(session("rt0", 3000)), mode: { refresh: "ok", user: "ok" } })
    const renewed = await run("a connected domain, session renewed on this request", { url, cookie: cookieFor(session("rt0", -30)), mode: { refresh: "ok", user: "ok" } })
    console.log(`    live: ${plain.rewrite}\n    renewed: ${renewed.rewrite}`)
    expect(Boolean(plain.rewrite), "rewritten to the website", plain.rewrite)
    expect(renewed.rewrite === plain.rewrite, "the renewal does not change where it is rewritten", `${plain.rewrite} vs ${renewed.rewrite}`)
    expect(renewed.override.includes(KEY), "and the renewed cookie reaches the page", renewed.override.slice(0, 80))
  }
  console.log(broken === 0 ? "\nall session proxy checks passed\n" : `\n${broken} session proxy checks failed\n`)
  process.exitCode = broken === 0 ? 0 : 1
} finally {
  rmSync(out, { recursive: true, force: true })
}
