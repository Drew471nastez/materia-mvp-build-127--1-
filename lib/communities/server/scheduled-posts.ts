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
 * Before part 194 every read answers "not ready".
 *
 * ROUND 27 (B1, run-now part 222): WHAT IT CARRIES. A scheduled post or a
 * draft keeps its pictures, video, files, GIFs, videos by link, link card
 * (`media`, the post route's own list) and its poll (`poll`, its end as days
 * from going up). Saving checks the media as the post route does (checkMedia,
 * then the files and videos are the uploader's: ownedMedia), so a problem is
 * said in the writer, not found at the time; going up checks it all again, as
 * its author, through createPost, the poll ending that many days from then.
 * Files and videos added to somebody else's scheduled post are refused: it
 * goes up as its author, and they are not theirs. Before part 222 the reads
 * and writes go on without the two columns (a post with only words schedules
 * as before), and one that carries something says the part is needed.
 */
import { EDITABLE, checkScheduledInput, pollToPost, type ScheduledInput, type ScheduledPanelData, type ScheduledPoll, type ScheduledPostView, type ScheduledStatus } from "../scheduled-posts"
import { can } from "../permissions"
import type { CommunityRow, PostMedia } from "../types"
import { communityOpen, loadCommunity, viewerContext, type Viewer } from "./context"
import { canPostIn, checkMedia, checkPoll, createPost, listSpaces, ownedMedia } from "./feed"
import { peopleOf } from "./moderation"
import { audit } from "./audit"
import { missing, nowIso, reasonOf, type Db, type DbError } from "./db"

const BASE_COLUMNS = "id, community_id, author_id, space_id, title, body, status, publish_at, post_id, error, attempts, claimed_at, published_at, created_at, updated_at"
/** With part 222's two columns (round 27). */
const COLUMNS = `${BASE_COLUMNS}, media, poll`

/*
  BEFORE PART 222. A read or a write naming `media` or `poll` on a database without them is answered with an unknown column;
  it is made again without them, and for a few minutes after that this server asks without them first.
*/
let partMissingUntil = 0
const PART_RECHECK_MS = 5 * 60_000
function columnMissing(error: DbError | null | undefined): boolean {
  if (!error) return false
  return (error.code === "42703" || error.code === "PGRST204") && /\b(media|poll)\b/.test(error.message ?? "")
}
/** What a read or a write answers: its rows (the client is untyped here, as everywhere in ./db.ts) and its error. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Answer = { data?: any; error: DbError | null }
/** Run a read or a write with part 222's columns, or without them on a database that has not run it; `media` says which. */
async function withMedia<T extends Answer>(run: (columns: string, media: boolean) => PromiseLike<T>): Promise<T & { media: boolean }> {
  if (Date.now() >= partMissingUntil) {
    const r = await run(COLUMNS, true)
    if (!columnMissing(r.error)) return { ...r, media: true }
    partMissingUntil = Date.now() + PART_RECHECK_MS
  }
  return { ...(await run(BASE_COLUMNS, false)), media: false }
}

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
  /** Part 222; absent before it. */
  media?: PostMedia[] | null
  poll?: ScheduledPoll | null
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
    media: Array.isArray(r.media) ? r.media : [],
    poll: r.poll && typeof r.poll === "object" ? r.poll : null,
    authorId: r.author_id,
    authorName: people.get(r.author_id)?.name ?? "Member",
    mine: mayChange(r, actor),
    updatedAt: r.updated_at,
  }))
}

/** The community's drafts and scheduled posts, then what went up or failed in the last two weeks. */
export async function listScheduled(db: Db, communityId: string, actor: { userId: string; role: Viewer["role"]; perms?: Viewer["perms"] }): Promise<{ ready: boolean; media: boolean; rows: ScheduledPostView[] }> {
  const since = nowIso(Date.now() - HISTORY_DAYS * 86_400_000)
  const read = await withMedia(async (columns) => {
    const [waiting, history] = await Promise.all([
      db.from("community_scheduled_posts").select(columns).eq("community_id", communityId).in("status", ["draft", "scheduled", "publishing"]).order("publish_at", { ascending: true, nullsFirst: false }).order("updated_at", { ascending: false }).limit(WAITING_MAX),
      db.from("community_scheduled_posts").select(columns).eq("community_id", communityId).in("status", ["published", "failed"]).gte("updated_at", since).order("updated_at", { ascending: false }).limit(50),
    ])
    return { waiting, history, error: (waiting.error ?? history.error) as DbError | null }
  })
  const error = read.error
  if (error) {
    if (!missing(error)) console.error(`[communities] scheduled read: ${reasonOf(error)}`)
    return { ready: !missing(error), media: false, rows: [] }
  }
  const rows = [...((read.waiting.data as Row[] | null) ?? []), ...((read.history.data as Row[] | null) ?? [])]
  return { ready: true, media: read.media, rows: await views(db, communityId, rows, actor) }
}

/**
 * THE PANEL'S READ (round 33): the rows and the spaces this person may post in, at once. The route's GET answers it, and the
 * Posts page reads it beside the posts, so the panel is on screen with the page instead of after a request of its own.
 */
export async function scheduledPanelReads(db: Db, community: CommunityRow, viewer: Viewer, userId: string): Promise<ScheduledPanelData> {
  const [list, spaces] = await Promise.all([listScheduled(db, community.id, { userId, role: viewer.role, perms: viewer.perms }), listSpaces(db, community.id)])
  const writable = spaces.filter((s) => s.kind !== "chat" && canPostIn(s, viewer, community.chat_enabled)).map((s) => ({ id: s.id, name: s.name, kind: s.kind, icon: s.icon }))
  return { ...list, spaces: writable }
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

/**
 * What a scheduled post carries, checked as the post route checks a post's (feed.ts checkMedia), and its files and videos
 * as the uploader's own: `author` is who it goes up as, `actor` who is saving it now, `kept` what it carried already
 * (left as it was checked). Somebody else's scheduled post takes no new file or video from the person editing it.
 */
async function mediaFor(db: Db, a: Actor, input: ScheduledInput, author: string, kept: PostMedia[] = []): Promise<Done<{ media: PostMedia[] }>> {
  if (!input.media.length) return { ok: true, media: [] }
  const shaped = checkMedia(input.media)
  if (shaped.ok === false) return no(400, shaped.error)
  const had = new Set(kept.map((m) => (m.type === "file" ? `f:${m.assetId}` : m.type === "video" ? `v:${m.videoId}` : "")).filter(Boolean))
  const fresh = shaped.value.filter((m) => (m.type === "file" && !had.has(`f:${m.assetId}`)) || (m.type === "video" && !had.has(`v:${m.videoId}`)))
  if (fresh.length && author !== a.userId) return no(403, "author_media")
  const owned = await ownedMedia(db, a.community, a.viewer, shaped.value, kept)
  if (owned.ok === false) return no(400, owned.error)
  return { ok: true, media: owned.value }
}

/** The two columns of part 222 for a write, or a refusal when the database does not have them and the post carries something. */
function carried(media: boolean, value: { media: PostMedia[]; poll: ScheduledPoll | null }): Record<string, unknown> | null {
  if (media) return { media: value.media, poll: value.poll }
  return value.media.length || value.poll ? null : {}
}

export async function createScheduled(db: Db, a: Actor, raw: unknown): Promise<Done<{ post: ScheduledPostView }>> {
  if (a.community.status === "archived" || a.community.archived_at) return no(403, "archived")
  const checked = checkScheduledInput(raw)
  if (checked.ok === false) return no(400, checked.error, checked.field)
  const space = await spaceFor(db, a.community, a.viewer, checked.value.spaceId)
  if (space.ok === false) return space
  const { count } = await db.from("community_scheduled_posts").select("id", { count: "exact", head: true }).eq("community_id", a.community.id).in("status", ["draft", "scheduled"])
  if (typeof count === "number" && count >= WAITING_MAX) return no(409, `A community keeps up to ${WAITING_MAX} drafts and scheduled posts. Publish or delete some first.`)
  const v = checked.value
  const media = await mediaFor(db, a, v, a.userId)
  if (media.ok === false) return media
  const keep = { media: media.media, poll: v.poll }
  let refused = false
  const { data, error } = await withMedia((columns, part) => {
    const extra = carried(part, keep)
    if (!extra) {
      refused = true
      return Promise.resolve({ data: null, error: null })
    }
    return db
      .from("community_scheduled_posts")
      .insert({ community_id: a.community.id, author_id: a.userId, space_id: v.spaceId, title: v.title, body: v.body, status: v.publishAt ? "scheduled" : "draft", publish_at: v.publishAt, ...extra })
      .select(columns)
      .single()
  })
  if (refused) return no(503, "media_not_ready")
  if (error || !data) {
    if (missing(error)) return no(503, "not_ready")
    console.error(`[communities] scheduled insert: ${reasonOf(error)}`)
    return no(500, "That did not save. Try again.")
  }
  await audit(db, { communityId: a.community.id, actorId: a.userId, actorKind: "member", action: v.publishAt ? "post.scheduled" : "post.drafted", targetType: "scheduled_post", targetId: data.id, targetLabel: v.title || v.body.slice(0, 80), detail: { publishAt: v.publishAt } })
  return { ok: true, post: await oneView(db, a, data as Row) }
}

async function rowOf(db: Db, communityId: string, id: string): Promise<Row | null> {
  const { data } = await withMedia((columns) => db.from("community_scheduled_posts").select(columns).eq("id", id).eq("community_id", communityId).maybeSingle())
  return (data as Row | null) ?? null
}

/**
 * A change: new words, space or time (publishAt null makes it a draft), or
 * { publishNow: true }, which puts it up at once through the same path the
 * schedule uses.
 */
export async function updateScheduled(db: Db, a: Actor, id: string, raw: unknown, make: MakePost = createPost): Promise<Done<{ post: ScheduledPostView }>> {
  const row = await rowOf(db, a.community.id, id)
  if (!row) return no(404, "not_found")
  if (!mayChange(row, actorOf(a))) return no(403, "forbidden")
  if (!EDITABLE.includes(row.status)) return no(409, row.status === "published" ? "This one is already up." : "This one is going up right now.")
  if (a.community.status === "archived" || a.community.archived_at) return no(403, "archived")
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const now = r.publishNow === true
  const had = Array.isArray(row.media) ? row.media : []
  const merged = {
    spaceId: "spaceId" in r ? r.spaceId : row.space_id,
    title: "title" in r ? r.title : row.title,
    body: "body" in r ? r.body : row.body,
    publishAt: now ? new Date(Date.now() + 120_000).toISOString() : "publishAt" in r ? r.publishAt : row.publish_at,
    media: "media" in r ? r.media : had,
    poll: "poll" in r ? r.poll : (row.poll ?? null),
  }
  const checked = checkScheduledInput(merged)
  if (checked.ok === false) return no(400, checked.error, checked.field)
  const v = checked.value
  const space = await spaceFor(db, a.community, a.viewer, v.spaceId)
  if (space.ok === false) return space
  const media = await mediaFor(db, a, v, row.author_id, had)
  if (media.ok === false) return media
  const status: ScheduledStatus = now ? "publishing" : v.publishAt ? "scheduled" : "draft"
  let refused = false
  const { data, error } = await withMedia((columns, part) => {
    const extra = carried(part, { media: media.media, poll: v.poll })
    if (!extra) {
      refused = true
      return Promise.resolve({ data: null, error: null })
    }
    return db
      .from("community_scheduled_posts")
      .update({ space_id: v.spaceId, title: v.title, body: v.body, status, publish_at: now ? nowIso() : v.publishAt, error: null, claimed_at: now ? nowIso() : null, updated_at: nowIso(), ...extra })
      .eq("id", row.id)
      .eq("community_id", a.community.id)
      .in("status", EDITABLE as ScheduledStatus[])
      .select(columns)
      .maybeSingle()
  })
  if (refused) return no(503, "media_not_ready")
  if (error) {
    console.error(`[communities] scheduled update: ${reasonOf(error)}`)
    return no(500, "That did not save. Try again.")
  }
  if (!data) return no(409, "This one changed a moment ago. Refresh to see it.")
  let saved = data as Row
  if (now) saved = await publishOne(db, saved, a.community, make)
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
/** What puts a post up: createPost, or a stand in for the tests. */
type MakePost = typeof createPost

export async function publishOne(db: Db, row: Row, given?: CommunityRow | null, make: MakePost = createPost): Promise<Row> {
  const finish = async (patch: Partial<Row>): Promise<Row> => {
    const next = { ...patch, updated_at: nowIso() }
    const { data } = await withMedia((columns) => db.from("community_scheduled_posts").update(next).eq("id", row.id).eq("status", "publishing").select(columns).maybeSingle())
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
    /* What it carries, checked as the post route checks a post (round 27); the poll ends that many days from now. */
    const media = checkMedia(Array.isArray(row.media) ? row.media : [])
    if (media.ok === false) return finish({ status: "failed", error: failWords(media.error) })
    const poll = row.poll ? checkPoll(pollToPost(row.poll)) : ({ ok: true, value: null } as const)
    if (poll.ok === false) return finish({ status: "failed", error: failWords(poll.error) })
    const made = await make({ db, community, viewer }, { spaceId: row.space_id, title: row.title, body: row.body, media: media.value, poll: poll.value })
    if (made.ok === false) return finish({ status: "failed", error: failWords(made.error) })
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
export async function publishDuePosts(db: Db, now: number = Date.now(), budgetMs = 10_000, make: MakePost = createPost): Promise<{ published: number; failed: number; available: boolean }> {
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
  const { data, error } = await withMedia((columns) => db.from("community_scheduled_posts").select(columns).eq("status", "scheduled").lte("publish_at", nowIso(now)).order("publish_at", { ascending: true }).limit(RUN_MAX))
  if (error) {
    if (missing(error)) return { ...out, available: false }
    console.error(`[communities] scheduled due: ${reasonOf(error)}`)
    return out
  }
  const started = Date.now()
  for (const due of (data as Row[] | null) ?? []) {
    if (Date.now() - started > budgetMs) break
    const taken = await withMedia((columns) =>
      db
        .from("community_scheduled_posts")
        .update({ status: "publishing", claimed_at: nowIso(), attempts: (due.attempts ?? 0) + 1, updated_at: nowIso() })
        .eq("id", due.id)
        .eq("status", "scheduled")
        .select(columns)
        .maybeSingle(),
    )
    if (taken.error || !taken.data) continue
    const row = await publishOne(db, taken.data as Row, null, make)
    if (row.status === "published") out.published++
    else out.failed++
  }
  return out
}
