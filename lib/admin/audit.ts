import "server-only"

import { loggable } from "./plain-reason"

/**
 * ===========================================================================
 *  EVERY CHANGE MADE FROM /admin, WRITTEN DOWN
 * ===========================================================================
 * A ban, an unpublished product, a refund: each is recorded in
 * `admin_actions` after it happens (supabase/sql/RUN_ADMIN_CONSOLE.sql). The
 * table has row level security on and no policy, so only the service role
 * reads or writes it, and the admin's Audit view is the only place it shows.
 *
 * Written AFTER the action, and a failure to write it does not undo the
 * action: a refund Stripe has already made is made. The failure is logged
 * and returned so the route can say "done, but not recorded" rather than
 * pretend. Before the SQL is run the table does not exist, and that is the
 * answer every action gets until it is.
 *
 * There is one admin login, not one per person, so the actor is the session
 * rather than a name. When the admin grows accounts, this is where the name
 * goes.
 */

export type AdminAction = {
  action: string
  /** "domain" is a payment method domain held by Stripe, not a row in this database. */
  targetType: "creator" | "product" | "order" | "account" | "domain" | "review" | "platform" | "flag" | "community"
  targetId: string
  /** A handle or title, so the log still reads after the row is gone. */
  targetLabel?: string | null
  reason?: string | null
  detail?: Record<string, unknown>
}

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export async function recordAdminAction(db: Db, entry: AdminAction): Promise<boolean> {
  try {
    const { error } = await db.from("admin_actions").insert({
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId,
      target_label: entry.targetLabel ?? null,
      reason: entry.reason ? entry.reason.slice(0, 500) : null,
      detail: entry.detail ?? {},
      actor: "admin session",
    })
    if (error) {
      console.error(`[admin] audit write failed: ${loggable(error)}`)
      return false
    }
    return true
  } catch (e) {
    console.error(`[admin] audit write failed: ${loggable(e)}`)
    return false
  }
}
