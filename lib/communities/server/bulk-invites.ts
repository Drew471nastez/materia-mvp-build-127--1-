import "server-only"

/**
 * ===========================================================================
 *  INVITING A LIST OF PEOPLE, ON THE SERVER (round 32)
 * ===========================================================================
 * Members › Invite a list: up to 200 addresses at a time, each sent the
 * same email invite the one address form sends (./invites.ts createInvite:
 * one use, 30 days, the tier when one is chosen). The route checks the
 * invite permission and a rate limit first.
 *
 * Not sent to somebody already an active member, nor again to an address
 * invited in the last seven days (createInvite would revoke that link and
 * send a new one, which reads as spam). One community sends at most 500
 * email invites a day, counted from its own invites table, whoever sends
 * them; past that the rest are left for tomorrow and the answer says how
 * many.
 */
import { BULK_INVITES_PER_DAY, parseEmailList, type BulkInviteResult } from "../bulk-invites"
import type { CommunityRow } from "../types"
import { createInvite } from "./invites"
import { audit } from "./audit"
import { nowIso, reasonOf, type Db } from "./db"

const WEEK_MS = 7 * 86_400_000
const DAY_MS = 86_400_000
const AT_ONCE = 5

/** Email invites this community made in the last day. */
async function sentToday(db: Db, communityId: string, now: number): Promise<number> {
  const { count } = await db.from("community_invites").select("id", { count: "exact", head: true }).eq("community_id", communityId).not("email", "is", null).gte("created_at", nowIso(now - DAY_MS))
  return typeof count === "number" ? count : 0
}

/** Which of these addresses belong to active members already. */
async function memberEmails(db: Db, communityId: string, emails: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  for (let i = 0; i < emails.length; i += 100) {
    const { data: people } = await db.from("profiles").select("id, email").in("email", emails.slice(i, i + 100))
    const byId = new Map(((people as { id: string; email: string | null }[] | null) ?? []).filter((p) => p.email).map((p) => [p.id, String(p.email).toLowerCase()]))
    if (!byId.size) continue
    const { data: rows } = await db.from("community_members").select("user_id").eq("community_id", communityId).eq("status", "active").in("user_id", [...byId.keys()])
    for (const r of (rows as { user_id: string }[] | null) ?? []) out.add(byId.get(r.user_id) as string)
  }
  return out
}

/** Which of these addresses had an invite from this community in the last week that still works. */
async function invitedLately(db: Db, communityId: string, emails: string[], now: number): Promise<Set<string>> {
  const out = new Set<string>()
  for (let i = 0; i < emails.length; i += 100) {
    const { data } = await db.from("community_invites").select("email").eq("community_id", communityId).in("email", emails.slice(i, i + 100)).is("revoked_at", null).gte("created_at", nowIso(now - WEEK_MS))
    for (const r of (data as { email: string | null }[] | null) ?? []) if (r.email) out.add(r.email.toLowerCase())
  }
  return out
}

export async function inviteList(db: Db, a: { community: CommunityRow; actorId: string; inviterName: string; text: unknown; tierId: string | null; now?: number }): Promise<{ ok: true; result: BulkInviteResult; found: number } | { ok: false; status: number; error: string }> {
  const now = a.now ?? Date.now()
  const list = parseEmailList(a.text)
  if (!list.emails.length) return { ok: false, status: 400, error: "No email addresses found. Paste them one per line, or choose a CSV file." }
  if (a.tierId) {
    const { data: tier } = await db.from("community_tiers").select("id, archived_at").eq("id", a.tierId).eq("community_id", a.community.id).maybeSingle()
    if (!tier || tier.archived_at) return { ok: false, status: 404, error: "That tier is not in this community." }
  }
  const [members, recent, today] = await Promise.all([memberEmails(db, a.community.id, list.emails), invitedLately(db, a.community.id, list.emails, now), sentToday(db, a.community.id, now)])
  const result: BulkInviteResult = { sent: 0, members: 0, recent: 0, failed: 0, limited: 0 }
  const send: string[] = []
  for (const e of list.emails) {
    if (members.has(e)) result.members++
    else if (recent.has(e)) result.recent++
    else send.push(e)
  }
  const room = Math.max(0, BULK_INVITES_PER_DAY - today)
  result.limited = Math.max(0, send.length - room)
  const batch = send.slice(0, room)
  for (let i = 0; i < batch.length; i += AT_ONCE) {
    const outcomes = await Promise.all(
      batch.slice(i, i + AT_ONCE).map(async (email) => {
        try {
          const made = await createInvite(db, { community: a.community, createdBy: a.actorId, inviterName: a.inviterName, input: { email, maxUses: 1, expiresInDays: 30, tierId: a.tierId, complimentary: null }, enabled: true })
          return made.ok
        } catch (e) {
          console.error(`[communities] list invite: ${reasonOf(e)}`)
          return false
        }
      }),
    )
    for (const ok of outcomes) ok ? result.sent++ : result.failed++
    /* A whole group failing is the database or the email engine, not the addresses: the rest are not tried. */
    if (outcomes.every((ok) => !ok)) {
      result.failed += batch.length - Math.min(i + AT_ONCE, batch.length)
      break
    }
  }
  await audit(db, { communityId: a.community.id, actorId: a.actorId, actorKind: "member", action: "invite.list_sent", targetType: "community", targetId: a.community.id, detail: { found: list.emails.length, ...result } })
  return { ok: true, result, found: list.emails.length }
}
