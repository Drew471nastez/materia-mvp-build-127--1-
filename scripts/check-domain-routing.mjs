/**
 * ===========================================================================
 *  WHAT A CONNECTED DOMAIN SERVES, ASKED OF THE REAL proxy.ts
 * ===========================================================================
 * proxy.ts bundled as it is, run in Node against a small stand-in for the
 * database (a PostgREST that knows one creator and three domains), and asked
 * for real URLs. Once with the purpose columns (supabase/sql/run-now/22) and
 * once without, where every domain must be served exactly as before them.
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
  } else if (table === "creators") rows = [{ id: "c1", user_id: "u1" }]
  else if (table === "profiles") rows = [{ id: "u1", username: "mara" }]
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
async function ask(url) {
  const r = await proxy(new NextRequest(url, { headers: { host: new URL(url).host } }))
  const to = r.headers.get("location")
  if (to) return `${r.status} ${to}`
  const rw = r.headers.get("x-middleware-rewrite")
  return rw ? `rewrite ${new URL(rw).pathname}${new URL(rw).search}` : `next`
}

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

legacy = true
console.log("\nBefore the columns exist: everything as it was")
expect(await ask("https://www.maralind.shop/about"), "rewrite /u/mara", "no domain redirects to another")
expect(await ask("https://links.maralind.com/"), "rewrite /u/mara", "every domain is a website domain")
expect(await ask("https://links.maralind.com/prints"), "rewrite /u/mara", "and other paths land on the page, as they did")
expect(await ask("https://links.maralind.com/links"), "rewrite /l/mara", "with /links the OnePage")

console.warn = quiet
server.close()
rmSync(dir, { recursive: true, force: true })
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nok: connected domains are served by purpose, and the same as before without the columns")
