import "server-only"

/**
 * ===========================================================================
 *  CONTACTS, FOR THE REST OF THE SERVER (round 51)
 * ===========================================================================
 * What other parts of Storelib read about a store's people. Every function
 * takes the store's id the caller already found from the session (lib/team/
 * server requireTeamPermission, or lib/contacts/gate requireContacts); none
 * of them decides who is asking.
 *
 *   contactsForEmail(creatorId, ids)
 *       The composer's preselect: `/app/emails/new?to=<contactId>` and
 *       `/app/emails/new?contacts=<id,id,...>` (at most 200). Each id comes
 *       back with the person's address and `marketingEligible`, which is the
 *       campaign rule unchanged (a subscribed, active subscribers row of this
 *       store, and the address not suppressed). Community membership, a
 *       purchase or a form answer never make anybody eligible; `reason` says
 *       why not. An id of another store, or of nobody, is "not_found".
 *
 * A contact id is any key lib/contacts/identity.ts makes ("u_<uuid>",
 * "s_<uuid>", "c_<uuid>", ...). A link made before two rows were joined into
 * one person still opens that person; `contactId` is their id now.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { contactsForEmail as targets, personByKey, type EmailTarget } from "./profile-server"
import type { ContactsScope } from "./gate"

export type { EmailTarget }

async function scopeOf(db: ReturnType<typeof createAdminClient>, creatorId: string): Promise<ContactsScope | null> {
  const { data } = await db.from("creators").select("id, user_id").eq("id", creatorId).maybeSingle()
  return data ? { creatorId: String(data.id), ownerUserId: (data.user_id as string | null) ?? null } : null
}

/** Ids from `?to=` or `?contacts=`: split, trimmed, deduplicated, at most 200. */
export function contactIdsFrom(raw: string | string[] | null | undefined): string[] {
  const text = Array.isArray(raw) ? raw.join(",") : raw ?? ""
  return [...new Set(text.split(",").map((x) => x.trim().toLowerCase()).filter((x) => /^[a-z]_[0-9a-f-]{36}$/.test(x)))].slice(0, 200)
}

/** See the top of this file. */
export async function contactsForEmail(creatorId: string, ids: readonly string[]): Promise<EmailTarget[]> {
  const db = createAdminClient()
  const scope = await scopeOf(db, creatorId)
  if (!scope) return ids.map((id) => ({ id, contactId: null, email: null, name: null, marketingEligible: false, reason: "not_found" }))
  return targets(db, scope, ids)
}

/** Whether a contact id is one of this store's people (for a link that should only be drawn when it opens something). */
export async function isStoreContact(creatorId: string, id: string): Promise<boolean> {
  const db = createAdminClient()
  const scope = await scopeOf(db, creatorId)
  return !!scope && !!(await personByKey(db, scope, id).catch(() => null))
}
