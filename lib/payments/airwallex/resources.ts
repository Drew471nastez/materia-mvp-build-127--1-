import "server-only"

/**
 * ===========================================================================
 *  THE AIRWALLEX CALLS STORELIB MAKES, ONE FUNCTION EACH
 * ===========================================================================
 * Thin and typed: each function is one documented endpoint with the fields
 * Storelib reads. Money amounts arrive here as integers in the smallest unit
 * and leave as Airwallex's decimals (./../money), never the other way round.
 *
 * WHO OWNS WHAT decides the `x-on-behalf-of` header (see ./client):
 *
 *   the creator's account           accounts, onboarding authorisation,
 *   (onBehalfOf: accountId)         balances, beneficiaries, payouts
 *
 *   the platform (onBehalfOf: null) payment intents, their refunds and
 *                                   funds splits (collect payments directly:
 *                                   the creator is `connected_account_id` /
 *                                   `destination` in the body), charges
 *                                   (which name the creator as `source`),
 *                                   hosted onboarding flows
 */

import type { AirwallexClient } from "./client"
import { requestId, requestIdMax } from "./client"
import { toMajor, toMajorNumber } from "../money"

/* ── Accounts ─────────────────────────────────────────────────────────── */

export interface AwxAccount {
  id: string
  status?: string
  next_action?: { type?: string } | null
  requirements?: Record<string, unknown> | null
  account_details?: { legal_entity_type?: string } | null
  created_at?: string
}

export interface NewAccount {
  kind: "individual" | "business"
  email: string
  /** Two letter country the person lives in, or the business is registered in. */
  country: string
  /** Business accounts: the name it trades under. */
  businessName?: string
  /** Storelib's creator id, kept on the account as `identifier` and in metadata. */
  creatorId: string
  /** The consent the creator gave in Storelib, with where it was given. */
  consent: { at: string; ip: string | null; userAgent: string | null }
}

/** POST /api/v1/accounts/create, as the platform. */
export function createAccount(c: AirwallexClient, a: NewAccount): Promise<AwxAccount> {
  const country = a.country.trim().toUpperCase()
  const account_details =
    a.kind === "business"
      ? { legal_entity_type: "BUSINESS", business_details: { business_name: a.businessName ?? "", registration_address: { country_code: country } } }
      : { legal_entity_type: "INDIVIDUAL", individual_details: { residential_address: { country_code: country } } }
  return c.call<AwxAccount>("POST", "/api/v1/accounts/create", {
    onBehalfOf: null,
    /* No request_id: this endpoint does not take one. A second account is
       prevented by the row Storelib writes first (lib/payments/service). */
    body: {
      identifier: a.creatorId,
      metadata: { storelib_creator_id: a.creatorId },
      primary_contact: { email: a.email },
      account_details,
      customer_agreements: {
        agreed_to_data_usage: true,
        agreed_to_terms_and_conditions: true,
        terms_and_conditions: {
          agreed_at: a.consent.at,
          service_agreement_type: "FULL",
          device_data: {
            ...(a.consent.ip ? { ip_address: a.consent.ip } : {}),
            ...(a.consent.userAgent ? { user_agent: a.consent.userAgent.slice(0, 250) } : {}),
          },
        },
      },
    },
  })
}

/** GET /api/v1/accounts/{id}, as the platform. The source of truth for the lifecycle. */
export function retrieveAccount(c: AirwallexClient, accountId: string): Promise<AwxAccount> {
  return c.call<AwxAccount>("GET", `/api/v1/accounts/${encodeURIComponent(accountId)}`, { onBehalfOf: null })
}

/* ── Onboarding ───────────────────────────────────────────────────────── */

export type ComponentScope = "onboarding:write" | "transfer:write" | "rfi:read" | "rfi:write"

/**
 * POST /api/v1/authentication/authorize, on behalf of the creator. The code
 * lives 30 seconds and is exchanged by the browser SDK with the verifier the
 * server kept (PKCE, RFC 7636).
 */
export async function authorizeComponent(c: AirwallexClient, accountId: string, scope: ComponentScope[], codeChallenge: string): Promise<string> {
  const r = await c.call<{ authorization_code: string }>("POST", "/api/v1/authentication/authorize", {
    onBehalfOf: accountId,
    body: { scope, code_challenge: codeChallenge },
  })
  return r.authorization_code
}

export interface HostedFlow {
  id: string
  url: string
  status?: string
}

/** POST /api/v1/hosted_flows/create, as the platform, naming the account in the body. */
export function createHostedFlow(c: AirwallexClient, input: { accountId: string; template: string; returnUrl: string; errorUrl: string }): Promise<HostedFlow> {
  return c.call<HostedFlow>("POST", "/api/v1/hosted_flows/create", {
    onBehalfOf: null,
    body: { account_id: input.accountId, template: input.template, return_url: input.returnUrl, error_url: input.errorUrl, metadata: {} },
  })
}

/** POST /api/v1/hosted_flows/{id}/authorize: the short lived URL to send them to. */
export function authorizeHostedFlow(c: AirwallexClient, flowId: string, identity: string): Promise<HostedFlow & { authorization_code?: string }> {
  return c.call("POST", `/api/v1/hosted_flows/${encodeURIComponent(flowId)}/authorize`, { onBehalfOf: null, body: { identity } })
}

/* ── Balances ─────────────────────────────────────────────────────────── */

export interface AwxBalance {
  account_type?: string
  currency: string
  available_amount?: number
  pending_amount?: number
  reserved_amount?: number
  total_amount?: number
}

/** GET /api/v1/balances/current, on behalf of the creator. */
export function currentBalances(c: AirwallexClient, accountId: string): Promise<AwxBalance[]> {
  return c.call<AwxBalance[]>("GET", "/api/v1/balances/current", { onBehalfOf: accountId })
}

/* ── Beneficiaries (where payouts go) ─────────────────────────────────── */

export interface AwxBeneficiary {
  /** A uuid. */
  id?: string
  nickname?: string
  beneficiary?: {
    entity_type?: string
    bank_details?: {
      account_currency?: string
      bank_country_code?: string
      bank_name?: string
      account_number?: string
      iban?: string
      account_name?: string
    }
  }
  transfer_methods?: string[]
}

/**
 * POST /api/v1/beneficiaries/create, on behalf of the creator, with the
 * payload the embedded beneficiary form's submit() returned. The payload
 * passes through and is not kept: only a masked summary is stored.
 */
export function createBeneficiary(c: AirwallexClient, accountId: string, formPayload: Record<string, unknown>): Promise<AwxBeneficiary> {
  return c.call<AwxBeneficiary>("POST", "/api/v1/beneficiaries/create", { onBehalfOf: accountId, body: formPayload })
}

/** GET /api/v1/beneficiaries, on behalf of the creator. */
export async function listBeneficiaries(c: AirwallexClient, accountId: string): Promise<AwxBeneficiary[]> {
  const r = await c.call<{ items?: AwxBeneficiary[] }>("GET", "/api/v1/beneficiaries", { onBehalfOf: accountId, query: { page_size: 20 } })
  return r.items ?? []
}

/* ── Payouts (transfers from the creator's wallet to their bank) ──────── */

export interface AwxTransfer {
  id: string
  request_id?: string
  status?: string
  transfer_amount?: number
  transfer_currency?: string
  source_amount?: number
  source_currency?: string
  created_at?: string
  updated_at?: string
  beneficiary_id?: string
  reference?: string
}

/**
 * POST /api/v1/transfers/create, on behalf of the creator. `payoutId` is
 * Storelib's own id for this payout, written down before the call, so a
 * retry sends the same request_id and Airwallex refuses a second payout.
 */
export function createPayout(
  c: AirwallexClient,
  accountId: string,
  p: { payoutId: string; beneficiaryId: string; amountMinor: number; currency: string },
): Promise<AwxTransfer> {
  return c.call<AwxTransfer>("POST", "/api/v1/transfers/create", {
    onBehalfOf: accountId,
    body: {
      request_id: requestId("payout", p.payoutId),
      beneficiary_id: p.beneficiaryId,
      source_currency: p.currency.toUpperCase(),
      transfer_currency: p.currency.toUpperCase(),
      transfer_amount: toMajor(p.amountMinor, p.currency),
      fee_paid_by: "PAYER",
      reason: "transfer_to_own_account",
      reference: "Storelib payout",
      metadata: { storelib_payout_id: p.payoutId },
    },
  })
}

/** GET /api/v1/transfers, on behalf of the creator. */
export async function listPayouts(c: AirwallexClient, accountId: string, pageSize = 20): Promise<AwxTransfer[]> {
  const r = await c.call<{ items?: AwxTransfer[] }>("GET", "/api/v1/transfers", { onBehalfOf: accountId, query: { page_size: pageSize } })
  return r.items ?? []
}

/* ── Payments (Storelib collects, the creator's share is split to them) ── */

export interface AwxPaymentIntent {
  id: string
  client_secret?: string
  status?: string
  amount?: number
  currency?: string
  merchant_order_id?: string
  connected_account_id?: string
  captured_amount?: number
  created_at?: string
  metadata?: Record<string, unknown> | null
  customer?: { email?: string } | null
  latest_payment_attempt?: {
    id?: string
    status?: string
    payment_method?: { type?: string; card?: { brand?: string; last4?: string } | null } | null
  } | null
}

export interface NewPayment {
  /** Storelib's order (or checkout) id: the merchant order id and the idempotency key. */
  orderId: string
  amountMinor: number
  currency: string
  /** The creator's Airwallex account. */
  accountId: string
  /** What the creator receives. The difference is Storelib's fee, and Airwallex's fee comes out of it. */
  creatorShareMinor: number
  /** Only for a redirect-based method outside the hosted page; the hosted page has its own successUrl. */
  returnUrl?: string
  descriptor?: string
  metadata?: Record<string, string>
}

/**
 * POST /api/v1/pa/payment_intents/create, as the platform ("collect payments
 * directly"). The creator is `connected_account_id`, and their share is a
 * funds split to their account that Airwallex creates and releases on its
 * own once the payment succeeds.
 */
export function createPaymentIntent(c: AirwallexClient, p: NewPayment): Promise<AwxPaymentIntent> {
  if (p.creatorShareMinor < 0 || p.creatorShareMinor > p.amountMinor) throw new Error("The creator's share must be between zero and the total.")
  return c.call<AwxPaymentIntent>("POST", "/api/v1/pa/payment_intents/create", {
    onBehalfOf: null,
    body: {
      request_id: requestId("pi", p.orderId),
      merchant_order_id: p.orderId,
      amount: toMajorNumber(p.amountMinor, p.currency),
      currency: p.currency.toUpperCase(),
      connected_account_id: p.accountId,
      funds_split_data: p.creatorShareMinor > 0 ? [{ amount: toMajorNumber(p.creatorShareMinor, p.currency), destination: p.accountId }] : undefined,
      ...(p.returnUrl ? { return_url: p.returnUrl } : {}),
      ...(p.descriptor ? { descriptor: p.descriptor.slice(0, 32) } : {}),
      metadata: withOrderId(p.metadata ?? {}, p.orderId),
    },
  })
}

/** Airwallex keeps at most 50 metadata keys: the order id goes on only while there is room. */
function withOrderId(metadata: Record<string, string>, orderId: string): Record<string, string> {
  return Object.keys(metadata).length < 50 ? { ...metadata, storelib_order_id: orderId } : metadata
}

/** GET /api/v1/pa/payment_intents/{id}, as the platform. */
export function retrievePaymentIntent(c: AirwallexClient, id: string): Promise<AwxPaymentIntent> {
  return c.call<AwxPaymentIntent>("GET", `/api/v1/pa/payment_intents/${encodeURIComponent(id)}`, { onBehalfOf: null })
}

export interface AwxRefund {
  id: string
  status?: string
  amount?: number
  currency?: string
  payment_intent_id?: string
}

/** POST /api/v1/pa/refunds/create, as the platform. `refundKey` is Storelib's id for this refund. */
export function createRefund(c: AirwallexClient, r: { paymentIntentId: string; refundKey: string; amountMinor: number; currency: string; reason?: string }): Promise<AwxRefund> {
  return c.call<AwxRefund>("POST", "/api/v1/pa/refunds/create", {
    onBehalfOf: null,
    body: {
      request_id: requestId("refund", r.refundKey),
      payment_intent_id: r.paymentIntentId,
      amount: toMajorNumber(r.amountMinor, r.currency),
      ...(r.reason ? { reason: r.reason.slice(0, 120) } : {}),
      metadata: { storelib_refund_key: r.refundKey },
    },
  })
}

/**
 * POST /api/v1/charges/create, as the platform, naming the creator as the
 * source: takes the creator's share of a refund back from their wallet once
 * the split has already been released to them. Charges take request ids of
 * at most 50 characters.
 */
export function chargeCreator(c: AirwallexClient, ch: { accountId: string; key: string; amountMinor: number; currency: string; reference: string }): Promise<{ id: string; status?: string }> {
  return c.call("POST", "/api/v1/charges/create", {
    onBehalfOf: null,
    body: {
      request_id: requestIdMax(50, "chg", ch.key),
      source: ch.accountId,
      amount: toMajor(ch.amountMinor, ch.currency),
      currency: ch.currency.toUpperCase(),
      reason: "transfer_to_own_account",
      reference: ch.reference.slice(0, 140),
    },
  })
}
