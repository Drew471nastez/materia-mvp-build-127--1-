import "server-only"

/**
 * ===========================================================================
 *  WHO TO WRITE TO, AND SENDING A POST TO CHATS (round 39)
 * ===========================================================================
 * New message's picker (components/community/member/people-picker.tsx) and
 * a post's "Send in a message" (share-to-chat.tsx) read and write through
 * here, behind GET /api/community/<id>/chat/people and
 * GET|POST /api/community/<id>/chat/share.
 *
 *   SUGGESTED  ../chat-people.ts rankSuggestions over what the member's own
 *              rows say: their conversations, the comments on their posts,
 *              the posts they liked, the team, the points and the heartbeat.
 *              Only active members the member may write to (dmDecision with
 *              the community's rule, a block either way, the person's own
 *              choice), so a suggestion always opens.
 *   SEARCH     a name or an @handle among the community's active members
 *              (the directory's own search, so a member found here is one the
 *              member list would show), the member left out, blocked people
 *              left out either way, and anybody the rules refuse drawn greyed
 *              with the reason (they were asked for by name, so silence would
 *              read as "not here").
 *   SHARE      a post the sender may see, to at most SHARE_TARGETS_MAX chats:
 *              a person (their conversation, opened as Message would), a
 *              conversation, a group they are in, a chat channel they may post
 *              in. Each goes through that chat's own send, with every check
 *              it makes (rules accepted, blocks, slow mode, levels), and
 *              answers for itself.
 */
import { dmDecision, dmShortReason, levelLetsPost } from "../chat-rules"
import { SEARCH_MAX, SHARE_NOTE_MAX, SHARE_TARGETS_MAX, cleanPeopleQuery, rankSearch, rankSuggestions, type PickPerson, type SuggestSignals } from "../chat-people"
import { meetsRole } from "../permissions"
import type { CommunityRow, Role } from "../types"
import type { Viewer } from "./context"
import { missing, type Db } from "./db"
import { authorViews, listMembers } from "./directory"
import { canPostIn, cleanText, listSpaces, type Checked } from "./feed"
import { blockedAmong, chatMemberStates, loadChatSettings } from "./chat-settings"
import { ONLINE_WINDOW_MS } from "./presence"
import { checkPostShare } from "./chat-post"
import { conversationOf, listConversations, openConversation, sendDirectMessage } from "./direct"
import { groupOf, listGroups, sendGroupMessage } from "./groups"
import { chatSpace, postMessage } from "./chat"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A read that answers its rows, or none when it failed (a missing column or table is a signal not there yet). */
async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await q
    return error ? [] : ((data as T[] | null) ?? [])
  } catch {
    return []
  }
}

/** The member's conversations: who with, who started it, the last message (all of them, a message in it or not). */
async function myConversations(db: Db, communityId: string, me: string) {
  return rows<{ user_a: string; user_b: string; started_by: string | null; last_message_at: string | null }>(
    db.from("community_conversations").select("user_a, user_b, started_by, last_message_at").eq("community_id", communityId).or(`user_a.eq.${me},user_b.eq.${me}`).order("last_message_at", { ascending: false }).limit(100),
  )
}

/**
 * The people in `ids` as the picker draws them, each with whether the viewer
 * may start writing to them. Nobody inactive, banned or blocked either way
 * comes back at all.
 */
async function decorate(db: Db, community: Pick<CommunityRow, "id" | "owner_user_id" | "chat_enabled">, viewer: Viewer, ids: string[], started: Map<string, string | null>): Promise<Map<string, PickPerson>> {
  const out = new Map<string, PickPerson>()
  const me = String(viewer.userId)
  const list = [...new Set(ids.filter((id) => UUID.test(id) && id !== me))].slice(0, 120)
  if (!list.length) return out
  const [views, states, blocked, settings, seen] = await Promise.all([
    authorViews(db, community.id, list),
    chatMemberStates(db, community.id, list),
    blockedAmong(db, me, list),
    loadChatSettings(db, community.id),
    rows<{ user_id: string; last_seen_at: string | null }>(db.from("community_members").select("user_id, last_seen_at").eq("community_id", community.id).in("user_id", list)),
  ])
  const presence = new Map(seen.map((r) => [r.user_id, r.last_seen_at]))
  const heartbeat = seen.length > 0
  const now = Date.now()
  const senderRole: Role | null = me === community.owner_user_id ? "owner" : viewer.role
  for (const id of list) {
    const state = states.get(id)
    const view = views.get(id)
    if (!state || !state.active || !view || blocked.has(id)) continue
    const role: Role | null = id === community.owner_user_id ? "owner" : state.role
    let can = true
    let why: string | null = null
    /* A conversation that already exists always opens (to read it, as Message on a profile does). */
    if (!started.has(id)) {
      const d = dmDecision({
        policy: community.chat_enabled ? settings.dmPolicy : "off",
        senderId: me,
        senderRole,
        recipientId: id,
        recipientRole: role,
        recipientDms: state.chatDms,
        blocked: false,
        senderLevel: viewer.member?.level ?? 1,
        senderJoinedAt: viewer.member?.joined_at ?? viewer.member?.created_at ?? null,
        minLevel: settings.dmMinLevel,
        minDays: settings.dmMinDays,
        toStaff: settings.dmToStaff,
      })
      if ("error" in d) {
        can = false
        why = dmShortReason(d.reason, { minLevel: settings.dmMinLevel, minDays: settings.dmMinDays }) || d.error
      }
    }
    const at = presence.get(id)
    out.set(id, {
      id,
      name: view.name,
      username: view.username,
      avatarUrl: view.avatarUrl,
      role: role ?? "member",
      online: heartbeat ? !!at && now - Date.parse(at) < ONLINE_WINDOW_MS : null,
      can,
      why,
    })
  }
  return out
}

/** The Suggested list for New message: the team, the people the member deals with, the top and the recently here. */
export async function suggestPeople(db: Db, community: CommunityRow, viewer: Viewer): Promise<PickPerson[]> {
  if (!viewer.userId || !community.chat_enabled) return []
  const me = viewer.userId
  const cid = community.id
  const [team, conversations, myPosts, likes, top, active] = await Promise.all([
    rows<{ user_id: string; role: string }>(db.from("community_members").select("user_id, role").eq("community_id", cid).eq("status", "active").in("role", ["owner", "admin", "moderator"]).limit(20)),
    myConversations(db, cid, me),
    rows<{ id: string }>(db.from("community_feed_posts").select("id").eq("community_id", cid).eq("author_id", me).eq("status", "published").order("created_at", { ascending: false }).limit(30)),
    rows<{ target_id: string; created_at: string }>(db.from("community_reactions").select("target_id, created_at").eq("community_id", cid).eq("user_id", me).eq("target_type", "post").order("created_at", { ascending: false }).limit(60)),
    rows<{ user_id: string; points: number | null }>(db.from("community_members").select("user_id, points").eq("community_id", cid).eq("status", "active").order("points", { ascending: false }).limit(10)),
    rows<{ user_id: string; last_seen_at: string | null }>(db.from("community_members").select("user_id, last_seen_at").eq("community_id", cid).eq("status", "active").not("last_seen_at", "is", null).order("last_seen_at", { ascending: false }).limit(10)),
  ])
  const [comments, liked] = await Promise.all([
    myPosts.length
      ? rows<{ author_id: string | null; created_at: string }>(db.from("community_feed_comments").select("author_id, created_at").eq("community_id", cid).in("post_id", myPosts.map((p) => p.id)).eq("status", "published").order("created_at", { ascending: false }).limit(120))
      : Promise.resolve([]),
    likes.length ? rows<{ id: string; author_id: string | null }>(db.from("community_feed_posts").select("id, author_id").eq("community_id", cid).in("id", [...new Set(likes.map((l) => l.target_id))])) : Promise.resolve([]),
  ])
  const authorOf = new Map(liked.map((p) => [p.id, p.author_id]))
  const other = (c: { user_a: string; user_b: string }) => (c.user_a === me ? c.user_b : c.user_a)
  const started = new Map(conversations.map((c) => [other(c), c.started_by]))
  const signals: SuggestSignals = {
    me,
    ownerId: community.owner_user_id ?? null,
    team: team.map((t) => ({ id: t.user_id, role: t.role })),
    talked: conversations.filter((c) => c.last_message_at).map((c) => ({ id: other(c), at: c.last_message_at })),
    commented: comments.filter((c) => c.author_id && c.author_id !== me).map((c) => ({ id: String(c.author_id), at: c.created_at })),
    liked: likes.map((l) => ({ id: authorOf.get(l.target_id) ?? "", at: l.created_at })).filter((l) => l.id && l.id !== me),
    top: top.map((t) => ({ id: t.user_id, points: Number(t.points) || 0 })),
    active: active.filter((a) => a.last_seen_at).map((a) => ({ id: a.user_id, at: String(a.last_seen_at) })),
  }
  const candidates = [signals.ownerId ?? "", ...signals.team.map((t) => t.id), ...signals.talked.map((t) => t.id), ...signals.commented.map((c) => c.id), ...signals.liked.map((l) => l.id), ...signals.top.map((t) => t.id), ...signals.active.map((a) => a.id)].filter(Boolean)
  const people = await decorate(db, community, viewer, candidates, started)
  return rankSuggestions(signals, (id) => !!people.get(id)?.can).map((s) => ({ ...(people.get(s.id) as PickPerson), from: s.from }))
}

/** Members by name or @handle, for the picker's search. */
export async function searchPeople(db: Db, community: CommunityRow, viewer: Viewer, raw: unknown): Promise<PickPerson[]> {
  const q = cleanPeopleQuery(raw)
  if (!viewer.userId || !q) return []
  const [found, conversations] = await Promise.all([listMembers(db, community.id, { q, limit: 40 }), myConversations(db, community.id, viewer.userId)])
  const me = viewer.userId
  const started = new Map(conversations.map((c) => [c.user_a === me ? c.user_b : c.user_a, c.started_by]))
  const ids = found.members.map((m) => m.userId).filter((id) => id !== me)
  const people = await decorate(db, community, viewer, ids, started)
  return rankSearch(q, ids.map((id) => people.get(id)).filter((p): p is PickPerson => !!p)).slice(0, SEARCH_MAX)
}

/* ── Sending a post ────────────────────────────────────────────────────── */

export interface ShareChat {
  kind: "dm" | "group" | "space"
  id: string
  name: string
  avatarUrl: string | null
  username: string | null
  role: string | null
  /** "12 people" for a group; null otherwise. */
  sub: string | null
  at: string | null
  /** A conversation's other person, so a search result for them is this chat. */
  personId?: string
}

/** Where the member may send a post: their latest conversations and groups, newest first, then the chat channels they may post in. */
export async function shareTargets(db: Db, community: CommunityRow, viewer: Viewer): Promise<{ ready: boolean; chats: ShareChat[] }> {
  if (!viewer.userId || !community.chat_enabled) return { ready: false, chats: [] }
  const [direct, groups, spaces, levels] = await Promise.all([
    listConversations(db, community, viewer),
    listGroups(db, community, viewer),
    listSpaces(db, community.id),
    rows<{ id: string; post_min_level: number | null }>(db.from("community_spaces").select("id, post_min_level").eq("community_id", community.id).eq("kind", "chat")),
  ])
  const recent: ShareChat[] = [
    ...direct.conversations
      .filter((c) => c.other)
      .map((c) => ({ kind: "dm" as const, id: c.id, name: c.other!.name, avatarUrl: c.other!.avatarUrl, username: c.other!.username, role: c.other!.role, sub: null, at: c.lastAt, personId: c.other!.id })),
    ...groups.groups.map((g) => ({ kind: "group" as const, id: g.id, name: g.name, avatarUrl: null, username: null, role: null, sub: `${g.memberCount} people`, at: g.lastAt })),
  ]
    .sort((a, b) => (b.at ? Date.parse(b.at) : 0) - (a.at ? Date.parse(a.at) : 0))
    .slice(0, 12)
  const minLevel = new Map(levels.map((l) => [l.id, Number(l.post_min_level) || 0]))
  const channels: ShareChat[] = spaces
    .filter((s) => s.kind === "chat" && canPostIn(s, viewer, true) && (!s.post_role || meetsRole(viewer.role, s.post_role)) && levelLetsPost(viewer.role, viewer.member?.level ?? 1, minLevel.get(s.id) ?? 0))
    .map((s) => ({ kind: "space" as const, id: s.id, name: s.name, avatarUrl: null, username: null, role: null, sub: null, at: null }))
  return { ready: direct.ready || groups.ready, chats: [...recent, ...channels] }
}

export interface ShareResult {
  kind: "person" | "dm" | "group" | "space"
  id: string
  /** The chat it landed in (a person's conversation id), when it did. */
  chatId: string | null
  ok: boolean
  error?: string
}

type Target = { kind: ShareResult["kind"]; id: string }

/** The targets a client sent: known kinds and well formed ids, each once, at most SHARE_TARGETS_MAX. */
export function shareTargetsOf(raw: unknown): Checked<Target[]> {
  if (!Array.isArray(raw) || !raw.length) return { ok: false, error: "Pick where to send it.", status: 400 }
  const seen = new Set<string>()
  const out: Target[] = []
  for (const t of raw) {
    const kind = (t as { kind?: unknown })?.kind
    const id = (t as { id?: unknown })?.id
    if (!(kind === "person" || kind === "dm" || kind === "group" || kind === "space") || typeof id !== "string" || !UUID.test(id)) return { ok: false, error: "That chat is not here.", status: 400 }
    const key = `${kind}:${id.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ kind, id: id.toLowerCase() })
  }
  if (out.length > SHARE_TARGETS_MAX) return { ok: false, error: `Send it to up to ${SHARE_TARGETS_MAX} chats at once.`, status: 400 }
  return { ok: true, value: out }
}

/** A post, with an optional note, sent to each chat picked; every chat answers for itself. */
export async function sharePostToChats(db: Db, community: CommunityRow, viewer: Viewer, raw: unknown): Promise<Checked<{ results: ShareResult[] }>> {
  if (!viewer.userId) return { ok: false, error: "Sign in first.", status: 401 }
  if (!community.chat_enabled) return { ok: false, error: "Messages are turned off in this community.", status: 403 }
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const targets = shareTargetsOf(r.targets)
  if (!targets.ok) return targets
  const note = cleanText(r.note, SHARE_NOTE_MAX)
  if (note.length > SHARE_NOTE_MAX) return { ok: false, error: "Keep the note under 1,000 characters.", status: 400 }
  /* The post first, once, so a post the sender cannot see is one clear refusal rather than one per chat. */
  const post = await checkPostShare(db, community, viewer, [{ type: "post", postId: r.postId }])
  if (!post.ok) return post
  if (!post.value) return { ok: false, error: "Pick a post to send.", status: 400 }
  const base = typeof r.clientId === "string" && /^[A-Za-z0-9_-]{8,48}$/.test(r.clientId) ? r.clientId : null
  const results: ShareResult[] = []
  for (const [i, t] of targets.value.entries()) {
    const message = { body: note, attachments: [post.value], ...(base ? { clientId: `${base}-${i}` } : {}) }
    const done = await sendOne(db, community, viewer, t, message)
    results.push(done)
  }
  return { ok: true, value: { results } }
}

async function sendOne(db: Db, community: CommunityRow, viewer: Viewer, t: Target, message: Record<string, unknown>): Promise<ShareResult> {
  const failed = (error: string, chatId: string | null = null): ShareResult => ({ kind: t.kind, id: t.id, chatId, ok: false, error })
  try {
    if (t.kind === "person" || t.kind === "dm") {
      let conversationId = t.id
      if (t.kind === "person") {
        const opened = await openConversation(db, community, viewer, t.id)
        if (!opened.ok) return failed(opened.error)
        conversationId = opened.value.id
      }
      const conversation = await conversationOf(db, community, viewer, conversationId)
      if (!conversation) return failed("That conversation is gone.")
      const sent = await sendDirectMessage(db, community, viewer, conversation, message)
      return sent.ok ? { kind: t.kind, id: t.id, chatId: conversation.id, ok: true } : failed(sent.error, conversation.id)
    }
    if (t.kind === "group") {
      const opened = await groupOf(db, community, viewer, t.id)
      if (!opened) return failed("You are not in that group.")
      const sent = await sendGroupMessage(db, community, viewer, opened, message)
      return sent.ok ? { kind: t.kind, id: t.id, chatId: t.id, ok: true } : failed(sent.error, t.id)
    }
    const space = await chatSpace(db, community, viewer, t.id)
    if (!space) return failed("That channel is not here.")
    const sent = await postMessage({ db, community, viewer }, space, message)
    return sent.ok ? { kind: t.kind, id: t.id, chatId: t.id, ok: true } : failed(sent.error, t.id)
  } catch (e) {
    if (missing(e as { code?: string })) return failed("Messages are not set up yet.")
    return failed("That did not send. Try again.")
  }
}
