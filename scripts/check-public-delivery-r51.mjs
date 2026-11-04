/**
 * ===========================================================================
 *  EVERY PUBLIC PAGE TYPE ON A LOCAL PRODUCTION BUILD: WHAT IT COSTS, WHAT
 *  THE CDN MAY KEEP, AND WHETHER EVERYBODY GETS THE SAME BYTES (round 51)
 * ===========================================================================
 * Against a production build (`next start` in DIR), reading the Supabase stub
 * (scripts/supabase-stub-server.mjs) on STUB_PORT with one fixture that has
 * every public page type: lena's published Storelib theme website on her
 * subdomain and on her connected domain www.lenashop.test, satori's creator
 * page, product page and OnePage (storelib.me/satori), and the Loop Club
 * community. Requests carry the public Host header, so proxy.ts routes them
 * as it does on Vercel.
 *
 * Build it pointed at the stub first, as scripts/load/local-bench.mjs says:
 *
 *   node scripts/load/local-bench.mjs --stub &          # 127.0.0.1:54391
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54391 <CLAUDE.md placeholders> pnpm build
 *   DIR=<built checkout> node scripts/check-public-delivery-r51.mjs [--json FILE]
 *
 * For each page, it prints:
 *   - status, Cache-Control, Vercel-CDN-Cache-Control, Vercel-Cache-Tag, and
 *     whether the answer sets a cookie (Vercel never stores one that does);
 *   - database and auth requests for one warm stranger visit (the stub's log);
 *   - time to first byte and bytes on the wire (gzip), warm;
 *   - renders a second: SECONDS of CONCURRENCY strangers in a loop, with
 *     nothing in front of the server, so every request is a render (or a
 *     held answer of the server's own);
 *   - for every page the CDN may keep: the same bytes (markup and RSC rows)
 *     for a stranger, a signed in person, the owner and a visitor with every
 *     personal cookie this platform sets. FAILS when they differ.
 * NAV=1 also measures a website's first load (the document and every script,
 * style and font it names) and a move to another page (the RSC request a
 * link click makes). Exits 1 on any failure.
 */
import { spawn } from "node:child_process"
import { request as httpRequest } from "node:http"
import { gunzipSync } from "node:zlib"
import { writeFileSync } from "node:fs"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"
import { fixtureTables, HANDLE, USER, CREATOR, products } from "./load/local-fixture.mjs"

const DIR = process.env.DIR || "."
const PORT = Number(process.env.PORT || 3517)
const STUB_PORT = Number(process.env.STUB_PORT || 54391)
const SECONDS = Number(process.env.SECONDS || 6)
const CONCURRENCY = Number(process.env.CONCURRENCY || 20)
const jsonAt = process.argv.indexOf("--json")
const JSON_OUT = jsonAt > 0 ? process.argv[jsonAt + 1] : null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const at = "2026-10-01T10:00:00.000Z"

/* ── The fixture: local-fixture's satori, plus lena's website (scripts/serve-edge-stub-r49.mjs) ── */
const T = fixtureTables()
const LU = "11111111-1111-4111-8111-1111111111cc"
const LC = "22222222-2222-4222-8222-2222222222cc"
const LI = "44444444-4444-4444-8444-4444444444cc"
const lenaProduct = (n) => ({ ...products[0], id: `33333333-3333-4333-8333-0000000000c${n}`, creator_id: LC, seller_id: LC, title: `Lena Pack ${n}`, slug: `lena-pack-${n}`, creators: { user_id: LU } })
const sections = ["header", "hero_centered", "features_grid", "text_image", "faq_accordion", "footer"].map((type, i) => ({ id: `${type}-${i}`, type, name: type, settings: {}, blocks: [] }))
const settings = { id: "s1", install_id: LI, settings: {}, draft_settings: null, created_at: at, updated_at: at }
const pages = ["home", "about"].map((key, i) => ({ id: `p${i}`, install_id: LI, page_key: key, sections, draft_sections: null, created_at: at, updated_at: at }))
T.profiles.push({ id: LU, username: "lena", display_name: "Lena", email_verified: true, is_creator: true, welcome_completed: true, onboarding_completed: true, created_at: at })
T.creators.push({ id: LC, user_id: LU, slug: "lena", username: "lena", name: "Lena", display_name: "Lena", onboarding_completed: true, store_published: true, banned_at: null, subscription_plan_id: "free", currency: "usd", created_at: at })
T.products.push(...[1, 2, 3].map(lenaProduct))
T.store_theme_installs = [{ id: LI, creator_id: LC, theme_id: "default", name: "Lena's site", status: "published", is_custom: false, sort_order: 0, created_at: at, updated_at: at, store_theme_settings: settings, settings, pages }]
T.store_theme_settings = [settings]
T.store_theme_pages = pages
T.custom_domains = [{ id: "d1", domain: "lenashop.test", creator_id: LC, status: "active", purpose: "website", is_primary: true, ssl_status: "active", created_at: at, creator: { user_id: LU } }]
for (const t of ["store_menus", "site_releases", "store_localization", "site_access", "site_deployments", "wishlist_items", "subscribers", "team_members", "membership_plans", "product_sales_status", "community_members", "community_plans"]) T[t] = T[t] ?? []
/* nova: the same website with no domain of its own, so its subdomain serves the pages. */
const NU = "11111111-1111-4111-8111-1111111111dd", NC = "22222222-2222-4222-8222-2222222222dd", NI = "44444444-4444-4444-8444-4444444444dd"
const novaSettings = { ...settings, id: "s2", install_id: NI }
const novaPages = pages.map((p) => ({ ...p, id: `n${p.id}`, install_id: NI }))
T.profiles.push({ id: NU, username: "nova", display_name: "Nova", email_verified: true, is_creator: true, welcome_completed: true, onboarding_completed: true, created_at: at })
T.creators.push({ id: NC, user_id: NU, slug: "nova", username: "nova", name: "Nova", display_name: "Nova", onboarding_completed: true, store_published: true, banned_at: null, subscription_plan_id: "free", currency: "usd", created_at: at })
T.products.push(...[1, 2].map((n) => ({ ...lenaProduct(n), id: `33333333-3333-4333-8333-0000000000d${n}`, creator_id: NC, seller_id: NC, slug: `nova-pack-${n}`, title: `Nova Pack ${n}`, creators: { user_id: NU } })))
T.store_theme_installs.push({ ...T.store_theme_installs[0], id: NI, creator_id: NC, name: "Nova's site", store_theme_settings: novaSettings, settings: novaSettings, pages: novaPages })
T.store_theme_settings.push(novaSettings)
T.store_theme_pages.push(...novaPages)
T.profiles_public = T.profiles.map(({ email: _e, ...row }) => row)
T.creators_public = T.creators.map(({ stripe_account_id: _s, ...row }) => row)

const person = (id, email) => ({ id, aud: "authenticated", role: "authenticated", email, email_confirmed_at: at, app_metadata: { provider: "email" }, user_metadata: {}, created_at: at, updated_at: at })
const OTHER = "77777777-7777-4777-8777-000000000002"
T.profiles.push({ id: OTHER, username: "someone2", display_name: "Sam", email_verified: true, is_creator: false, welcome_completed: true, created_at: at })
const stub = await serveSupabaseStub({ port: STUB_PORT, tables: T, users: [person(USER, "hi@satori.studio"), person(LU, "lena@example.test"), person(OTHER, "sam@example.test")] })

const env = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${STUB_PORT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder", SUPABASE_SERVICE_ROLE_KEY: "placeholder", STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder" }
delete env.HTTPS_PROXY
delete env.https_proxy
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: DIR, env, stdio: process.env.DEBUG ? "inherit" : "ignore" })
process.on("exit", () => { next.kill(); stub.server.close() })

/** One request with the Host header the public address carries; raw bytes as sent (gzip when asked). */
function get(host, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now()
    let ttfb = 0
    const req = httpRequest({ host: "127.0.0.1", port: PORT, path, method: "GET", headers: { host, accept: "text/html,application/xhtml+xml,*/*;q=0.8", "accept-language": "en-US,en;q=0.9", "accept-encoding": "gzip", "user-agent": "Mozilla/5.0 (Macintosh) Chrome/130.0 Safari/537.36", "sec-fetch-dest": "document", "x-forwarded-for": "203.0.113.7", ...headers } }, (res) => {
      ttfb = performance.now() - t0
      const chunks = []
      res.on("data", (c) => chunks.push(c))
      res.on("end", () => {
        const raw = Buffer.concat(chunks)
        const body = res.headers["content-encoding"] === "gzip" ? gunzipSync(raw).toString("utf8") : raw.toString("utf8")
        resolve({ status: res.statusCode, h: res.headers, wire: raw.length, body, ttfb, total: performance.now() - t0 })
      })
    })
    req.on("error", reject)
    req.setTimeout(90_000, () => req.destroy(new Error("timeout")))
    req.end()
  })
}
for (let i = 0; i < 400; i++) { try { await get("storelib.com", "/robots.txt"); break } catch { await sleep(250) } }

const cookieOf = (id) => { const c = stub.sessionCookie(id); return `${c.name}=${c.value}` }
/* Every personal cookie a visitor of these hosts can carry (a session, a guest buyer, a language, a market, a team store, a theme cart, a website account, a site password pass). */
const PERSONAL = "sl_owned_hint=1; sl_owned=abc; sl_lang=fr; sl_country=FR; sl_team_store=x; sl_theme_cart=c1; sl_site_session=x; sl_site_pass=x; sl_suggest=fr"
const VISITORS = {
  stranger: {},
  "signed in": { cookie: cookieOf(OTHER) },
  owner: { cookie: cookieOf(USER) },
  "website owner": { cookie: cookieOf(LU) },
  "every personal cookie": { cookie: `${cookieOf(OTHER)}; ${PERSONAL}` },
  "a Referer from Storelib": { referer: "https://storelib.com/app" },
}

const P1 = products[0]
const SURFACES = [
  /* [name, host, path, owner visitor] */
  ["Website /, subdomain of a site at its own domain (302)", "lena.storelib.com", "/"],
  ["Website /, subdomain", "nova.storelib.com", "/"],
  ["Website /about, subdomain", "nova.storelib.com", "/about"],
  ["Website /products/<slug>, subdomain", "nova.storelib.com", "/products/nova-pack-1"],
  ["Website /, custom domain", "www.lenashop.test", "/"],
  ["Website /about, custom domain", "www.lenashop.test", "/about"],
  ["Website /products, custom domain", "www.lenashop.test", "/products"],
  ["Website /cart (never held)", "www.lenashop.test", "/cart"],
  ["OnePage storelib.me/<name>", "storelib.me", `/${HANDLE}`],
  ["Creator page /<handle>", "storelib.com", `/${HANDLE}`],
  ["Product /<handle>/<slug>", "storelib.com", `/${HANDLE}/${P1.slug}`],
  ["Community /community/<slug>", "storelib.com", "/community/loop-club"],
  ["Community /community/<slug>/about", "storelib.com", "/community/loop-club/about"],
  ["Checkout (never held)", "storelib.com", `/checkout?productId=${P1.id}`],
]

let failed = 0
const check = (name, ok, detail) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `   ${JSON.stringify(detail).slice(0, 400)}`}`); if (!ok) failed++ }
const markup = (html) => html.replace(/<script\b[\s\S]*?<\/script>/g, "")
const flightRows = (html) => {
  const parts = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map((m) => JSON.parse(m[1]))
  return parts.join("").split(/\n(?=[0-9a-f]+:)/).map((row) => row.replace(/^[0-9a-f]+:/, "").replace(/"\$(@|L|F|Q|W|K|B)?[0-9a-f]+(?=[":])/g, '"$$ref')).sort()
}
const sameDocument = (a, b) => a === b || (markup(a) === markup(b) && JSON.stringify(flightRows(a)) === JSON.stringify(flightRows(b)))
const held = (r) => /s-maxage=(?!0\b)\d+/.test(String(r.h["vercel-cdn-cache-control"] || "")) || (/\bpublic\b/.test(String(r.h["cache-control"] || "")) && /s-maxage=(?!0\b)\d+/.test(String(r.h["cache-control"] || "")))

async function throughput(host, path) {
  const until = Date.now() + SECONDS * 1000
  let n = 0
  let errors = 0
  const lat = []
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (Date.now() < until) {
      try {
        const r = await get(host, path)
        if (r.status >= 500) errors++
        lat.push(r.total)
        n++
      } catch { errors++ }
    }
  }))
  lat.sort((a, b) => a - b)
  return { perSecond: Math.round(n / SECONDS), p50: Math.round(lat[Math.floor(lat.length / 2)] ?? 0), errors }
}

const results = []
for (const [name, host, path] of SURFACES.filter(([n]) => !process.env.ONLY || n.includes(process.env.ONLY))) {
  console.log(`\n${name}  (${host}${path})`)
  await get(host, path)
  await get(host, path)
  await sleep(300)
  const before = stub.log.length
  const r = await get(host, path)
  await sleep(400)
  const db = stub.log.length - before
  if (process.env.LOGDB) for (const line of stub.log.slice(before)) console.log(`    db: ${line.slice(0, 160)}`)
  const answers = {}
  for (const [who, extra] of Object.entries(VISITORS)) answers[who] = await get(host, path, extra)
  if (process.env.DUMP) for (const [who, a] of Object.entries(answers)) writeFileSync(`${process.env.DUMP}/${(host + path).replace(/\W+/g, "_")}-${who.replace(/\W+/g, "_")}.html`, a.body)
  const isHeld = held(r)
  const row = {
    name, host, path, status: r.status,
    cacheControl: String(r.h["cache-control"] || ""), cdn: String(r.h["vercel-cdn-cache-control"] || ""), tag: String(r.h["vercel-cache-tag"] || ""),
    setsCookie: !!r.h["set-cookie"], db, ttfbMs: Math.round(r.ttfb), wireBytes: r.wire, held: isHeld,
  }
  console.log(`  ${r.status}  Cache-Control "${row.cacheControl}"  CDN "${row.cdn}"  tag "${row.tag}"  set-cookie ${row.setsCookie}  db ${db}  ttfb ${row.ttfbMs}ms  ${r.wire} B`)
  if (isHeld) {
    check("  a CDN may keep it, so the stranger's answer sets no cookie", !r.h["set-cookie"], r.h["set-cookie"])
    for (const [who, a] of Object.entries(answers)) {
      if (who === "stranger") continue
      check(`  ${who}: the same document as the stranger's`, a.status === r.status && sameDocument(answers.stranger.body, a.body), { status: a.status })
      check(`  ${who}: the same CDN rule`, String(a.h["vercel-cdn-cache-control"] || "") === row.cdn && String(a.h["vercel-cache-tag"] || "") === row.tag && String(a.h["cache-control"] || "") === row.cacheControl, { cc: a.h["cache-control"], cdn: a.h["vercel-cdn-cache-control"] })
    }
    const rsc = await get(host, path, { rsc: "1", accept: "*/*" })
    check("  an RSC request (a client side move): nothing a CDN keeps", !held(rsc), { cc: rsc.h["cache-control"], cdn: rsc.h["vercel-cdn-cache-control"] })
  }
  if (/never held/.test(name)) check("  never held", !held(r) && !held(answers["every personal cookie"]), { cc: r.h["cache-control"], cdn: r.h["vercel-cdn-cache-control"] })
  row.throughput = SECONDS > 0 ? await throughput(host, path) : { perSecond: 0, p50: 0, errors: 0 }
  console.log(`  ${row.throughput.perSecond} answers/s at ${CONCURRENCY} in flight, p50 ${row.throughput.p50}ms, errors ${row.throughput.errors}`)
  results.push(row)
}

/* ── A website's first load and a move to another page ── */
if (process.env.NAV) {
  console.log("\nA website: first load and a move to another page")
  for (const host of ["nova.storelib.com", "www.lenashop.test"]) {
    const doc = await get(host, "/")
    const assets = [...new Set([...doc.body.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+\.(?:js|css|woff2))"/g)].map((m) => m[1]))]
    let js = 0, css = 0, font = 0, slow = 0
    const uncached = []
    const sizes = []
    for (const a of assets) {
      const r = await get(host, a, { accept: "*/*", "sec-fetch-dest": "script" })
      sizes.push([r.wire, a])
      if (a.endsWith(".js")) js += r.wire
      else if (a.endsWith(".css")) css += r.wire
      else font += r.wire
      if (!/immutable/.test(String(r.h["cache-control"] || ""))) uncached.push(a)
      slow = Math.max(slow, r.ttfb)
    }
    const move = await get(host, "/about", { rsc: "1", accept: "*/*", "next-url": "/about", "sec-fetch-dest": "empty" })
    const moveHtml = await get(host, "/about")
    const nav = { host, documentBytes: doc.wire, documentTtfbMs: Math.round(doc.ttfb), assets: assets.length, jsBytes: js, cssBytes: css, fontBytes: font, uncachedAssets: uncached.length, moveRscBytes: move.wire, moveRscTtfbMs: Math.round(move.ttfb), moveRscStatus: move.status, aboutDocumentTtfbMs: Math.round(moveHtml.ttfb) }
    console.log(`  ${host}: document ${doc.wire} B gz, ttfb ${nav.documentTtfbMs}ms; ${assets.length} assets: js ${js} B, css ${css} B, fonts ${font} B (gz), ${uncached.length} not immutable; move to /about: RSC ${move.status} ${move.wire} B, ttfb ${nav.moveRscTtfbMs}ms (as a document ${nav.aboutDocumentTtfbMs}ms)`)
    if (process.env.NAV === "2") for (const [b, a] of sizes.sort((x, y) => y[0] - x[0]).slice(0, 12)) console.log(`    ${String(b).padStart(8)} B  ${a}`)
    check(`  ${host}: every script, style and font is immutable`, uncached.length === 0, uncached.slice(0, 3))
    results.push({ name: `navigation ${host}`, ...nav })
  }
}

if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(results, null, 2))
console.log(failed ? `\n${failed} failed` : "\nall passed")
process.exit(failed ? 1 : 0)
