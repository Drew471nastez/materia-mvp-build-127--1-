/**
 * STRIPE, AS THE JOURNEY NEEDS IT: a small world of accounts, Checkout
 * Sessions, PaymentIntents, charges, refunds and disputes, answering the
 * methods the commerce code calls on the real `stripe` client (lib/stripe),
 * with Stripe's shapes and Stripe's idempotency (the same key returns the
 * first object). Webhooks are signed with the real SDK's test header, so the
 * webhook route verifies them exactly as it verifies Stripe's.
 *
 * Nothing here talks to a network; a method not stubbed falls through to the
 * SDK, whose request the network guard (./net.ts) refuses and records.
 */
import type Stripe from "stripe"

type Obj = Record<string, any>
let seq = 0
const id = (prefix: string) => `${prefix}_test${String(++seq).padStart(6, "0")}${Math.random().toString(36).slice(2, 8)}`
const unix = () => Math.floor(Date.now() / 1000)

export interface StripeCall {
  method: string
  args: unknown[]
}

export class StripeWorld {
  accounts = new Map<string, Obj>()
  sessions = new Map<string, Obj>()
  intents = new Map<string, Obj>()
  charges = new Map<string, Obj>()
  refunds = new Map<string, Obj>()
  disputes = new Map<string, Obj>()
  transfers = new Map<string, Obj>()
  idem = new Map<string, Obj>()
  calls: StripeCall[] = []
  /** The next refund's status ("pending" to try a refund Stripe settles later). */
  nextRefundStatus: "succeeded" | "pending" | "failed" = "succeeded"
  /** Make the next Checkout Session creation fail (a Stripe outage). */
  failNextSession = false

  /**
   * Stripe's refusal of a key sent again with other parameters ("Keys for idempotent requests can only be used with the
   * same parameters"), for the suites that turn it on (tests/pay9-checkout-attempts.test.ts). Off by default.
   */
  strictIdempotency = false
  /** What was first sent under each key (strictIdempotency only). */
  idemParams = new Map<string, string>()

  private once<T extends Obj>(opts: { idempotencyKey?: string } | undefined, make: () => T, params?: unknown): T {
    const key = opts?.idempotencyKey
    const sent = params === undefined ? null : JSON.stringify(params)
    if (key && this.idem.has(key)) {
      if (this.strictIdempotency && sent !== null && this.idemParams.has(key) && this.idemParams.get(key) !== sent) {
        throw Object.assign(new Error(`Keys for idempotent requests can only be used with the same parameters they were first used with. Try using a key other than '${key}' if you meant to execute a different request.`), { type: "StripeIdempotencyError", rawType: "idempotency_error", statusCode: 400 })
      }
      return this.idem.get(key) as T
    }
    const made = make()
    if (key) {
      this.idem.set(key, made)
      if (sent !== null) this.idemParams.set(key, sent)
    }
    return made
  }

  account(acct: string): Obj {
    return this.accounts.get(acct) ?? { id: acct, object: "account", charges_enabled: false, payouts_enabled: false, details_submitted: false, requirements: { currently_due: [], past_due: [], eventually_due: [], pending_verification: [], disabled_reason: null }, capabilities: {}, external_accounts: { data: [] }, settings: { payouts: { schedule: { interval: "manual" } } }, country: "US", default_currency: "usd", type: "express" }
  }

  /** The seller finished Stripe's onboarding: the account can take payments and pay out. */
  activate(acct: string) {
    const a = this.account(acct)
    Object.assign(a, { charges_enabled: true, payouts_enabled: true, details_submitted: true, capabilities: { card_payments: "active", transfers: "active" }, external_accounts: { object: "list", data: [{ id: "ba_test", object: "bank_account", last4: "6789", bank_name: "STRIPE TEST BANK", currency: "usd", default_for_currency: true }] } })
    this.accounts.set(acct, a)
    return a
  }

  /** The buyer paid on Stripe's page: a succeeded PaymentIntent with its charge, transferred to the shop less the fee. */
  pay(sessionId: string, card: { brand?: string; last4?: string; fail?: boolean } = {}): { session: Obj; intent: Obj; charge: Obj | null } {
    const s = this.sessions.get(sessionId)
    if (!s) throw new Error(`no session ${sessionId}`)
    const pd = s.__params.payment_intent_data ?? {}
    const pi: Obj = {
      id: id("pi"),
      object: "payment_intent",
      amount: s.amount_total,
      amount_received: card.fail ? 0 : s.amount_total,
      currency: s.currency,
      status: card.fail ? "requires_payment_method" : "succeeded",
      metadata: { ...(pd.metadata ?? {}) },
      application_fee_amount: pd.application_fee_amount ?? null,
      transfer_data: pd.transfer_data ?? null,
      client_secret: `${id("pi")}_secret_x`,
      latest_charge: null,
      last_payment_error: card.fail ? { code: "card_declined", decline_code: "insufficient_funds", message: "Your card has insufficient funds." } : null,
      shipping: pd.shipping ?? null,
      created: unix(),
    }
    this.intents.set(pi.id, pi)
    let charge: Obj | null = null
    if (!card.fail) {
      charge = this.chargeFor(pi, card)
      Object.assign(s, { status: "complete", payment_status: "paid", payment_intent: pi.id, customer_details: { email: s.customer_email, name: s.__params.payment_intent_data?.shipping?.name ?? null } })
    }
    return { session: s, intent: pi, charge }
  }

  /** The buyer paid in Storelib's own card form: the PaymentIntent succeeds (or is declined) with its charge. */
  payIntent(piId: string, card: { brand?: string; last4?: string; fail?: boolean } = {}): { intent: Obj; charge: Obj | null } {
    const pi = this.intents.get(piId)
    if (!pi) throw new Error(`no payment intent ${piId}`)
    if (card.fail) {
      Object.assign(pi, { status: "requires_payment_method", last_payment_error: { code: "card_declined", decline_code: "insufficient_funds", message: "Your card has insufficient funds." } })
      return { intent: pi, charge: null }
    }
    Object.assign(pi, { status: "succeeded", amount_received: pi.amount, last_payment_error: null })
    return { intent: pi, charge: this.chargeFor(pi, card) }
  }

  private chargeFor(pi: Obj, card: { brand?: string; last4?: string }): Obj {
    const transfer: Obj | null = pi.transfer_data?.destination
      ? { id: id("tr"), object: "transfer", amount: pi.amount - (pi.application_fee_amount ?? 0), currency: pi.currency, destination: pi.transfer_data.destination, destination_payment: id("py"), reversals: { data: [] }, amount_reversed: 0 }
      : null
    if (transfer) this.transfers.set(transfer.id, transfer)
    const charge: Obj = {
      id: id("ch"),
      object: "charge",
      amount: pi.amount,
      amount_captured: pi.amount,
      amount_refunded: 0,
      refunded: false,
      currency: pi.currency,
      paid: true,
      status: "succeeded",
      payment_intent: pi.id,
      metadata: pi.metadata,
      application_fee_amount: pi.application_fee_amount,
      transfer: transfer?.id ?? null,
      transfer_data: pi.transfer_data,
      destination: pi.transfer_data?.destination ?? null,
      payment_method_details: { type: "card", card: { brand: card.brand ?? "visa", last4: card.last4 ?? "4242", country: "US" } },
      billing_details: { address: { country: "US" } },
      balance_transaction: { id: id("txn"), fee: Math.round(pi.amount * 0.029) + 30, net: pi.amount - Math.round(pi.amount * 0.029) - 30, currency: pi.currency },
      refunds: { object: "list", data: [] as Obj[], has_more: false },
      created: unix(),
    }
    this.charges.set(charge.id, charge)
    pi.latest_charge = charge.id
    return charge
  }

  expand(o: Obj | null, paths: string[] = []): Obj | null {
    if (!o) return o
    const out = { ...o }
    for (const p of paths) {
      const [head, ...rest] = p.split(".")
      const v = out[head]
      if (typeof v !== "string") {
        if (v && typeof v === "object" && rest.length) out[head] = this.expand(v, [rest.join(".")])
        continue
      }
      const target = this.intents.get(v) ?? this.charges.get(v) ?? this.transfers.get(v) ?? this.refunds.get(v) ?? this.accounts.get(v) ?? null
      out[head] = rest.length ? this.expand(target, [rest.join(".")]) : target ? { ...target } : v
    }
    for (const k of Object.keys(out)) if (k.startsWith("__")) delete out[k]
    return out
  }

  refund(params: Obj): Obj {
    const pi = params.payment_intent ? this.intents.get(params.payment_intent) : null
    const charge = params.charge ? this.charges.get(params.charge) : pi?.latest_charge ? this.charges.get(pi.latest_charge) : null
    if (!charge) throw Object.assign(new Error("No such charge"), { type: "StripeInvalidRequestError", statusCode: 404, raw: { message: "No such payment_intent" } })
    const amount = params.amount ?? charge.amount - charge.amount_refunded
    if (amount > charge.amount - charge.amount_refunded) {
      throw Object.assign(new Error(`Refund amount ($${(amount / 100).toFixed(2)}) is greater than unrefunded amount on charge ($${((charge.amount - charge.amount_refunded) / 100).toFixed(2)})`), { type: "StripeInvalidRequestError", statusCode: 400, raw: { message: "Refund amount is greater than unrefunded amount on charge" } })
    }
    const status = this.nextRefundStatus
    this.nextRefundStatus = "succeeded"
    const r: Obj = { id: id("re"), object: "refund", amount, currency: charge.currency, charge: charge.id, payment_intent: charge.payment_intent, status, reason: params.reason ?? null, metadata: params.metadata ?? {}, created: unix() }
    this.refunds.set(r.id, r)
    /* A destination charge's refund with reverse_transfer takes back the refund's share of the transfer (Stripe: refund x transfer / charge). */
    if (params.reverse_transfer && charge.transfer) {
      const t = this.transfers.get(charge.transfer)!
      const back = Math.round((amount * t.amount) / charge.amount)
      const rev = { id: id("trr"), object: "transfer_reversal", amount: back, transfer: t.id, source_refund: r.id }
      t.amount_reversed += back
      t.reversals.data.push(rev)
      r.transfer_reversal = rev.id
    }
    if (status === "succeeded") this.settle(r)
    return r
  }

  settle(r: Obj) {
    r.status = "succeeded"
    const charge = this.charges.get(r.charge)!
    if (charge.refunds.data.some((x: Obj) => x.id === r.id)) return
    charge.amount_refunded += r.amount
    charge.refunded = charge.amount_refunded >= charge.amount
    charge.refunds.data.unshift({ ...r })
  }

  dispute(chargeId: string, reason = "fraudulent"): Obj {
    const c = this.charges.get(chargeId)!
    const d: Obj = { id: id("dp"), object: "dispute", amount: c.amount, currency: c.currency, charge: c.id, payment_intent: c.payment_intent, reason, status: "needs_response", evidence_details: { due_by: unix() + 7 * 86400 }, balance_transactions: [{ fee: 1500, amount: -c.amount }], created: unix(), metadata: {} }
    this.disputes.set(d.id, d)
    return d
  }

  /** Installs the world onto the real client's resources. */
  install(client: Stripe) {
    const w = this
    const rec =
      (method: string, fn: (...args: any[]) => any) =>
      async (...args: any[]) => {
        w.calls.push({ method, args })
        return fn(...args)
      }
    const notFound = (what: string) => Object.assign(new Error(`No such ${what}`), { type: "StripeInvalidRequestError", statusCode: 404, code: "resource_missing", raw: { message: `No such ${what}` } })
    const c = client as any

    c.checkout.sessions.create = rec("checkout.sessions.create", (params: Obj, opts?: Obj) =>
      w.once(opts, () => {
        if (w.failNextSession) {
          w.failNextSession = false
          throw Object.assign(new Error("An error occurred with our connection to Stripe."), { type: "StripeConnectionError", code: "api_connection_error" })
        }
        const items = (params.line_items ?? []) as Obj[]
        const itemsTotal = items.reduce((n, l) => n + (l.price_data?.unit_amount ?? 0) * (l.quantity ?? 1), 0)
        const ship = params.shipping_options?.[0]?.shipping_rate_data?.fixed_amount?.amount ?? 0
        const s: Obj = {
          id: id("cs"),
          object: "checkout.session",
          mode: params.mode,
          status: "open",
          payment_status: "unpaid",
          url: params.ui_mode === "embedded" ? null : `https://checkout.stripe.com/c/pay/${id("cs")}`,
          client_secret: params.ui_mode === "embedded" ? `${id("cs")}_secret` : null,
          amount_subtotal: itemsTotal,
          amount_total: itemsTotal + ship,
          currency: items[0]?.price_data?.currency ?? "usd",
          customer_email: params.customer_email ?? null,
          customer_details: null,
          metadata: { ...(params.metadata ?? {}) },
          payment_intent: null,
          shipping_cost: ship ? { amount_total: ship } : null,
          expires_at: params.expires_at,
          success_url: params.success_url,
          cancel_url: params.cancel_url,
          __params: params,
        }
        w.sessions.set(s.id, s)
        return s
      }, params),
    )
    c.checkout.sessions.retrieve = rec("checkout.sessions.retrieve", (sid: string, opts?: Obj) => {
      const s = w.sessions.get(sid)
      if (!s) throw notFound("checkout.session")
      return w.expand(s, opts?.expand ?? [])
    })
    c.checkout.sessions.expire = rec("checkout.sessions.expire", (sid: string) => {
      const s = w.sessions.get(sid)
      if (!s) throw notFound("checkout.session")
      if (s.status !== "open") throw Object.assign(new Error("Only Checkout Sessions with a status in [\"open\"] can be expired."), { type: "StripeInvalidRequestError", statusCode: 400 })
      s.status = "expired"
      return w.expand(s)
    })
    c.paymentIntents.create = rec("paymentIntents.create", (params: Obj, opts?: Obj) =>
      w.once(opts, () => {
        const pi: Obj = { id: id("pi"), object: "payment_intent", amount: params.amount, amount_received: 0, currency: params.currency, status: "requires_payment_method", metadata: { ...(params.metadata ?? {}) }, application_fee_amount: params.application_fee_amount ?? null, transfer_data: params.transfer_data ?? null, client_secret: `${id("pi")}_secret_${Math.random().toString(36).slice(2)}`, latest_charge: null, shipping: params.shipping ?? null, created: unix() }
        w.intents.set(pi.id, pi)
        return pi
      }, params),
    )
    c.paymentIntents.retrieve = rec("paymentIntents.retrieve", (pid: string, opts?: Obj) => {
      const pi = w.intents.get(pid)
      if (!pi) throw notFound("payment_intent")
      return w.expand(pi, opts?.expand ?? [])
    })
    c.paymentIntents.cancel = rec("paymentIntents.cancel", (pid: string) => {
      const pi = w.intents.get(pid)
      if (!pi) throw notFound("payment_intent")
      if (pi.status === "succeeded") throw Object.assign(new Error("You cannot cancel this PaymentIntent because it has a status of succeeded."), { type: "StripeInvalidRequestError", statusCode: 400 })
      pi.status = "canceled"
      return { ...pi }
    })
    c.paymentIntents.search = rec("paymentIntents.search", () => ({ object: "search_result", data: [], has_more: false, next_page: null }))
    c.charges.retrieve = rec("charges.retrieve", (cid: string, opts?: Obj) => {
      const ch = w.charges.get(cid)
      if (!ch) throw notFound("charge")
      return w.expand(ch, opts?.expand ?? [])
    })
    c.refunds.create = rec("refunds.create", (params: Obj, opts?: Obj) => w.once(opts, () => w.refund(params)))
    c.refunds.update = rec("refunds.update", (rid: string, params: Obj) => {
      const r = w.refunds.get(rid)
      if (!r) throw notFound("refund")
      Object.assign(r.metadata, params.metadata ?? {})
      return { ...r }
    })
    c.refunds.retrieve = rec("refunds.retrieve", (rid: string) => {
      const r = w.refunds.get(rid)
      if (!r) throw notFound("refund")
      return { ...r }
    })
    c.refunds.list = rec("refunds.list", (params: Obj) => {
      const data = [...w.refunds.values()].filter((r) => (!params?.charge || r.charge === params.charge) && (!params?.payment_intent || r.payment_intent === params.payment_intent))
      return { object: "list", data, has_more: false }
    })
    c.accounts.create = rec("accounts.create", (params: Obj, opts?: Obj) =>
      w.once(opts, () => {
        const a = w.account(id("acct"))
        Object.assign(a, { email: params?.email ?? null, country: params?.country ?? "US", metadata: params?.metadata ?? {} })
        w.accounts.set(a.id, a)
        return a
      }),
    )
    c.accounts.retrieve = rec("accounts.retrieve", (acct?: string) => {
      if (!acct) return { id: "acct_platform", object: "account", country: "US", settings: { dashboard: { display_name: "Storelib" } } }
      if (!w.accounts.has(acct)) throw notFound("account")
      return { ...w.account(acct) }
    })
    c.accounts.update = rec("accounts.update", (acct: string, params: Obj) => {
      const a = w.account(acct)
      w.accounts.set(acct, Object.assign(a, { ...params, settings: { ...a.settings, ...(params?.settings ?? {}) } }))
      return { ...a }
    })
    c.accounts.listExternalAccounts = rec("accounts.listExternalAccounts", (acct: string) => ({ object: "list", data: w.account(acct).external_accounts?.data ?? [], has_more: false }))
    c.accountLinks.create = rec("accountLinks.create", (params: Obj) => ({ object: "account_link", url: `https://connect.stripe.com/setup/e/${params.account}/test`, expires_at: unix() + 300 }))
    c.balance.retrieve = rec("balance.retrieve", () => ({ object: "balance", available: [{ amount: 0, currency: "usd" }], pending: [{ amount: 0, currency: "usd" }] }))
    c.payouts.list = rec("payouts.list", () => ({ object: "list", data: [], has_more: false }))
    c.transfers.retrieve = rec("transfers.retrieve", (tid: string) => {
      const t = w.transfers.get(tid)
      if (!t) throw notFound("transfer")
      return { ...t }
    })
    c.transfers.createReversal = rec("transfers.createReversal", (tid: string, params: Obj, opts?: Obj) =>
      w.once(opts, () => {
        const t = w.transfers.get(tid)
        if (!t) throw notFound("transfer")
        const r = { id: id("trr"), object: "transfer_reversal", amount: params?.amount ?? t.amount - t.amount_reversed, transfer: tid, metadata: params?.metadata ?? {} }
        t.amount_reversed += r.amount
        t.reversals.data.push(r)
        return r
      }),
    )
    c.transfers.create = rec("transfers.create", (params: Obj, opts?: Obj) =>
      w.once(opts, () => {
        const t = { id: id("tr"), object: "transfer", amount: params.amount, currency: params.currency, destination: params.destination, source_transaction: params.source_transaction ?? null, metadata: params.metadata ?? {}, reversals: { data: [] }, amount_reversed: 0 }
        w.transfers.set(t.id, t)
        return t
      }),
    )
    c.transfers.listReversals = rec("transfers.listReversals", (tid: string) => ({ object: "list", data: w.transfers.get(tid)?.reversals.data ?? [], has_more: false }))
    c.balanceTransactions.list = rec("balanceTransactions.list", () => ({ object: "list", data: [], has_more: false }))
  }

  /** A signed webhook request, as Stripe sends one. */
  webhook(client: Stripe, type: string, object: Obj, opts: { account?: string; secret: string; id?: string }): { body: string; headers: Record<string, string>; eventId: string } {
    const eventId = opts.id ?? id("evt")
    const clean = JSON.parse(JSON.stringify(object, (k, v) => (k.startsWith("__") ? undefined : v)))
    const event = { id: eventId, object: "event", api_version: "2025-09-30.clover", created: unix(), type, livemode: false, data: { object: clean }, ...(opts.account ? { account: opts.account } : {}), pending_webhooks: 1, request: { id: null } }
    const body = JSON.stringify(event)
    const header = (client as any).webhooks.generateTestHeaderString({ payload: body, secret: opts.secret })
    return { body, headers: { "stripe-signature": header, "content-type": "application/json" }, eventId }
  }
}
