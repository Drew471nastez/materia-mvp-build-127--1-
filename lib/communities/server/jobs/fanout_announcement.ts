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
 * AN ANNOUNCEMENT IS NOT EMAILED while lib/notify/email-budget.ts says an
 * announcement is never an email (today: the bell and the phone carry it).
 * Were it allowed again, each member who keeps email_announcements on and
 * has not set notify_level to none would get it through
 * lib/communities/server/email.ts sendCommunityEmail, once per member and
 * post (key announce:<postId>:<userId>).
 *
 * A NEW POST (reason "post", queued by notify.ts queueNewPost for a post in
 * an ordinary space) is told on phones only, to the members who can see the
 * post's space and hear posts at their level: a post by the community's
 * owner or an admin reaches members at Everything and at the default
 * Everything but likes ("admin_post"), a member's post only those at
 * Everything ("post"). No bell row, no email. The same pages and cursor, the
 * members read already filtered to those levels, and lib/notifications/
 * push-bridge.ts holding a second post inside five minutes for one "3 new
 * posts" push. A page run again pushes nobody twice: the window the first
 * run opened holds the repeat, and the digest only counts posts newer than
 * that window.
 *
 * A NEW PROGRAM OR LESSON (reason "program", queued by notify.ts
 * notifyProgramPublished) rides this kind too, since the queue's kinds are
 * fixed in SQL: jobs/fanout_program.ts. So does the owner's own email to
 * the members (reason "broadcast", ../broadcasts.ts).
 */
import { evaluateAccess, parseAccessRule } from "../../access"
import { wantsNotification } from "../../permissions"
import type { JobRow, NotifyLevel, Role } from "../../types"
import { reasonOf, type Db } from "../db"
import { sendCommunityEmail } from "../email"
import { ownedProductIds } from "../membership"
import type { JobContext, JobOutcome } from "./index"
import { STAFF_POST_ROLES, carryPushes, communityPushItem, newPostPushItem, pushFanout, type PushItem } from "@/lib/notifications/push-bridge"
import { emailAllowed } from "@/lib/notify/email-budget"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const FANOUT_PAGE = 500
/* The levels that hear a new post (push-bridge.ts levelAllowsPush): an owner's or admin's at Everything and the default Everything but likes, a member's at Everything. */
export function postLevels(byStaff: boolean): NotifyLevel[] {
  return byStaff ? ["all", "important"] : ["all"]
}

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
  if (payload.reason === "program") {
    const { fanoutProgram } = await import("./fanout_program")
    return fanoutProgram(db, payload, ctx)
  }
  /* Round AG: the owner's own email to the members (../broadcasts.ts), on this kind too. */
  if (payload.reason === "broadcast") {
    const { fanoutBroadcast } = await import("../broadcasts")
    return fanoutBroadcast(db, payload, ctx)
  }
  const communityId = typeof payload.communityId === "string" ? payload.communityId : ""
  const postId = typeof payload.postId === "string" ? payload.postId : ""
  const actorId = typeof payload.actorId === "string" && UUID.test(payload.actorId) ? payload.actorId : null
  const reason = payload.reason === "everyone" ? "everyone" : payload.reason === "post" ? "post" : "announcement"
  let after = typeof payload.after === "string" && UUID.test(payload.after) ? payload.after : null
  if (!UUID.test(communityId) || !UUID.test(postId)) throw new Error("fanout_announcement needs payload.communityId and payload.postId")

  const [{ data: community, error: communityError }, { data: post, error: postError }] = await Promise.all([
    db.from("communities").select("id, slug, name, status, suspended_at, deleted_at").eq("id", communityId).maybeSingle(),
    db.from("community_feed_posts").select("id, community_id, space_id, author_id, title, body_text, status").eq("id", postId).maybeSingle(),
  ])
  if (communityError) throw new Error(`community read: ${reasonOf(communityError)}`)
  if (postError) throw new Error(`post read: ${reasonOf(postError)}`)
  /* Nothing left to tell anybody about. */
  if (!community || community.deleted_at || community.suspended_at || !post || post.community_id !== communityId || post.status !== "published") return

  let actorName = reason === "post" ? "A member" : "An admin"
  if (actorId) {
    const { data: actor } = await db.from("profiles").select("display_name, username").eq("id", actorId).maybeSingle()
    actorName = (actor?.display_name || actor?.username || actorName).trim() || actorName
  }
  const heading = (post.title || "").trim()
  const text = String(post.body_text || "").replace(/\s+/g, " ").trim()
  if (reason === "post") return newPostFanout(db, { payload, after, community, post: { ...post, heading, text }, actorId, actorName }, ctx)
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
    if (reason === "announcement" && emailAllowed("COMMUNITY_ANNOUNCEMENT")) {
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

/**
 * A new post to the phones of the members who hear it at their level and can
 * see its space. A page of them at a time by user id, already filtered to
 * those levels by the read (members at Mentions only or Nothing, and for a
 * member's post the default level too, never leave the database).
 */
async function newPostFanout(
  db: Db,
  a: {
    payload: Record<string, unknown>
    after: string | null
    community: { id: string; slug: string; name: string }
    post: { id: string; space_id: string | null; author_id: string | null; heading: string; text: string }
    actorId: string | null
    actorName: string
  },
  ctx: JobContext,
): Promise<JobOutcome | void> {
  const { community, post } = a
  let after = a.after
  const { data: space, error: spaceError } = await db.from("community_spaces").select("id, kind, view_access, archived_at").eq("id", post.space_id).eq("community_id", community.id).maybeSingle()
  if (spaceError) throw new Error(`space read: ${reasonOf(spaceError)}`)
  /* An announcement has its own fan out; a chat is not a feed; an archived space tells nobody. */
  if (!space || space.archived_at || space.kind === "announcements" || space.kind === "chat") return
  const rule = parseAccessRule(space.view_access)
  const authorId = post.author_id ?? a.actorId
  /* Who wrote it decides who hears it: the owner and admins reach the default level too. */
  let byStaff = false
  if (authorId) {
    const { data: author } = await db.from("community_members").select("role, status").eq("community_id", community.id).eq("user_id", authorId).maybeSingle()
    const r = author as { role: Role; status: string } | null
    byStaff = !!r && r.status === "active" && (STAFF_POST_ROLES as readonly string[]).includes(r.role)
  }
  for (;;) {
    let read = db
      .from("community_members")
      .select("user_id, role, tier_id, level, notify_level")
      .eq("community_id", community.id)
      .eq("status", "active")
      .in("notify_level", postLevels(byStaff))
      .order("user_id", { ascending: true })
      .limit(FANOUT_PAGE)
    if (after) read = read.gt("user_id", after)
    const { data, error } = await read
    if (error) throw new Error(`members read: ${reasonOf(error)}`)
    const page = (data as { user_id: string; role: Role; tier_id: string | null; level: number | null; notify_level: NotifyLevel | null }[] | null) ?? []
    if (page.length === 0) return
    const items: PushItem[] = []
    for (const m of page) {
      if (m.user_id === authorId) continue
      const v = { role: m.role, active: true, tierId: m.tier_id, ownedProductIds: [] as string[], level: m.level || 1 }
      let allowed = evaluateAccess(rule, v).ok
      /* A space open through products: only then is what this member owns looked up. */
      if (!allowed && rule.productIds?.length) allowed = evaluateAccess(rule, { ...v, ownedProductIds: await ownedProductIds(db, m.user_id, rule.productIds) }).ok
      if (!allowed) continue
      const item = newPostPushItem(
        { userId: m.user_id, communityId: community.id, communitySlug: community.slug, postId: post.id, actorId: authorId, authorName: a.actorName, heading: post.heading, text: post.text, level: m.notify_level, byStaff },
        community.name,
      )
      if (item) items.push(item)
    }
    const left = await pushFanout(db, items, { deadline: ctx.deadline })
    after = page[page.length - 1].user_id
    if (left.length) return { again: { payload: { ...a.payload, after, pushLeft: left } } }
    if (page.length < FANOUT_PAGE) return
    if (Date.now() > ctx.deadline - 8_000) return { again: { payload: { ...a.payload, after } } }
  }
}
