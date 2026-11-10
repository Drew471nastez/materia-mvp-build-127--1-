import "server-only"

/**
 * ===========================================================================
 *  A TIP ON A ONEPAGE: STORELIB CHECKOUT, TO THE CREATOR'S OWN ACCOUNT
 * ===========================================================================
 * The tips block (lib/onepage/tips.ts) in its Storelib mode. The visitor
 * picks an amount and goes to a Stripe Checkout page; once paid they come
 * back to the page they started on and are thanked there.
 *
 * MONEY. A destination charge, exactly as every Storelib sale is (the
 * product checkout, a community ticket): charged on the platform, with the
 * creator's connected account as `transfer_data.destination` and the
 * platform's usual fee kept back (`application_fee_amount`, the creator's
 * own plan). The account is read here from the page's own creator, never
 * from the request, and only an account that can take payments now
 * (checkoutReadyForCreator) is used. Nothing reaches the platform's balance
 * beyond the fee, and nothing reaches anybody else's account.
 *
 * AMOUNT. Read from the published block, never from the page: one of the
 * block's presets, or, when it allows its own, a whole amount from Stripe's
 * smallest charge in the store's currency up to the cap (checkTipAmount).
 * The block has to be on the published page, switched on and in its
 * schedule (lib/onepage/page-block).
 *
 * THE RECORD. One row in onepage_tips per Checkout Session (run-now part
 * 411), written by whichever comes first of Stripe's webhook
 * (app/api/stripe/webhook, checkout.session.completed) and the visitor's
 * return (app/api/onepage/tip confirm), so one payment is one tip. Before
 * the part has run the tip is still paid and confirmed from Stripe; it is
 * only not kept here.
 *
 * Stripe, the fee and the readiness check are handed in, so the tests run
 * all of it against stubs.
 */
import type Stripe from "stripe"
import { checkTipAmount, tipModeOf, tipText, type TipFields } from "./tips"
import { liveAppBlockData, pageCreatorId, publishedBlocksOf } from "./page-block"
import type { PlatformFee } from "@/lib/communities/server/learn-checkout"
import { stripeIdempotencyKey } from "@/lib/stripe/resilience"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const TIP_SESSION_KIND = "onepage_tip"

export interface TipStripe {
  checkout: {
    sessions: {
      create(params: Stripe.Checkout.SessionCreateParams, options?: { idempotencyKey?: string }): Promise<Pick<Stripe.Checkout.Session, "id" | "url">>
      retrieve(id: string): Promise<Stripe.Checkout.Session>
    }
  }
}

export interface TipDeps {
  stripe: TipStripe
  ready: (creatorId: string) => Promise<boolean>
  fee: (amountCents: number, creatorId: string, currency: string) => Promise<PlatformFee>
  /** The store's selling currency (lib/store/selling-currency-read). */
  currency: (creatorId: string) => Promise<string>
  /** Stripe's smallest charge in a currency (lib/store/selling-currency minimumChargeMinor). */
  minimum: (currency: string) => number
}

export type TipStart = { ok: true; url: string; sessionId: string; amountCents: number; currency: string } | { ok: false; status: number; code: string; error: string }

const refuse = (status: number, code: string, error: string): TipStart => ({ ok: false, status, code, error })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type PageRow = { id: string; status?: string | null; slug?: string | null; title?: string | null; seller_id?: string | null; creator_id?: string | null; owner_id?: string | null; published_blocks?: unknown; draft_blocks?: unknown }

/** The published page, or null. */
export async function readLivePage(db: Db, onepageId: unknown): Promise<PageRow | null> {
  if (typeof onepageId !== "string" || !UUID.test(onepageId)) return null
  const { data } = await db.from("onepages").select("id, status, slug, title, seller_id, creator_id, owner_id, published_blocks, draft_blocks").eq("id", onepageId).eq("status", "published").maybeSingle()
  return (data as PageRow | null) ?? null
}

/** Everything Stripe is asked for, from the server's own facts. Pure, so the tests read it. */
export function tipCheckoutParams(p: {
  page: Pick<PageRow, "id" | "title">
  blockId: string
  creatorId: string
  creatorName: string
  destination: string
  amountCents: number
  currency: string
  fee: PlatformFee
  name: string | null
  message: string | null
  successUrl: string
  cancelUrl: string
}): Stripe.Checkout.SessionCreateParams {
  const metadata: Record<string, string> = {
    kind: TIP_SESSION_KIND,
    onepage_id: p.page.id,
    block_id: p.blockId.slice(0, 120),
    creator_id: p.creatorId,
    amount_cents: String(p.amountCents),
    platform_fee_cents: String(p.fee.platformFeeCents),
    fee_percent: String(p.fee.feePercent),
    fee_fixed_cents: String(p.fee.feeFixedCents),
    plan_used: p.fee.planId,
    ...(p.name ? { tipper_name: p.name.slice(0, 80) } : {}),
    ...(p.message ? { tip_message: p.message.slice(0, 280) } : {}),
  }
  const who = (p.creatorName || p.page.title || "the creator").slice(0, 120)
  return {
    mode: "payment",
    success_url: p.successUrl,
    cancel_url: p.cancelUrl,
    submit_type: "donate",
    line_items: [{ quantity: 1, price_data: { currency: p.currency, unit_amount: p.amountCents, product_data: { name: `Tip for ${who}` } } }],
    payment_intent_data: {
      application_fee_amount: p.fee.platformFeeCents,
      transfer_data: { destination: p.destination },
      description: `Tip for ${who}`,
      metadata,
    },
    metadata,
  }
}

/** A tip's checkout, or why not. The money is the creator's; the amount is the block's. */
export async function startTipCheckout(
  db: Db,
  deps: TipDeps,
  a: { onepageId: unknown; blockId: unknown; amountCents: unknown; name?: unknown; message?: unknown; origin: string; /** The page's path on `origin`, or null for the page's own address on Storelib. */ returnPath: string | null; /** Who is asking (their address, hashed): a double tap reuses a page, two people never share one. */ visitor: string },
): Promise<TipStart> {
  const page = await readLivePage(db, a.onepageId)
  if (!page) return refuse(404, "not_found", "This page is not available.")
  const data = liveAppBlockData<TipFields & { tip_message?: boolean }>(publishedBlocksOf(page), a.blockId, "tips")
  if (!data || tipModeOf(data) !== "storelib") return refuse(404, "not_found", "Tips are not open on this page.")
  const creatorId = pageCreatorId(page)
  if (!creatorId) return refuse(409, "seller_unavailable", "This creator cannot take tips right now. Nothing was charged.")
  const { data: creator } = await db.from("creators").select("id, user_id, display_name, stripe_account_id").eq("id", creatorId).maybeSingle()
  const account = (creator as { stripe_account_id?: string | null } | null)?.stripe_account_id ?? null
  if (!account || !account.startsWith("acct_") || !(await deps.ready(creatorId))) return refuse(409, "seller_unavailable", "This creator cannot take tips right now. Nothing was charged.")
  const currency = (await deps.currency(creatorId)).toLowerCase()
  const checked = checkTipAmount(data, a.amountCents, deps.minimum(currency))
  if (checked.ok === false) {
    if (checked.error === "too_small") return refuse(400, "too_small", "That amount is below the smallest card payment.")
    if (checked.error === "too_large") return refuse(400, "too_large", "That amount is above the largest tip.")
    return refuse(400, "amount", "Choose one of the amounts.")
  }
  let fee: PlatformFee
  try {
    fee = await deps.fee(checked.cents, creatorId, currency)
  } catch {
    return refuse(400, "currency", "Tips in this currency are not available yet.")
  }
  if (fee.platformFeeCents < 0 || fee.platformFeeCents >= checked.cents) return refuse(400, "too_small", "That amount is below the smallest card payment.")
  const blockId = String(a.blockId)
  const back = `${a.origin}${a.returnPath ?? `/l/${encodeURIComponent(page.slug || "")}`}`
  const params = tipCheckoutParams({
    page,
    blockId,
    creatorId,
    creatorName: (creator as { display_name?: string | null } | null)?.display_name || page.title || "",
    destination: account,
    amountCents: checked.cents,
    currency,
    fee,
    name: tipText(a.name, 80),
    message: data.tip_message === true ? tipText(a.message, 280) : null,
    successUrl: `${back}?tip=thanks&tip_session={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${back}?tip=cancelled`,
  })
  try {
    /* A double tap inside a minute opens the same page at Stripe, not a second one (lib/stripe/resilience). */
    const session = await deps.stripe.checkout.sessions.create(params, { idempotencyKey: stripeIdempotencyKey("onepage-tip", [page.id, blockId, String(checked.cents), a.visitor], params) })
    if (!session.url) return refuse(502, "stripe", "The payment page did not open. Nothing was charged. Try again.")
    return { ok: true, url: session.url, sessionId: session.id, amountCents: checked.cents, currency }
  } catch (e) {
    console.error("[onepage-tip] checkout:", e instanceof Error ? e.message.slice(0, 200) : "unknown")
    return refuse(502, "stripe", "The payment page did not open. Nothing was charged. Try again.")
  }
}

/** A Checkout Session this file made. */
export function isTipSession(session: Pick<Stripe.Checkout.Session, "metadata">): boolean {
  const m = session.metadata ?? {}
  return m.kind === TIP_SESSION_KIND && typeof m.onepage_id === "string" && UUID.test(m.onepage_id) && typeof m.creator_id === "string" && typeof m.block_id === "string"
}

export type TipRecord = { ok: true; created: boolean; stored: boolean; amountCents: number; currency: string; onepageId: string } | { ok: false; status: number; error: string }

const MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST204"])

/**
 * THE TIP, FROM A PAID SESSION: the webhook's call and the visitor's return.
 * Only a session this file made (its metadata is written by this server, and
 * a session id from the page is read back from Stripe, never believed),
 * paid, and for the page the return names. Twice is once.
 */
export async function recordTipFromSession(db: Db, session: Stripe.Checkout.Session, expected?: { onepageId?: string }): Promise<TipRecord> {
  if (!isTipSession(session)) return { ok: false, status: 400, error: "not_a_tip" }
  const m = session.metadata as Record<string, string>
  if (expected?.onepageId && m.onepage_id !== expected.onepageId) return { ok: false, status: 403, error: "forbidden" }
  if (session.payment_status !== "paid") return { ok: false, status: 409, error: "not_paid" }
  const amount = typeof session.amount_total === "number" ? session.amount_total : Number(m.amount_cents)
  const currency = (session.currency || "").toLowerCase()
  if (!Number.isInteger(amount) || amount <= 0 || !currency) return { ok: false, status: 409, error: "not_paid" }
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null)
  const fee = Number(m.platform_fee_cents)
  const row = {
    onepage_id: m.onepage_id,
    block_id: m.block_id,
    creator_id: m.creator_id,
    checkout_session_id: session.id,
    payment_intent_id: intent,
    amount_cents: amount,
    currency,
    platform_fee_cents: Number.isFinite(fee) ? fee : null,
    tipper_name: m.tipper_name || session.customer_details?.name || null,
    tipper_email: session.customer_details?.email || null,
    message: m.tip_message || null,
    status: "paid",
  }
  try {
    const { data, error } = await db.from("onepage_tips").upsert(row, { onConflict: "checkout_session_id", ignoreDuplicates: true }).select("id")
    if (error) {
      if (MISSING.has(error.code)) return { ok: true, created: false, stored: false, amountCents: amount, currency, onepageId: m.onepage_id }
      return { ok: false, status: 500, error: "not_saved" }
    }
    return { ok: true, created: Array.isArray(data) && data.length > 0, stored: true, amountCents: amount, currency, onepageId: m.onepage_id }
  } catch {
    return { ok: false, status: 500, error: "not_saved" }
  }
}

/** The return's question: the session read from Stripe again, never trusted from the page, for the page it says. */
export async function confirmTip(db: Db, stripe: TipStripe, a: { sessionId: unknown; onepageId: unknown }): Promise<TipRecord> {
  const id = typeof a.sessionId === "string" && /^cs_[A-Za-z0-9_]{8,255}$/.test(a.sessionId) ? a.sessionId : null
  if (!id || typeof a.onepageId !== "string" || !UUID.test(a.onepageId)) return { ok: false, status: 400, error: "bad_session" }
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(id)
  } catch {
    return { ok: false, status: 502, error: "stripe" }
  }
  return recordTipFromSession(db, session, { onepageId: a.onepageId })
}

/** The creator's tips on their page, newest first, for /app. Empty before part 411. */
export async function pageTips(db: Db, onepageId: string, limit = 50): Promise<{ rows: Array<{ id: string; block_id: string; amount_cents: number; currency: string; tipper_name: string | null; message: string | null; created_at: string }>; ready: boolean }> {
  try {
    const { data, error } = await db.from("onepage_tips").select("id, block_id, amount_cents, currency, tipper_name, message, created_at").eq("onepage_id", onepageId).eq("status", "paid").order("created_at", { ascending: false }).limit(limit)
    if (error) return { rows: [], ready: !MISSING.has(error.code) }
    return { rows: (data ?? []) as never, ready: true }
  } catch {
    return { rows: [], ready: false }
  }
}
