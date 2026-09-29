/**
 * STORELIB PAYMENTS ON AIRWALLEX.
 *
 * Nothing here talks to Airwallex: the client is driven against a fake
 * `fetch` that answers the way Airwallex's API reference documents, and
 * records every request, so each check is about what Storelib SENDS (the
 * headers, the ids, the amounts) and how it reads what comes back. What only
 * a real sandbox can show is listed in docs/payments/airwallex.md.
 */
import { createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { decimalsOf, toMajor, toMajorNumber, toMinor } from "@/lib/payments/money"
import {
  checkoutOpen,
  creatorPartOf,
  payoutStatusOf,
  readFormStatus,
  readLifecycle,
  requirementNotes,
  STAGE_COPY,
  stageOf,
  type ProviderAccountFacts,
} from "@/lib/payments/model"
import { airwallexRollout, inAirwallexRollout, readAirwallexConfig, type AirwallexConfig } from "@/lib/payments/airwallex/config"
import { AirwallexError, createAirwallexClient, requestId, requestIdMax } from "@/lib/payments/airwallex/client"
import {
  authorizeComponent,
  chargeCreator,
  createAccount,
  createBeneficiary,
  createPaymentIntent,
  createPayout,
  createRefund,
  currentBalances,
  retrieveAccount,
} from "@/lib/payments/airwallex/resources"
import { familyOf, parseAirwallexEvent, verifyAirwallexSignature, WEBHOOK_TOLERANCE_MS } from "@/lib/payments/airwallex/webhook"
import { maskBeneficiary, sanitizeRequirements } from "@/lib/payments/store"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
  }
}

/* ── A fake Airwallex ─────────────────────────────────────────────────── */

interface Seen {
  method: string
  path: string
  headers: Record<string, string>
  body: Record<string, unknown> | null
}

function fakeAirwallex(answer: (req: Seen) => { status: number; json?: unknown }) {
  const seen: Seen[] = []
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const u = new URL(String(url))
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) headers[k.toLowerCase()] = v
    const req: Seen = { method: init?.method ?? "GET", path: u.pathname + u.search, headers, body: init?.body ? JSON.parse(String(init.body)) : null }
    seen.push(req)
    const out = answer(req)
    return new Response(out.json === undefined ? null : JSON.stringify(out.json), { status: out.status, headers: { "content-type": "application/json" } })
  }) as typeof fetch
  return { seen, fetchImpl }
}

const CONFIG: AirwallexConfig = {
  clientId: "client-123",
  apiKey: "key-456",
  env: "sandbox",
  baseUrl: "https://api.sandbox.airwallex.com",
  apiVersion: null,
  webhookSecret: "whsec",
  hostedFlowTemplate: "tmpl",
  embeddedComponents: true,
}

const login = { status: 201, json: { token: "tok-1", expires_at: new Date(Date.now() + 30 * 60_000).toISOString() } }

async function main() {
  console.log("\nMoney crosses once, by the currency's own decimals")
  {
    check("dollars have two decimals, yen none, dinars three", decimalsOf("usd") === 2 && decimalsOf("JPY") === 0 && decimalsOf("KWD") === 3)
    check("1234 cents is 12.34", toMajor(1234, "USD") === "12.34")
    check("5 cents is 0.05, not 0.5", toMajor(5, "USD") === "0.05")
    check("1234 yen is 1234", toMajor(1234, "JPY") === "1234")
    check("1234 fils is 1.234 dinars", toMajor(1234, "KWD") === "1.234")
    check("a negative amount keeps its sign", toMajor(-250, "EUR") === "-2.50")
    check("a JSON number where Airwallex types one", toMajorNumber(1999, "USD") === 19.99)
    let refused = false
    try {
      toMajor(12.5, "USD")
    } catch {
      refused = true
    }
    check("half a cent is refused, not rounded", refused)
    check("0.29 back is 29, never 28.999", toMinor(0.29, "USD") === 29 && toMinor("0.29", "USD") === 29)
    check("a figure finer than the currency rounds half up", toMinor("1.005", "USD") === 101 && toMinor("1.004", "USD") === 100)
    check("yen and dinars come back whole", toMinor(1200, "JPY") === 1200 && toMinor("1.234", "KWD") === 1234)
    check("nothing is zero", toMinor(null, "USD") === 0 && toMinor(undefined, "USD") === 0)
    for (const n of [0, 1, 9, 10, 99, 100, 101, 12345, 999999999]) {
      if (toMinor(toMajor(n, "USD"), "USD") !== n) check(`round trip ${n}`, false)
    }
    check("every amount survives the round trip", true)
  }

  console.log("\nThe account's lifecycle and the form's status are two different things")
  {
    const f = (o: Partial<ProviderAccountFacts>): ProviderAccountFacts => ({ hasAccount: true, lifecycle: "CREATED", formStatus: null, hasPayoutDestination: false, ...o })
    check("no account is Set up payments", stageOf(f({ hasAccount: false })) === "set_up")
    check("CREATED is Verify your details", stageOf(f({ lifecycle: "CREATED" })) === "verify")
    check("CREATED with the form finished reads as review, not as fill it in again", stageOf(f({ lifecycle: "CREATED", formStatus: "SUCCESS" })) === "review")
    check("SUBMITTED is under review", stageOf(f({ lifecycle: "SUBMITTED" })) === "review")
    check("ACTION_REQUIRED is Action required", stageOf(f({ lifecycle: "ACTION_REQUIRED" })) === "action")
    check("ACTIVE without a bank account is Add payout account", stageOf(f({ lifecycle: "ACTIVE" })) === "payout")
    check("ACTIVE with one is Payments active", stageOf(f({ lifecycle: "ACTIVE", hasPayoutDestination: true })) === "active")
    check("SUSPENDED, DORMANT and CLOSED each have their own words", stageOf(f({ lifecycle: "SUSPENDED" })) === "paused" && stageOf(f({ lifecycle: "DORMANT" })) === "inactive" && stageOf(f({ lifecycle: "CLOSED" })) === "closed")
    check("a status Airwallex adds later is read as unknown, and not ready", readLifecycle("RESTRICTED_NEW") === "unknown" && stageOf(f({ lifecycle: "unknown" })) === "checking")
    check("the form's SUCCESS is never a lifecycle", readLifecycle("SUCCESS") === "unknown" && readFormStatus("SUCCESS") === "SUCCESS")
    check("checkout opens only for ACTIVE with a payout account", checkoutOpen(f({ lifecycle: "ACTIVE", hasPayoutDestination: true })))
    check("  not for a form that succeeded while the account is under review", !checkoutOpen(f({ lifecycle: "SUBMITTED", formStatus: "SUCCESS", hasPayoutDestination: true })))
    check("  not for ACTIVE with nowhere to pay out", !checkoutOpen(f({ lifecycle: "ACTIVE" })))
    check("  not for a suspended account that had a bank account", !checkoutOpen(f({ lifecycle: "SUSPENDED", hasPayoutDestination: true })))
    check("  not without an account at all", !checkoutOpen(f({ hasAccount: false, lifecycle: "ACTIVE", hasPayoutDestination: true })))
    const titles = Object.values(STAGE_COPY).map((c) => [c.title, c.line ?? "", c.action ?? ""].join(" ")).join(" ")
    check("the words are Storelib's: no raw status, no provider id", !/ACTION_REQUIRED|SUBMITTED|acct_|kyc|KYB/i.test(titles))
    check("  and none of the banned words or an em dash", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform|—/i.test(titles))
    check("the stages are the ones asked for", ["Set up payments", "Verify your details", "Add payout account", "Payments under review", "Action required", "Payments active"].every((t) => titles.includes(t)))
  }

  console.log("\nWhat Airwallex asks for is said plainly, and nothing personal is kept")
  {
    const raw = {
      primary_identification_required: [{ error_code: "EXPIRED_DOCUMENT", first_name: "Alice", last_name: "Smith", front_file_id: "Njg3", message: "Please upload a photo" }],
      photo_file_id_required: { error_code: "FACE_CROPPED", photo_file_id: "abc", message: "retry" },
      agreement_to_terms_and_conditions_required: { endpoint: "/x", method: "POST", message: "agree" },
      other: [{ error_code: "OTHER", message: "Please contact customer support." }],
    }
    const kept = sanitizeRequirements(raw)
    const text = JSON.stringify(kept)
    check("only the codes are kept", !!kept && !/Alice|Smith|Njg3|abc|upload|support|\/x/.test(text), kept)
    check("  and each kind of requirement still reads", !!kept?.primary_identification_required && !!kept.photo_file_id_required && kept.agreement_to_terms_and_conditions_required === true && Array.isArray(kept.other))
    const notes = requirementNotes(kept)
    check("the notes name what to do", notes.some((n) => /new photo of your ID: the document has expired/.test(n.text)) && notes.some((n) => /selfie/.test(n.text)) && notes.some((n) => /Accept the terms/.test(n.text)))
    check("  and never carry a name", !notes.some((n) => /Alice|Smith/.test(n.text)))
    check("nothing asked, a next action set: one general line", requirementNotes(null, "UPLOAD").length === 1)
  }

  console.log("\nA payout destination is a bank, a country, a currency and four digits")
  {
    const masked = maskBeneficiary({
      id: "b1",
      beneficiary: { entity_type: "PERSONAL", bank_details: { bank_name: "National Australia Bank", bank_country_code: "au", account_currency: "aud", account_number: "12750852", account_name: "Lee Da Ming" } },
    })
    check("the last four only", masked.last4 === "0852" && !JSON.stringify(masked).includes("12750852"))
    check("  no account holder's name", !JSON.stringify(masked).includes("Lee"))
    check("  the bank, country and currency, tidied", masked.bankName === "National Australia Bank" && masked.country === "AU" && masked.currency === "AUD" && masked.holder === "individual")
    check("an IBAN is masked the same way", maskBeneficiary({ beneficiary: { bank_details: { iban: "ES80 2310 0001 1800 0001 2345" } } }).last4 === "2345")
  }

  console.log("\nSandbox first: production cannot start by accident")
  {
    check("no credentials, not configured", !readAirwallexConfig({}).ok)
    const sb = readAirwallexConfig({ AIRWALLEX_CLIENT_ID: "c", AIRWALLEX_API_KEY: "k" })
    check("sandbox by default, on Airwallex's sandbox host", sb.ok && sb.config.env === "sandbox" && sb.config.baseUrl === "https://api.sandbox.airwallex.com")
    check("production refused without AIRWALLEX_ALLOW_LIVE", !readAirwallexConfig({ AIRWALLEX_CLIENT_ID: "c", AIRWALLEX_API_KEY: "k", AIRWALLEX_ENV: "production" }).ok)
    const live = readAirwallexConfig({ AIRWALLEX_CLIENT_ID: "c", AIRWALLEX_API_KEY: "k", AIRWALLEX_ENV: "production", AIRWALLEX_ALLOW_LIVE: "1" })
    check("  and on the live host only with it", live.ok && live.config.baseUrl === "https://api.airwallex.com")
    check("a mistyped environment is refused, not guessed", !readAirwallexConfig({ AIRWALLEX_CLIENT_ID: "c", AIRWALLEX_API_KEY: "k", AIRWALLEX_ENV: "prod" }).ok)
    const env = { AIRWALLEX_CLIENT_ID: "c", AIRWALLEX_API_KEY: "k" }
    check("nobody is on Airwallex until the rollout names them", !inAirwallexRollout("creator-1", env))
    check("  a named creator is", inAirwallexRollout("creator-1", { ...env, STORELIB_PAYMENTS_AIRWALLEX: "creator-9, creator-1" }) && !inAirwallexRollout("creator-2", { ...env, STORELIB_PAYMENTS_AIRWALLEX: "creator-9, creator-1" }))
    check("  and no one without credentials, whatever the rollout says", !inAirwallexRollout("creator-1", { STORELIB_PAYMENTS_AIRWALLEX: "all" }))
    check("\"all\" is its own answer, so the caller can keep Stripe creators where they are", airwallexRollout("creator-1", { ...env, STORELIB_PAYMENTS_AIRWALLEX: "all" }) === "all" && airwallexRollout("creator-1", { ...env, STORELIB_PAYMENTS_AIRWALLEX: "creator-1" }) === "named")
    const service = read("lib/payments/service.ts")
    check("a creator already paid through Stripe is never moved by \"all\"", /if \(reach === "all"\) \{[\s\S]*?return stripeAccount \? "stripe" : "airwallex"/.test(service))
    check("  while Airwallex is not configured, no read at all: Stripe", /if \(!readAirwallexConfig\(\)\.ok\) return "stripe"/.test(service))
    check("  and an Airwallex account already made keeps its creator there", /if \(row\) return "airwallex"/.test(service))
  }

  console.log("\nThe client: one login, the right account, nothing retried that moves money")
  {
    let logins = 0
    const { seen, fetchImpl } = fakeAirwallex((r) => {
      if (r.path === "/api/v1/authentication/login") {
        logins++
        return login
      }
      return { status: 200, json: { ok: true } }
    })
    const c = createAirwallexClient(CONFIG, fetchImpl)
    await Promise.all([c.call("GET", "/api/v1/accounts/acct_1", { onBehalfOf: null }), c.call("GET", "/api/v1/balances/current", { onBehalfOf: "acct_abc" })])
    await c.call("GET", "/api/v1/transfers", { onBehalfOf: "acct_abc" })
    check("two calls at once share one login, and the token is reused", logins === 1, logins)
    const loginReq = seen.find((s) => s.path === "/api/v1/authentication/login")
    check("the login sends the client id and key as headers, nothing in a body", loginReq?.headers["x-client-id"] === "client-123" && loginReq?.headers["x-api-key"] === "key-456" && loginReq?.body === null)
    const platform = seen.find((s) => s.path === "/api/v1/accounts/acct_1")
    const onBehalf = seen.find((s) => s.path === "/api/v1/balances/current")
    check("the platform's own call carries no x-on-behalf-of", platform !== undefined && !("x-on-behalf-of" in platform.headers))
    check("a creator's call carries theirs", onBehalf?.headers["x-on-behalf-of"] === "acct_abc")
    check("the API key never leaves the login", seen.filter((s) => s.path !== "/api/v1/authentication/login").every((s) => !("x-api-key" in s.headers) && s.headers.authorization === "Bearer tok-1"))
    let refused = false
    try {
      await c.call("GET", "/api/v1/balances/current", { onBehalfOf: "creator-uuid-not-an-account" })
    } catch {
      refused = true
    }
    check("anything but an account id is refused as x-on-behalf-of", refused)
    const pinned = fakeAirwallex((r) => (r.path.endsWith("/login") ? login : { status: 200, json: {} }))
    await createAirwallexClient({ ...CONFIG, apiVersion: "2026-08-21" }, pinned.fetchImpl).call("GET", "/api/v1/accounts/acct_1", { onBehalfOf: null })
    check("an API version is pinned on every call when set", pinned.seen.every((s) => s.headers["x-api-version"] === "2026-08-21"))
  }
  {
    let logins = 0
    let first = true
    const { seen, fetchImpl } = fakeAirwallex((r) => {
      if (r.path.endsWith("/login")) {
        logins++
        return { status: 201, json: { token: `tok-${logins}`, expires_at: new Date(Date.now() + 30 * 60_000).toISOString() } }
      }
      if (first) {
        first = false
        return { status: 401, json: { code: "credentials_expired" } }
      }
      return { status: 200, json: { id: "acct_1", status: "ACTIVE" } }
    })
    const c = createAirwallexClient(CONFIG, fetchImpl)
    const acct = await retrieveAccount(c, "acct_1")
    check("a 401 logs in again and repeats the call once", acct.status === "ACTIVE" && logins === 2 && seen.at(-1)?.headers.authorization === "Bearer tok-2")
  }
  {
    let calls = 0
    const { fetchImpl } = fakeAirwallex((r) => {
      if (r.path.endsWith("/login")) return login
      calls++
      return { status: 500, json: { code: "internal_error", message: "boom" } }
    })
    const c = createAirwallexClient(CONFIG, fetchImpl)
    let thrown: unknown = null
    try {
      await createPayout(c, "acct_1", { payoutId: "p-1", beneficiaryId: "b-1", amountMinor: 1000, currency: "USD" })
    } catch (e) {
      thrown = e
    }
    check("a 500 on a payout is not retried here: the caller retries with the same request id", calls === 1)
    check("  and comes back as AirwallexError with Airwallex's code, for the log", thrown instanceof AirwallexError && thrown.status === 500 && thrown.code === "internal_error")
  }
  {
    check("request ids come from what the request is for", requestId("pi", "order-1") === "pi:order-1" && requestId("pi", "order-1") === requestId("pi", "order-1"))
    const long = requestId("refund", "x".repeat(200))
    check("  and stay within Airwallex's 64 characters", long.length <= 64 && long === requestId("refund", "x".repeat(200)))
    check("  and 50 for Charges", requestIdMax(50, "chg", "refund:" + "y".repeat(120)).length <= 50)
  }

  console.log("\nEach request, as Airwallex's reference documents it")
  {
    const { seen, fetchImpl } = fakeAirwallex((r) => {
      if (r.path.endsWith("/login")) return login
      if (r.path === "/api/v1/pa/payment_intents/create") return { status: 201, json: { id: "int_abc", client_secret: "sec", status: "REQUIRES_PAYMENT_METHOD" } }
      if (r.path === "/api/v1/authentication/authorize") return { status: 200, json: { authorization_code: "code-1" } }
      if (r.path === "/api/v1/balances/current") return { status: 200, json: [{ account_type: "cash", currency: "USD", available_amount: 12.34, pending_amount: 5 }] }
      return { status: 201, json: { id: "x_1", status: "CREATED" } }
    })
    const c = createAirwallexClient(CONFIG, fetchImpl)
    await createPaymentIntent(c, { orderId: "chk-1", amountMinor: 2500, currency: "usd", accountId: "acct_seller", creatorShareMinor: 2350, metadata: { product_id: "p1" } })
    const pi = seen.find((s) => s.path === "/api/v1/pa/payment_intents/create")
    check("a payment is Storelib's: no x-on-behalf-of (collect payments directly)", !!pi && !("x-on-behalf-of" in pi.headers))
    check("  the creator is named in the body", pi?.body?.connected_account_id === "acct_seller")
    check("  their share is split to them when it succeeds, Storelib's fee is what is not split", JSON.stringify(pi?.body?.funds_split_data) === JSON.stringify([{ amount: 23.5, destination: "acct_seller" }]))
    check("  in major units, upper case currency", pi?.body?.amount === 25 && pi?.body?.currency === "USD")
    check("  one request id per checkout", pi?.body?.request_id === "pi:chk-1" && pi?.body?.merchant_order_id === "chk-1")
    check("  the checkout's metadata goes with it", (pi?.body?.metadata as Record<string, string>)?.product_id === "p1")
    let wrongShare = false
    try {
      await createPaymentIntent(c, { orderId: "chk-2", amountMinor: 100, currency: "USD", accountId: "acct_seller", creatorShareMinor: 101 })
    } catch {
      wrongShare = true
    }
    check("a share larger than the payment is refused before any request", wrongShare)

    await createPayout(c, "acct_seller", { payoutId: "pay-9", beneficiaryId: "ben-1", amountMinor: 1050, currency: "usd" })
    const payout = seen.find((s) => s.path === "/api/v1/transfers/create")
    check("a payout is the creator's: on behalf of their account", payout?.headers["x-on-behalf-of"] === "acct_seller")
    check("  from Storelib's own payout id, so a retry cannot pay twice", payout?.body?.request_id === "payout:pay-9" && payout?.body?.beneficiary_id === "ben-1")
    check("  as a decimal string in their currency", payout?.body?.transfer_amount === "10.50" && payout?.body?.transfer_currency === "USD")

    const balances = await currentBalances(c, "acct_seller")
    check("balances are read on behalf of the creator", seen.find((s) => s.path === "/api/v1/balances/current")?.headers["x-on-behalf-of"] === "acct_seller" && balances[0].available_amount === 12.34)

    await createBeneficiary(c, "acct_seller", { beneficiary: { bank_details: { account_number: "1" } } })
    check("a payout account is created on the creator's account", seen.find((s) => s.path === "/api/v1/beneficiaries/create")?.headers["x-on-behalf-of"] === "acct_seller")

    const code = await authorizeComponent(c, "acct_seller", ["onboarding:write"], "challenge")
    const auth = seen.find((s) => s.path === "/api/v1/authentication/authorize")
    check("an embedded form is authorised for that account only, with its scope and PKCE challenge", code === "code-1" && auth?.headers["x-on-behalf-of"] === "acct_seller" && JSON.stringify(auth?.body) === JSON.stringify({ scope: ["onboarding:write"], code_challenge: "challenge" }))

    await createRefund(c, { paymentIntentId: "int_abc", refundKey: "o1:0:500", amountMinor: 500, currency: "USD" })
    const refund = seen.find((s) => s.path === "/api/v1/pa/refunds/create")
    check("a refund is Storelib's, keyed on the order and what was refunded before", !!refund && !("x-on-behalf-of" in refund.headers) && refund.body?.request_id === "refund:o1:0:500" && refund.body?.amount === 5)

    await chargeCreator(c, { accountId: "acct_seller", key: "refund:o1:0:500", amountMinor: 470, currency: "USD", reference: "Refund of order o1" })
    const charge = seen.find((s) => s.path === "/api/v1/charges/create")
    check("the creator's share of a refund is charged back from their wallet, naming them as the source", charge?.body?.source === "acct_seller" && charge?.body?.amount === "4.70" && String(charge?.body?.request_id).length <= 50)

    await createAccount(c, { kind: "individual", email: "a@b.co", country: "gb", creatorId: "cr-1", consent: { at: "2026-09-29T10:00:00.000Z", ip: "1.2.3.4", userAgent: "UA" } })
    const acct = seen.find((s) => s.path === "/api/v1/accounts/create")
    const details = acct?.body?.account_details as Record<string, unknown> | undefined
    check("an account is created as an individual or a business, in their country", details?.legal_entity_type === "INDIVIDUAL" && JSON.stringify(details?.individual_details) === JSON.stringify({ residential_address: { country_code: "GB" } }))
    const agreements = acct?.body?.customer_agreements as Record<string, unknown> | undefined
    check("  with the consent the creator gave, when and from where", agreements?.agreed_to_terms_and_conditions === true && agreements?.agreed_to_data_usage === true && JSON.stringify((agreements?.terms_and_conditions as Record<string, unknown>)?.device_data) === JSON.stringify({ ip_address: "1.2.3.4", user_agent: "UA" }))
    check("  and no field the endpoint does not take", !("request_id" in (acct?.body ?? {})) && acct?.body?.identifier === "cr-1")
  }

  console.log("\nWebhooks: signed, once each, in any order")
  {
    const secret = "whsec_test"
    const body = JSON.stringify({ id: "evt_1", name: "account.active", account_id: "acct_9", data: { object: { id: "acct_9" } }, created_at: "2026-09-29T10:00:00+0000" })
    const now = Date.now()
    const ts = String(now)
    const sig = createHmac("sha256", secret).update(ts + body).digest("hex")
    check("Airwallex's signature is accepted", verifyAirwallexSignature({ rawBody: body, timestamp: ts, signature: sig, secret, now }).ok)
    check("one changed byte is refused", !verifyAirwallexSignature({ rawBody: body.replace("acct_9", "acct_8"), timestamp: ts, signature: sig, secret, now }).ok)
    check("another secret is refused", !verifyAirwallexSignature({ rawBody: body, timestamp: ts, signature: sig, secret: "other", now }).ok)
    check("no headers, refused", !verifyAirwallexSignature({ rawBody: body, timestamp: null, signature: null, secret, now }).ok)
    check("no secret configured, every event refused", verifyAirwallexSignature({ rawBody: body, timestamp: ts, signature: sig, secret: null, now }).ok === false)
    check("a retry days later still verifies (Airwallex retries for about three days)", verifyAirwallexSignature({ rawBody: body, timestamp: ts, signature: sig, secret, now: now + 3 * 24 * 60 * 60_000 }).ok)
    check("  a signature from long before that does not", !verifyAirwallexSignature({ rawBody: body, timestamp: ts, signature: sig, secret, now: now + WEBHOOK_TOLERANCE_MS + 60_000 }).ok)
    const e = parseAirwallexEvent(body)
    check("an event is read for its id, name, account and object", e?.id === "evt_1" && e.name === "account.active" && e.accountId === "acct_9" && e.object?.id === "acct_9")
    const older = parseAirwallexEvent(JSON.stringify({ id: "x", name: "account.action_required", accountId: "acct_7", data: { agreedToTermsAndConditionsRequired: {} } }))
    check("  the older camelCase shape too", older?.accountId === "acct_7")
    check("not JSON, or no id, is nothing", parseAirwallexEvent("nope") === null && parseAirwallexEvent('{"name":"x"}') === null)
    check("each family is routed", familyOf("account.suspended") === "account" && familyOf("payment_intent.succeeded") === "payment" && familyOf("payment_dispute.won") === "dispute" && familyOf("payout.transfer.paid") === "payout" && familyOf("funds_split.failed") === "split" && familyOf("rfi.action_required") === "rfi" && familyOf("customer.created") === "other")
    const route = read("app/api/payments/airwallex/webhook/route.ts")
    check("the route verifies the raw body before it parses anything", route.indexOf("verifyAirwallexSignature(") > -1 && route.indexOf("verifyAirwallexSignature(") < route.indexOf("parseAirwallexEvent("))
    check("  claims the event id before handling it, and acknowledges a finished one", route.indexOf("claimEvent(") < route.indexOf("handleAirwallexEvent(") && /claim === "done"/.test(route))
    check("  answers 500 when it could not finish, so Airwallex delivers again", /status: 500/.test(route))
    check("  and never logs the body", !/console\.(log|error)\([^)]*raw/.test(route))
    const events = read("lib/payments/airwallex/events.ts")
    check("an account event re-reads the account from Airwallex rather than trusting the payload", /syncAccount\(row\.creator_id, "webhook"\)/.test(events))
    check("a paid checkout event makes the order through the one fulfilment path", /fulfilAirwallexIntent\(createAdminClient\(\), intentId/.test(events))
    check("a change is announced once per state reached", /key: `awx:\$\{accountId\}:active`/.test(events))
  }

  console.log("\nPayouts and refunds, in words and numbers")
  {
    check("Airwallex's transfer statuses in five words", payoutStatusOf("PAID").text === "Paid" && payoutStatusOf("PROCESSING").status === "processing" && payoutStatusOf("FAILED").status === "failed" && payoutStatusOf("CANCELLED").status === "cancelled" && payoutStatusOf("IN_APPROVAL").status === "waiting")
    check("a refund takes back the creator's part in proportion", creatorPartOf(1000, 1000, 940) === 940 && creatorPartOf(500, 1000, 940) === 470)
    check("  rounded down, never more than they got", creatorPartOf(333, 1000, 940) === 313 && creatorPartOf(5000, 1000, 940) === 940)
    check("  nothing from nothing", creatorPartOf(0, 1000, 940) === 0 && creatorPartOf(100, 0, 0) === 0)
  }

  console.log("\nThe database: Storelib's alone")
  {
    const part = read("supabase/sql/run-now/76_storelib_payments.sql")
    for (const t of ["payment_accounts", "payment_webhook_events", "payment_audit_log", "payment_fee_records", "payment_balances", "payment_payouts"]) {
      check(`${t}: row level security on`, part.includes(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`))
    }
    check("no policy, and no grant to the public or signed in keys", !/CREATE POLICY/i.test(part) && part.includes("FROM PUBLIC, anon, authenticated;"))
    check("one account per creator, one row per event, one fee record per payment", /PRIMARY KEY \(creator_id, provider\)/.test(part) && /PRIMARY KEY \(provider, event_id\)/.test(part) && /UNIQUE \(provider, provider_payment_id\)/.test(part))
    check("a fee and a share always add up to the payment", part.includes("CHECK (platform_fee_minor + creator_share_minor = gross_minor)"))
    check("an order's Airwallex payment is unique", part.includes("orders_provider_payment_id_key ON public.orders (provider_payment_id) WHERE provider_payment_id IS NOT NULL"))
    check("no identity data column anywhere", !/(first_name|last_name|date_of_birth|document|account_number|iban)\b/i.test(part.split("\n").slice(1).join("\n")))
  }

  console.log("\nStripe creators: nothing changes")
  {
    const session = read("app/api/checkout/stripe-session/route.ts")
    check("checkout asks who takes the money before it takes any", /const provider = await providerFor\(creator\.id\)/.test(session))
    check("  Airwallex only for an account checkout is open for", /!checkoutOpen\(factsOf\(row\)\)/.test(session))
    check("  Stripe's own checks and its payment intent are as they were", session.includes("application_fee_amount: fee.platformFeeCents,") && session.includes("transfer_data: { destination: account },") && /provider === "stripe" && \(creator\.charges_enabled === false/.test(session))
    const fulfil = read("lib/checkout/fulfil-payment.ts")
    check("a Stripe order is written with the columns it always had", /stripe_payment_intent_id: paid\.provider === "stripe" \? paid\.paymentId : null/.test(fulfil) && /\.\.\.\(paid\.provider === "stripe" \? \{\} : \{ provider_payment_id: paid\.paymentId \}\)/.test(fulfil))
    check("  and its seller ledger is written as before; an Airwallex sale's balance is Airwallex's", /if \(paid\.provider === "stripe"\) \{\s*await step\("ledger"/.test(fulfil))
    const refund = read("app/api/stripe/refund/route.ts")
    check("a Stripe refund still reverses the transfer, keyed as before", refund.includes("refundParams.reverse_transfer = true") && refund.includes("idempotencyKey: `storelib-refund:${orderId}:${alreadyRefunded}:${refundAmountCents}`"))
    const catalog = read("lib/notify/templates/catalog.ts")
    check("payment emails name Stripe unless the event says Airwallex", /const processor = \(d: Data\): string => \(d\.text\("provider", 20\)\.toLowerCase\(\) === "airwallex" \? "Airwallex" : "Stripe"\)/.test(catalog))
    const csp = read("lib/security/csp.ts")
    check("the page may load Airwallex's own script and forms", (csp.match(/"https:\/\/\*\.airwallex\.com"/g) ?? []).length === 3)
  }

  console.log("\nNothing secret reaches a browser")
  {
    const hub = read("components/app/settings/payments-hub.tsx")
    check("the hub imports types only from the server's payments code", !/from "@\/lib\/payments\/(service|store|airwallex\/client|airwallex\/resources)"/.test(hub.replace(/import type [^\n]+/g, "")))
    check("  and never reads an API key", !/AIRWALLEX_API_KEY|apiKey/.test(hub))
    const redirect = read("app/checkout/parts/airwallex-redirect.ts")
    check("the client secret stays in the tab, out of the address", /sessionStorage\.setItem/.test(redirect) && !/searchParams\.set\([^)]*[Ss]ecret/.test(redirect))
    const api = read("app/api/payments/[action]/route.ts")
    check("every hub action acts for the signed in creator, never an id from the body", /signedInCreator\(\)/.test(api) && !/body\.creatorId|body\.accountId/.test(api))
    check("  a creator on Stripe gets 404 from all of it", /!== "airwallex"\) return NextResponse\.json\(\{ error: "Not found\." \}, \{ status: 404/.test(api))
    check("  a payout is rate limited on its own", /bucket: moves \? "payout"/.test(api))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
