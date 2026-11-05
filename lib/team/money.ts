import "server-only"
import type { User } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { permits, type TeamPermission } from "./permissions"
import { actingStore, type ActingStore } from "./server"
import { teamStampDb } from "./audit"
import { routeUser, authUnavailableResponse } from "@/lib/auth/route-user"

/**
 * ===========================================================================
 *  PAYOUTS AND BILLING FOR A TEAM MEMBER (round 42)
 * ===========================================================================
 * Money is the part of a store a member is given most carefully, so each is
 * two permissions (lib/team/permissions):
 *
 *   payouts          see the balance, the payouts, the payout method on file
 *                    and the tax summaries
 *   payouts_manage   cash out, change the payout schedule, and open Stripe's
 *                    own pages where the bank account is changed
 *   billing          see the plan, its invoices and the card on file
 *   billing_manage   change, cancel or resume the plan, and change the card
 *
 * Changing always gives seeing. Every route of Payouts and Billing asks
 * moneyCaller with the level it needs, so a member with "see" who sends a
 * request that changes something is refused on the server, whatever the
 * page showed. The store is the owner's: its Stripe account, its customer,
 * its plan, read and changed by the store's id and the owner's account,
 * never the member's own. What a member changes is written to
 * security_events with their name on it (lib/team/areas recordTeamAction).
 */

export type MoneyKind = "payouts" | "billing"
export type MoneyLevel = "view" | "manage"

/** Pure: the permission a route of this kind needs at this level. */
export function moneyPermission(kind: MoneyKind, level: MoneyLevel): TeamPermission {
  if (kind === "payouts") return level === "manage" ? "payouts_manage" : "payouts"
  return level === "manage" ? "billing_manage" : "billing"
}

/* Said in English as the routes' other answers are. i18n-ignore-start */
export const MONEY_REFUSED: Record<MoneyKind, Record<MoneyLevel, string>> = {
  payouts: {
    view: "You don't have access to this store's payouts. Ask the store's owner.",
    manage: "You can see this store's payouts but not change them. Ask the store's owner for Change payouts.",
  },
  billing: {
    view: "You don't have access to this store's billing. Ask the store's owner.",
    manage: "You can see this store's plan but not change it. Ask the store's owner for Change billing.",
  },
}
/* i18n-ignore-end */

export type MoneyStore =
  | { kind: "store"; creatorId: string; isOwner: boolean; ownerUserId: string; acting: ActingStore | null }
  | { kind: "denied" }
  | { kind: "none" }
  | { kind: "unreachable" }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** The database half, for the suite: whose store this money request is about, or why not. */
export async function moneyStoreFor(admin: Db, userId: string, kind: MoneyKind, level: MoneyLevel, acting: ActingStore | null): Promise<MoneyStore> {
  if (acting) {
    if (!permits(acting.permissions, moneyPermission(kind, level))) return { kind: "denied" }
    const { data, error } = await admin.from("creators").select("id, user_id").eq("id", acting.creatorId).maybeSingle()
    if (error) return { kind: "unreachable" }
    const row = data as { id: string; user_id: string | null } | null
    if (!row?.user_id) return { kind: "none" }
    return { kind: "store", creatorId: row.id, isOwner: false, ownerUserId: row.user_id, acting }
  }
  const { data, error } = await admin.from("creators").select("id").eq("user_id", userId).maybeSingle()
  if (error) return { kind: "unreachable" }
  const row = data as { id: string } | null
  if (!row) return { kind: "none" }
  return { kind: "store", creatorId: row.id, isOwner: true, ownerUserId: userId, acting: null }
}

export type MoneyCaller =
  | {
      ok: true
      user: User
      /** The signed in person (the member, or the owner). For rate limits and the record line. */
      userId: string
      creatorId: string
      isOwner: boolean
      /** The account the store belongs to: its Stripe customer and its plan are kept by this account. */
      ownerUserId: string
      /** The owner's email, for a Stripe customer made for the store. */
      ownerEmail: string | null
      acting: ActingStore | null
      /** The service role, naming the member on the record lines it writes (lib/team/audit). */
      db: Db
    }
  | { ok: false; response: NextResponse }

const NO_STORE = { "Cache-Control": "no-store" }

/** For a Payouts or Billing route: the store, for this level, or the answer to send. */
export async function moneyCaller(kind: MoneyKind, level: MoneyLevel, opts: { noStore?: string; read?: boolean } = {}): Promise<MoneyCaller> {
  /* Bounded, retried with backoff; a 503 with Try again when Supabase Auth did not answer, a 401 only for its nobody (lib/auth/route-user). A read-only GET passes read: true (round 49). */
  /*
    Round 52: every "manage" (a payout, a bank account, a plan, a card, Stripe Connect) asks Supabase Auth
    itself, so a session ended within its token's life cannot move money. A "view" (a balance, a list of
    payouts, invoices) takes the token's verified signature, as every other read does, and no longer goes
    blank while Auth is slow.
  */
  const who = await routeUser({ fresh: level !== "view" && !opts.read })
  if (who.kind === "unavailable") return { ok: false, response: authUnavailableResponse() }
  if (who.kind !== "user") return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE }) }
  const user = who.user
  const admin = createAdminClient()
  const acting = await actingStore(admin, user.id).catch(() => null)
  const found = await moneyStoreFor(admin, user.id, kind, level, acting)
  if (found.kind === "denied") return { ok: false, response: NextResponse.json({ error: MONEY_REFUSED[kind][level] }, { status: 403, headers: NO_STORE }) }
  if (found.kind === "unreachable") return { ok: false, response: NextResponse.json({ error: "Storelib could not reach your store just now. Try again in a moment." }, { status: 503, headers: NO_STORE }) }
  if (found.kind === "none") return { ok: false, response: NextResponse.json({ error: opts.noStore ?? "Creator not found" }, { status: 404, headers: NO_STORE }) }
  let ownerEmail: string | null = user.email ?? null
  if (!found.isOwner) {
    const { data } = await admin.auth.admin.getUserById(found.ownerUserId).catch(() => ({ data: null }))
    ownerEmail = data?.user?.email ?? null
  }
  return {
    ok: true,
    user,
    userId: user.id,
    creatorId: found.creatorId,
    isOwner: found.isOwner,
    ownerUserId: found.ownerUserId,
    ownerEmail,
    acting: found.acting,
    db: found.acting ? teamStampDb(admin, user.id) : admin,
  }
}

/**
 * For the Payouts page and the Billing tab: what this person may do with the
 * store's money, so the page shows the buttons the server will honour. Only
 * ever hides; the routes decide.
 */
export function moneyAbilities(perms: readonly TeamPermission[] | null): { payouts: boolean; payoutsManage: boolean; billing: boolean; billingManage: boolean } {
  if (!perms) return { payouts: true, payoutsManage: true, billing: true, billingManage: true }
  return { payouts: permits(perms, "payouts"), payoutsManage: permits(perms, "payouts_manage"), billing: permits(perms, "billing"), billingManage: permits(perms, "billing_manage") }
}

/**
 * The Payments hub's actions (app/api/payments/[action]) and what each asks
 * of a team member. Setting up the Stripe account is the account holder's
 * own identity (their date of birth, ID, tax number, the terms they accept),
 * so it is the owner's whatever is given, and so is letting the account go.
 * Changing where payouts go (the bank, Stripe's payouts form) is Change
 * payouts; reading where the account has got to is Payouts.
 */
export type PaymentsActionLevel = MoneyLevel | "owner"

export function paymentsActionLevel(action: string, body: Record<string, unknown>): PaymentsActionLevel {
  if (action === "overview" || action === "refresh") return "view"
  if (action === "bank") return "manage"
  if (action === "component") return body.purpose === "stripe_payouts" ? "manage" : "owner"
  if (action === "app-sheet") return body.form === "bank" ? "manage" : "owner"
  return "owner"
}
