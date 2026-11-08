import "server-only"

/**
 * ===========================================================================
 *  PEOPLE PICKED IN CONTACTS, AS AN EMAIL'S RECIPIENTS (round 51)
 * ===========================================================================
 * The composer opens with people already chosen: /app/emails/new?to=<id>
 * (one person) or ?contacts=<id,id,...> (a selection, at most 200). This
 * turns those contact ids into the people a campaign may go to, and says
 * how many were left out and why.
 *
 * ONLY MARKETING ELIGIBLE PEOPLE, DECIDED HERE, ON THE SERVER. A campaign is
 * marketing. Somebody is sent one only when they are on this creator's list
 * as subscribed and active (subscribers.status, the same rule the send
 * itself keeps: lib/email-campaigns/queue.ts resolveAudience), and their
 * address is not suppressed (email_suppressions, a hard bounce or a
 * complaint). Everyone else is left out, counted under the reason:
 *
 *   unsubscribed   they left the list (or it was turned off for them)
 *   suppressed     the address bounced or complained
 *   no_consent     a buyer, a form respondent, a community member: known,
 *                  but never asked for this creator's news. Being in a
 *                  community is never consent.
 *   unknown        the id is not one of this creator's people
 *
 * ---------------------------------------------------------------------------
 *  THE ONE PART TO REWIRE WHEN CONTACTS LANDS
 * ---------------------------------------------------------------------------
 * `lookupContacts` is the only function that knows what a contact id is.
 * Until the Contacts builder's server helper exists it reads the ids as
 * subscribers.id, because that is the only "person" table Emails has, and
 * ids it does not find are reported as unknown. Once lib/contacts/server.ts
 * exports its helper (contactsForEmail(creatorId, ids) giving each person's
 * address and marketing eligibility), `lookupContacts` maps that answer to
 * ContactLookup and nothing else changes: the eligible addresses are still
 * matched to a subscribed, active subscribers row of this creator (campaigns
 * are sent to subscriber rows), and anyone without one is no_consent.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** At most this many people in one ?contacts= list (the shared round 51 contract). */
export const MAX_PICKED = 200

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type Eligibility = "eligible" | "unsubscribed" | "suppressed" | "no_consent"
export type LeftOutReason = Exclude<Eligibility, "eligible"> | "unknown"

/** One contact, as Contacts knows them: an address, a name, and whether they agreed to marketing. */
export interface ContactLookup {
  contactId: string
  email: string | null
  name: string | null
  marketing: Eligibility
}

/** Resolves this creator's contact ids. Ids that are not theirs are simply not in the answer. */
export type LookupContacts = (db: Db, creatorId: string, ids: string[]) => Promise<ContactLookup[]>

export interface PickedRecipient {
  contactId: string
  subscriberId: string
  email: string
  name: string | null
}

export interface PickedResult {
  /** Distinct ids asked for, after the cap. */
  asked: number
  recipients: PickedRecipient[]
  leftOut: Record<LeftOutReason, number>
}

const SUPPRESSED_STATUS = new Set(["unsubscribed", "bounced", "complained", "cleaned"])

/** ?to=<id> and ?contacts=<id,...> as a clean list: distinct, well formed, at most MAX_PICKED. */
export function readContactIds(...raw: Array<string | string[] | null | undefined>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const r of raw) {
    const parts = Array.isArray(r) ? r : typeof r === "string" ? r.split(",") : []
    for (const p of parts) {
      const id = String(p).trim()
      if (!id || id.length > 80 || !/^[A-Za-z0-9_:-]+$/.test(id) || seen.has(id)) continue
      seen.add(id)
      out.push(id)
      if (out.length >= MAX_PICKED) return out
    }
  }
  return out
}

function subscriberEligibility(row: { status?: string | null; is_active?: boolean | null }): Eligibility {
  const status = String(row.status || "subscribed").toLowerCase()
  if (status === "bounced" || status === "complained" || status === "cleaned") return "suppressed"
  if (SUPPRESSED_STATUS.has(status) || row.is_active === false) return "unsubscribed"
  /* A buyer who never asked for news ("customer"), somebody who only wrote ("wrote"). */
  if (status !== "subscribed") return "no_consent"
  return "eligible"
}

/**
 * BEFORE CONTACTS IS MERGED: a contact id is a subscribers.id of this
 * creator. Rewire this one function to lib/contacts/server.ts (see above).
 */
export const lookupContacts: LookupContacts = async (db, creatorId, ids) => {
  const wanted = ids.filter((id) => UUID.test(id))
  const out: ContactLookup[] = []
  for (let i = 0; i < wanted.length; i += 200) {
    const { data, error } = await db
      .from("subscribers")
      .select("id, email, name, status, is_active")
      .eq("creator_id", creatorId)
      .in("id", wanted.slice(i, i + 200))
    if (error) throw new Error("contacts")
    for (const r of (data ?? []) as Array<{ id: string; email: string | null; name: string | null; status: string | null; is_active: boolean | null }>) {
      out.push({ contactId: r.id, email: r.email, name: r.name, marketing: subscriberEligibility(r) })
    }
  }
  return out
}

const norm = (e: string | null | undefined) => (typeof e === "string" ? e.trim().toLowerCase() : "")

/** Addresses with a live suppression that stops marketing (lib/notify/suppressions: all, optional). A missing table is no suppression. */
async function suppressedAddresses(db: Db, emails: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  for (let i = 0; i < emails.length; i += 200) {
    try {
      const { data, error } = await db.from("email_suppressions").select("email, scope").in("email", emails.slice(i, i + 200)).is("lifted_at", null)
      if (error) return out
      for (const r of (data ?? []) as Array<{ email: string; scope: string }>) if (r.scope === "all" || r.scope === "optional") out.add(norm(r.email))
    } catch {
      return out
    }
  }
  return out
}

/**
 * The picked people a campaign may go to, and the count left out under each
 * reason. Every read is filtered by `creatorId`: an id from another
 * creator's contacts is unknown here, never resolved.
 */
export async function resolvePickedContacts(db: Db, creatorId: string, ids: string[], lookup: LookupContacts = lookupContacts): Promise<PickedResult> {
  const asked = readContactIds(ids)
  const leftOut: Record<LeftOutReason, number> = { unsubscribed: 0, suppressed: 0, no_consent: 0, unknown: 0 }
  const found = asked.length ? await lookup(db, creatorId, asked) : []
  const byId = new Map(found.map((c) => [c.contactId, c]))

  const maybe: ContactLookup[] = []
  for (const id of asked) {
    const c = byId.get(id)
    if (!c || !norm(c.email).includes("@")) leftOut.unknown++
    else if (c.marketing !== "eligible") leftOut[c.marketing]++
    else maybe.push(c)
  }

  /* The subscriber row each eligible address is sent through: subscribed and active, this creator's. */
  const emails = [...new Set(maybe.map((c) => norm(c.email)))]
  const rows = new Map<string, { id: string; email: string; name: string | null; status: string | null; is_active: boolean | null }>()
  for (let i = 0; i < emails.length; i += 200) {
    const { data, error } = await db
      .from("subscribers")
      .select("id, email, name, status, is_active")
      .eq("creator_id", creatorId)
      .in("email", emails.slice(i, i + 200))
    if (error) throw new Error("subscribers")
    for (const r of (data ?? []) as Array<{ id: string; email: string; name: string | null; status: string | null; is_active: boolean | null }>) {
      const e = norm(r.email)
      const had = rows.get(e)
      /* Two rows for one address: the subscribed one is the one that counts. */
      if (!had || (subscriberEligibility(r) === "eligible" && subscriberEligibility(had) !== "eligible")) rows.set(e, r)
    }
  }
  const blocked = await suppressedAddresses(db, emails)

  const recipients: PickedRecipient[] = []
  const sent = new Set<string>()
  for (const c of maybe) {
    const e = norm(c.email)
    const row = rows.get(e)
    const standing = row ? subscriberEligibility(row) : "no_consent"
    if (standing !== "eligible") {
      leftOut[standing]++
      continue
    }
    if (blocked.has(e)) {
      leftOut.suppressed++
      continue
    }
    /* The same address picked twice (two contact ids for one person) is one email. */
    if (sent.has(e)) continue
    sent.add(e)
    recipients.push({ contactId: c.contactId, subscriberId: row!.id, email: e, name: c.name ?? row!.name ?? null })
  }
  return { asked: asked.length, recipients, leftOut }
}

/**
 * The picked people kept as a segment the composer sends to (a hand picked
 * one, email_segments.filters.subscriber_ids, which the send already reads
 * and filters again when it goes). Marked `picked`, so the Send to list does
 * not offer it as one of the creator's own segments. The same people picked
 * again reuse the same row.
 */
export async function keepPickedSegment(db: Db, creatorId: string, subscriberIds: string[]): Promise<{ id: string } | null> {
  const ids = [...new Set(subscriberIds)].sort()
  if (ids.length === 0) return null
  const key = await pickedKey(ids)
  try {
    const { data: had } = await db.from("email_segments").select("id").eq("creator_id", creatorId).eq("filters->>picked_key", key).limit(1).maybeSingle()
    if (had?.id) return { id: String(had.id) }
  } catch {
    /* read below writes a new one */
  }
  const { data, error } = await db
    .from("email_segments")
    .insert({ creator_id: creatorId, name: `Picked in Contacts (${ids.length})`, filters: { subscriber_ids: ids, picked: true, picked_key: key } })
    .select("id")
    .single()
  if (error || !data) return null
  return { id: String(data.id) }
}

async function pickedKey(ids: string[]): Promise<string> {
  const { createHash } = await import("node:crypto")
  return createHash("sha256").update(ids.join(",")).digest("hex").slice(0, 32)
}
