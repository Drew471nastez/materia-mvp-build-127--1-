import "server-only"

/**
 * FANOUT_ANNOUNCEMENT: tells every active member about an announcement or an
 * @everyone, a page of members at a time. Payload { communityId, postId,
 * actorId, reason: "announcement" | "everyone", after: <last user id done> }.
 *
 * One read and one write per page of FANOUT_PAGE members: the inbox rows go
 * in as one insert keyed by dedupe_key, so a page run twice (a retry after a
 * crash) writes nothing new. Each member's notify_level is respected the
 * same way notifyMember respects it (wantsNotification). When the run's time
 * is nearly spent the job hands back its cursor and carries on in the next
 * run, so ten thousand members is a few runs, never a timeout.
 *
 * A post removed or deleted before the job reaches it tells nobody else.
 *
 * AN ANNOUNCEMENT IS ALSO EMAILED (an @everyone is not): to each member who
 * keeps email_announcements on and has not set notify_level to none, through
 * lib/communities/server/email.ts sendCommunityEmail, once per member and
 * post (key announce:<postId>:<userId>), so a page run again sends nothing
 * twice. A page whose emails cannot all go before the deadline is handed
 * back from its own start; what already went answers "duplicate".
 */
import { wantsNotification } from "../../permissions"
import type { JobRow, NotifyLevel } from "../../types"
import { reasonOf, type Db } from "../db"
import { sendCommunityEmail } from "../email"
import type { JobContext, JobOutcome } from "./index"
import { carryPushes, communityPushItem, pushFanout, type PushItem } from "@/lib/notifications/push-bridge"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const FANOUT_PAGE = 500

/** The inbox rows for one page of members: everyone who wants to hear, never the author. */
export function fanoutRows(
  members: { user_id: string; notify_level: NotifyLevel | null }[],
  p: { communityId: string; postId: string; actorId: string | null; title: string; body: string | null; url: string; reason: string },
): Record<string, unknown>[] {
  return members
    .filter((m) => m.user_id !== p.actorId && wantsNotification(m.notify_level, "announcement"))
    .map((m) => ({
      user_id: m.user_id,
      community_id: p.communityId,
      kind: "announcement",
      actor_id: p.actorId,
      target_type: "post",
      target_id: p.postId,
      title: p.title.slice(0, 200),
      body: p.body ? p.body.slice(0, 500) : null,
      url: p.url,
      dedupe_key: `${p.reason}:${p.postId}:${m.user_id}`,
    }))
}

/** Who gets the announcement by email: email_announcements on, notifications not off, never the author. */
export function announcementEmailees(members: { user_id: string; notify_level: NotifyLevel | null; email_announcements?: boolean | null }[], actorId: string | null): string[] {
  return members.filter((m) => m.user_id !== actorId && m.email_announcements === true && m.notify_level !== "none").map((m) => m.user_id)
}

export async function fanoutAnnouncement(db: Db, job: JobRow, ctx: JobContext): Promise<JobOutcome | void> {
  /* Pushes an earlier run could not send in time go first (lib/notifications/push-bridge.ts). */
  const carried = await carryPushes(job.payload, ctx.deadline)
  if (carried.left.length) return { again: { payload: { ...carried.payload, pushLeft: carried.left } } }
  const payload = carried.payload
  const communityId = typeof payload.communityId === "string" ? payload.communityId : ""
  const postId = typeof payload.postId === "string" ? payload.postId : ""
  const actorId = typeof payload.actorId === "string" && UUID.test(payload.actorId) ? payload.actorId : null
  const reason = payload.reason === "everyone" ? "everyone" : "announcement"
  let after = typeof payload.after === "string" && UUID.test(payload.after) ? payload.after : null
  if (!UUID.test(communityId) || !UUID.test(postId)) throw new Error("fanout_announcement needs payload.communityId and payload.postId")

  const [{ data: community, error: communityError }, { data: post, error: postError }] = await Promise.all([
    db.from("communities").select("id, slug, name, status, suspended_at, deleted_at").eq("id", communityId).maybeSingle(),
    db.from("community_feed_posts").select("id, community_id, title, body_text, status").eq("id", postId).maybeSingle(),
  ])
  if (communityError) throw new Error(`community read: ${reasonOf(communityError)}`)
  if (postError) throw new Error(`post read: ${reasonOf(postError)}`)
  /* Nothing left to tell anybody about. */
  if (!community || community.deleted_at || community.suspended_at || !post || post.community_id !== communityId || post.status !== "published") return

  let actorName = "An admin"
  if (actorId) {
    const { data: actor } = await db.from("profiles").select("display_name, username").eq("id", actorId).maybeSingle()
    actorName = (actor?.display_name || actor?.username || actorName).trim() || actorName
  }
  const heading = (post.title || "").trim()
  const text = String(post.body_text || "").replace(/\s+/g, " ").trim()
  const title = reason === "everyone" ? `${actorName} posted to everyone in ${community.name}` : heading ? `${community.name}: ${heading}` : `New announcement in ${community.name}`
  const body = (heading && reason === "everyone" ? heading : text).slice(0, 140) || null
  const url = `/community/${community.slug}/post/${postId}`

  while (true) {
    let read = db.from("community_members").select("user_id, notify_level, email_announcements").eq("community_id", communityId).eq("status", "active").order("user_id", { ascending: true }).limit(FANOUT_PAGE)
    if (after) read = read.gt("user_id", after)
    const { data, error } = await read
    if (error) throw new Error(`members read: ${reasonOf(error)}`)
    const members = (data as { user_id: string; notify_level: NotifyLevel | null; email_announcements?: boolean | null }[] | null) ?? []
    if (!members.length) return
    const rows = fanoutRows(members, { communityId, postId, actorId, title, body, url, reason })
    if (rows.length) {
      const { data: written, error: writeError } = await db.from("community_notifications").upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("user_id")
      if (writeError) throw new Error(`notifications write: ${reasonOf(writeError)}`)
      /*
        AND TO THEIR PHONES, the members whose row is new this run (a page run
        again pushes nobody twice). Before the emails, so a page handed back
        for its emails has already pushed; what does not fit in this run goes
        back with the page's own cursor and is sent first next time.
      */
      const fresh = new Set(((written as { user_id: string }[] | null) ?? []).map((r) => r.user_id))
      const levels = new Map(members.map((m) => [m.user_id, m.notify_level]))
      const items = rows
        .filter((r) => fresh.has(r.user_id as string))
        .map((r) => communityPushItem({ userId: r.user_id as string, communityId, kind: "announcement", actorId, title: r.title as string, body: r.body as string | null, url, dedupeKey: r.dedupe_key as string, level: levels.get(r.user_id as string) ?? null }, community.name))
        .filter((i): i is PushItem => !!i)
      const left = await pushFanout(db, items, { deadline: ctx.deadline })
      if (left.length) return { again: { payload: { ...payload, after, pushLeft: left } } }
    }
    if (reason === "announcement") {
      const emailTo = announcementEmailees(members, actorId)
      for (const userId of emailTo) {
        if (Date.now() > ctx.deadline - 5_000) return { again: { payload: { ...payload, after } } }
        await sendCommunityEmail(
          db,
          "community.announcement",
          { userId, communityId, data: { postId, title: heading, excerpt: text.slice(0, 400), authorName: actorName === "An admin" ? "" : actorName }, key: `announce:${postId}:${userId}` },
          { soon: false },
        )
      }
    }
    after = members[members.length - 1].user_id
    if (members.length < FANOUT_PAGE) return
    if (Date.now() > ctx.deadline - 8_000) return { again: { payload: { ...payload, after } } }
  }
}
