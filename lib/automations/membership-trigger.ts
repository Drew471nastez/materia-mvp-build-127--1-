import "server-only"

/**
 * ===========================================================================
 *  "SOMEONE STARTS A MEMBERSHIP", FOR THE CREATOR'S AUTOMATIONS (round 51)
 * ===========================================================================
 * Called once a membership first gives access (lib/memberships/sync.ts
 * applyEffects, the "started" change). It enters the creator's active
 * Membership onboarding flows for the member.
 *
 *   ONE RUN PER MEMBER PER FLOW PER MEMBERSHIP. The entry's event is the
 *   membership's id, so the run's key is `event:membership:<id>` and the
 *   engine's unique (flow_id, dedupe_key) turns a second call (a webhook
 *   delivered twice, the confirm page and the webhook both syncing) into
 *   nothing (lib/automations/engine.ts enroll, flow-model dedupeKey).
 *
 *   NOT A COMMUNITY'S PAID PLAN. A community already welcomes a new member
 *   by email (its Welcome email) and in its chat; a third message for the
 *   same moment is not sent. A plan whose product cannot be read is left
 *   out too, rather than guessed.
 *
 *   ABOUT THEIR ACCESS, TO THE MEMBER. The flow's audience is the people the
 *   trigger is about, as a purchase follow-up's is; somebody who left the
 *   creator's list is still never sent one (the engine's standing check).
 *
 * Only the engine: before its tables exist nothing is sent (the older path
 * has no way to send this once). Never throws.
 */
import type { TriggerInput } from "./engine"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface StartedMembership {
  id: string
  creator_id: string | null
  product_id: string | null
  buyer_email: string | null
  buyer_name?: string | null
  title?: string | null
}

/** What would be entered for this membership, or null when nothing should be (a community's plan, no address). */
export async function membershipTriggerInput(db: Db, row: StartedMembership): Promise<TriggerInput | null> {
  const email = (row.buyer_email ?? "").trim().toLowerCase()
  if (!row.creator_id || !email.includes("@") || email.endsWith("@storelib.invalid")) return null
  if (row.product_id) {
    try {
      const { data, error } = await db.from("products").select("id, community_id").eq("id", row.product_id).eq("creator_id", row.creator_id).maybeSingle()
      if (error || !data) return null
      if (data.community_id) return null
    } catch {
      return null
    }
  }
  return {
    triggerType: "membership_started",
    creatorId: row.creator_id,
    email,
    name: row.buyer_name ?? null,
    productId: row.product_id,
    productTitle: row.title ?? null,
    eventId: `membership:${row.id}`,
    source: { surface: "checkout" },
  }
}

export async function membershipStartedAutomations(db: Db, row: StartedMembership, enter?: (input: TriggerInput) => Promise<unknown>): Promise<void> {
  try {
    const input = await membershipTriggerInput(db, row)
    if (!input) return
    const go = enter ?? (await import("./run")).enrollInFlows
    await go(input)
  } catch (e) {
    console.error("[automations] membership started:", e instanceof Error ? e.message : e)
  }
}
