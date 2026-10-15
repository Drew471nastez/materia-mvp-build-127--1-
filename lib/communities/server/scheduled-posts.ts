import "server-only"

/**
 * ===========================================================================
 *  SCHEDULED POSTS AND DRAFTS, ON THE SERVER (round 32)
 * ===========================================================================
 * The admin routes (app/api/app/community/[id]/scheduled-posts) call these
 * after requireCreatorCommunity(id, "post"); the cron (app/api/cron/
 * community) calls publishDuePosts every five minutes.
 *
 *   WHO        anybody on the team who may post. They write into a space they
 *              may post in now (Announcements needs announce), and it is
 *              checked again when it goes up, as its author: somebody who
 *              lost the role by then does not post through a schedule.
 *              Changing or deleting one is its author's, or the owner's and
 *              admins' (manage_settings).
 *   GOING UP   through createPost, the member route's own path (word filters,
 *              mentions, the announcement fan out, points, counts), so
 *              members hear about it exactly as if it had been posted then.
 *   ONCE       a row is taken by one update from scheduled to publishing, so
 *              two runs at once put it up once. A row left in publishing for
 *              15 minutes (a run that died part way) is marked failed, never
 *              retried on its own: the post may already be up.
 *
 * Before part 188 every read answers "not ready".
 */
import { EDITABLE, checkScheduledInput, type ScheduledPostView, type ScheduledStatus } from "../scheduled-posts"
import { can } from "../permissions"
import type { CommunityRow } from "../types"
import { communityOpen, loadCommunity, viewerContext, type Viewer } from "./context"
import { canPostIn, createPost, listSpaces } from "./feed"
import { peopleOf } from "./moderation"
import { audit } from "./audit"
import { missing, nowIso, reasonOf, type Db } from "./db"

const COLUMNS = "id, community_id, author_id, space_id, title, body, status, publish_at, post_id, error, attempts, claimed_at, published_at, created_at, updated_at"

interface Row {
  id: string
  community_id: string
  author_id: string
  space_id: string | null
  title: string
  body: string
  status: ScheduledStatus
  publish_at: string | null
  post_id: string | null
  error: string | null
  attempts: number
  claimed_at: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

/** How many a community keeps waiting at once (drafts and scheduled together). */
export const WAITING_MAX = 200
/** Published and failed ones are listed for this long after they went. */
const HISTORY_DAYS = 14
/** A run that took a row and never finished: after this it is failed, not retried. */
export const STALE_MS = 15 * 60_000
/** Posts a run puts up, at most. */
export const RUN_MAX = 25

type Done<T = unknown> = ({ ok: true } & T) | { ok: false; status: number; error: string; field?: string }
const no = (status: number, error: string, field?: string): { ok: false; status: number; error: string; field?: string } => ({ ok: false, status, error, ...(field ? { field } : {}) })

function mayChange(row: Pick<Row, "author_id">, actor: { userId: string; role: Viewer["role"]; perms?: Viewer["perms"] }): boolean {
  return row.author_id === actor.userId || can(actor.role, "manage_settings", actor.perms)
}

async function views(db: Db, communityId: string, rows: Row[], actor: { userId: string; role: Viewer["role"]; perms?: Viewer["perms"] }): Promise<ScheduledPostView[]> {
  const [people, spaces] = await Promise.all([peopleOf(db, rows.map((r) => r.author_id)), listSpaces(db, communityId)])
  const spaceName = new Map(spaces.map((s) => [s.id, s.name]))
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    spaceId: r.space_id,
    spaceName: r.space_id ? (spaceName.get(r.space_id) ?? null) : null,
    title: r.title,
    body: r.body,
    publishAt: r.publish_at,
    publishedAt: r.published_at,
    postId: r.post_id,
    error: r.error,
    authorId: r.author_id,
    authorName: people.get(r.author_id)?.name ?? "Member",
    mine: mayChange(r, actor),
    updatedAt: r.updated_at,
  }))
}

/** The community's drafts and scheduled posts, then what went up or failed in the last two weeks. */
export async function listScheduled(db: Db, communityId: string, actor: { userId: string; role: Viewer["role"]; perms?: Viewer["perms"] }): Promise<{ ready: boolean; rows: ScheduledPostView[] }> {
  const since = nowIso(Date.now() - HISTORY_DAYS * 86_400_000)
  const [waiting, history] = await Promise.all([
    db.from("community_scheduled_posts").select(COLUMNS).eq("community_id", communityId).in("status", ["draft", "scheduled", "publishing"]).order("publish_at", { ascending: true, nullsFirst: false }).order("updated_at", { ascending: false }).limit(WAITING_MAX),
    db.from("community_scheduled_posts").select(COLUMNS).eq("community_id", communityId).in("status", ["published", "failed"]).gte("updated_at", since).order("updated_at", { ascending: false }).limit(50),
  ])
  const error = waiting.error ?? history.error
  if (error) {
    if (!missing(error)) console.error(`[communities] scheduled read: ${reasonOf(error)}`)
    return { ready: !missing(error), rows: [] }
  }
  const rows = [...((waiting.data as Row[] | null) ?? []), ...((history.data as Row[] | null) ?? [])]
  return { ready: true, rows: await views(db, communityId, rows, actor) }
}

/** The space a post is going to, checked for the person writing it now. */
async function spaceFor(db: Db, community: CommunityRow, viewer: Viewer, spaceId: string | null): Promise<Done> {
  if (!spaceId) return { ok: true }
  const space = (await listSpaces(db, community.id)).find((s) => s.id === spaceId)
  if (!space || space.kind === "chat") return no(404, "That space is not in this community.", "space")
  if (!canPostIn(space, viewer, community.chat_enabled)) return no(403, space.kind === "announcements" ? "Only people who may announce post in Announcements." : "You cannot post in this space.", "space")
  return { ok: true }
}

export interface Actor {
  community: CommunityRow
  viewer: Viewer
  userId: string
}

function actorOf(a: Actor) {
  return { userId: a.userId, role: a.viewer.role, perms: a.viewer.perms }
}

async function oneView(db: Db, a: Actor, row: Row): Promise<ScheduledPostView> {
  return (await views(db, a.community.id, [row], actorOf(a)))[0]
}

export async function createScheduled(db: Db, a: Actor, raw: unknown): Promise<Done<{ post: ScheduledPostView }>> {
  if (a.community.status === "archived" || a.community.archived_at) return no(403, "archived")
  const checked = checkScheduledInput(raw)
  if (!checked.ok) return no(400, checked.error, checked.field)
  const space = await spaceFor(db, a.community, a.viewer, checked.value.spaceId)
  if (!space.ok) return space
  const { count } = await db.from("community_scheduled_posts").select("id", { count: "exact", head: true }).eq("community_id", a.community.id).in("status", ["draft", "scheduled"])
  if (typeof count === "number" && count >= WAITING_MAX) return no(409, `A community keeps up to ${WAITING_MAX} drafts and scheduled posts. Publish or delete some first.`)
  const v = checked.value
  const { data, error } = await db
    .from("community_scheduled_posts")
    .insert({ community_id: a.community.id, author_id: a.userId, space_id: v.spaceId, title: v.title, body: v.body, status: v.publishAt ? "scheduled" : "draft", publish_at: v.publishAt })
    .select(COLUMNS)
    .single()
  if (error || !data) {
    if (missing(error)) return no(503, "not_ready")
    console.error(`[communities] scheduled insert: ${reasonOf(error)}`)
    return no(500, "That did not save. Try again.")
  }
  await audit(db, { communityId: a.community.id, actorId: a.userId, actorKind: "member", action: v.publishAt ? "post.scheduled" : "post.drafted", targetType: "scheduled_post", targetId: data.id, targetLabel: v.title || v.body.slice(0, 80), detail: { publishAt: v.publishAt } })
  return { ok: true, post: await oneView(db, a, data as Row) }
}

async function rowOf(db: Db, communityId: string, id: string): Promise<Row | null> {
  const { data } = await db.from("community_scheduled_posts").select(COLUMNS).eq("id", id).eq("community_id", communityId).maybeSingle()
  return (data as Row | null) ?? null
}

/**
 * A change: new words, space or time (publishAt null makes it a draft), or
 * { publishNow: true }, which puts it up at once through the same path the
 * schedule uses.
 */
export async function updateScheduled(db: Db, a: Actor, id: string, raw: unknown): Promise<Done<{ post: ScheduledPostView }>> {
  const row = await rowOf(db, a.community.id, id)
  if (!row) return no(404, "not_found")
  if (!mayChange(row, actorOf(a))) return no(403, "forbidden")
  if (!EDITABLE.includes(row.status)) return no(409, row.status === "published" ? "This one is already up." : "This one is going up right now.")
  if (a.community.status === "archived" || a.community.archived_at) return no(403, "archived")
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const now = r.publishNow === true
  const merged = { spaceId: "spaceId" in r ? r.spaceId : row.space_id, title: "title" in r ? r.title : row.title, body: "body" in r ? r.body : row.body, publishAt: now ? new Date(Date.now() + 120_000).toISOString() : "publishAt" in r ? r.publishAt : row.publish_at }
  const checked = checkScheduledInput(merged)
  if (!checked.ok) return no(400, checked.error, checked.field)
  const v = checked.value
  const space = await spaceFor(db, a.community, a.viewer, v.spaceId)
  if (!space.ok) return space
  const status: ScheduledStatus = now ? "publishing" : v.publishAt ? "scheduled" : "draft"
  const { data, error } = await db
    .from("community_scheduled_posts")
    .update({ space_id: v.spaceId, title: v.title, body: v.body, status, publish_at: now ? nowIso() : v.publishAt, error: null, claimed_at: now ? nowIso() : null, updated_at: nowIso() })
    .eq("id", row.id)
    .eq("community_id", a.community.id)
    .in("status", EDITABLE as ScheduledStatus[])
    .select(COLUMNS)
    .maybeSingle()
  if (error) {
    console.error(`[communities] scheduled update: ${reasonOf(error)}`)
    return no(500, "That did not save. Try again.")
  }
  if (!data) return no(409, "This one changed a moment ago. Refresh to see it.")
  let saved = data as Row
  if (now) saved = await publishOne(db, saved, a.community)
  else await audit(db, { communityId: a.community.id, actorId: a.userId, actorKind: "member", action: v.publishAt ? "post.scheduled" : "post.drafted", targetType: "scheduled_post", targetId: row.id, targetLabel: v.title || v.body.slice(0, 80), detail: { publishAt: v.publishAt } })
  if (saved.status === "failed" && now) return no(409, saved.error || "It did not go up. Try again.")
  return { ok: true, post: await oneView(db, a, saved) }
}

export async function deleteScheduled(db: Db, a: Actor, id: string): Promise<Done> {
  const row = await rowOf(db, a.community.id, id)
  if (!row) return no(404, "not_found")
  if (!mayChange(row, actorOf(a))) return no(403, "forbidden")
  if (row.status === "publishing") return no(409, "This one is going up right now.")
  const { error } = await db.from("community_scheduled_posts").delete().eq("id", row.id).eq("community_id", a.community.id).neq("status", "publishing")
  if (error) {
    console.error(`[communities] scheduled delete: ${reasonOf(error)}`)
    return no(500, "That did not delete. Try again.")
  }
  if (row.status !== "published") await audit(db, { communityId: a.community.id, actorId: a.userId, actorKind: "member", action: "post.schedule_deleted", targetType: "scheduled_post", targetId: row.id, targetLabel: row.title || row.body.slice(0, 80) })
  return { ok: true }
}

/** A failure's reason, as the list shows it. */
function failWords(error: string | undefined): string {
  return (error || "It did not go up.").slice(0, 500)
}

/**
 * Puts one taken row up, as its author, through createPost. The row must be
 * in publishing (taken by this run). Answers the row as it now is.
 */
export async function publishOne(db: Db, row: Row, given?: CommunityRow | null): Promise<Row> {
  const finish = async (patch: Partial<Row>): Promise<Row> => {
    const next = { ...patch, updated_at: nowIso() }
    const { data } = await db.from("community_scheduled_posts").update(next).eq("id", row.id).eq("status", "publishing").select(COLUMNS).maybeSingle()
    return (data as Row | null) ?? { ...row, ...next }
  }
  try {
    const community = given ?? (await loadCommunity(db, { id: row.community_id }))
    if (!community || !communityOpen(community)) return finish({ status: "failed", error: "The community is not open." })
    if (community.status === "archived" || community.archived_at) return finish({ status: "failed", error: "The community is archived." })
    if (!row.space_id) return finish({ status: "failed", error: "Its space was removed. Pick another space and schedule it again." })
    let viewer = await viewerContext(db, community, row.author_id)
    /* The creator's own account is the owner here, as in /app (requireCreatorCommunity). */
    if (viewer.isCreatorAccount && !viewer.active) viewer = { ...viewer, role: "owner", active: true }
    if (!viewer.active) return finish({ status: "failed", error: "Its author is no longer a member." })
    if (viewer.mutedUntil) return finish({ status: "failed", error: "Its author is muted." })
    const made = await createPost({ db, community, viewer }, { spaceId: row.space_id, title: row.title, body: row.body, media: [], poll: null })
    if (!made.ok) return finish({ status: "failed", error: failWords(made.error) })
    const done = await finish({ status: "published", post_id: made.value.id, published_at: nowIso(), error: null })
    await audit(db, { communityId: community.id, actorId: row.author_id, actorKind: "system", action: "post.schedule_published", targetType: "post", targetId: made.value.id, targetLabel: row.title.slice(0, 80) })
    return done
  } catch (e) {
    console.error(`[communities] scheduled publish ${row.id}: ${reasonOf(e)}`)
    return finish({ status: "failed", error: "It did not go up. Try again." })
  }
}

/**
 * The cron's step: rows left in publishing too long are failed, then what is
 * due is taken one row at a time (scheduled to publishing in one update, so a
 * second run gets nothing) and put up. Answers how many went up and failed.
 */
export async function publishDuePosts(db: Db, now: number = Date.now(), budgetMs = 20_000): Promise<{ published: number; failed: number; available: boolean }> {
  const out = { published: 0, failed: 0, available: true }
  const stale = await db
    .from("community_scheduled_posts")
    .update({ status: "failed", error: "Publishing stopped part way. Check the feed before you schedule it again.", updated_at: nowIso(now) })
    .eq("status", "publishing")
    .lt("claimed_at", nowIso(now - STALE_MS))
  if (stale.error) {
    if (missing(stale.error)) return { ...out, available: false }
    console.error(`[communities] scheduled stale: ${reasonOf(stale.error)}`)
  }
  const { data, error } = await db.from("community_scheduled_posts").select(COLUMNS).eq("status", "scheduled").lte("publish_at", nowIso(now)).order("publish_at", { ascending: true }).limit(RUN_MAX)
  if (error) {
    if (missing(error)) return { ...out, available: false }
    console.error(`[communities] scheduled due: ${reasonOf(error)}`)
    return out
  }
  const started = Date.now()
  for (const due of (data as Row[] | null) ?? []) {
    if (Date.now() - started > budgetMs) break
    const taken = await db
      .from("community_scheduled_posts")
      .update({ status: "publishing", claimed_at: nowIso(), attempts: (due.attempts ?? 0) + 1, updated_at: nowIso() })
      .eq("id", due.id)
      .eq("status", "scheduled")
      .select(COLUMNS)
      .maybeSingle()
    if (taken.error || !taken.data) continue
    const row = await publishOne(db, taken.data as Row)
    if (row.status === "published") out.published++
    else out.failed++
  }
  return out
}
