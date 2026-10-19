/**
 * ===========================================================================
 *  CURRENCY ROUND AP: EVERY CREATOR ACCOUNT CAN BE PAID OUT
 * ===========================================================================
 * Stripe (docs.stripe.com/connect/cross-border-payouts): no cross-border
 * payouts to recipient agreement accounts, only destination charges without
 * on_behalf_of, only inside the US, UK, EEA, Canada and Switzerland.
 *
 *   REGION     lib/payments/stripe/payout-regions: domestic, cross-border or
 *              unsupported, and the scripts' copies of the list are the same
 *   ONBOARDING never the recipient agreement, never card_payments across a
 *              border, no account at all where Stripe cannot pay out; an
 *              untouched recipient account is swapped like an unfinished one
 *   AUDIT      the Connect audit marks those accounts affected
 *   TEST MODE  --create-account opens the account the way onboarding does,
 *              and the run ends with a real (test) payout
 */
import http from "node:http"
import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { CROSS_BORDER_REGION, payoutRoute, payoutSupported } from "../lib/payments/stripe/payout-regions"
import { accountAttempts } from "../lib/payments/stripe/account-attempts"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 700)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

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
  section("1. Where Stripe can pay a creator out")
  check("same country is domestic", payoutRoute("RO", "RO") === "domestic")
  check("Romania to Germany, the US, the UK, Canada, Switzerland, Norway is cross-border", ["DE", "US", "GB", "CA", "CH", "NO"].every((c) => payoutRoute("RO", c) === "cross-border"))
  check("Romania to India, Brazil, Australia, Japan is unsupported", ["IN", "BR", "AU", "JP"].every((c) => payoutRoute("ro", c) === "unsupported"))
  check("the region is the US, UK, Canada, Switzerland and the 30 EEA countries", CROSS_BORDER_REGION.size === 34)
  check("a cross-border recipient account cannot be paid; a cross-border full one can", !payoutSupported({ country: "DE", agreement: "recipient" }, "RO").ok && payoutSupported({ country: "DE", agreement: "full" }, "RO").ok)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const audit: any = await import(pathToFileURL(join(process.cwd(), "scripts/connect-audit.mjs")).href)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tp: any = await import(pathToFileURL(join(process.cwd(), "scripts/stripe-test-purchase.mjs")).href)
  const same = (a: Set<string>) => a.size === CROSS_BORDER_REGION.size && [...a].every((c) => CROSS_BORDER_REGION.has(c))
  check("  the Connect audit and the test-mode script use exactly the same list", same(audit.CROSS_BORDER_REGION) && same(tp.CROSS_BORDER_REGION))

  section("2. Onboarding asks Stripe only for accounts it can pay out")
  const shared = { country: "DE", email: "a@b.c" }
  const all = (route: "domestic" | "cross-border" | "unsupported") => [...accountAttempts(shared, route), ...accountAttempts(shared, route, { storelibOnly: true })]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recipientIn = (xs: any[]) => xs.some((x) => x.tos_acceptance?.service_agreement === "recipient")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardsIn = (xs: any[]) => xs.some((x) => !!x.capabilities?.card_payments)
  check("no shape anywhere asks for the recipient agreement", !recipientIn(all("domestic")) && !recipientIn(all("cross-border")))
  check("across a border: transfers only, never card_payments (so never on_behalf_of)", all("cross-border").length > 0 && !cardsIn(all("cross-border")) && all("cross-border").every((x) => x.capabilities?.transfers?.requested === true))
  check("  and the first try keeps setup inside Storelib", accountAttempts(shared, "cross-border")[0]?.controller?.requirement_collection === "application")
  check("at home: a full account first, then transfers only", !!accountAttempts(shared, "domestic")[0]?.capabilities?.card_payments && !accountAttempts(shared, "domestic")[1]?.capabilities?.card_payments)
  check("an unsupported country gets no attempt at all", all("unsupported").length === 0)
  const connect = read("lib/payments/stripe/connect.ts")
  check("onboarding refuses an unsupported country before calling Stripe, in plain words", /route === "unsupported"[\s\S]{0,80}throw new PaymentsProblem\("Payouts to that country are not available/.test(connect))
  check("  and builds its tries from the shared list", /accountAttempts\(shared, route, options\)/.test(connect) && !/service_agreement: "recipient"/.test(connect))
  check("an untouched account on the recipient agreement is swapped, like an unfinished Express one", /const recipient = existing\.tos_acceptance\?\.service_agreement === "recipient"\s*\n\s*if \(\(runsInStorelib\(existing\) && !recipient\) \|\| !untouched\) return accountId/.test(connect))
  check("  an account with anything submitted is never swapped (money and identity stay)", /\|\| !untouched\) return accountId/.test(connect))

  section("3. The Connect audit")
  const v = (a: Record<string, unknown>) => audit.connectVerdict({ payouts_enabled: true, capabilities: { transfers: "active" }, requirements: { currently_due: [] }, ...a }, "RO")
  check("an Indian creator (no Stripe payouts from Romania) is affected", v({ id: "a", country: "IN" }).verdict === "affected")
  check("a German creator on the recipient agreement is affected", v({ id: "b", country: "DE", tos_acceptance: { service_agreement: "recipient" } }).verdict === "affected")
  check("a German creator on the full agreement is ok", v({ id: "c", country: "DE" }).verdict === "ok")
  const cards = v({ id: "d", country: "DE", capabilities: { transfers: "active", card_payments: "active" } })
  check("  one that can take cards stays ok but carries the on_behalf_of warning", cards.verdict === "ok" && cards.reasons.some((r: string) => /on_behalf_of/.test(r)))

  section("3b. The one launch file and the lock on MARKETPLACE_USD=all")
  const launch = read("supabase/sql/runbooks/storelib-currency-launch.sql")
  check("one transaction, and orders must be byte-for-byte unchanged or nothing is kept", /raise exception 'Orders changed during the run/.test(launch) && (launch.match(/do \$launch\$/g) ?? []).length === 1)
  check("the price fix is the proven one (own order, same currency, no edit, no old options) at platform usd", /v_platform constant text := 'usd'/.test(launch) && /greatest\(0, coalesce\(o\.amount_cents, 0\) - coalesce\(o\.tip_cents, 0\)\) = c\.original_cents/.test(launch) && /product_variants v\s+where v\.product_id = c\.id and v\.price_cents > 0 and v\.created_at < v_applied_at/.test(launch))
  check("every change is written to price_corrections first", launch.indexOf("insert into public.price_corrections") < launch.indexOf("update public.products p set price_cents"))
  check("the launch lock table is admin only", /alter table public\.platform_migrations enable row level security;\s*revoke all on public\.platform_migrations from anon, authenticated;/.test(launch))
  check("all is unlocked only after a real marketplace dollar sale was refunded and no recent order lacks a currency", /v_mp_sales >= 1 and v_mp_refunded >= 1 and v_unknown_recent = 0 then\s*insert into public\.platform_migrations/.test(launch))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mk: any = await import("../lib/money/marketplace")
  const dbWith = (rows: unknown[]) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: rows[0] ?? null, error: null }) }) }) }) })
  mk.resetMarketplaceLaunchCache()
  check("MARKETPLACE_USD=all without the launch row acts as off", (await mk.resolveMarketplaceGate(dbWith([]), "all")).mode === "off")
  mk.resetMarketplaceLaunchCache()
  check("  with the row, all is on", (await mk.resolveMarketplaceGate(dbWith([{ key: "marketplace_usd_launch" }]), "all")).mode === "all")
  mk.resetMarketplaceLaunchCache()
  const failing = { from: () => { throw new Error("db down") } }
  check("  an unreadable database counts as not launched", (await mk.resolveMarketplaceGate(failing, "all")).mode === "off")
  check("  one creator id (the first rollout step) never needs the row", (await mk.resolveMarketplaceGate(failing, "0e5e3f49-2b67-4e49-8e8f-373a82aebf1d")).mode === "some")
  mk.resetMarketplaceLaunchCache()

  section("4. A test-mode run that opens its own account and pays it out")
  const seen: Array<{ m: string; p: string; body: URLSearchParams; acct: string | undefined }> = []
  const made: Record<string, Record<string, unknown>> = {}
  let n = 0
  const stub = http.createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const body = new URLSearchParams(Buffer.concat(chunks).toString())
    const url = new URL(req.url ?? "/", "http://x")
    const path = url.pathname.replace(/^\/v1\//, "")
    const acctHeader = req.headers["stripe-account"] as string | undefined
    seen.push({ m: req.method ?? "", p: path, body, acct: acctHeader })
    const send = (o: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(o)) }
    if (path === "account") return send({ id: "acct_platform", country: "RO", default_currency: "ron" })
    if (path === "accounts" && req.method === "POST") {
      const id = `acct_t${++n}`
      const cardsAsked = body.has("capabilities[card_payments][requested]")
      made[id] = { id, country: body.get("country"), tos_acceptance: { service_agreement: "full" }, capabilities: { transfers: "active", ...(cardsAsked ? { card_payments: "active" } : {}) }, payouts_enabled: true, requirements: { currently_due: [] } }
      return send(made[id])
    }
    let m = /^accounts\/(acct_\w+)\/external_accounts$/.exec(path)
    if (m) return send({ data: [{ object: "bank_account", currency: "eur", country: "DE" }] })
    m = /^accounts\/(acct_\w+)$/.exec(path)
    if (m) return send(made[m[1]])
    if (path === "payment_intents") return send({ id: "pi_1", status: "succeeded", currency: "usd", amount: Number(body.get("amount")), latest_charge: "ch_1" })
    if (path === "charges/ch_1") return send({ id: "ch_1", transfer: "tr_1", balance_transaction: { currency: "ron", amount: 4900, fee: 150 } })
    if (path === "transfers/tr_1") return send({ id: "tr_1", amount: 967, currency: "usd", destination: "acct_t1", destination_payment: "py_1", amount_reversed: seen.some((s) => s.p === "refunds") ? 454 : 0 })
    if (path === "charges/py_1") return send({ id: "py_1", balance_transaction: { currency: "eur", amount: 890 } })
    if (path === "refunds") return send({ id: "re_1", status: "succeeded", currency: "usd", amount: Number(body.get("amount")) })
    if (path === "balance") return send({ available: [{ amount: 472, currency: "eur" }] })
    if (path === "payouts") return send({ id: "po_1", amount: Number(body.get("amount")), currency: body.get("currency"), status: "pending" })
    send({ error: { message: `no stub for ${req.method} ${path}` } }, 404)
  })
  await new Promise<void>((r) => stub.listen(0, "127.0.0.1", () => r()))
  const env = { STRIPE_API_BASE: `http://127.0.0.1:${(stub.address() as { port: number }).port}`, STRIPE_SECRET_KEY: "sk_test_xxx" }

  const de = await run("scripts/stripe-test-purchase.mjs", ["--create-account", "DE", "--amount", "1065", "--fee", "98", "--refund", "500"], env)
  const created = seen.find((s) => s.m === "POST" && s.p === "accounts")
  check("a German test creator is opened, charged, transferred to, refunded and paid out: every check passes", de.code === 0 && /Every check passed/.test(de.out), de.out.slice(0, 1200))
  check("  opened on the full agreement with transfers only, set up inside Storelib", !!created && !created.body.has("tos_acceptance[service_agreement]") && !created.body.has("capabilities[card_payments][requested]") && created.body.get("controller[requirement_collection]") === "application")
  check("  the charge used Stripe's test card that makes funds available at once", seen.find((s) => s.p === "payment_intents")?.body.get("payment_method") === "pm_card_bypassPending")
  const po = seen.find((s) => s.p === "payouts")
  check("  the payout ran on the creator's account, in the currency the sale settled in", po?.acct === "acct_t1" && po.body.get("currency") === "eur" && po.body.get("amount") === "472")

  seen.length = 0
  const ind = await run("scripts/stripe-test-purchase.mjs", ["--create-account", "IN"], env)
  check("India is refused before any account is opened", ind.code !== 0 && !seen.some((s) => s.m === "POST"), ind.out.slice(0, 300))
  seen.length = 0
  const live = await run("scripts/stripe-test-purchase.mjs", ["--create-account", "DE"], { ...env, STRIPE_SECRET_KEY: "sk_live_xxx" })
  check("a live key is still refused before any call", live.code === 2 && seen.length === 0)
  stub.close()

  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
