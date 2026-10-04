import "server-only"

/**
 * FANOUT_FOLLOWERS: tells the people who follow a creator that they published
 * something new, and for a product, the people who bought from that creator
 * before. In app only (user_notifications, part 85); no email.
 *
 * Payload { type: "product" | "community", productId | communityId,
 * creatorUserId, phase: "followers" | "buyers", after: <cursor> }, queued by
 * lib/notifications/fanout.ts once per product or community ever.
 *
 *   followers  follows of the creator's account, newest first on
 *              (created_at, id) (follows_following_created_idx, part 85).
 *   buyers     the creator's completed orders, oldest first on
 *              (created_at, id) (idx_orders_creator_time_id, part 32);
 *              products only.
 *
 * One person hears once per product or community: every row is keyed
 * product:<productId>:<userId> (or community:...), so somebody who follows
 * the creator and bought from them gets the follower's row only, and a page
 * run twice writes nothing new. A page at a time; when the run's time is
 * nearly spent the job hands back its cursor and carries on in the next run.
 *
 * Read again when the job runs, so a product unpublished, archived or deleted
 * before then, or a community made unlisted, tells nobody. A community is
 * only announced while communities are switched on; the cron runs this kind
 * when they are off as well (PLATFORM_JOB_KINDS), and then a community's job
 * ends without telling anybody.
 */
import { getProductInternalPath } from "@/lib/url-helpers"
import { writeUserRows, type NotifyUserInput } from "@/lib/notifications/user-inbox"
import { carryPushes, pushFanout, userPushItem, type PushItem } from "@/lib/notifications/push-bridge"
import { communitiesEnabled } from "../../flag"
import type { JobRow } from "../../types"
import { reasonOf, type Db } from "../db"
import type { JobContext, JobOutcome } from "./index"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const FOLLOWERS_PAGE = 500

export interface FollowersSubject {
  type: "product" | "community"
  id: string
  creatorId: string | null
  creatorUserId: string
  actorName: string
  /** What the row says under the name: the product's or community's name. */
  name: string
  url: string
  image: string | null
}

/** The rows for one page of people: never the creator themselves, one per person. */
export function followerRows(userIds: string[], s: FollowersSubject, as: "followers" | "buyers"): NotifyUserInput[] {
  const product = s.type === "product"
  return [...new Set(userIds)]
    .filter((id) => UUID.test(id) && id !== s.creatorUserId)
    .map((userId) => ({
      userId,
      kind: product ? (as === "buyers" ? "purchased_creator_new_product" : "followed_new_product") : "followed_new_community",
      source: product && as === "buyers" ? "purchases" : "following",
      actorId: s.creatorUserId,
      creatorId: s.creatorId,
      title: product ? `${s.actorName} published a new product` : `${s.actorName} started a community`,
      body: s.name,
      url: s.url,
      imageUrl: s.image,
      dedupeKey: `${s.type}:${s.id}:${userId}`,
    }))
}

/** The product or community as it is now, or null when nobody should hear about it. */
async function loadSubject(db: Db, type: "product" | "community", id: string, creatorUserId: string): Promise<FollowersSubject | null> {
  const { data: person } = await db.from("profiles").select("display_name, username").eq("id", creatorUserId).maybeSingle()
  const p = person as { display_name: string | null; username: string | null } | null
  const actorName = (p?.display_name || p?.username || "A creator you follow").trim()
  if (type === "product") {
    const { data, error } = await db.from("products").select("id, title, slug, status, archived, creator_id, community_id, thumbnail_url").eq("id", id).maybeSingle()
    if (error) throw new Error(`product read: ${reasonOf(error)}`)
    const product = data as { id: string; title: string | null; slug: string | null; status: string | null; archived: boolean | null; creator_id: string | null; community_id?: string | null; thumbnail_url: string | null } | null
    if (!product || product.status !== "published" || product.archived || product.community_id || !product.slug) return null
    const { data: creator } = await db.from("creators").select("id, user_id, username, slug").eq("id", product.creator_id).maybeSingle()
    const c = creator as { id: string; user_id: string | null; username: string | null; slug: string | null } | null
    if (!c || c.user_id !== creatorUserId) return null
    const handle = c.username || c.slug || p?.username || undefined
    return { type, id, creatorId: c.id, creatorUserId, actorName, name: (product.title || "New product").trim(), url: getProductInternalPath(product.slug, handle), image: product.thumbnail_url }
  }
  if (!(await communitiesEnabled())) return null
  const { data, error } = await db.from("communities").select("id, slug, name, status, visibility, logo_url, owner_user_id, creator_id, deleted_at, suspended_at").eq("id", id).maybeSingle()
  if (error) throw new Error(`community read: ${reasonOf(error)}`)
  const community = data as { id: string; slug: string; name: string; status: string; visibility: string; logo_url: string | null; owner_user_id: string | null; creator_id: string | null; deleted_at: string | null; suspended_at: string | null } | null
  if (!community || community.status !== "published" || community.visibility === "unlisted" || community.deleted_at || community.suspended_at || community.owner_user_id !== creatorUserId) return null
  return { type, id, creatorId: community.creator_id, creatorUserId, actorName, name: community.name, url: `/community/${community.slug}`, image: community.logo_url }
}

interface TimeCursor {
  c: string
  i: string
}

function readCursor(v: unknown): TimeCursor | null {
  if (!v || typeof v !== "object") return null
  const c = (v as Record<string, unknown>).c
  const i = (v as Record<string, unknown>).i
  return typeof c === "string" && /^[0-9T:.+\- Z]{10,40}$/.test(c) && typeof i === "string" && UUID.test(i) ? { c, i } : null
}

export async function fanoutFollowers(db: Db, job: JobRow, ctx: JobContext): Promise<JobOutcome | void> {
  /* Pushes an earlier run could not send in time go first (lib/notifications/push-bridge.ts). */
  const carried = await carryPushes(job.payload, ctx.deadline)
  if (carried.left.length) return { again: { payload: { ...carried.payload, pushLeft: carried.left } } }
  const payload = carried.payload
  const type = payload.type === "community" ? "community" : payload.type === "product" ? "product" : null
  const id = type === "community" ? payload.communityId : payload.productId
  const creatorUserId = payload.creatorUserId
  if (!type || typeof id !== "string" || !UUID.test(id) || typeof creatorUserId !== "string" || !UUID.test(creatorUserId)) throw new Error("fanout_followers needs payload.type, its id and payload.creatorUserId")

  /* Every page was written; only pushes were left, and they have gone. */
  if (payload.finished === true) return
  const subject = await loadSubject(db, type, id, creatorUserId)
  if (!subject) return

  let phase: "followers" | "buyers" = payload.phase === "buyers" && type === "product" ? "buyers" : "followers"
  let after = readCursor(payload.after)
  let told = typeof payload.told === "number" ? payload.told : 0

  while (Date.now() < ctx.deadline - 3_000) {
    let userIds: string[] = []
    let last: TimeCursor | null = null
    let full = false
    if (phase === "followers") {
      let q = db.from("follows").select("id, follower_id, created_at").eq("following_id", creatorUserId)
      if (after) q = q.or(`created_at.lt."${after.c}",and(created_at.eq."${after.c}",id.lt.${after.i})`)
      const { data, error } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(FOLLOWERS_PAGE)
      if (error) throw new Error(`followers read: ${reasonOf(error)}`)
      const rows = (data as { id: string; follower_id: string; created_at: string }[] | null) ?? []
      userIds = rows.map((r) => r.follower_id)
      const end = rows[rows.length - 1]
      last = end ? { c: end.created_at, i: end.id } : null
      full = rows.length === FOLLOWERS_PAGE
    } else {
      if (!subject.creatorId) return
      let q = db.from("orders").select("id, buyer_id, created_at").eq("creator_id", subject.creatorId).eq("status", "completed").not("buyer_id", "is", null)
      if (after) q = q.or(`created_at.gt."${after.c}",and(created_at.eq."${after.c}",id.gt.${after.i})`)
      const { data, error } = await q.order("created_at", { ascending: true }).order("id", { ascending: true }).limit(FOLLOWERS_PAGE)
      if (error) throw new Error(`buyers read: ${reasonOf(error)}`)
      const rows = (data as { id: string; buyer_id: string; created_at: string }[] | null) ?? []
      userIds = rows.map((r) => r.buyer_id)
      const end = rows[rows.length - 1]
      last = end ? { c: end.created_at, i: end.id } : null
      full = rows.length === FOLLOWERS_PAGE
    }

    let left: Awaited<ReturnType<typeof pushFanout>> = []
    if (userIds.length) {
      const wrote = await writeUserRows(db, followerRows(userIds, subject, phase))
      /* Before part 85 there is no inbox to write to: nothing to do, now or later. */
      if (wrote === "unavailable") return
      told += wrote.wrote
      /* The people whose row is new, to their phones: a low priority kind, so held for anyone who just had one. */
      left = await pushFanout(db, wrote.fresh.map(userPushItem).filter((i): i is PushItem => !!i), { deadline: ctx.deadline })
    }

    let done = false
    if (full && last) {
      after = last
    } else if (phase === "followers" && type === "product") {
      phase = "buyers"
      after = null
    } else done = true
    if (left.length) return { again: { payload: { ...payload, phase, after, told, ...(done ? { finished: true } : {}), pushLeft: left } } }
    if (done) {
      console.log(`[notifications] ${type} ${id}: ${told} told`)
      return
    }
  }
  return { again: { payload: { ...payload, phase, after, told } } }
}
