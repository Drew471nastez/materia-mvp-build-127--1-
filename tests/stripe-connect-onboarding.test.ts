/**
 * ===========================================================================
 *  A SELLER IN ANY COUNTRY STRIPE CAN PAY OUT CAN SET UP PAYOUTS
 * ===========================================================================
 * Nov 23 2026, a seller: "I can't seem to be able to set up a payment method
 * for my store, I have tried so many times and it just keeps saying try
 * again". Three causes, each held here against a Stripe double and a
 * database double at the network edge (nothing reaches Stripe or Supabase):
 *
 *   1  A seller outside Romania asked Stripe for a transfers-only account,
 *      which Stripe opens only after it approves the platform for it. The
 *      refusal came back every time. Now the full account (cards and
 *      transfers) follows, which needs no approval.
 *   2  Setup never asked the country. It opened the account in the profile's
 *      country, or Romania when the profile had none, and Stripe never
 *      changes it. Now the country is required, and an untouched account in
 *      the wrong country is replaced.
 *   3  Every refusal the page did not recognise, and every sentence that
 *      named Stripe, reached the seller as "Try again". Now each answer says
 *      what to do, carries a code the page acts on, and is logged with
 *      Stripe's own type, code, param and request id.
 *
 * The country matrix runs from a Romanian platform: US, GB, DE, FR, RO, ES,
 * IT, NL, PL, CA open an account; AU, BR, MX, IN, JP, SG, AE and NG are told
 * plainly that Stripe cannot pay out there from Storelib, before any account
 * is opened. The same matrix from a US platform shows the rule follows the
 * platform, not a list of countries typed into the code.
 */
import http from "node:http"
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 600)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── the doubles ─────────────────────────────────────────────────────────── */

type Row = Record<string, unknown> & { id: string }
const db: Record<string, Row[]> = { creators: [], profiles: [], seller_ledger: [] }

interface StripeWorld {
  /** Stripe has approved the platform for transfers-only accounts. */
  transfersOnlyApproved: boolean
  /** Countries where Stripe refuses card_payments. */
  noCards: Set<string>
  /** Countries Stripe itself will not open an account in. */
  closed: Set<string>
  /** Every create answers 500. */
  down: boolean
  /** Runs when an account is made (a second tab saving first). */
  onCreate?: (id: string) => void
}
const world: StripeWorld = { transfersOnlyApproved: false, noCards: new Set(), closed: new Set(), down: false }
const calls: Array<{ method: string; path: string; body: URLSearchParams }> = []
const accounts: Record<string, Record<string, unknown>> = {}
let made = 0
let reqs = 0

function matches(row: Row, q: URLSearchParams): boolean {
  for (const [k, v] of q) {
    if (["select", "on_conflict", "limit", "order", "columns"].includes(k)) continue
    const have = row[k]
    if (v.startsWith("eq.") && String(have ?? "") !== v.slice(3)) return false
    if (v === "is.null" && have !== null && have !== undefined) return false
  }
  return true
}

function stripeError(res: http.ServerResponse, status: number, type: string, message: string, extra: Record<string, unknown> = {}) {
  res.writeHead(status, { "content-type": "application/json", "request-id": `req_test${++reqs}` })
  res.end(JSON.stringify({ error: { type, message, ...extra } }))
}

const server = http.createServer(async (req, res) => {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const raw = Buffer.concat(chunks).toString()
  const url = new URL(req.url ?? "/", "http://x")
  const send = (o: unknown, status = 200) => {
    res.writeHead(status, { "content-type": "application/json", "request-id": `req_test${++reqs}` })
    res.end(JSON.stringify(o))
  }

  /* Supabase (PostgREST) */
  if (url.pathname.startsWith("/rest/v1/")) {
    const table = url.pathname.slice("/rest/v1/".length)
    const rows = (db[table] ??= [])
    const hit = rows.filter((r) => matches(r, url.searchParams))
    if (req.method === "GET" || req.method === "HEAD") return send(hit)
    if (req.method === "PATCH") {
      const patch = JSON.parse(raw || "{}")
      for (const r of hit) Object.assign(r, patch)
      return send(hit.map((r) => ({ ...r })))
    }
    if (req.method === "POST") {
      const body = JSON.parse(raw || "{}")
      for (const b of Array.isArray(body) ? body : [body]) rows.push({ id: String(b.id ?? b.creator_id ?? Math.random()), ...b })
      return send([])
    }
    return send([])
  }

  /* Stripe */
  const path = url.pathname.replace(/^\/v1\//, "")
  const body = new URLSearchParams(raw)
  calls.push({ method: req.method ?? "", path, body })
  if (path === "account") return send({ id: "acct_platform", object: "account", country: process.env.TEST_PLATFORM ?? "RO" })
  if (path === "accounts" && req.method === "POST") {
    if (world.down) return stripeError(res, 500, "api_error", "An unknown error occurred")
    const country = body.get("country") ?? ""
    const cards = body.get("capabilities[card_payments][requested]") === "true"
    if (world.closed.has(country)) return stripeError(res, 400, "invalid_request_error", `The country ${country} is not supported for connected accounts on your platform.`, { param: "country" })
    if (cards && world.noCards.has(country)) return stripeError(res, 400, "invalid_request_error", `You cannot request the card_payments capability for accounts in country ${country}.`, { param: "capabilities" })
    if (!cards && !world.transfersOnlyApproved) {
      return stripeError(res, 400, "invalid_request_error", "Your platform needs approval for accounts to have requested the `transfers` capability without the `card_payments` capability. If you would like to request transfers without card_payments, please contact us via https://support.stripe.com/contact.")
    }
    const id = `acct_t${++made}`
    accounts[id] = {
      id,
      object: "account",
      country,
      details_submitted: false,
      charges_enabled: false,
      payouts_enabled: false,
      controller: { requirement_collection: body.get("controller[requirement_collection]") ?? "stripe" },
      capabilities: { transfers: "inactive", ...(cards ? { card_payments: "inactive" } : {}) },
      tos_acceptance: { service_agreement: "full" },
      settings: { payouts: { schedule: { interval: "daily" } } },
    }
    world.onCreate?.(id)
    return send(accounts[id])
  }
  const one = /^accounts\/(acct_\w+)$/.exec(path)
  if (one) {
    const a = accounts[one[1]]
    if (!a) return stripeError(res, 404, "invalid_request_error", "No such account", { code: "resource_missing" })
    if (req.method === "DELETE") {
      delete accounts[one[1]]
      return send({ id: one[1], deleted: true })
    }
    if (req.method === "POST" && body.get("settings[payouts][schedule][interval]")) (a.settings as { payouts: { schedule: { interval: string } } }).payouts.schedule.interval = "manual"
    return send(a)
  }
  stripeError(res, 404, "invalid_request_error", `no stub for ${req.method} ${path}`)
})

/* ── the run ─────────────────────────────────────────────────────────────── */

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()))
  const port = (server.address() as { port: number }).port
  process.env.STRIPE_SECRET_KEY = "sk_test_double"
  process.env.STRIPE_API_BASE = `http://127.0.0.1:${port}`
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role_double"
  delete process.env.STRIPE_PLATFORM_COUNTRY

  /* Logged lines are kept to check what Vercel would show, and kept off the test output. */
  const logged: string[] = []
  const keep = (...a: unknown[]) => logged.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "))
  const realError = console.error
  const realWarn = console.warn
  const realInfo = console.info
  console.error = keep
  console.warn = keep
  console.info = keep

  const { ensureStripeAccount, resolveCountryForStart } = await import("../lib/payments/stripe/connect")
  const { PaymentsProblem } = await import("../lib/payments/errors")
  const { paymentsSetupError } = await import("../lib/payments/stripe/setup-errors")
  const { readsLikeStripe } = await import("../lib/payments/verify-id")
  const { accountAttempts } = await import("../lib/payments/stripe/account-attempts")
  const { cannotPayOutLine, payoutRoute } = await import("../lib/payments/stripe/payout-regions")

  let n = 0
  const seller = () => {
    const id = `c${++n}`
    db.creators.push({ id, user_id: `u${n}`, username: `seller${n}`, display_name: `Seller ${n}`, bio: null, stripe_account_id: null, stripe_connected_at: null })
    db.profiles.push({ id: `u${n}`, email: `seller${n}@example.com`, country: null, first_name: "Ada", last_name: "Lovelace" })
    return { id, userId: `u${n}`, email: `seller${n}@example.com` }
  }
  const start = async (country: string) => {
    const who = seller()
    const before = calls.length
    try {
      const account = await ensureStripeAccount(who, { kind: "individual", country })
      return { who, account, error: null as null | { message: string; code: string | null; status: number }, creates: calls.slice(before).filter((c) => c.method === "POST" && c.path === "accounts") }
    } catch (e) {
      const p = e as InstanceType<typeof PaymentsProblem>
      return { who, account: null, error: { message: p.userMessage ?? String(e), code: p.code ?? null, status: p.status ?? 0 }, creates: calls.slice(before).filter((c) => c.method === "POST" && c.path === "accounts") }
    }
  }
  const row = (id: string) => db.creators.find((r) => r.id === id)!

  try {
    section("1. The country matrix, from a Romanian platform, before Stripe approves transfers-only accounts")
    const OPEN = ["US", "GB", "DE", "FR", "RO", "ES", "IT", "NL", "PL", "CA"]
    const OUTSIDE = ["AU", "BR", "MX", "IN", "JP", "SG", "AE", "NG"]
    for (const c of OPEN) {
      const r = await start(c)
      const saved = r.account ? row(r.who.id).stripe_account_id : null
      const acct = r.account ? accounts[r.account] : null
      check(`${c}: an account opens, in ${c}, saved on the seller`, !!r.account && saved === r.account && acct?.country === c, r.error)
      check(`${c}:   on the full agreement, never the recipient one`, r.creates.every((x) => !x.body.has("tos_acceptance[service_agreement]")))
      check(`${c}:   setup stays inside Storelib (Storelib collects, no Stripe dashboard)`, (acct?.controller as { requirement_collection?: string } | undefined)?.requirement_collection === "application")
      check(`${c}:   payouts are manual (Storelib's Cash out)`, (acct?.settings as { payouts: { schedule: { interval: string } } } | undefined)?.payouts.schedule.interval === "manual")
    }
    for (const c of OUTSIDE) {
      const r = await start(c)
      check(`${c}: no account is opened, and Stripe is not asked to`, !r.account && r.creates.length === 0)
      check(`${c}:   the seller is told why and what to do, by the country's name`, r.error?.code === "country_unsupported" && /can't send payouts from Storelib to a bank in/.test(r.error.message) && /choose that country/.test(r.error.message) && /support@storelib\.com/.test(r.error.message) && !/\b[A-Z]{2}\b yet/.test(r.error.message), r.error)
      check(`${c}:   never "try again"`, !/try again/i.test(r.error?.message ?? ""))
    }
    const de = calls.filter((c) => c.method === "POST" && c.path === "accounts" && c.body.get("country") === "DE")
    check("a cross-border seller is asked for transfers only first, then cards and transfers", de.length === 2 && !de[0].body.has("capabilities[card_payments][requested]") && de[1].body.get("capabilities[card_payments][requested]") === "true", de.map((d) => d.body.toString()))
    check("Stripe's platform country was asked once, not once per seller", calls.filter((c) => c.path === "account").length === 1)
    check("the refusal is logged as one JSON line with Stripe's request id and type", logged.some((l) => /"evt":"stripe_connect_attempt_refused"/.test(l) && /"requestId":"req_test\d+"/.test(l) && /"type":"StripeInvalidRequestError"/.test(l) && /"shape":"transfers\/storelib"/.test(l)))

    section("2. Once Stripe approves transfers-only accounts, cross-border is that shape again")
    world.transfersOnlyApproved = true
    {
      const r = await start("FR")
      check("a French seller gets transfers only, in one call", !!r.account && r.creates.length === 1 && !r.creates[0].body.has("capabilities[card_payments][requested]"))
    }
    world.transfersOnlyApproved = false

    section("3. The same matrix from a US platform (the rule follows the platform)")
    process.env.STRIPE_PLATFORM_COUNTRY = "US"
    for (const c of ["US", "GB", "DE", "CA", "RO"]) {
      const r = await start(c)
      check(`US platform, ${c}: an account opens`, !!r.account, r.error)
    }
    for (const c of ["AU", "JP", "BR"]) {
      const r = await start(c)
      check(`US platform, ${c}: a clear refusal, no account`, r.error?.code === "country_unsupported" && r.creates.length === 0)
    }
    delete process.env.STRIPE_PLATFORM_COUNTRY

    section("4. Refusals that are not the country, each with its own next step")
    world.noCards.add("RO")
    {
      const r = await start("RO")
      check("cards refused at home: transfers only is tried, and the approval refusal is told as Storelib's side", r.error?.code === "platform_setup" && /not open on Storelib yet/.test(r.error.message) && !/try again/i.test(r.error.message), r.error)
    }
    world.noCards.clear()
    world.closed.add("LI")
    {
      const r = await start("LI")
      check("a country Stripe itself will not open: choose another country", r.error?.code === "country_unsupported" && /Choose another country/.test(r.error.message), r.error)
    }
    world.closed.clear()
    world.down = true
    {
      const r = await start("DE")
      check("Stripe down: the only case that says try again, and nothing is saved", r.error?.code === "retry" && /Try again in a minute/.test(r.error.message) && row(r.who.id).stripe_account_id === null, r.error)
      const line = logged.filter((l) => /"evt":"stripe_connect_start_failed"/.test(l)).pop() ?? ""
      check("  logged as an error with what the seller was shown and Stripe's own answer", /"shown":"retry"/.test(line) && /"country":"DE"/.test(line) && /"type":"Stripe\w+Error"/.test(line), line)
    }
    world.down = false
    /* The 500s above opened the per-instance breaker (lib/stripe/resilience), as they would in production: closed again for the rest of the run. */
    ;(await import("../lib/stripe")).stripeBreaker.success()
    {
      const unknown = paymentsSetupError({ type: "StripeInvalidRequestError", message: "Something new Stripe says", requestId: "req_abc123" })
      check("an answer nobody has seen before gives support a reference, not try again", unknown.code === "unknown" && /req_abc123/.test(unknown.message) && !/try again/i.test(unknown.message))
      const profile = paymentsSetupError({ message: "Please review the responsibilities of managing losses for connected accounts at https://dashboard.stripe.com/settings/connect/platform-profile." })
      check("the platform profile refusal is told to the seller as Storelib's side, not as a Stripe Dashboard instruction", profile.code === "platform_setup" && !/Platform profile|Settings, then Connect/.test(profile.message))
      const auth = paymentsSetupError({ type: "StripeAuthenticationError", message: "Invalid API Key provided: sk_live_****" })
      check("a bad platform key is Storelib's side, and the key never reaches the seller", auth.code === "platform_setup" && !/sk_/.test(auth.message))
    }

    section("5. The country is never guessed")
    {
      const who = seller()
      let code: string | null = null
      try {
        await resolveCountryForStart(who, "")
      } catch (e) {
        code = (e as InstanceType<typeof PaymentsProblem>).code
      }
      check("no country on the form or the profile: asked for, not set to the platform's", code === "country_required")
      const r = await start("")
      check("ensureStripeAccount refuses a missing country the same way, before Stripe", r.error?.code === "country_required" && r.creates.length === 0)
    }

    section("6. One account per seller, and a wrong-country account replaced")
    {
      const first = await start("DE")
      const id = first.account!
      const again = await ensureStripeAccount(first.who, { kind: "individual", country: "DE" })
      check("a second press with an account in place returns that account, no new one", again === id && Object.keys(accounts).includes(id))

      const who = seller()
      const old = await ensureStripeAccount(who, { kind: "individual", country: "RO" })
      const swapped = await ensureStripeAccount(who, { kind: "individual", country: "DE" })
      check("an untouched account in the wrong country is replaced by one in the country chosen", swapped !== old && accounts[swapped]?.country === "DE" && row(who.id).stripe_account_id === swapped)
      check("  and the wrong one is removed from Stripe", !accounts[old] && calls.some((c) => c.method === "DELETE" && c.path === `accounts/${old}`))

      accounts[swapped].details_submitted = true
      const kept = await ensureStripeAccount(who, { kind: "individual", country: "FR" })
      check("an account with anything submitted is never replaced, whatever is asked", kept === swapped && !!accounts[swapped])

      /* Two tabs: the row is taken between this request's read and its save. */
      const race = seller()
      const theirs = "acct_other_tab"
      accounts[theirs] = { id: theirs, object: "account", country: "DE", details_submitted: false, charges_enabled: false, payouts_enabled: false, controller: { requirement_collection: "application" }, tos_acceptance: { service_agreement: "full" }, settings: { payouts: { schedule: { interval: "manual" } } } }
      const target = db.creators.find((r) => r.id === race.id)!
      let ours = ""
      world.onCreate = (id) => {
        ours = id
        target.stripe_account_id = theirs
      }
      const got = await ensureStripeAccount(race, { kind: "individual", country: "DE" })
      world.onCreate = undefined
      check("two tabs at once: the account already saved wins", got === theirs && target.stripe_account_id === theirs)
      check("  and the second account is removed, not left on Stripe", !accounts[ours] && calls.some((c) => c.method === "DELETE" && c.path === `accounts/${ours}`))
    }

    section("7. What the page shows is what the server said")
    {
      const sentences = [
        cannotPayOutLine("Brazil"),
        ...["needs approval for accounts to have requested the `transfers` capability without", "The country XX is not supported", "Invalid email address", "connect is not enabled", "rate limit", "Something new"].map((m) => paymentsSetupError({ message: m, requestId: "req_1" }).message),
      ]
      check("no server sentence is swallowed by the page's wire filter (it used to turn them into 'Try again')", sentences.every((s) => !readsLikeStripe(s)), sentences.filter((s) => readsLikeStripe(s)))
      const sheet = read("app/(storelib)/payouts-sheet/payouts-sheet.tsx")
      const embed = read("components/app/settings/stripe-connect-embedded.tsx")
      check("the apps' sheet no longer drops any sentence that names Stripe", !/!\/stripe\|acct_\|accs_\/i\.test/.test(sheet) && /readsLikeStripe/.test(sheet))
      check("the embedded form no longer drops any sentence that names Stripe", !/\|stripe\/i\.test\(message\)/.test(embed) && /readsLikeStripe\(message\)/.test(embed))
      check("  and a frame that will not load says why, and is reported to the server log", /loadErrorLine\(error\?\.type/.test(embed) && /\/api\/client-errors/.test(embed))
      const flow = read("components/app/settings/payments-setup-flow.tsx")
      check("setup asks the country before opening anything, on the web and in the apps", /function CountryStep/.test(flow) && (flow.match(/<CountryStep /g) ?? []).length === 2 && !/country: current\.prefill\?\.country \|\| current\.payoutHint\?\.country/.test(flow) && !/country: data\.prefill\?\.country \|\| data\.payoutHint\?\.country/.test(flow))
      check("  a country Stripe cannot pay out to is said before Continue", /payoutRoute\(platform, code\) === "unsupported"/.test(flow) && /disabled=\{blocked\}/.test(flow))
      check("  Try again is offered only where trying again can work", /const retry = code === "retry" \|\| code === null/.test(flow))
      check("  an existing account resumes on Stripe's form, the country is not asked again", /if \(!existed\.current && !country\)/.test(flow))
      const route = read("app/api/payments/[action]/route.ts")
      check("every refused action is a JSON log line with what the seller saw, and the code goes to the page", /evt: "payments_api_problem"/.test(route) && /\{ error: e\.userMessage, code: e\.code \}/.test(route))
    }

    section("8. Shapes, pure")
    {
      const shared = { country: "DE" }
      for (const c of ["US", "GB", "DE", "FR", "RO", "ES", "IT", "NL", "PL", "CA", "AU", "BR", "MX", "IN", "JP", "SG", "AE"]) {
        const route = payoutRoute("RO", c)
        const tries = accountAttempts(shared, route)
        const ok = route === "unsupported" ? tries.length === 0 : tries.length > 0 && tries.every((t) => t.capabilities?.transfers?.requested === true) && tries.some((t) => !!t.capabilities?.card_payments) && tries.some((t) => !t.capabilities?.card_payments)
        check(`${c} from Romania: ${route}, ${tries.length} shapes`, ok)
      }
    }
  } finally {
    console.error = realError
    console.warn = realWarn
    console.info = realInfo
    server.close()
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
  process.exit(0)
}

main().catch((e) => {
  console.log("crashed:", e)
  process.exit(1)
})
