/**
 * ===========================================================================
 *  CREATOR PAGES, PRODUCT PAGES, EXPLORE: ONE HTML FOR EVERYBODY (rounds 48, 49)
 * ===========================================================================
 * Against this checkout's production build (`next start`), reading a Supabase
 * that answers from a fixture (scripts/supabase-stub-server.mjs, the rows of
 * scripts/load/local-fixture.mjs plus three people): the owner of the store,
 * somebody who bought from it, and somebody signed in who did neither. Build
 * it pointed at the stub first, as scripts/load/local-bench.mjs says:
 *
 *   node scripts/load/local-bench.mjs --stub &          # 127.0.0.1:54391
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54391 <CLAUDE.md placeholders> pnpm build
 *   node scripts/check-creator-page-cache.mjs           (DIR=. PORT=3311 STUB_PORT=54391)
 *
 * On /<handle>, /<handle>/<product>, /explore and /explore/<category>:
 *   - the HTML is the same bytes for a stranger, the signed in visitor, the
 *     buyer, the owner, a guest buyer's cookies, a chosen language, a team
 *     store and a Referer from Storelib (any difference is printed);
 *   - every one of them is answered Vercel-CDN-Cache-Control
 *     `public, s-maxage=60, stale-while-revalidate=300` with the page's tag,
 *     and a stranger with no Set-Cookie;
 *   - an RSC request, the editor's canvas (?embedded=1) and a scheme
 *     preview (?scheme=) carry no CDN rule;
 *   - the database requests one render makes (the stub's log), per person.
 * BROWSER=1 also opens each person's page in Chromium (Playwright) at 1440
 * and 390 and checks they still SEE their own after hydration: the owner
 * Edit profile, the buyer Contact and Download, the signed in visitor and
 * the stranger neither; and that the owner's controls moved nothing.
 * SHOTS=<dir> saves a screenshot of each. Exits 1 on any failure.
 */
import { spawn } from "node:child_process"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"
import { fixtureTables, HANDLE, USER, CREATOR, products } from "./load/local-fixture.mjs"

const DIR = process.env.DIR || "."
const PORT = Number(process.env.PORT || 3311)
const STUB_PORT = Number(process.env.STUB_PORT || 54391)
const BASE = `http://localhost:${PORT}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const at = "2026-10-01T10:00:00.000Z"
const BUYER = "77777777-7777-4777-8777-000000000001"
const OTHER = "77777777-7777-4777-8777-000000000002"
const person = (id, email) => ({ id, aud: "authenticated", role: "authenticated", email, email_confirmed_at: at, app_metadata: { provider: "email" }, user_metadata: {}, created_at: at, updated_at: at })
const owner = person(USER, "hi@satori.studio")
const buyer = person(BUYER, "buyer@example.com")
const other = person(OTHER, "someone@example.com")
const P1 = products[0]

const T = fixtureTables()
T.profiles.push(
  { id: BUYER, username: "buyer1", display_name: "Bea Buyer", avatar_url: null, email: buyer.email, email_verified: true, is_creator: false, welcome_completed: true, created_at: at },
  { id: OTHER, username: "someone2", display_name: "Sam Someone", avatar_url: null, email: other.email, email_verified: true, is_creator: false, welcome_completed: true, created_at: at },
)
T.profiles[0].email = owner.email
T.profiles_public = T.profiles.map(({ email: _e, ...row }) => row)
T.orders = [{ id: "88888888-8888-4888-8888-000000000001", buyer_id: BUYER, product_id: P1.id, creator_id: CREATOR, variant_id: null, status: "completed", amount_cents: 2900, receipt_token: "rcpt-buyer-1", buyer_email: buyer.email, created_at: at }]
/* "products.creator_id" as a column: the stub matches a filter by the row's own key (lib/commerce/has-bought-from-creator filters on the join). */
T.entitlements = [{ id: "99999999-9999-4999-8999-000000000001", buyer_id: BUYER, product_id: P1.id, variant_id: null, "products.creator_id": CREATOR, products: { creator_id: CREATOR }, created_at: at }]
T.digital_assets = [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001", product_id: P1.id, file_name: "loops.zip", upload_status: "completed", created_at: at }]
/* A published page with an About block, so the buyer's Contact has its place. */
T.store_builder_configs = [{
  id: "cfg-1", creator_id: CREATOR, page_type: "shop",
  published_config: {
    sections: [
      { id: "featured", type: "featured-products", order: 0, settings: { spacing: { paddingTop: 48, paddingBottom: 48, paddingLeft: 0, paddingRight: 0 }, mobileSpacing: { paddingTop: 32, paddingBottom: 32, paddingLeft: 0, paddingRight: 0 }, visible: true, headline: "Featured", productIds: [], mobileListing: 2, showPrice: true } },
      { id: "about-1", type: "about", order: 1, settings: { spacing: { paddingTop: 48, paddingBottom: 48, paddingLeft: 0, paddingRight: 0 }, mobileSpacing: { paddingTop: 32, paddingBottom: 32, paddingLeft: 0, paddingRight: 0 }, visible: true, headline: "About", aboutContent: "<p>Loops, made in Cluj.</p>", mediaItems: [], showSalesStats: true, showProductsStats: true } },
    ],
    headerSettings: { bio: "Loops and kits", contactEmail: "studio@satori.example" },
    globalSettings: { themePreset: "default" },
  },
}]
for (const t of ["wishlist_items", "subscribers", "team_members", "membership_plans", "product_sales_status", "store_localization"]) T[t] = T[t] ?? []

const stub = await serveSupabaseStub({ port: STUB_PORT, tables: T, users: [owner, buyer, other] })
const env = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${STUB_PORT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder", SUPABASE_SERVICE_ROLE_KEY: "placeholder", STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder" }
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "localhost"], { cwd: DIR, env, stdio: process.env.DEBUG ? "inherit" : "ignore" })
process.on("exit", () => { next.kill(); stub.server.close() })
for (let i = 0; i < 300; i++) { try { await fetch(`${BASE}/robots.txt`); break } catch { await sleep(200) } }

let failed = 0
const check = (name, ok, detail) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `   ${JSON.stringify(detail).slice(0, 500)}`}`); if (!ok) failed++ }
const jar = (c) => `${c.name}=${c.value}`
const who = {
  stranger: {},
  "another stranger": {},
  "signed in, no purchase": { cookie: jar(stub.sessionCookie(OTHER)) },
  buyer: { cookie: jar(stub.sessionCookie(BUYER)) },
  owner: { cookie: jar(stub.sessionCookie(USER)) },
  "a guest buyer's cookies": { cookie: "sl_owned_hint=1; sl_owned=abc" },
  "a chosen language": { cookie: "sl_lang=fr" },
  "a team store": { cookie: "sl_team_store=x" },
  "a Referer from Storelib": { referer: "https://storelib.com/community/loop-club" },
}
const get = async (path, headers = {}) => {
  const before = stub.log.length
  const r = await fetch(`${BASE}${path}`, { headers: { accept: "text/html", "accept-language": "en-US,en;q=0.9", ...headers }, redirect: "manual" })
  const html = await r.text()
  return { status: r.status, cdn: r.headers.get("vercel-cdn-cache-control") || "", tag: r.headers.get("vercel-cache-tag") || "", cc: r.headers.get("cache-control") || "", setCookie: r.headers.get("set-cookie"), html, db: stub.log.slice(before) }
}
/* The first difference between two documents, for the report. */
const firstDiff = (a, b) => {
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  return i >= a.length && i >= b.length ? null : { at: i, a: a.slice(Math.max(0, i - 100), i + 160), b: b.slice(Math.max(0, i - 100), i + 160) }
}
const EDGE = "public, s-maxage=60, stale-while-revalidate=300"
/* The document without its scripts: what is drawn. */
const markup = (html) => html.replace(/<script\b[\s\S]*?<\/script>/g, "")
/* The RSC payload the page carries (self.__next_f.push chunks), joined, cut into its rows, sorted. */
const flightRows = (html) => {
  const parts = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map((m) => JSON.parse(m[1]))
  /* A row's number and its references to other rows follow the order they settled in, so both are taken out. */
  return parts.join("").split(/\n(?=[0-9a-f]+:)/).map((row) => row.replace(/^[0-9a-f]+:/, "").replace(/"\$(@|L|F|Q|W|K|B)?[0-9a-f]+(?=[":])/g, '"$$ref')).sort()
}
const pages = [`/${HANDLE}`, `/${HANDLE}/${P1.slug}`, "/explore", "/explore/music"]
const dbCount = {}
for (const path of pages) {
  console.log(`\n${path}`)
  await get(path)
  await get(path, who.owner)
  const answers = {}
  for (const [name, headers] of Object.entries(who)) answers[name] = await get(path, headers)
  const base = answers.stranger
  if (process.env.DUMP) {
    const { writeFileSync } = await import("node:fs")
    for (const [name, r] of Object.entries(answers)) writeFileSync(`${process.env.DUMP}/${path.replace(/\W+/g, "_")}-${name.replace(/\W+/g, "_")}.html`, r.html)
  }
  check(`a stranger: ${base.status}, ${base.html.length} bytes, Cache-Control "${base.cc}"`, base.status === 200, base.status)
  for (const [name, r] of Object.entries(answers)) {
    if (name === "stranger") continue
    const d = firstDiff(base.html, r.html)
    if (d === null) {
      check(`  ${name}: the same bytes as the stranger's`, r.status === base.status)
      continue
    }
    /*
      Not byte for byte: React streams the RSC rows as each part settles, so
      the same rows can arrive in another order from one render to the next
      (the metadata before or after the page). The same document then means
      the same markup outside the scripts and the same rows, in any order.
    */
    const sameMarkup = markup(base.html) === markup(r.html)
    const rowsA = flightRows(base.html), rowsB = flightRows(r.html)
    const sameRows = rowsA.length === rowsB.length && rowsA.every((row, i) => row === rowsB[i])
    check(`  ${name}: the same markup and the same RSC rows as the stranger's (streamed in another order)`, r.status === base.status && sameMarkup && sameRows, sameMarkup ? { rows: rowsA.filter((x, i) => x !== rowsB[i]).slice(0, 2), other: rowsB.filter((x, i) => x !== rowsA[i]).slice(0, 2) } : firstDiff(markup(base.html), markup(r.html)))
  }
  check(`  every one: Vercel-CDN-Cache-Control "${EDGE}", tag "${base.tag}"`, Object.values(answers).every((r) => r.cdn === EDGE && r.tag === base.tag && !!r.tag), Object.fromEntries(Object.entries(answers).map(([k, r]) => [k, `${r.cdn} | ${r.tag}`])))
  check("  the stranger's answer sets no cookie", !base.setCookie, base.setCookie)
  const rsc = await get(path, { rsc: "1" })
  check("  an RSC request: no CDN rule", rsc.cdn === "", rsc.cdn)
  if (path.startsWith(`/${HANDLE}`)) {
    for (const q of ["embedded=1", "scheme=dark"]) {
      const r = await get(`${path}?${q}`, who.owner)
      check(`  ?${q}: no CDN rule`, r.cdn === "", r.cdn)
    }
  }
  dbCount[path] = Object.fromEntries(Object.entries(answers).filter(([k]) => ["stranger", "owner", "buyer"].includes(k)).map(([k, r]) => [k, r.db.length]))
}
console.log("\ndatabase and auth requests for one render (the stub's log):", JSON.stringify(dbCount))

console.log("\nWhat each person's own routes answer (what the page asks after load)")
const ask = async (path, headers, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } })
  return { status: r.status, cc: r.headers.get("cache-control"), body: await r.json().catch(() => null) }
}
for (const name of ["stranger", "signed in, no purchase", "buyer", "owner"]) {
  const v = await ask(`/api/creator-page/viewer?creator=${CREATOR}`, who[name])
  const p = await ask("/api/purchases/verify", who[name], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: P1.id, receiptTokens: [] }) })
  console.log(`  ${name}: viewer ${JSON.stringify(v.body)} (${v.cc}); verify hasPurchased=${p.body?.hasPurchased} isLoggedIn=${p.body?.isLoggedIn} (${p.cc})`)
  /* The owner's typed address comes from a JSON path select the stub does not answer, so only "nobody else gets one" is checked here. */
  const want = { owner: name === "owner", bought: name === "buyer" }
  check(`  ${name}: owner ${want.owner}, bought ${want.bought}, private`, v.body?.owner === want.owner && v.body?.bought === want.bought && /private, no-store/.test(v.cc ?? "") && (name === "owner" || v.body?.contactEmail === null), v.body)
  check(`  ${name}: owns the product ${name === "buyer"}`, p.body?.hasPurchased === (name === "buyer"), p.body)
}

if (process.env.BROWSER) {
  const { createRequire } = await import("node:module")
  const { chromium } = createRequire(import.meta.url)("playwright")
  const b = await chromium.launch({ args: ["--no-sandbox", "--no-proxy-server"] })
  const open = async (path, cookie, width) => {
    const ctx = await b.newContext({ viewport: { width, height: 900 } })
    if (cookie) {
      for (const part of cookie.split("; ")) {
        const i = part.indexOf("=")
        await ctx.addCookies([{ name: part.slice(0, i), value: part.slice(i + 1), url: BASE }])
      }
    }
    const page = await ctx.newPage()
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" })
    const top = () => page.evaluate(() => {
      const el = [...document.querySelectorAll("h1, h2")].find((e) => e.getBoundingClientRect().height > 0)
      return el ? el.getBoundingClientRect().top : null
    })
    await page.waitForLoadState("load")
    const top0 = await top()
    await page.waitForTimeout(3000)
    /* "Edit profile" is a word on a computer and an icon with that name on a phone. */
    const text = await page.evaluate(() => `${document.body.innerText}${document.querySelector('[aria-label="Edit profile"]') ? "\nEdit profile" : ""}`)
    const top1 = await top()
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${path.replace(/\W+/g, "_")}-${cookie ? cookie.split("=")[0].replace(/\W+/g, "").slice(0, 16) + cookie.length : "stranger"}-${width}.png` })
    await ctx.close()
    return { text, moved: top0 !== null && top1 !== null ? Math.abs(top1 - top0) : 0 }
  }
  console.log("\nIn Chromium, after hydration")
  const cp = `/${HANDLE}`, pp = `/${HANDLE}/${P1.slug}`
  for (const width of [1440, 390]) {
    const s = await open(cp, null, width)
    check(`${width}: a stranger sees no Edit profile and no Contact`, !/Edit profile/.test(s.text) && !/\bContact\b/.test(s.text))
    const o = await open(cp, who.owner.cookie, width)
    check(`${width}: the owner sees Edit profile`, /Edit profile/.test(o.text))
    check(`${width}:   and the heading above did not move when it came in`, o.moved < 1, o.moved)
    const sb = await open(cp, who.buyer.cookie, width)
    check(`${width}: the buyer sees Contact and no Edit profile`, /\bContact\b/.test(sb.text) && !/Edit profile/.test(sb.text))
    const so = await open(cp, who["signed in, no purchase"].cookie, width)
    check(`${width}: somebody signed in who bought nothing sees neither`, !/Edit profile/.test(so.text) && !/\bContact\b/.test(so.text))
    const pb = await open(pp, who.buyer.cookie, width)
    check(`${width}: the buyer's product page offers the download`, /Download/.test(pb.text) && !/Loading\.\.\./.test(pb.text), pb.text.slice(0, 400))
    const ps = await open(pp, null, width)
    check(`${width}: the stranger's offers Buy, no download`, !/Download File/.test(ps.text) && !/Loading\.\.\./.test(ps.text), ps.text.slice(0, 400))
    const po = await open(pp, who["signed in, no purchase"].cookie, width)
    check(`${width}: somebody signed in who did not buy: no download`, !/Download File/.test(po.text) && !/Loading\.\.\./.test(po.text))
    const pown = await open(pp, who.owner.cookie, width)
    check(`${width}: the owner's own product page draws (no download of their own)`, !/Download File/.test(pown.text))
  }
  await b.close()
}
console.log(failed ? `\n${failed} failed` : "\nall passed")
process.exit(failed ? 1 : 0)
