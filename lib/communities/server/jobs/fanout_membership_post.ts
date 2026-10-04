import "server-only"

/**
 * FANOUT_MEMBERSHIP_POST: tells every member of a membership who can read it
 * now that the creator posted an update, in the bell (user_notifications,
 * part 85). In app only: the update email is the membership's own and stays
 * as it is (lib/memberships/update-email.ts, sent only when the creator asks).
 *
 * Payload { postId, productId, after: <last membership id done> }, queued by
 * lib/notifications/fanout.ts once per post when it is created.
 *
 * Who hears: memberships of the product whose access holds now
 * (grantsAccess: active, trialing, past due inside its grace, cancelled
 * until the period ends) and that belong to an account (a guest checkout not
 * yet claimed has nobody to tell). The row links to the member's own
 * membership page, /library/memberships/<their membership id>. Once per post
 * and person (mpost:<postId>:<userId>). A page of memberships at a time,
 * handed back with its cursor when the run's time is nearly spent.
 *
 * Read again when the job runs: a post removed before then, or a product no
 * longer on sale, tells nobody. Not about a community, so it runs whether
 * communities are switched on or not (PLATFORM_JOB_KINDS).
 */
import { grantsAccess } from "@/lib/memberships/state"
import { writeUserRows, type NotifyUserInput } from "@/lib/notifications/user-inbox"
import { carryPushes, pushFanout, userPushItem, type PushItem } from "@/lib/notifications/push-bridge"
import type { JobRow } from "../../types"
import { reasonOf, type Db } from "../db"
import type { JobContext, JobOutcome } from "./index"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const MEMBERSHIP_PAGE = 500

interface MembershipLite {
  id: string
  buyer_id: string | null
  status: string
  current_period_end: string | null
  past_due_since: string | null
}

/** A post's text as one short line. */
export function postPreview(title: string | null | undefined, body: string | null | undefined): string {
  const t = (title || "").replace(/\s+/g, " ").trim()
  if (t) return t.slice(0, 200)
  const text = (body || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
  return text.length <= 140 ? text : `${text.slice(0, 137).trimEnd()}...`
}

/** The rows for one page of memberships: access now, an account, never the creator, one per person. */
export function membershipPostRows(
  rows: MembershipLite[],
  p: { postId: string; creatorUserId: string | null; creatorId: string | null; creatorName: string; productTitle: string; preview: string; image: string | null },
  now: number = Date.now(),
): NotifyUserInput[] {
  const seen = new Set<string>()
  const out: NotifyUserInput[] = []
  for (const m of rows) {
    if (!m.buyer_id || !UUID.test(m.buyer_id) || m.buyer_id === p.creatorUserId || seen.has(m.buyer_id)) continue
    if (!grantsAccess(m, now)) continue
    seen.add(m.buyer_id)
    out.push({
      userId: m.buyer_id,
      kind: "membership_post",
      source: "purchases",
      actorId: p.creatorUserId,
      creatorId: p.creatorId,
      title: `${p.creatorName} posted in ${p.productTitle}`,
      body: p.preview || null,
      url: `/account/library/memberships/${m.id}`,
      imageUrl: p.image,
      dedupeKey: `mpost:${p.postId}:${m.buyer_id}`,
    })
  }
  return out
}

export async function fanoutMembershipPost(db: Db, job: JobRow, ctx: JobContext): Promise<JobOutcome | void> {
  /* Pushes an earlier run could not send in time go first (lib/notifications/push-bridge.ts). */
  const carried = await carryPushes(job.payload, ctx.deadline)
  if (carried.left.length) return { again: { payload: { ...carried.payload, pushLeft: carried.left } } }
  const payload = carried.payload
  /* Every page was written; only pushes were left, and they have gone. */
  if (payload.finished === true) return
  const postId = typeof payload.postId === "string" ? payload.postId : ""
  const productId = typeof payload.productId === "string" ? payload.productId : ""
  let after = typeof payload.after === "string" && UUID.test(payload.after) ? payload.after : null
  if (!UUID.test(postId) || !UUID.test(productId)) throw new Error("fanout_membership_post needs payload.postId and payload.productId")

  const [{ data: post, error: postError }, { data: product, error: productError }] = await Promise.all([
    db.from("membership_posts").select("id, product_id, creator_id, title, body, deleted_at").eq("id", postId).maybeSingle(),
    db.from("products").select("id, title, status, creator_id, thumbnail_url").eq("id", productId).maybeSingle(),
  ])
  if (postError) throw new Error(`post read: ${reasonOf(postError)}`)
  if (productError) throw new Error(`product read: ${reasonOf(productError)}`)
  const po = post as { id: string; product_id: string; creator_id: string; title: string | null; body: string | null; deleted_at: string | null } | null
  const pr = product as { id: string; title: string | null; status: string | null; creator_id: string | null; thumbnail_url: string | null } | null
  if (!po || po.deleted_at || po.product_id !== productId || !pr || pr.status !== "published") return

  const { data: creator } = await db.from("creators").select("id, user_id, display_name, username").eq("id", po.creator_id).maybeSingle()
  const c = creator as { id: string; user_id: string | null; display_name: string | null; username: string | null } | null
  let creatorName = (c?.display_name || c?.username || "").trim()
  if (c?.user_id) {
    const { data: person } = await db.from("profiles").select("display_name, username").eq("id", c.user_id).maybeSingle()
    const p = person as { display_name: string | null; username: string | null } | null
    creatorName = (p?.display_name || p?.username || creatorName).trim()
  }
  const meta = {
    postId,
    creatorUserId: c?.user_id ?? null,
    creatorId: c?.id ?? null,
    creatorName: creatorName || "A creator",
    productTitle: (pr.title || "your membership").trim(),
    preview: postPreview(po.title, po.body),
    image: pr.thumbnail_url,
  }
  let told = typeof payload.told === "number" ? payload.told : 0

  while (Date.now() < ctx.deadline - 3_000) {
    let q = db
      .from("memberships")
      .select("id, buyer_id, status, current_period_end, past_due_since")
      .eq("product_id", productId)
      .in("status", ["active", "trialing", "past_due", "canceled"])
      .not("buyer_id", "is", null)
    if (after) q = q.gt("id", after)
    const { data, error } = await q.order("id", { ascending: true }).limit(MEMBERSHIP_PAGE)
    if (error) throw new Error(`memberships read: ${reasonOf(error)}`)
    const rows = (data as MembershipLite[] | null) ?? []
    let left: Awaited<ReturnType<typeof pushFanout>> = []
    if (rows.length) {
      const wrote = await writeUserRows(db, membershipPostRows(rows, meta))
      if (wrote === "unavailable") return
      told += wrote.wrote
      /* The members whose row is new, to their phones: a low priority kind, so held for anyone who just had one. */
      left = await pushFanout(db, wrote.fresh.map(userPushItem).filter((i): i is PushItem => !!i), { deadline: ctx.deadline })
    }
    const done = rows.length < MEMBERSHIP_PAGE
    if (!done) after = rows[rows.length - 1].id
    if (left.length) return { again: { payload: { ...payload, after, told, ...(done ? { finished: true } : {}), pushLeft: left } } }
    if (done) {
      console.log(`[notifications] membership post ${postId}: ${told} told`)
      return
    }
  }
  return { again: { payload: { ...payload, after, told } } }
}
