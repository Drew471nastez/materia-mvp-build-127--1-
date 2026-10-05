import "server-only"

/**
 * ===========================================================================
 *  "3 PEOPLE JOINED THROUGH YOUR LINK": ONE QUIET ROW A DAY
 * ===========================================================================
 * Round 13, ask 31: "members joining through someone's link: the inviter
 * gets one quiet notification per day ('3 people joined through your
 * link'), using community_invite_uses / invites, non spammy".
 *
 * ONE ROW PER INVITER, COMMUNITY AND DAY (UTC), grouped the way likes are
 * (notify.ts LIKES ARE GROUPED): the first join of the day through any of
 * their links writes "Ayla joined through your link"; every join after it
 * that day rewrites the same row with the day's count, "3 people joined
 * through your link". QUIET: no push, no email, and a rewrite does not mark
 * it unread again or move it up, so a busy link is one line in the bell,
 * never a stream. It respects what they asked to hear here (notify_level,
 * "Nothing" hears nothing) and never tells somebody about themselves.
 *
 * The count is real: the uses of this inviter's links in this community
 * since the day began (community_invite_uses, read through its primary key
 * by invite id; their invites through community_invites_community_idx).
 * Nothing here can fail a join: every error is logged and dropped.
 */
import { wantsNotification } from "../permissions"
import type { NotifyLevel } from "../types"
import { missing, reasonOf, type Db } from "./db"

const DAY_MS = 86_400_000

/** The day's row for this inviter in this community. */
export function inviteJoinsKey(communityId: string, inviterId: string, now: number): string {
  return `invite-joins:${communityId}:${inviterId}:${Math.floor(now / DAY_MS)}`
}

/** "Ayla joined through your link", then "3 people joined through your link". */
export function inviteJoinsTitle(count: number, firstName: string | null): string {
  if (count <= 1) return `${(firstName || "").trim() || "Someone"} joined through your link`
  return `${count} people joined through your link`
}

export type InviteJoinOutcome = "sent" | "updated" | "skipped" | "unavailable"

export async function noteInviteJoin(
  db: Db,
  j: { communityId: string; slug: string; inviterId: string | null; joinerId: string; joinerName?: string | null; now?: number },
): Promise<InviteJoinOutcome> {
  const { communityId, inviterId, joinerId } = j
  if (!inviterId || inviterId === joinerId) return "skipped"
  const now = j.now ?? Date.now()
  try {
    const { data: member, error: memberError } = await db.from("community_members").select("status, notify_level").eq("community_id", communityId).eq("user_id", inviterId).maybeSingle()
    if (memberError) {
      if (!missing(memberError)) console.error(`[communities] invite joins member: ${reasonOf(memberError)}`)
      return "unavailable"
    }
    if (!member || member.status !== "active") return "skipped"
    if (!wantsNotification(member.notify_level as NotifyLevel, "membership")) return "skipped"

    const key = inviteJoinsKey(communityId, inviterId, now)
    const url = `/community/${j.slug}/members`
    /* Their first name for the first row of the day; "Someone" when it cannot be read. */
    let joinerName = j.joinerName ?? null
    if (joinerName === null) {
      const { data: p } = await db.from("profiles").select("display_name, username").eq("id", joinerId).maybeSingle()
      const row = p as { display_name?: string | null; username?: string | null } | null
      joinerName = (row?.display_name || "").trim().split(/\s+/)[0] || row?.username || null
    }
    const first = inviteJoinsTitle(1, joinerName)
    const { data, error } = await db
      .from("community_notifications")
      .upsert(
        { user_id: inviterId, community_id: communityId, kind: "membership", actor_id: joinerId, target_type: "invite_joins", target_id: null, title: first.slice(0, 200), body: null, url, dedupe_key: key },
        { onConflict: "dedupe_key", ignoreDuplicates: true },
      )
      .select("id")
    if (error) {
      if (!missing(error)) console.error(`[communities] invite joins row: ${reasonOf(error)}`)
      return "unavailable"
    }
    if (Array.isArray(data) && data.length > 0) return "sent"

    /* Somebody joined through their link earlier today: the row says how many now, quietly (no unread, no move). */
    const { data: invites, error: invitesError } = await db.from("community_invites").select("id").eq("community_id", communityId).eq("created_by", inviterId).limit(200)
    if (invitesError) return "unavailable"
    const ids = ((invites as { id: string }[] | null) ?? []).map((i) => i.id)
    if (!ids.length) return "skipped"
    const dayStart = new Date(Math.floor(now / DAY_MS) * DAY_MS).toISOString()
    const { count, error: countError } = await db.from("community_invite_uses").select("user_id", { count: "exact", head: true }).in("invite_id", ids).neq("user_id", inviterId).gte("used_at", dayStart)
    if (countError) return "unavailable"
    const title = inviteJoinsTitle(Math.max(2, count ?? 2), null)
    const { error: updateError } = await db.from("community_notifications").update({ title: title.slice(0, 200), actor_id: joinerId }).eq("dedupe_key", key)
    if (updateError) return "unavailable"
    return "updated"
  } catch (e) {
    console.error(`[communities] invite joins: ${reasonOf(e)}`)
    return "unavailable"
  }
}
