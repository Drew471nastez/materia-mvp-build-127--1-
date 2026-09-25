/**
 * ===========================================================================
 *  WHAT A CONNECTED DOMAIN SERVES, ASKED OF THE REAL proxy.ts
 * ===========================================================================
 * proxy.ts bundled as it is, run in Node against a small stand-in for the
 * database (a PostgREST that knows one creator and three domains), and asked
 * for real URLs. Once with the purpose columns (supabase/sql/run-now/22) and
 * once without, where every domain must be served exactly as before them,
 * and once with a website published. Each host's /robots.txt and
 * /sitemap.xml are asked for too: storelib.com and its subdomains keep
 * their own, a website domain with a website answers the website's, and
 * every other connected domain the creator page's (lib/seo/creator-domain.ts).
 *
 *   maralind.com         website, primary        (no website published)
 *   maralind.shop        website, not primary
 *   links.maralind.com   creator page, primary
 *
 *   node scripts/check-domain-routing.mjs
 *
 * It runs itself again under `--conditions=react-server`, which is how
 * `server-only` (imported by what the proxy imports) resolves to nothing.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"

if (!process.execArgv.some((a) => a.includes("react-server"))) {
  try {
    execFileSync(process.execPath, ["--conditions=react-server", ...process.argv.slice(1)], { stdio: "inherit" })
    process.exit(0)
  } catch {
    process.exit(1)
  }
}

const root = process.cwd()
const dir = join(root, ".domain-routing-probe")
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })
symlinkSync(join(root, "node_modules"), join(dir, "node_modules"), "junction")
execFileSync("npx", ["--no-install", "esbuild", "proxy.ts", "--bundle", "--platform=node", "--format=cjs", "--packages=external", "--alias:@=.", `--outfile=${join(dir, "proxy.cjs")}`, "--log-level=error"], { stdio: "inherit" })
writeFileSync(join(dir, "package.json"), "{}")

const domains = [
  { domain: "maralind.com", creator_id: "c1", status: "active", purpose: "website", is_primary: true },
  { domain: "maralind.shop", creator_id: "c1", status: "active", purpose: "website", is_primary: false },
  { domain: "links.maralind.com", creator_id: "c1", status: "active", purpose: "creator_page", is_primary: true },
]
let legacy = false
let website = false
const server = createServer((req, res) => {
  const u = new URL(req.url, "http://x")
  const table = u.pathname.split("/").pop()
  const q = Object.fromEntries(u.searchParams)
  let rows = []
  if (table === "custom_domains") {
    if (legacy && /purpose|is_primary/.test(q.select || "")) {
      res.writeHead(400, { "content-type": "application/json" })
      res.end(JSON.stringify({ code: "42703", message: "column custom_domains.purpose does not exist" }))
      return
    }
    rows = domains.filter((d) =>
      Object.entries(q).every(([k, v]) => {
        if (["select", "limit", "order"].includes(k)) return true
        if (v.startsWith("eq.")) return String(d[k]) === v.slice(3)
        if (v.startsWith("in.")) return v.slice(4, -1).split(",").map((x) => x.replace(/"/g, "")).includes(String(d[k]))
        return true
      }),
    )
    if (legacy) rows = rows.map(({ purpose, is_primary, ...r }) => r)
  } else if (table === "domain_redirects") {
    rows = q.domain === "eq.old.maralind.com" ? [{ redirect_to: "https://storelib.com/mara", http_code: 301, keep_until: "2999-01-01T00:00:00Z" }] : []
  } else if (table === "creators") rows = [{ id: "c1", user_id: "u1" }]
  else if (table === "profiles") rows = [{ id: "u1", username: "mara" }]
  else if (table === "store_theme_installs") rows = website ? [{ id: "i1" }] : []
  const single = (req.headers.accept || "").includes("vnd.pgrst.object")
  res.writeHead(200, { "content-type": "application/json" })
  res.end(JSON.stringify(single ? rows[0] ?? null : rows))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${server.address().port}`
process.env.SUPABASE_SERVICE_ROLE_KEY = "probe"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "probe"
const require = createRequire(join(dir, "package.json"))
const { NextRequest } = require("next/server")
const { proxy } = require(join(dir, "proxy.cjs"))

const quiet = console.warn
console.warn = () => {}
async function ask(url, init = {}) {
  const r = await proxy(new NextRequest(url, { ...init, headers: { host: new URL(url).host, ...(init.headers ?? {}) } }))
  const to = r.headers.get("location")
  if (to) return `${r.status} ${to}`
  const rw = r.headers.get("x-middleware-rewrite")
  if (rw) return `rewrite ${new URL(rw).pathname}${new URL(rw).search}`
  return r.status >= 400 ? `${r.status}` : `next`
}
/** A form a page submits: POST, with the Origin and Sec-Fetch-Site a browser sends. */
const post = (url, from) =>
  ask(url, { method: "POST", headers: { origin: from, "sec-fetch-site": new URL(from).host === new URL(url).host ? "same-origin" : "same-site", "content-type": "application/x-www-form-urlencoded" } })

let broken = 0
const expect = (got, want, what) => {
  const ok = got === want
  if (!ok) broken++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `\n        got  ${got}\n        want ${want}`}`)
}

console.log("\nWith the purpose columns")
expect(await ask("https://maralind.com/about"), "301 https://www.maralind.com/about", "a bare apex goes to its www")
expect(await ask("https://www.maralind.com/"), "rewrite /u/mara", "a website domain with no website published shows the creator page, as before")
expect(await ask("https://www.maralind.shop/about?x=1"), "308 https://www.maralind.com/about?x=1", "a domain that is not primary sends the page, path and query to the primary")
expect(await ask("https://links.maralind.com/"), "rewrite /u/mara", "a creator page domain: / is the creator page")
expect(await ask("https://links.maralind.com/prints"), "rewrite /mara/prints", "/<product> is the product")
expect(await ask("https://links.maralind.com/links"), "rewrite /l/mara", "/links is the OnePage")
expect(await ask("https://links.maralind.com/p/prints"), "rewrite /p/prints", "/p/<slug> still answers")
expect(await ask("https://links.maralind.com/mara/prints"), "308 https://links.maralind.com/prints", "a link with the handle in front loses it and stays on the domain")
expect(await ask("https://links.maralind.com/mara"), "308 https://links.maralind.com/", "and the handle alone is the page")
expect(await ask("https://links.maralind.com/api/track-view"), "next", "API calls are never rewritten or redirected")
expect(await ask("https://storelib.com/mara"), "next", "storelib.com is untouched")
expect(await ask("https://nobody.storelib.com/"), "rewrite /w/nobody", "a storelib.com subdomain is still a website address")
expect(await ask("https://old.maralind.com/prints?x=1"), "301 https://storelib.com/mara/prints?x=1", "a removed creator page domain sends a product to it under the handle")

console.log("\nEach host's robots.txt and sitemap.xml")
expect(await ask("https://storelib.com/robots.txt"), "next", "storelib.com keeps its own robots.txt")
expect(await ask("https://storelib.com/sitemap.xml"), "next", "and its own sitemap index")
expect(await ask("https://nobody.storelib.com/robots.txt"), "rewrite /w/nobody/robots.txt", "a storelib.com subdomain keeps its website's")
expect(await ask("https://links.maralind.com/robots.txt"), "rewrite /u/mara/robots.txt", "a creator page domain answers the creator page's own robots.txt")
expect(await ask("https://links.maralind.com/sitemap.xml"), "rewrite /u/mara/sitemap.xml", "and its own sitemap (the route reads the Host header)")
expect(await ask("https://www.maralind.com/robots.txt"), "rewrite /u/mara/robots.txt", "a website domain with no website shows the creator page, and answers for it, not storelib.com")
expect(await ask("https://www.maralind.shop/sitemap.xml"), "rewrite /u/mara/sitemap.xml", "a secondary domain is asked, not redirected (the route gives it no sitemap)")
expect(await ask("https://maralind.com/robots.txt"), "301 https://www.maralind.com/robots.txt", "a bare apex still goes to its www first")
expect(await ask("https://storelib.com/u/mara/sitemap.xml"), "308 https://storelib.com/mara/sitemap.xml", "the route is not an address on storelib.com")
expect(await ask("https://links.maralind.com/app"), "307 https://links.maralind.com/login", "the app is Storelib's on a domain, as before, which its robots.txt closes")

website = true
console.log("\nWith a website published")
expect(await ask("https://www.maralind.com/"), "rewrite /w/mara", "a website domain shows the website")
expect(await ask("https://www.maralind.com/robots.txt"), "rewrite /w/mara/robots.txt", "and answers the website's own robots.txt")
expect(await ask("https://www.maralind.com/sitemap.xml"), "rewrite /w/mara/sitemap.xml", "and the website's own sitemap")
expect(await ask("https://links.maralind.com/robots.txt"), "rewrite /u/mara/robots.txt", "a creator page domain never answers the website's")
expect(await ask("https://links.maralind.com/"), "rewrite /u/mara", "nor shows it")

console.log("\nCustomer accounts on the website, on its domain and on its subdomain")
expect(await ask("https://www.maralind.com/account/login?return=%2Fwishlist"), "rewrite /w/mara/account/login?return=%2Fwishlist", "a website domain answers its sign in page, query and all")
expect(await ask("https://www.maralind.com/account/login?step=email"), "rewrite /w/mara/account/login?step=email", "and its email step")
expect(await ask("https://www.maralind.com/account"), "rewrite /w/mara/account", "and its account page")
expect(await ask("https://www.maralind.com/account?edit=name"), "rewrite /w/mara/account?edit=name", "with the profile open for editing")
expect(await post("https://www.maralind.com/account/logout", "https://www.maralind.com"), "rewrite /w/mara/account/logout", "signing out posts to the website's own route")
expect(await ask("https://www.maralind.com/wishlist"), "rewrite /w/mara/wishlist", "and the Wishlist is the website's, not storelib.com's")
for (const route of ["code", "verify", "profile", "wishlist"]) {
  expect(await post(`https://www.maralind.com/api/site-account/${route}`, "https://www.maralind.com"), "next", `the ${route} form reaches its route on the domain itself, not rewritten or refused`)
}
expect(await post("https://maralind.com/api/site-account/code", "https://maralind.com"), "next", "and on the bare name too: the API is never sent to www")
expect(await ask("https://maralind.com/account/login"), "301 https://www.maralind.com/account/login", "while the page itself goes to www, where its cookies are")
expect(await ask("https://www.maralind.shop/account/login"), "308 https://www.maralind.com/account/login", "a secondary domain sends the sign in page to the primary one")
expect(await ask("https://mara.storelib.com/account/login"), "rewrite /w/mara/account/login", "a storelib.com subdomain answers its sign in page")
expect(await ask("https://mara.storelib.com/account"), "rewrite /w/mara/account", "and its account page")
expect(await post("https://mara.storelib.com/account/logout", "https://mara.storelib.com"), "rewrite /w/mara/account/logout", "and signing out")
for (const route of ["code", "verify", "profile"]) {
  expect(await post(`https://mara.storelib.com/api/site-account/${route}`, "https://mara.storelib.com"), "next", `the ${route} form reaches its route on the subdomain`)
}
expect(await post("https://storelib.com/api/site-account/code", "https://mara.storelib.com"), "403", "a website's page still cannot post to storelib.com's own API")
website = false

legacy = true
console.log("\nBefore the columns exist: everything as it was")
expect(await ask("https://www.maralind.shop/about"), "rewrite /u/mara", "no domain redirects to another")
expect(await ask("https://links.maralind.com/"), "rewrite /u/mara", "every domain is a website domain")
expect(await ask("https://links.maralind.com/prints"), "rewrite /u/mara", "and other paths land on the page, as they did")
expect(await ask("https://links.maralind.com/links"), "rewrite /l/mara", "with /links the OnePage")
expect(await ask("https://links.maralind.com/robots.txt"), "rewrite /u/mara/robots.txt", "robots.txt is the creator page's, which names no sitemap before the columns")

console.warn = quiet
server.close()
rmSync(dir, { recursive: true, force: true })
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nok: connected domains are served by purpose, and the same as before without the columns")
