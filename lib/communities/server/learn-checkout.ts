import "server-only"

/**
 * ===========================================================================
 *  A PAID PROGRAM'S CHECKOUT: STRIPE EMBEDDED CHECKOUT, IN THE COMMUNITY
 * ===========================================================================
 * A program sold on its own (lib/communities/learn.ts, mode "paid") is
 * bought in a sheet on the program's page (components/community/learn/
 * program-checkout.tsx), never through the Storelib checkout pages and
 * never as a product: a program is not one.
 *
 * THE SESSION is a Checkout Session in embedded mode that never redirects
 * (the sheet hears onComplete). It is paid the way every Storelib sale is
 * (app/api/checkout/stripe-session, app/api/checkout/cart): a destination
 * charge on the platform, the creator's connected account as the
 * destination of the money and the platform's fee kept back
 * (application_fee_amount), only when the creator's account can take
 * payments. The price, the title and the account are all read here from
 * the program's row and the community's creator; nothing the page sends is.
 * The PaymentIntent's metadata names no product, so the product checkout's
 * fulfilment (lib/checkout/fulfil-payment isCheckoutIntent) never takes it
 * for a sale of a product.
 *
 * THE GRANT comes from the session, once paid: from Stripe's webhook
 * (app/api/stripe/webhook, checkout.session.completed) or from the sheet
 * asking right after onComplete, whichever is first; grantProgram keeps
 * one row per person and program, so the second changes nothing.
 *
 * Stripe and the two payment checks are handed in, so the tests run all of
 * it against a stub.
 */
import type Stripe from "stripe"
import { programGate, programPrice } from "../learn"
import type { CommunityRow } from "../types"
import type { Viewer } from "./context"
import { type Db } from "./db"
import { findProgram, grantProgram, ownedPrograms, programViewer, type ProgramRow } from "./learn"
import { pushCommunitySale } from "@/lib/orders/sale-events"

export const PROGRAM_SESSION_KIND = "community_program"

export interface PlatformFee {
  platformFeeCents: number
  feePercent: number
  feeFixedCents: number
  planId: string
  pricingTier?: string | null
  feeRuleVersion?: string | null
}

export interface StripeSessions {
  checkout: {
    sessions: {
      create(params: Stripe.Checkout.SessionCreateParams): Promise<Pick<Stripe.Checkout.Session, "id" | "client_secret">>
      retrieve(id: string): Promise<Stripe.Checkout.Session>
      /** Closes a session nobody should pay any more (an event ticket's earlier form). */
      expire?(id: string): Promise<unknown>
    }
  }
}

export interface CheckoutDeps {
  stripe: StripeSessions
  /** The creator's account can take payments now (lib/payments/service checkoutReadyForCreator). */
  ready: (creatorId: string) => Promise<boolean>
  /** The platform's fee on this amount (lib/billing/platform-fee-server). */
  fee: (amountCents: number, creatorId: string, currency: string) => Promise<PlatformFee>
  /** The currency every Storelib charge is made in (lib/payments/fees/currency-rules). */
  chargeCurrency: string
}

export type CheckoutStart =
  | { ok: true; clientSecret: string; sessionId: string; amountCents: number; currency: string }
  | { ok: false; status: number; error: string; code: string }

const refuse = (status: number, code: string, error: string): CheckoutStart => ({ ok: false, status, code, error })

/** Everything Stripe is asked for, from the server's own facts. Pure, so the tests can read it. */
export function programCheckoutParams(p: {
  program: Pick<ProgramRow, "id" | "title" | "summary" | "coverUrl" | "priceCents">
  community: Pick<CommunityRow, "id" | "name" | "slug">
  buyer: { userId: string; email: string | null }
  creatorId: string
  destination: string
  currency: string
  fee: PlatformFee
}): Stripe.Checkout.SessionCreateParams {
  const amount = p.program.priceCents as number
  const metadata: Record<string, string> = {
    kind: PROGRAM_SESSION_KIND,
    community_program_id: p.program.id,
    community_id: p.community.id,
    community_slug: p.community.slug.slice(0, 200),
    buyer_id: p.buyer.userId,
    creator_id: p.creatorId,
    price_cents: String(amount),
    platform_fee_cents: String(p.fee.platformFeeCents),
    fee_percent: String(p.fee.feePercent),
    fee_fixed_cents: String(p.fee.feeFixedCents),
    plan_used: p.fee.planId,
    pricing_tier: p.fee.pricingTier ?? "standard",
    fee_rule_version: p.fee.feeRuleVersion ?? "",
  }
  const cover = p.program.coverUrl && /^https:\/\//.test(p.program.coverUrl) ? [p.program.coverUrl] : undefined
  return {
    mode: "payment",
    ui_mode: "embedded",
    redirect_on_completion: "never",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: p.currency,
          unit_amount: amount,
          product_data: {
            name: (p.program.title || "Program").slice(0, 250),
            description: `A program in ${p.community.name}`.slice(0, 500),
            ...(cover ? { images: cover } : {}),
          },
        },
      },
    ],
    ...(p.buyer.email ? { customer_email: p.buyer.email } : {}),
    client_reference_id: p.buyer.userId,
    payment_intent_data: {
      application_fee_amount: p.fee.platformFeeCents,
      transfer_data: { destination: p.destination },
      description: `${(p.program.title || "Program").slice(0, 200)} (${p.community.name.slice(0, 200)})`,
      metadata,
    },
    metadata,
  }
}

/**
 * A session for this member and this paid program, or why not: not paid,
 * not published, already theirs, closed to them by another rule, or the
 * creator not able to take payments.
 */
export async function startProgramCheckout(db: Db, deps: CheckoutDeps, a: { community: CommunityRow; viewer: Viewer; programId: string; email: string | null }): Promise<CheckoutStart> {
  const { community, viewer } = a
  if (!community.classroom_enabled) return refuse(404, "not_found", "That program is not here.")
  if (!viewer.userId || !viewer.active) return refuse(403, "not_member", "Join the community first.")
  const program = await findProgram(db, community.id, a.programId)
  if (!program || program.id !== a.programId || program.productId) return refuse(404, "not_found", "That program is not here.")
  if (program.status !== "published" || !program.priceCents) return refuse(409, "not_for_sale", "This program is not for sale.")
  const owned = await ownedPrograms(db, viewer.userId, [program.id])
  const gate = programGate(program, programViewer(viewer, owned.has(program.id)))
  if (gate.open) return refuse(409, "already_yours", "This program is already yours.")
  if ((gate as { reason?: string }).reason !== "paid") return refuse(403, "closed", "This program is not open to you.")
  if (program.currency && program.currency !== deps.chargeCurrency) return refuse(409, "price_changed", "This program's price is being updated. Try again later.")
  if (!community.creator_id) return refuse(409, "seller_unavailable", "This community cannot take payments right now.")
  const { data: creator } = await db.from("creators").select("id, stripe_account_id").eq("id", community.creator_id).maybeSingle()
  const account = (creator as { stripe_account_id?: string | null } | null)?.stripe_account_id ?? null
  if (!account || !account.startsWith("acct_") || !(await deps.ready(community.creator_id))) return refuse(409, "seller_unavailable", "This community cannot take payments right now. Nothing was charged.")
  let fee: PlatformFee
  try {
    fee = await deps.fee(program.priceCents, community.creator_id, deps.chargeCurrency)
  } catch {
    return refuse(400, "currency", "This currency is not available for checkout yet.")
  }
  try {
    const session = await deps.stripe.checkout.sessions.create(
      programCheckoutParams({ program, community, buyer: { userId: viewer.userId, email: a.email }, creatorId: community.creator_id, destination: account, currency: deps.chargeCurrency, fee }),
    )
    if (!session.client_secret) return refuse(502, "stripe", "The payment form did not load. Nothing was charged. Try again.")
    return { ok: true, clientSecret: session.client_secret, sessionId: session.id, amountCents: program.priceCents, currency: deps.chargeCurrency }
  } catch (e) {
    console.error("[communities] program checkout:", e instanceof Error ? e.message.slice(0, 200) : "unknown")
    return refuse(502, "stripe", "The payment form did not load. Nothing was charged. Try again.")
  }
}

/** A Checkout Session this file made. */
export function isProgramSession(session: Pick<Stripe.Checkout.Session, "metadata">): boolean {
  const m = session.metadata ?? {}
  return m.kind === PROGRAM_SESSION_KIND && typeof m.community_program_id === "string" && typeof m.buyer_id === "string"
}

export type GrantAnswer = { ok: true; created: boolean; programId: string } | { ok: false; status: number; error: string }

/**
 * THE PROGRAM IS THEIRS, FROM A PAID SESSION: the webhook's call and the
 * sheet's. Only a session this file made, paid, for a program still in the
 * community it names, for the buyer it names (and, from the sheet, that
 * buyer must be the one asking).
 */
export async function grantFromSession(db: Db, session: Stripe.Checkout.Session, opts: { userId?: string } = {}): Promise<GrantAnswer> {
  if (!isProgramSession(session)) return { ok: false, status: 400, error: "not_a_program_session" }
  const m = session.metadata as Record<string, string>
  if (opts.userId && m.buyer_id !== opts.userId) return { ok: false, status: 403, error: "forbidden" }
  if (session.payment_status !== "paid") return { ok: false, status: 409, error: "not_paid" }
  const program = await findProgram(db, m.community_id, m.community_program_id)
  if (!program || program.id !== m.community_program_id) return { ok: false, status: 404, error: "not_found" }
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null)
  const done = await grantProgram(db, {
    programId: program.id,
    userId: m.buyer_id,
    communityId: m.community_id,
    source: "purchase",
    checkoutSessionId: session.id,
    paymentIntentId: intent,
    amountCents: typeof session.amount_total === "number" ? session.amount_total : null,
    currency: session.currency ?? null,
  })
  if (done.ok === false) return { ok: false, status: done.error === "not_set_up" ? 409 : 500, error: done.error }
  if (done.created) pushCommunitySale(db, { communityId: m.community_id, buyerId: m.buyer_id, title: program.title || "A program", amountCents: session.amount_total, currency: session.currency ?? null, saleId: session.id })
  return { ok: true, created: done.created, programId: program.id }
}

/** The sheet's question after onComplete: the session read from Stripe again, never trusted from the page. */
export async function confirmProgramCheckout(db: Db, stripe: StripeSessions, a: { sessionId: unknown; userId: string }): Promise<GrantAnswer> {
  const id = typeof a.sessionId === "string" && /^cs_[A-Za-z0-9_]{8,255}$/.test(a.sessionId) ? a.sessionId : null
  if (!id) return { ok: false, status: 400, error: "bad_session" }
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(id)
  } catch {
    return { ok: false, status: 502, error: "stripe" }
  }
  return grantFromSession(db, session, { userId: a.userId })
}

/**
 * A FULL REFUND TAKES IT BACK (app/api/stripe/webhook, charge.refunded): the
 * row for that payment is marked revoked, so the program locks again and
 * shows its price. Never throws; nothing to do for any other payment.
 */
export async function revokeRefundedProgram(db: Db, paymentIntentId: string | null | undefined): Promise<number> {
  if (!paymentIntentId) return 0
  try {
    const { data, error } = await db.from("community_program_access").update({ revoked_at: new Date().toISOString() }).eq("payment_intent_id", paymentIntentId).is("revoked_at", null).select("program_id")
    if (error) return 0
    return ((data as unknown[] | null) ?? []).length
  } catch {
    return 0
  }
}

/** "$49" for a program's sheet, from its row. */
export function programPriceLabel(program: Pick<ProgramRow, "priceCents" | "currency">): string | null {
  return program.priceCents ? programPrice(program.priceCents, program.currency) : null
}
