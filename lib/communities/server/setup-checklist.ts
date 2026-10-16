import "server-only"

/**
 * ===========================================================================
 *  THE SETUP LIST, READ FROM ROWS (round 33)
 * ===========================================================================
 * The rules are in ../setup-checklist.ts. Here the facts are counted (head
 * requests and one row reads, nothing loaded whole) and a person's skips are
 * kept (community_setup_progress, run-now part 202).
 *
 *   setupFacts       what the Overview has not already counted: members who
 *                    joined without an invite, posts by the owner or this
 *                    person, a phone with the app, this person's progress
 *   loadSetupChecklist   the whole list, for the floating pill's route
 *   markSetupProgress    a skip, a tick by hand or the pill hidden, or taken
 *                    back; answers 503 not_ready before part 202
 */
import type { CommunityRow, Role } from "../types"
import { progressKey, setupChecklist, type SetupChecklistView, type SetupFacts } from "../setup-checklist"
import type { NextStepFacts } from "@/components/community/creator/logic"
import { missing, nowIso, reasonOf, type Db } from "./db"
import { inviteCount } from "./invites"
import { pricedEventCount } from "./event-admin"

async function count(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  try {
    const { count: n, error } = await q
    return error ? 0 : (n ?? 0)
  } catch {
    return 0
  }
}

/** This person's rows: skips, ticks and the pill hidden. Empty before part 202. */
export async function setupProgress(db: Db, communityId: string, userId: string): Promise<{ ready: boolean; keys: Set<string> }> {
  try {
    const { data, error } = await db.from("community_setup_progress").select("step").eq("community_id", communityId).eq("user_id", userId).limit(50)
    if (error) {
      if (!missing(error)) console.error(`[communities] setup progress read: ${reasonOf(error)}`)
      return { ready: !missing(error), keys: new Set() }
    }
    return { ready: true, keys: new Set(((data as { step: string }[] | null) ?? []).map((r) => r.step)) }
  } catch {
    return { ready: false, keys: new Set() }
  }
}

/** The facts beyond what the Overview counts already. */
export async function setupExtras(db: Db, c: Pick<CommunityRow, "id" | "owner_user_id">, userId: string): Promise<{ joinedWithoutInvite: number; staffPosts: number; appInstalled: boolean; progress: Set<string> }> {
  const authors = [...new Set([c.owner_user_id, userId].filter((x): x is string => !!x))]
  const [joinedWithoutInvite, staffPosts, phones, progress] = await Promise.all([
    count(db.from("community_members").select("id", { count: "exact", head: true }).eq("community_id", c.id).eq("status", "active").neq("role", "owner").is("invite_id", null)),
    count(db.from("community_feed_posts").select("id", { count: "exact", head: true }).eq("community_id", c.id).in("author_id", authors)),
    count(db.from("push_tokens").select("id", { count: "exact", head: true }).eq("user_id", userId).in("platform", ["ios", "android"])),
    setupProgress(db, c.id, userId),
  ])
  return { joinedWithoutInvite, staffPosts, appInstalled: phones > 0, progress: progress.keys }
}

export function factsFrom(c: CommunityRow, base: NextStepFacts, extras: Awaited<ReturnType<typeof setupExtras>>, a: { invitesSent: number; isOwner: boolean }): SetupFacts {
  const description = typeof c.description === "string" ? c.description.replace(/<[^>]*>/g, "").trim() : ""
  return {
    ...base,
    name: c.name,
    hasLogo: !!c.logo_url,
    hasCover: !!c.cover_url,
    hasDescription: description.length > 0 || !!c.tagline?.trim(),
    invitesSent: a.invitesSent,
    isOwner: a.isOwner,
    ...extras,
  }
}

/** The whole list for one community and one person, owner or admin: what the floating pill shows. */
export async function loadSetupChecklist(db: Db, a: { community: CommunityRow; userId: string; role: Role; paymentsReady: boolean }): Promise<SetupChecklistView> {
  const c = a.community
  const head = (q: PromiseLike<{ count: number | null; error: unknown }>) => count(q)
  const [invites, posts, courses, events, priced, extras] = await Promise.all([
    inviteCount(db, c.id).catch(() => 0),
    head(db.from("community_feed_posts").select("id", { count: "exact", head: true }).eq("community_id", c.id)),
    head(db.from("community_courses").select("product_id", { count: "exact", head: true }).eq("community_id", c.id)),
    head(db.from("community_events").select("id", { count: "exact", head: true }).eq("community_id", c.id)),
    a.paymentsReady ? Promise.resolve(0) : pricedEventCount(db, c.id).catch(() => 0),
    setupExtras(db, c, a.userId),
  ])
  const base: NextStepFacts = {
    published: c.status === "published",
    paid: c.access === "paid",
    paymentsReady: a.paymentsReady,
    members: c.member_count,
    invites,
    posts,
    courses,
    events,
    customized: Array.isArray(c.benefits) && c.benefits.length > 0,
    rules: Array.isArray(c.rules) ? c.rules.length : 0,
    classroomEnabled: c.classroom_enabled,
    eventsEnabled: c.events_enabled,
    pricedEventsUnsellable: priced,
  }
  return setupChecklist(factsFrom(c, base, extras, { invitesSent: invites, isOwner: a.role === "owner" }), `/app/community/${c.slug}`)
}

export type SetupMarkResult = { ok: true } | { ok: false; status: number; error: string }

/** A skip, a tick by hand or the pill hidden (`on`), or taken back. Only the keys ../setup-checklist progressKey knows. */
export async function markSetupProgress(db: Db, a: { communityId: string; userId: string; step: unknown; on: boolean }): Promise<SetupMarkResult> {
  const key = progressKey(a.step)
  if (!key) return { ok: false, status: 400, error: "That step is not on the list." }
  const q = a.on
    ? db.from("community_setup_progress").upsert({ community_id: a.communityId, user_id: a.userId, step: key, done_at: nowIso() }, { onConflict: "community_id,user_id,step", ignoreDuplicates: true })
    : db.from("community_setup_progress").delete().eq("community_id", a.communityId).eq("user_id", a.userId).eq("step", key)
  const { error } = await q
  if (error) {
    if (missing(error)) return { ok: false, status: 503, error: "not_ready" }
    console.error(`[communities] setup progress: ${reasonOf(error)}`)
    return { ok: false, status: 500, error: "That did not save. Try again." }
  }
  return { ok: true }
}
