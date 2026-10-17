import "server-only"

/**
 * ===========================================================================
 *  ONE MODULE OF A PROGRAM, SOLD ON ITS OWN (round AG)
 * ===========================================================================
 * The owner: "module and lesson sales, with locked previews". A program
 * already locks its lessons on the server (lib/courses/server.ts
 * lessonContext: anybody it is not open to plays only the lessons marked as
 * a free preview). Now a module of a program can carry its own price
 * (course_modules.price_cents, run-now part 217): a member the program is not
 * open to buys that module alone, and its lessons open for them, still on the
 * server, the rest of the program staying locked with its previews.
 *
 * Bought the way a program is (./learn-checkout.ts): an embedded Checkout
 * Session on Storelib's Stripe account, the creator's connected account the
 * destination and the platform's fee kept back, every fact (price, title,
 * account) read here from the rows, nothing from the page. The grant is one
 * row per person and module (community_module_access), from the webhook or
 * the sheet's confirm, whichever is first; a full refund revokes it.
 */
import type Stripe from "stripe"
import { programGate } from "../learn"
import type { CommunityRow } from "../types"
import type { Viewer } from "./context"
import { type Db } from "./db"
import { findProgram, ownedPrograms, programViewer, type ProgramRow } from "./learn"
import type { CheckoutDeps, CheckoutStart, GrantAnswer, StripeSessions } from "./learn-checkout"

export const MODULE_SESSION_KIND = "community_module"
/** A module's price: $1 to $10,000, or none (not sold on its own). */
export const MODULE_PRICE_MIN = 100
export const MODULE_PRICE_MAX = 1_000_000

const refuse = (status: number, code: string, error: string): CheckoutStart => ({ ok: false, status, code, error })
const MISSING = new Set(["42P01", "42703", "PGRST204", "PGRST205"])

/** A price as typed into the editor ("19", "19.50", "") to cents, null for none, NaN for a price out of range. */
export function modulePriceInput(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null
  const n = typeof raw === "number" ? raw : Math.round(Number.parseFloat(String(raw).replace(/[$,\s]/g, "")) * 100)
  if (!Number.isFinite(n)) return NaN
  if (n === 0) return null
  return n >= MODULE_PRICE_MIN && n <= MODULE_PRICE_MAX && Number.isInteger(n) ? n : NaN
}

/** The modules of these ids this person bought, and still has. Empty before part 217. */
export async function ownedModules(db: Db, userId: string | null, moduleIds: string[]): Promise<Set<string>> {
  if (!userId || moduleIds.length === 0) return new Set()
  try {
    const { data, error } = await db.from("community_module_access").select("module_id").eq("user_id", userId).in("module_id", moduleIds).is("revoked_at", null)
    if (error) return new Set()
    return new Set(((data as { module_id: string }[] | null) ?? []).map((r) => r.module_id))
  } catch {
    return new Set()
  }
}

/** A program's modules with their prices (none before part 217), in order. */
export async function modulePrices(db: Db, courseId: string | null): Promise<{ id: string; title: string; priceCents: number | null }[]> {
  if (!courseId) return []
  const read = async (cols: string) => db.from("course_modules").select(cols).eq("course_id", courseId).order("position", { ascending: true })
  let { data, error } = await read("id, title, price_cents")
  if (error && MISSING.has(String(error.code))) ({ data, error } = await read("id, title"))
  if (error) return []
  return ((data ?? []) as unknown as { id: string; title: string | null; price_cents?: number | null }[]).map((m) => ({ id: m.id, title: m.title || "Module", priceCents: m.price_cents && m.price_cents > 0 ? m.price_cents : null }))
}

/** The modules of this program a viewer it is not open to has bought: the lessons the server opens for them. */
export async function openModulesFor(db: Db, userId: string | null, program: Pick<ProgramRow, "courseId">): Promise<Set<string>> {
  if (!userId || !program.courseId) return new Set()
  const priced = (await modulePrices(db, program.courseId)).filter((m) => m.priceCents)
  return ownedModules(db, userId, priced.map((m) => m.id))
}

/** Everything Stripe is asked for, from the server's own facts. Pure, so the tests read it. */
export function moduleCheckoutParams(p: {
  module: { id: string; title: string; priceCents: number }
  program: Pick<ProgramRow, "id" | "title" | "coverUrl">
  community: Pick<CommunityRow, "id" | "name" | "slug">
  buyer: { userId: string; email: string | null }
  creatorId: string
  destination: string
  currency: string
  fee: { platformFeeCents: number; feePercent: number; feeFixedCents: number; planId: string; pricingTier?: string | null; feeRuleVersion?: string | null }
}): Stripe.Checkout.SessionCreateParams {
  const amount = p.module.priceCents
  const metadata: Record<string, string> = {
    kind: MODULE_SESSION_KIND,
    community_module_id: p.module.id,
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
  const name = `${p.module.title || "Module"}`.slice(0, 250)
  return {
    mode: "payment",
    ui_mode: "embedded",
    redirect_on_completion: "never",
    line_items: [{ quantity: 1, price_data: { currency: p.currency, unit_amount: amount, product_data: { name, description: `A module of ${p.program.title || "a program"} in ${p.community.name}`.slice(0, 500), ...(cover ? { images: cover } : {}) } } }],
    ...(p.buyer.email ? { customer_email: p.buyer.email } : {}),
    client_reference_id: p.buyer.userId,
    payment_intent_data: {
      application_fee_amount: p.fee.platformFeeCents,
      transfer_data: { destination: p.destination },
      description: `${name.slice(0, 150)} (${p.community.name.slice(0, 150)})`,
      metadata,
    },
    metadata,
  }
}

/** A session for this member and this module, or why not. */
export async function startModuleCheckout(db: Db, deps: CheckoutDeps, a: { community: CommunityRow; viewer: Viewer; programId: string; moduleId: string; email: string | null }): Promise<CheckoutStart> {
  const { community, viewer } = a
  if (!community.classroom_enabled) return refuse(404, "not_found", "That program is not here.")
  if (!viewer.userId || !viewer.active) return refuse(403, "not_member", "Join the community first.")
  const program = await findProgram(db, community.id, a.programId)
  if (!program || program.id !== a.programId || program.productId || !program.courseId) return refuse(404, "not_found", "That program is not here.")
  if (program.status !== "published") return refuse(409, "not_for_sale", "This program is not open yet.")
  const mod = (await modulePrices(db, program.courseId)).find((m) => m.id === a.moduleId)
  if (!mod || !mod.priceCents) return refuse(409, "not_for_sale", "This module is not sold on its own.")
  const owned = await ownedPrograms(db, viewer.userId, [program.id])
  const gate = programGate(program, programViewer(viewer, owned.has(program.id)))
  if (gate.open) return refuse(409, "already_yours", "This program is already open to you.")
  if ((gate as { reason?: string }).reason === "private") return refuse(403, "closed", "This program is not open to you.")
  if ((await ownedModules(db, viewer.userId, [mod.id])).has(mod.id)) return refuse(409, "already_yours", "This module is already yours.")
  if (!community.creator_id) return refuse(409, "seller_unavailable", "This community cannot take payments right now.")
  const { data: creator } = await db.from("creators").select("id, stripe_account_id").eq("id", community.creator_id).maybeSingle()
  const account = (creator as { stripe_account_id?: string | null } | null)?.stripe_account_id ?? null
  if (!account || !account.startsWith("acct_") || !(await deps.ready(community.creator_id))) return refuse(409, "seller_unavailable", "This community cannot take payments right now. Nothing was charged.")
  let fee
  try {
    fee = await deps.fee(mod.priceCents, community.creator_id, deps.chargeCurrency)
  } catch {
    return refuse(400, "currency", "This currency is not available for checkout yet.")
  }
  try {
    const session = await deps.stripe.checkout.sessions.create(
      moduleCheckoutParams({ module: { id: mod.id, title: mod.title, priceCents: mod.priceCents }, program, community, buyer: { userId: viewer.userId, email: a.email }, creatorId: community.creator_id, destination: account, currency: deps.chargeCurrency, fee }),
    )
    if (!session.client_secret) return refuse(502, "stripe", "The payment form did not load. Nothing was charged. Try again.")
    return { ok: true, clientSecret: session.client_secret, sessionId: session.id, amountCents: mod.priceCents, currency: deps.chargeCurrency }
  } catch (e) {
    console.error("[communities] module checkout:", e instanceof Error ? e.message.slice(0, 200) : "unknown")
    return refuse(502, "stripe", "The payment form did not load. Nothing was charged. Try again.")
  }
}

export function isModuleSession(session: Pick<Stripe.Checkout.Session, "metadata">): boolean {
  const m = session.metadata ?? {}
  return m.kind === MODULE_SESSION_KIND && typeof m.community_module_id === "string" && typeof m.community_program_id === "string" && typeof m.buyer_id === "string"
}

/** THE MODULE IS THEIRS, FROM A PAID SESSION: one row per person and module; a second call changes nothing. */
export async function grantModuleFromSession(db: Db, session: Stripe.Checkout.Session, opts: { userId?: string } = {}): Promise<GrantAnswer> {
  if (!isModuleSession(session)) return { ok: false, status: 400, error: "not_a_module_session" }
  const m = session.metadata as Record<string, string>
  if (opts.userId && m.buyer_id !== opts.userId) return { ok: false, status: 403, error: "forbidden" }
  if (session.payment_status !== "paid") return { ok: false, status: 409, error: "not_paid" }
  const program = await findProgram(db, m.community_id, m.community_program_id)
  if (!program || program.id !== m.community_program_id || !program.courseId) return { ok: false, status: 404, error: "not_found" }
  const mod = (await modulePrices(db, program.courseId)).find((x) => x.id === m.community_module_id)
  if (!mod) return { ok: false, status: 404, error: "not_found" }
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null)
  const row = {
    module_id: mod.id,
    user_id: m.buyer_id,
    program_id: program.id,
    community_id: m.community_id,
    source: "purchase",
    checkout_session_id: session.id,
    payment_intent_id: intent,
    amount_cents: typeof session.amount_total === "number" ? session.amount_total : null,
    currency: session.currency ?? null,
    revoked_at: null,
  }
  const { data: existing, error: readError } = await db.from("community_module_access").select("revoked_at").eq("module_id", mod.id).eq("user_id", m.buyer_id).maybeSingle()
  if (readError) return { ok: false, status: MISSING.has(String(readError.code)) ? 409 : 500, error: MISSING.has(String(readError.code)) ? "not_set_up" : "failed" }
  if (existing && !(existing as { revoked_at: string | null }).revoked_at) return { ok: true, created: false, programId: program.id }
  const { error } = existing
    ? await db.from("community_module_access").update({ ...row, created_at: new Date().toISOString() }).eq("module_id", mod.id).eq("user_id", m.buyer_id)
    : await db.from("community_module_access").insert(row)
  if (error && String(error.code) !== "23505") return { ok: false, status: 500, error: "failed" }
  return { ok: true, created: !error, programId: program.id }
}

/** The sheet's confirm: the session read from Stripe again, never trusted from the page. */
export async function confirmModuleCheckout(db: Db, stripe: StripeSessions, a: { sessionId: unknown; userId: string }): Promise<GrantAnswer> {
  const id = typeof a.sessionId === "string" && /^cs_[A-Za-z0-9_]{8,255}$/.test(a.sessionId) ? a.sessionId : null
  if (!id) return { ok: false, status: 400, error: "bad_session" }
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(id)
  } catch {
    return { ok: false, status: 502, error: "stripe" }
  }
  return grantModuleFromSession(db, session, { userId: a.userId })
}

/** A full refund locks the module again. Never throws. */
export async function revokeRefundedModule(db: Db, paymentIntentId: string | null | undefined): Promise<number> {
  if (!paymentIntentId) return 0
  try {
    const { data, error } = await db.from("community_module_access").update({ revoked_at: new Date().toISOString() }).eq("payment_intent_id", paymentIntentId).is("revoked_at", null).select("module_id")
    if (error) return 0
    return ((data as unknown[] | null) ?? []).length
  } catch {
    return 0
  }
}
