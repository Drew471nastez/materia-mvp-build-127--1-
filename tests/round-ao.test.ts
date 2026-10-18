/**
 * ===========================================================================
 *  CURRENCY ROUND AO: PRICES PROVEN BEFORE THEY ARE TOUCHED
 * ===========================================================================
 * scripts/price-audit.mjs and scripts/price-restore.mjs, run as they would be
 * in production: separate processes talking to a database over HTTP (here the
 * journey's in-memory PostgREST, tests/_journey, served on a local port).
 *
 *   PROOF      a price is "confirmed" multiplied only with the marker, its age,
 *              an order before the multiplication at exactly price / 4.6 in the
 *              currency the store still sells in, and no price edit since
 *   NO GUESS   no order, another currency, mixed currencies, an edit since, an
 *              option with no proof: the creator decides, nothing is restored
 *   SAFE       dry run by default; --apply needs a named approver; a record is
 *              written before each change; a price that moved is not
 *              overwritten; --undo puts it back; orders never change
 */
import "./_journey/env"
import http from "node:http"
import { spawn } from "node:child_process"
import { readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { Journey } from "./_journey/harness"
import { pathToFileURL } from "node:url"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 700)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const day = 86_400_000
const T = new Date(Date.now() - 60 * day).toISOString()
const before = (n: number) => new Date(Date.parse(T) - n * day).toISOString()
const after = (n: number) => new Date(Date.parse(T) + n * day).toISOString()

function run(script: string, args: string[], env: Record<string, string>): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const child: any = (spawn as any)(process.execPath, [script, ...args], { env: { PATH: process.env.PATH ?? "", ...env }, cwd: process.cwd() })
    let out = ""
    child.stdout.on("data", (d: Buffer) => (out += d))
    child.stderr.on("data", (d: Buffer) => (out += d))
    child.on("close", (code: number | null) => resolve({ code: code ?? 1, out }))
  })
}

async function main() {
  /* The script's own pure rules, from the repository (the tests run compiled from elsewhere). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { verdictOf, fitsPattern, original, multiplied }: any = await import(pathToFileURL(join(process.cwd(), "scripts/price-audit.mjs")).href)
  section("1. The proof, rule by rule")
  const base = { appliedAt: T, storeCurrency: null, platformCurrency: "usd", priceEditsSince: 0, logStartedAt: null }
  const p = (price: number, created = before(30)) => ({ id: "p", created_at: created, price_cents: price })
  const paid = (amount: number, currency: string | null = "usd", extra: Record<string, unknown> = {}) => ({ amount_cents: amount, tip_cents: 0, currency, variant_id: null, variant_price_cents: null, ...extra })
  check("the inverse of round(x * 4.6) is exact for whole cents", [1, 99, 3600, 6800, 400, 12345, 999999].every((c) => original(multiplied(c)) === c))
  check("  and a price the multiplication could not produce is told apart", fitsPattern(16560) && !fitsPattern(16561) && fitsPattern(46))
  check("no marker: nothing is confirmed", verdictOf({ ...base, appliedAt: null, product: p(16560), preOrders: [paid(3600)] }).verdict === "not-affected")
  check("made after the multiplication: not affected", verdictOf({ ...base, product: p(16560, after(1)), preOrders: [] }).verdict === "not-affected")
  check("edited since (the activity log says so): not affected", verdictOf({ ...base, product: p(16560), preOrders: [paid(3600)], priceEditsSince: 1 }).verdict === "not-affected")
  check("an order before it at 36.00 usd, the store sells in usd: confirmed, back to 36.00", (() => { const v = verdictOf({ ...base, product: p(16560), preOrders: [paid(3600)] }); return v.verdict === "confirmed" && v.original_cents === 3600 && v.currency === "usd" })())
  check("  a tip on that order is not part of the price", verdictOf({ ...base, product: p(16560), preOrders: [paid(4100, "usd", { tip_cents: 500 })] }).verdict === "confirmed")
  check("no order to prove it: the creator decides", verdictOf({ ...base, product: p(16560), preOrders: [] }).verdict === "needs-creator")
  check("orders at another price: the creator decides", verdictOf({ ...base, product: p(16560), preOrders: [paid(3000)] }).verdict === "needs-creator")
  check("charged in lei before, sells in dollars now: the creator decides (never a guessed currency)", verdictOf({ ...base, product: p(16560), preOrders: [paid(3600, "ron")] }).verdict === "needs-creator")
  check("orders with no currency recorded prove nothing", verdictOf({ ...base, product: p(16560), preOrders: [paid(3600, null)] }).verdict === "needs-creator")
  check("orders in two currencies: the creator decides", verdictOf({ ...base, product: p(16560), preOrders: [paid(3600, "usd"), paid(3600, "eur")] }).verdict === "needs-creator")
  check("a store that chose lei and was charged lei before: confirmed in lei", verdictOf({ ...base, storeCurrency: "ron", product: p(16560), preOrders: [paid(3600, "ron")] }).verdict === "confirmed")

  section("1b. The production runbook for parts 244 and 245")
  {
    const apply = readFileSync("supabase/sql/runbooks/am-ao-2-apply.sql", "utf8")
    const p244 = readFileSync("supabase/sql/run-now/244_marketplace_pricing.sql", "utf8").trim()
    const p245 = readFileSync("supabase/sql/run-now/245_price_corrections.sql", "utf8").trim()
    check("the apply file is the two parts as they are, after a 5 second lock wait", apply.includes(p244) && apply.includes(p245) && /set lock_timeout = '5s';/.test(apply) && apply.indexOf("lock_timeout") < apply.indexOf(p244))
    check("  part 245 is the migration copy too", readFileSync("supabase/migrations/20270204_ao_price_corrections.sql", "utf8").trim() === p245)
    const pre = readFileSync("supabase/sql/runbooks/am-ao-1-preflight.sql", "utf8") + readFileSync("supabase/sql/runbooks/am-ao-3-postflight.sql", "utf8")
    check("  preflight and postflight only read", !/\b(insert|update|delete|alter|drop|create|truncate|grant|revoke)\b/i.test(pre.replace(/--.*$/gm, "")))
    check("  both print the same order and product fingerprints to compare", (pre.match(/orders_fingerprint/g) ?? []).length === 2 && (pre.match(/products_fingerprint/g) ?? []).length === 2)
  }

  section("2. The scripts against a database, over HTTP")
  const j = await Journey.start()
  const seller = await j.signUp("audit@example.com", { name: "Ana Audit" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "ana-audit" } })
  const creator = j.rows("creators")[0]
  const product = (title: string, price: number, created: string, extra: Record<string, unknown> = {}) =>
    j.db.insert("products", { creator_id: creator.id, type: "digital", title, slug: title.toLowerCase().replace(/\W+/g, "-"), status: "published", price_cents: price, created_at: created, pay_what_you_want: false, ...extra }, {})[0].id as string
  const order = (productId: string, amount: number, currency: string | null, created: string, extra: Record<string, unknown> = {}) =>
    j.db.insert("orders", { creator_id: creator.id, product_id: productId, amount_cents: amount, tip_cents: 0, currency, status: "completed", created_at: created, buyer_email: "b@example.com", ...extra }, {})
  j.db.insert("platform_migrations", { key: "currency_ron_2026", applied_at: T, note: "test" }, {})
  const proven = product("Ads Course", 16560, before(40), { pwyw_min_price_cents: null })
  order(proven, 3600, "usd", before(20))
  const noProof = product("Printable Checks", 1840, before(40))
  const madeAfter = product("New Pack", 1840, after(5))
  const wasLei = product("Lei Pack", 16560, before(40))
  order(wasLei, 3600, "ron", before(10))
  const withOption = product("Bundle", 4600, before(40))
  j.db.insert("product_variants", { product_id: withOption, name: "Pro", price_cents: 9200, created_at: before(39) }, {})
  order(withOption, 1000, "usd", before(5))
  const edited = product("Edited", 16560, before(40))
  order(edited, 3600, "usd", before(5))
  j.db.insert("store_activity_log", { creator_id: creator.id, action: "product.price", subject_type: "product", subject_id: edited, created_at: after(3) }, {})
  const ordersBefore = JSON.stringify(j.rows("orders").map((o) => [o.id, o.amount_cents, o.currency, o.status]))

  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const body = chunks.length ? Buffer.concat(chunks).toString() : undefined
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v)
    const answer = await j.db.handle(new Request(`https://journey.supabase.co${req.url}`, { method: req.method, headers, body: req.method === "GET" || req.method === "HEAD" ? undefined : body }))
    res.writeHead(answer.status, { "content-type": answer.headers.get("content-type") ?? "application/json" })
    res.end(await answer.text())
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()))
  const port = (server.address() as { port: number }).port
  const env = { SUPABASE_URL: `http://127.0.0.1:${port}`, SUPABASE_SERVICE_ROLE_KEY: "journey", NEXT_PUBLIC_PLATFORM_CURRENCY: "usd" }
  const reportFile = join(tmpdir(), `price-audit-${process.pid}.json`)

  const pricesBefore = JSON.stringify(j.rows("products").map((x) => [x.id, x.price_cents]))
  const audit = await run("scripts/price-audit.mjs", ["--out", reportFile], env)
  const report = audit.code === 0 ? JSON.parse(readFileSync(reportFile, "utf8")) : null
  const verdict = (id: string) => report?.products.find((r: { id: string }) => r.id === id)?.verdict ?? "not-affected"
  check("the audit runs and finds the recorded multiplication", audit.code === 0 && report?.multiplication_recorded?.at === T, audit.out.slice(0, 600))
  check("  proven by its order: confirmed", verdict(proven) === "confirmed", report?.products)
  check("  no order: needs the creator", verdict(noProof) === "needs-creator")
  check("  made after: not affected", verdict(madeAfter) === "not-affected")
  check("  was lei, sells in dollars now: needs the creator", verdict(wasLei) === "needs-creator")
  check("  edited since: not affected", verdict(edited) === "not-affected")
  check("  it wrote nothing", JSON.stringify(j.rows("products").map((x) => [x.id, x.price_cents])) === pricesBefore && j.rows("price_corrections").length === 0)

  const dry = await run("scripts/price-restore.mjs", ["--from", reportFile], env)
  check("the restore's dry run says what it would do and changes nothing", dry.code === 0 && /would\s+\S+ price_cents: 165\.60 -> 36\.00/.test(dry.out) && j.rows("products").find((x) => x.id === proven)?.price_cents === 16560 && j.rows("price_corrections").length === 0, dry.out.slice(0, 500))
  const noName = await run("scripts/price-restore.mjs", ["--from", reportFile, "--apply"], env)
  check("--apply without a named approver is refused, nothing changed", noName.code === 2 && j.rows("products").find((x) => x.id === proven)?.price_cents === 16560, noName.out.slice(0, 300))

  const applied = await run("scripts/price-restore.mjs", ["--from", reportFile, "--apply", "--approved-by", "Andrew (test)"], env)
  const row = j.rows("price_corrections").find((r) => r.product_id === proven)
  check("applied: the proven product is back to 36.00", applied.code === 0 && j.rows("products").find((x) => x.id === proven)?.price_cents === 3600, applied.out.slice(0, 500))
  check("  with its record: before, after, proof, approver, applied", row?.before_cents === 16560 && row?.after_cents === 3600 && /order of 36\.00 usd/.test(row?.proof ?? "") && row?.approved_by === "Andrew (test)" && !!row?.applied_at, row)
  check("  nothing else was touched", j.rows("products").find((x) => x.id === noProof)?.price_cents === 1840 && j.rows("products").find((x) => x.id === wasLei)?.price_cents === 16560 && j.rows("products").find((x) => x.id === edited)?.price_cents === 16560)
  check("  and no order changed", JSON.stringify(j.rows("orders").map((o) => [o.id, o.amount_cents, o.currency, o.status])) === ordersBefore)

  const batch = /--undo (ao-[\w-]+)/.exec(applied.out)?.[1]
  const undo = await run("scripts/price-restore.mjs", ["--undo", batch ?? "missing", "--approved-by", "Andrew (test)"], env)
  check("--undo puts it back to 165.60 and marks the record undone", undo.code === 0 && j.rows("products").find((x) => x.id === proven)?.price_cents === 16560 && !!j.rows("price_corrections").find((r) => r.product_id === proven)?.undone_at, undo.out.slice(0, 300))

  /* A product with an option nobody's order proves is never half restored. */
  const optReport = { products: [{ id: withOption, verdict: "confirmed" }] }
  const optFile = join(tmpdir(), `price-audit-opt-${process.pid}.json`)
  writeFileSync(optFile, JSON.stringify(optReport))
  const opt = await run("scripts/price-restore.mjs", ["--from", optFile, "--apply", "--approved-by", "Andrew (test)"], env)
  check("a product whose option has no proof is skipped whole, even if a report calls it confirmed", /skip/.test(opt.out) && j.rows("products").find((x) => x.id === withOption)?.price_cents === 4600 && j.rows("product_variants").find((v) => v.product_id === withOption)?.price_cents === 9200, opt.out.slice(0, 400))

  /* A price that moved between the audit and the restore is not overwritten. */
  j.db.update("products", { price_cents: 5000 }, [{ path: "id", op: "eq", value: proven, not: false } as any])
  const moved = await run("scripts/price-restore.mjs", ["--from", reportFile, "--apply", "--approved-by", "Andrew (test)"], env)
  check("a price changed after the audit is re-proven and left alone", j.rows("products").find((x) => x.id === proven)?.price_cents === 5000 && /skip/.test(moved.out), moved.out.slice(0, 400))

  section("3. Connect accounts and a Stripe test-mode purchase, against a stand-in Stripe")
  const seen: string[] = []
  const amountReversed: Record<string, number> = {}
  const accounts: Record<string, any> = {
    acct_ro: { id: "acct_ro", country: "RO", default_currency: "ron", tos_acceptance: { service_agreement: "full" }, capabilities: { transfers: "active" }, payouts_enabled: true, charges_enabled: false, requirements: { currently_due: [] } },
    acct_us: { id: "acct_us", country: "US", default_currency: "usd", tos_acceptance: { service_agreement: "recipient" }, capabilities: { transfers: "active" }, payouts_enabled: true, requirements: { currently_due: [] } },
    acct_de: { id: "acct_de", country: "DE", default_currency: "eur", tos_acceptance: { service_agreement: "full" }, capabilities: { transfers: "pending" }, payouts_enabled: false, requirements: { currently_due: ["external_account"] } },
  }
  const stripeStub = http.createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const body = new URLSearchParams(Buffer.concat(chunks).toString())
    const url = new URL(req.url ?? "/", "http://x")
    seen.push(`${req.method} ${url.pathname}`)
    const send = (o: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(o)) }
    const path = url.pathname.replace(/^\/v1\//, "")
    if (path === "account") return send({ id: "acct_platform", country: "RO", default_currency: "ron" })
    if (path === "accounts") return send({ data: Object.values(accounts), has_more: false })
    let m = /^accounts\/(acct_\w+)\/external_accounts$/.exec(path)
    if (m) return send({ data: m[1] === "acct_de" ? [] : [{ object: "bank_account", currency: accounts[m[1]].default_currency, country: accounts[m[1]].country, last4: "6789", routing_number: "110000000", default_for_currency: true }] })
    m = /^accounts\/(acct_\w+)$/.exec(path)
    if (m) return send(accounts[m[1]])
    if (path === "payment_intents" && req.method === "POST") {
      const amount = Number(body.get("amount")), fee = Number(body.get("application_fee_amount"))
      return send({ id: "pi_1", status: "succeeded", currency: body.get("currency"), amount, latest_charge: "ch_1", __fee: fee, __dest: body.get("transfer_data[destination]") })
    }
    if (path === "charges/ch_1") return send({ id: "ch_1", transfer: "tr_1", balance_transaction: { currency: "ron", amount: 4900, exchange_rate: 4.6, fee: 150 } })
    if (path === "transfers/tr_1") return send({ id: "tr_1", amount: 1065 - 98, currency: "usd", destination: "acct_ro", destination_payment: "py_1", amount_reversed: amountReversed.tr_1 ?? 0 })
    if (path === "charges/py_1") return send({ id: "py_1", balance_transaction: { currency: req.headers["stripe-account"] === "acct_ro" ? "ron" : "usd", amount: 4448, exchange_rate: 4.6 } })
    if (path === "refunds" && req.method === "POST") {
      amountReversed.tr_1 = Math.round(((1065 - 98) * Number(body.get("amount"))) / 1065)
      return send({ id: "re_1", status: "succeeded", currency: "usd", amount: Number(body.get("amount")) })
    }
    if (path === "balance") return send({ available: [{ amount: 2215, currency: "ron" }] })
    if (path === "payouts" && req.method === "POST") return send({ id: "po_1", amount: Number(body.get("amount")), currency: body.get("currency"), status: "pending" })
    send({ error: { message: `no stub for ${req.method} ${path}` } }, 404)
  })
  await new Promise<void>((r) => stripeStub.listen(0, "127.0.0.1", () => r()))
  const stripeEnv = (key: string) => ({ STRIPE_API_BASE: `http://127.0.0.1:${(stripeStub.address() as { port: number }).port}`, STRIPE_SECRET_KEY: key })

  seen.length = 0
  const ca = await run("scripts/connect-audit.mjs", ["--json"], stripeEnv("rk_live_readonly"))
  const connect = ca.code === 0 ? JSON.parse(ca.out) : null
  const vOf = (id: string) => connect?.all.find((a: { id: string }) => a.id === id)?.verdict
  check("the Connect audit reads every account and only ever GETs", ca.code === 0 && connect?.accounts === 3 && seen.every((x) => x.startsWith("GET ")), { code: ca.code, seen, out: ca.out.slice(0, 300) })
  check("  a US creator on the recipient agreement is affected", vOf("acct_us") === "affected" && connect?.all.find((a: { id: string }) => a.id === "acct_us")?.crossBorder === true)
  check("  a German creator with transfers pending and no bank is not ready", vOf("acct_de") === "not-ready")
  check("  a Romanian creator on the full agreement with payouts on is ok", vOf("acct_ro") === "ok")
  check("  no bank number or routing number is ever printed", !/6789|110000000/.test(ca.out))

  seen.length = 0
  const live = await run("scripts/stripe-test-purchase.mjs", ["--account", "acct_ro"], stripeEnv("sk_live_xxx"))
  check("the test purchase refuses a live key before calling Stripe at all", live.code === 2 && seen.length === 0, live.out.slice(0, 200))
  const tp = await run("scripts/stripe-test-purchase.mjs", ["--account", "acct_ro", "--amount", "1065", "--fee", "98", "--refund", "500"], stripeEnv("sk_test_xxx"))
  check("in test mode, to a full-agreement account: charge, settlement, transfer, creator's currency, refund and reversal all pass", tp.code === 0 && /Every check passed/.test(tp.out), tp.out.slice(0, 900))
  check("  the USD charge was sent as a destination charge with the fee", seen.includes("POST /v1/payment_intents") && seen.includes("POST /v1/refunds"))
  const rec = await run("scripts/stripe-test-purchase.mjs", ["--account", "acct_us", "--amount", "1065", "--fee", "98", "--refund", "500"], stripeEnv("sk_test_xxx"))
  check("to a recipient-agreement account it fails loudly on the agreement check", rec.code === 1 && /FAIL\s+the connected account is not on the recipient agreement/.test(rec.out), rec.out.slice(0, 600))
  stripeStub.close()

  server.close()
  rmSync(reportFile, { force: true })
  rmSync(optFile, { force: true })
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
